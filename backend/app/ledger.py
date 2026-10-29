"""
Double-Entry Atomic Ledger Engine & HMAC-SHA256 Cryptographic Signing.
Guarantees mathematical balance, canonical message generation, and tamper detection.
Rule: $1.00 = 100 CU (Compute Units). All internal ledger calculations use integer CU.
Schema: apex (isolated from legacy public tables).
"""

import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from .config import settings
from . import db

logger = logging.getLogger("apex.ledger")


# -----------------------------------------------------------------------------
# 1. CANONICAL MESSAGE & CRYPTOGRAPHIC SIGNING
# -----------------------------------------------------------------------------
def normalize_timestamp(value: Any) -> str:
    """Normalize any timestamp input to one canonical UTC ISO-8601 string."""
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if not text:
            raise ValueError("signed_at timestamp is required")
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return text
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="microseconds")


def _canonical_line(line: Dict[str, Any]) -> str:
    code = line.get("account_code")
    if not code:
        raise ValueError("Every ledger line must include account_code for signing.")
    direction = str(line.get("direction", "")).lower()
    if direction not in ("debit", "credit"):
        raise ValueError(f"Invalid ledger direction: {direction!r}")
    if "amount_cu" not in line:
        raise ValueError("Every ledger line must include amount_cu.")
    amount = int(line["amount_cu"])
    if amount <= 0:
        raise ValueError("Ledger line amount_cu must be strictly positive.")
    return f"{code}:{direction}:{amount}"


def canonicalize_transaction(
    tx_id: str,
    tx_type: str,
    reference: str,
    signed_at_iso: Any,
    lines: List[Dict[str, Any]],
) -> str:
    """
    Canonical schema (stable across signing and verification):
      <tx_id>|<type>|<reference>|<signed_at_utc>|<sorted lines>
    Each line: <account_code>:<direction>:<amount_cu>
    Lines are sorted by (account_code, direction, amount_cu).
    """
    normalized = normalize_timestamp(signed_at_iso)
    sorted_lines = sorted(
        lines,
        key=lambda l: (
            str(l.get("account_code") or ""),
            str(l.get("direction") or ""),
            int(l.get("amount_cu", 0)),
        ),
    )
    line_parts = [_canonical_line(line) for line in sorted_lines]
    return f"{tx_id}|{tx_type}|{reference}|{normalized}|{'|'.join(line_parts)}"


# Backwards-compatible name used by earlier modules.
build_canonical_message = canonicalize_transaction


