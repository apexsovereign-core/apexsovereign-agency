"""Canonical PayPal environment resolution for every backend entry point.

Sandbox is the only default. Selecting ``live`` requires an explicit founder
override token, so a stray ``PAYPAL_ENV=live`` in a deployment dashboard cannot
route traffic or credentials at the live PayPal API without a second, deliberate
control being set at the same time.

This module intentionally has no third-party imports so the standalone legacy
gateways can use it without pulling in the FastAPI settings graph.
"""

from __future__ import annotations

import os
from typing import Mapping, Optional

SANDBOX = "sandbox"
LIVE = "live"
VALID_ENVIRONMENTS = (SANDBOX, LIVE)

# Environment variable that must carry the exact token below before live mode
# is accepted. The token is a confirmation phrase, not a secret.
FOUNDER_OVERRIDE_ENV = "FOUNDER_PAYPAL_LIVE_OVERRIDE"
FOUNDER_OVERRIDE_TOKEN = "I_ACCEPT_LIVE_PAYPAL_SETTLEMENT_RISK"


def resolve_paypal_env(environ: Optional[Mapping[str, str]] = None) -> str:
    """Return ``sandbox`` or ``live``, failing closed on unsafe configuration.

    Raises:
        RuntimeError: if ``PAYPAL_ENV`` is not a recognised value, or if it is
            ``live`` without the explicit founder override token.
    """

    source = os.environ if environ is None else environ
    raw = str(source.get("PAYPAL_ENV", SANDBOX) or SANDBOX).strip().lower()

    if raw not in VALID_ENVIRONMENTS:
        raise RuntimeError(
            "FATAL: PAYPAL_ENV must be either 'sandbox' or 'live'; "
            f"received {raw!r}."
        )

    if raw == LIVE:
        override = str(source.get(FOUNDER_OVERRIDE_ENV, "") or "").strip()
        if override != FOUNDER_OVERRIDE_TOKEN:
            raise RuntimeError(
                "FATAL: PAYPAL_ENV=live is blocked. Live PayPal settlement "
                f"requires {FOUNDER_OVERRIDE_ENV} to be set to the founder "
                "confirmation token after a documented live-settlement review."
            )

    return raw


def paypal_api_base(environment: str) -> str:
    """Map a validated environment to the matching PayPal REST host."""

    if environment == LIVE:
        return "https://api-m.paypal.com"
    if environment == SANDBOX:
        return "https://api-m.sandbox.paypal.com"
    raise RuntimeError(f"FATAL: unsupported PayPal environment {environment!r}.")
