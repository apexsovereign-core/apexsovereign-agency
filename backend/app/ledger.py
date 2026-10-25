"""
Double-Entry Atomic Ledger Engine & HMAC-SHA256 Cryptographic Signing.
Guarantees mathematical balance, canonical message generation, and tamper detection.
Rule: $1.00 = 100 CU (Compute Units). All internal ledger calculations use integer CU.
Schema: apex (Isolated from legacy public tables).
"""

import hmac
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from fastapi import HTTPException, status

from .config import settings
from . import db


# -----------------------------------------------------------------------------
# 1. CANONICAL MESSAGE & CRYPTOGRAPHIC SIGNING
# -----------------------------------------------------------------------------
def build_canonical_message(
    tx_id: str,
    tx_type: str,
    reference: str,
    created_at_iso: str,
    lines: List[Dict[str, Any]]
) -> str:
    """
    Constructs a deterministic canonical string for HMAC-SHA256 signing:
    Format:
    <tx_id>|<type>|<reference>|<created_at_iso>|<sorted_lines>
    Where sorted_lines is joined by '|' and each line is:
    <account_code>:<direction>:<amount_cu>
    Lines are sorted lexicographically by account_code.
    """
    sorted_lines = sorted(lines, key=lambda l: str(l.get("account_code") or l.get("account_id")))
    line_parts = [
        f"{str(l.get('account_code') or l.get('account_id'))}:{l['direction']}:{int(l['amount_cu'])}"
        for l in sorted_lines
    ]
    lines_str = "|".join(line_parts)
    return f"{tx_id}|{tx_type}|{reference}|{created_at_iso}|{lines_str}"


def sign_transaction(
    tx_id: str,
    tx_type: str,
    reference: str,
    created_at_iso: str,
    lines: List[Dict[str, Any]],
    kid: Optional[str] = None
) -> Tuple[str, str]:
    """
    Signs the canonical transaction representation with HMAC-SHA256.
    Returns: (hex_hmac, kid)
    """
    active_kid = kid or settings.LEDGER_HMAC_KID
    keys = settings.hmac_keys
    secret = keys.get(active_kid)
    if not secret:
        # Fallback to first available key
        active_kid = list(keys.keys())[0] if keys else "k1"
        secret = keys.get(active_kid, "fallback-secret")

    canonical = build_canonical_message(tx_id, tx_type, reference, created_at_iso, lines)
    signature = hmac.new(
        secret.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    return signature, active_kid


def verify_transaction_signature(
    tx_id: str,
    tx_type: str,
    reference: str,
    created_at_iso: str,
    lines: List[Dict[str, Any]],
    stored_hmac: str,
    kid: str
) -> Dict[str, Any]:
    """
    Recomputes the HMAC-SHA256 signature for verification.
    Returns verification metadata dictionary for the audit receipt.
    """
    keys = settings.hmac_keys
    secret = keys.get(kid)
    if not secret:
        return {
            "hmac_verified": False,
            "hmac_algo": "HMAC-SHA256",
            "hmac_kid": kid,
            "hmac_sig_prefix": stored_hmac[:12] if stored_hmac else "",
            "reason": f"Unknown or rotated key ID: {kid}"
        }

    canonical = build_canonical_message(tx_id, tx_type, reference, created_at_iso, lines)
    expected_hmac = hmac.new(
        secret.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    is_valid = hmac.compare_digest(expected_hmac, stored_hmac)
    return {
        "hmac_verified": is_valid,
        "hmac_algo": "HMAC-SHA256",
        "hmac_kid": kid,
        "hmac_sig_prefix": stored_hmac[:12] if stored_hmac else ""
    }


# -----------------------------------------------------------------------------
# 2. ATOMIC POSTING ENGINE
# -----------------------------------------------------------------------------
async def post_ledger_transaction(
    tx_type: str,
    reference: str,
    lines: List[Dict[str, Any]],
    idempotency_key: Optional[str] = None
) -> str:
    """
    High-level posting engine:
    1. Validates mathematical balance: sum(debits) == sum(credits)
    2. Builds canonical message and generates HMAC-SHA256
    3. Calls 'apex.post_transaction' RPC in Postgres
    """
    total_debit = sum(int(l["amount_cu"]) for l in lines if l["direction"] == "debit")
    total_credit = sum(int(l["amount_cu"]) for l in lines if l["direction"] == "credit")

    if total_debit != total_credit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "ledger_imbalance", "message": f"Mathematical imbalance: Debits ({total_debit}) != Credits ({total_credit})"}}
        )

    tx_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    signature, kid = sign_transaction(tx_id, tx_type, reference, now_iso, lines)

    # Format lines for SQL function
    sql_lines = [
        {
            "account_id": l["account_id"],
            "direction": l["direction"],
            "amount_cu": int(l["amount_cu"])
        }
        for l in lines
    ]

    call_sql = """
        SELECT apex.post_transaction(
            %s::uuid,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::jsonb
        ) AS tx_id;
    """

    try:
        row = await db.fetch_one(
            call_sql,
            (tx_id, tx_type, reference, idempotency_key, signature, kid, json.dumps(sql_lines))
        )
        if row and row.get("tx_id"):
            return str(row["tx_id"])
        return tx_id
    except Exception as e:
        err_msg = str(e)
        if "Insufficient Funds" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={"error": {"code": "insufficient_funds", "message": "Compute credit wallet balance insufficient."}}
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"code": "ledger_posting_failed", "message": f"Failed to record ledger transaction: {err_msg}"}}
        )