def sign_transaction(
    tx_id: str,
    tx_type: str,
    reference: str,
    signed_at_iso: Any,
    lines: List[Dict[str, Any]],
    kid: Optional[str] = None,
) -> Tuple[str, str]:
    """Sign the canonical transaction. Returns (hex_hmac, kid). No fallback key."""
    active_kid = kid or settings.LEDGER_HMAC_KID
    keys = settings.hmac_keys
    secret = keys.get(active_kid)
    if not secret:
        raise ValueError(f"Unknown or unconfigured ledger HMAC key ID: {active_kid}")

    canonical = canonicalize_transaction(
        tx_id, tx_type, reference, signed_at_iso, lines
    )
    signature = hmac.new(
        secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return signature, active_kid


def verify_transaction_signature(
    tx_id: str,
    tx_type: str,
    reference: str,
    signed_at_iso: Any,
    lines: List[Dict[str, Any]],
    stored_hmac: str,
    kid: str,
) -> Dict[str, Any]:
    """Recompute the HMAC from every line and the persisted signed_at value."""
    prefix = stored_hmac[:12] if stored_hmac else ""
    if not stored_hmac:
        return {
            "hmac_verified": False,
            "hmac_algo": "HMAC-SHA256",
            "hmac_kid": kid,
            "hmac_sig_prefix": "",
            "reason": "Missing stored signature",
        }
    if not signed_at_iso:
        return {
            "hmac_verified": False,
            "hmac_algo": "HMAC-SHA256",
            "hmac_kid": kid,
            "hmac_sig_prefix": prefix,
            "reason": "Missing persisted signed_at timestamp",
        }

    keys = settings.hmac_keys
    secret = keys.get(kid)
    if not secret:
        return {
            "hmac_verified": False,
            "hmac_algo": "HMAC-SHA256",
            "hmac_kid": kid,
            "hmac_sig_prefix": prefix,
            "reason": f"Unknown or rotated key ID: {kid}",
        }

    try:
        canonical = canonicalize_transaction(
            tx_id, tx_type, reference, signed_at_iso, lines
        )
    except ValueError as exc:
        return {
            "hmac_verified": False,
            "hmac_algo": "HMAC-SHA256",
            "hmac_kid": kid,
            "hmac_sig_prefix": prefix,
            "reason": str(exc),
        }

    expected = hmac.new(
        secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return {
        "hmac_verified": hmac.compare_digest(expected, stored_hmac),
        "hmac_algo": "HMAC-SHA256",
        "hmac_kid": kid,
        "hmac_sig_prefix": prefix,
    }


def verify_transaction_hmac(
    tx_id: str,
    tx_type: str,
    reference: str,
    signed_at_iso: Any,
    lines: List[Dict[str, Any]],
    stored_hmac: str,
    kid: str,
) -> bool:
    return bool(
        verify_transaction_signature(
            tx_id, tx_type, reference, signed_at_iso, lines, stored_hmac, kid
        )["hmac_verified"]
    )


# -----------------------------------------------------------------------------
# 2. CURRENCY & LINE VALIDATION
# -----------------------------------------------------------------------------
def amount_to_cu(amount_usd: Any) -> int:
    """
    Convert a USD amount to integer CU at exactly $1.00 = 100 CU.
    Rejects sub-cent precision instead of silently rounding money.
    """
    try:
        amount = Decimal(str(amount_usd))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("amount_usd must be a decimal number") from exc
    if amount <= 0:
        raise ValueError("amount_usd must be greater than zero")
    if amount != amount.quantize(Decimal("0.01")):
        raise ValueError("amount_usd must have at most two decimal places")
    cu = int(amount * 100)
    if Decimal(cu) != amount * 100:
        raise ValueError("amount_usd cannot be represented as integer CU")
    return cu


def _prepare_lines(lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    prepared = []
    for line in lines:
        if not line.get("account_code"):
            raise ValueError("Every ledger line must include account_code.")
        if not line.get("account_id"):
            raise ValueError("Every ledger line must include account_id.")
        prepared.append(
            {
                "account_id": str(line["account_id"]),
                "account_code": str(line["account_code"]),
                "direction": str(line["direction"]).lower(),
                "amount_cu": int(line["amount_cu"]),
            }
        )
    return prepared


# -----------------------------------------------------------------------------
# 3. ATOMIC POSTING ENGINE (non-credit transactions)
# -----------------------------------------------------------------------------
async def post_ledger_transaction(
    tx_type: str,
    reference: str,
    lines: List[Dict[str, Any]],
    idempotency_key: Optional[str] = None,
) -> str:
    """
    Validate balance, sign the canonical representation, and call
    apex.post_transaction atomically. Credit minting is handled only by
    apex.increment_user_credits from the verified PayPal webhook.
    """
    prepared = _prepare_lines(lines)

    total_debit = sum(l["amount_cu"] for l in prepared if l["direction"] == "debit")
    total_credit = sum(l["amount_cu"] for l in prepared if l["direction"] == "credit")
    if total_debit != total_credit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "ledger_imbalance",
                    "message": (
                        f"Mathematical imbalance: Debits ({total_debit}) "
                        f"!= Credits ({total_credit})"
                    ),
                }
            },
        )

    tx_id = str(uuid.uuid4())
    signed_at = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    signature, kid = sign_transaction(
        tx_id, tx_type, reference, signed_at, prepared
    )

    sql_lines = [
        {
            "account_id": l["account_id"],
            "direction": l["direction"],
            "amount_cu": l["amount_cu"],
        }
        for l in prepared
    ]

    call_sql = """
        SELECT apex.post_transaction(
            %s::uuid, %s::text, %s::text, %s::text,
            %s::text, %s::text, %s::jsonb, %s::timestamptz
        ) AS tx_id;
    """

    try:
        row = await db.fetch_one(
            call_sql,
            (
                tx_id,
                tx_type,
                reference,
                idempotency_key,
                signature,
                kid,
                json.dumps(sql_lines),
                signed_at,
            ),
        )
    except Exception as exc:
        message = str(exc)
        if "Insufficient Funds" in message:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "error": {
                        "code": "insufficient_funds",
                        "message": "Compute credit wallet balance insufficient.",
                    }
                },
            ) from exc
        logger.error("Ledger posting failed: %s", exc.__class__.__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "ledger_posting_failed",
                    "message": "Failed to record ledger transaction.",
                }
            },
        ) from exc

    if row and row.get("tx_id"):
        return str(row["tx_id"])
    return tx_id
