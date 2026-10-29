"""Regression tests for the sandbox-only PayPal startup lock."""

import pytest
from pydantic import ValidationError

from app.config import Settings, settings
from paypal_env import (
    FOUNDER_OVERRIDE_ENV,
    FOUNDER_OVERRIDE_TOKEN,
    LIVE,
    SANDBOX,
    paypal_api_base,
    resolve_paypal_env,
)


def test_resolver_defaults_to_sandbox():
    assert resolve_paypal_env({}) == SANDBOX
    assert paypal_api_base(SANDBOX) == "https://api-m.sandbox.paypal.com"


def test_resolver_rejects_unknown_environment():
    with pytest.raises(RuntimeError, match="must be either"):
        resolve_paypal_env({"PAYPAL_ENV": "production"})


def test_resolver_rejects_live_without_founder_override():
    with pytest.raises(RuntimeError, match="FATAL: PAYPAL_ENV=live is blocked"):
        resolve_paypal_env({"PAYPAL_ENV": LIVE})


def test_resolver_accepts_live_with_exact_founder_override():
    assert (
        resolve_paypal_env(
            {
                "PAYPAL_ENV": LIVE,
                FOUNDER_OVERRIDE_ENV: FOUNDER_OVERRIDE_TOKEN,
            }
        )
        == LIVE
    )
    assert paypal_api_base(LIVE) == "https://api-m.paypal.com"


def test_settings_construction_rejects_live_without_override(monkeypatch):
    monkeypatch.setenv("PAYPAL_ENV", "live")
    monkeypatch.delenv(FOUNDER_OVERRIDE_ENV, raising=False)

    with pytest.raises(ValidationError) as exc_info:
        Settings()

    message = str(exc_info.value)
    assert "FATAL: PAYPAL_ENV=live is blocked" in message
    # Pydantic must not echo the settings mapping, which contains secrets.
    assert "test-paypal-client-secret" not in message
    assert "input_value" not in message


def test_settings_construction_accepts_live_with_override(monkeypatch):
    monkeypatch.setenv("PAYPAL_ENV", "live")
    monkeypatch.setenv(FOUNDER_OVERRIDE_ENV, FOUNDER_OVERRIDE_TOKEN)

    configured = Settings()
    assert configured.PAYPAL_ENV == LIVE
    assert configured.paypal_base_url == "https://api-m.paypal.com"
    # Live settlement still requires supplier mode and the separate ack.
    assert configured.payments_enabled is False


def test_runtime_live_gate_fails_closed_after_mutation():
    original_env = settings.PAYPAL_ENV
    original_override = settings.FOUNDER_PAYPAL_LIVE_OVERRIDE
    try:
        settings.PAYPAL_ENV = "live"
        settings.FOUNDER_PAYPAL_LIVE_OVERRIDE = ""
        assert settings.payments_enabled is False
        with pytest.raises(RuntimeError, match="blocked at runtime"):
            settings.validate_runtime()
    finally:
        settings.PAYPAL_ENV = original_env
        settings.FOUNDER_PAYPAL_LIVE_OVERRIDE = original_override
