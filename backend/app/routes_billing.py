"""
Billing, Ledger, PayPal Orders & Webhook Capture Routes.
Double-entry accounting with $1.00 = 100 CU integer precision.

Hard invariants:
- CU is minted only by apex.increment_user_credits from a PayPal-verified
  PAYMENT.CAPTURE.COMPLETED webhook.
- The capture route never posts to the ledger.
- No fabricated balances, receipts, savings, or security status.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Request, Security, status
from pydantic import BaseModel

from .config import settings
from .security import get_current_user
from . import db, ledger, paypal

router = APIRouter(prefix="/v1", tags=["billing"])
logger = logging.getLogger("apex.billing")


# -----------------------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------------------
def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code, detail={"error": {"code": code, "message": message}}
    )


def _db_unavailable(operation: str, exc: Exception) -> HTTPException:
    logger.error("Billing DB failure operation=%s error=%s", operation, exc.__class__.__name__)
    return _error(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "db_unavailable",
        "Billing database is temporarily unavailable.",
    )


def _as_utc_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        return ledger.normalize_timestamp(value)
    except ValueError:
        return str(value)


def _parse_capture_amount(resource: Dict[str, Any]) -> tuple[int, Decimal]:
    amount = resource.get("amount") or {}
    currency = str(amount.get("currency_code", "")).upper()
    value = amount.get("value")
    if currency != "USD":
        raise _error(400, "invalid_capture_currency", "Capture currency must be USD.")
    if value is None:
        raise _error(400, "invalid_capture_amount", "Capture amount is missing.")
    try:
        usd = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise _error(400, "invalid_capture_amount", "Capture amount is not a decimal value.")
    try:
        cu_amount = ledger.amount_to_cu(usd)
    except ValueError as exc:
        raise _error(400, "invalid_capture_amount", str(exc)) from exc
    return cu_amount, usd


def _capture_id_from_resource(resource: Dict[str, Any]) -> str:
    capture_id = resource.get("id")
    if not capture_id or not isinstance(capture_id, str):
        raise _error(400, "invalid_capture", "Capture id is missing.")
    return capture_id


# -----------------------------------------------------------------------------
# 1. BALANCE & SUMMARY (measured from apex.ledger_entries only)
# -----------------------------------------------------------------------------
@router.get("/billing/balance")
async def get_user_balance(
    user: Dict[str, Any] = Security(get_current_user),
) -> Dict[str, Any]:
    user_id = user["user_id"]
    query = """
        SELECT
            w.id AS wallet_id,
            e.id AS escrow_id,
            apex.account_balance(w.id) AS wallet_cu,
            apex.account_balance(e.id) AS escrow_cu
        FROM apex.accounts w
        JOIN apex.accounts e ON e.owner_id = w.owner_id AND e.kind = 'user_escrow'
        WHERE w.owner_id = %s AND w.kind = 'user_wallet';
    """
    try:
        row = await db.fetch_one(query, (user_id,))
        if not row:
            raise _error(
                status.HTTP_404_NOT_FOUND,
                "wallet_not_found",
                "No wallet is provisioned for this account.",
            )
        clusters = await db.fetch_all(
            "SELECT count(*) AS cnt FROM apex.clusters "
            "WHERE owner_id = %s AND status = 'running';",
            (user_id,),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise _db_unavailable("balance", exc) from exc

    wallet_cu = int(row["wallet_cu"] or 0)
    escrow_cu = int(row["escrow_cu"] or 0)
    active_clusters = int(clusters[0]["cnt"]) if clusters else 0

    return {
        "user_id": user_id,
        "available_cu": wallet_cu,
        "available_usd": round(wallet_cu / 100.0, 2),
        "reserved_cu": escrow_cu,
        "reserved_usd": round(escrow_cu / 100.0, 2),
        "total_cu": wallet_cu + escrow_cu,
        "active_clusters": active_clusters,
        "currency": "CU",
        "conversion_rule": "$1.00 = 100 CU",
        "source": "MEASURED_LEDGER",
    }


@router.get("/billing/summary")
async def get_billing_summary(
    user: Dict[str, Any] = Security(get_current_user),
) -> Dict[str, Any]:
    query = """
        SELECT
            COALESCE(SUM(CASE WHEN le.direction = 'debit' THEN le.amount_cu ELSE 0 END), 0)
                AS spend_cu,
            COALESCE(SUM(CASE WHEN le.direction = 'credit' THEN le.amount_cu ELSE 0 END), 0)
                AS topup_cu
        FROM apex.ledger_entries le
        JOIN apex.accounts a ON a.id = le.account_id
        JOIN apex.transactions t ON t.id = le.transaction_id
        WHERE a.owner_id = %s
          AND a.kind = 'user_wallet'
          AND t.created_at >= NOW() - INTERVAL '30 days';
    """
    try:
        row = await db.fetch_one(query, (user["user_id"],))
    except Exception as exc:
        raise _db_unavailable("summary", exc) from exc

    spend_cu = int(row["spend_cu"] or 0) if row else 0
    topup_cu = int(row["topup_cu"] or 0) if row else 0

    return {
        "period_days": 30,
        "total_spend_cu": spend_cu,
        "total_spend_usd": round(spend_cu / 100.0, 2),
        "total_topup_cu": topup_cu,
        "total_topup_usd": round(topup_cu / 100.0, 2),
        "savings_vs_reference_cu": None,
        "savings_vs_reference_usd": None,
        "savings_percent": None,
        "benchmark_status": "NOT_MEASURED",
        "benchmark_disclaimer": (
            "Savings are not calculated: no reference baseline is recorded for this account."
        ),
        "source": "MEASURED_LEDGER",
    }


# -----------------------------------------------------------------------------
# 2. DOUBLE-ENTRY LEDGER AUDIT & VERIFICATION
# -----------------------------------------------------------------------------
@router.get("/billing/ledger")
async def get_user_ledger(
    user: Dict[str, Any] = Security(get_current_user),
) -> List[Dict[str, Any]]:
    """
    Return only ledger lines belonging to the caller. Transactions are authorized
    through at least one owned line first; all lines are then loaded internally
    for HMAC verification but clearing/platform lines are never returned.
    """
    query = """
        WITH authorized AS (
            SELECT t.id
            FROM apex.transactions t
            JOIN apex.ledger_entries le ON le.transaction_id = t.id
            JOIN apex.accounts a ON a.id = le.account_id
            WHERE a.owner_id = %s
            GROUP BY t.id
            ORDER BY MAX(t.created_at) DESC
            LIMIT 100
        )
        SELECT
            t.id AS tx_id,
            t.type,
            t.reference,
            t.hmac,
            t.hmac_kid,
            t.created_at,
            t.signed_at,
            le.id AS entry_id,
            le.account_id,
            le.direction,
            le.amount_cu,
            le.created_at AS entry_created_at,
            a.code AS account_code,
            a.kind AS account_kind,
            a.owner_id
        FROM apex.transactions t
        JOIN apex.ledger_entries le ON le.transaction_id = t.id
        JOIN apex.accounts a ON a.id = le.account_id
        WHERE t.id IN (SELECT id FROM authorized)
        ORDER BY t.created_at DESC, le.created_at DESC;
    """
    try:
        rows = await db.fetch_all(query, (user["user_id"],))
    except Exception as exc:
        raise _db_unavailable("ledger", exc) from exc

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["tx_id"]), []).append(row)

    results: List[Dict[str, Any]] = []
    for tx_id, tx_rows in grouped.items():
        head = tx_rows[0]
        all_lines = [
            {
                "account_code": r["account_code"],
                "direction": r["direction"],
                "amount_cu": int(r["amount_cu"]),
            }
            for r in tx_rows
        ]
        verify_meta = ledger.verify_transaction_signature(
            tx_id=tx_id,
            tx_type=head["type"],
            reference=head["reference"],
            signed_at_iso=_as_utc_iso(head.get("signed_at")),
            lines=all_lines,
            stored_hmac=head["hmac"],
            kid=head["hmac_kid"],
        )

        # Never expose clearing/platform lines (owner_id IS NULL or another tenant).
        for row in tx_rows:
            if str(row["owner_id"]) != str(user["user_id"]):
                continue
            results.append(
                {
                    "entry_id": str(row["entry_id"]),
                    "tx_id": tx_id,
                    "type": row["type"],
                    "reference": row["reference"],
                    "account_code": row["account_code"],
                    "account_kind": row["account_kind"],
                    "direction": row["direction"],
                    "amount_cu": int(row["amount_cu"]),
                    "amount_usd": round(int(row["amount_cu"]) / 100.0, 2),
                    "created_at": row["entry_created_at"],
                    "signed_at": row["signed_at"],
                    "hmac_sig_prefix": verify_meta["hmac_sig_prefix"],
                    **{
                        k: verify_meta[k]
                        for k in ("hmac_verified", "hmac_algo", "hmac_kid", "reason")
                        if k in verify_meta
                    },
                }
            )

    results.sort(key=lambda r: r["created_at"], reverse=True)
    return results


@router.get("/billing/security")
async def get_ledger_security_status() -> Dict[str, Any]:
    """Return measured RLS/trigger status; 503 when it cannot be measured."""
    query = """
        SELECT
            apex.rls_status() AS status,
            EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgname IN ('trg_no_update_tx', 'trg_no_update_le')
                  AND NOT tgisinternal
            ) AS immutability_triggers;
    """
    try:
        row = await db.fetch_one(query)
    except Exception as exc:
        raise _db_unavailable("security_status", exc) from exc

    if not row or not row.get("status"):
        raise _error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "security_status_unavailable",
            "Row-level security status could not be measured.",
        )

    return {
        "ledger_model": "DOUBLE_ENTRY_ATOMIC_IMMUTABLE",
        "currency_rule": "$1.00 = 100 CU",
        "cryptographic_algorithm": "HMAC-SHA256",
        "active_signing_kid": settings.LEDGER_HMAC_KID,
        "row_level_security": row["status"],
        "audit_immutability": (
            "ENFORCED_VIA_TRIGGERS" if row.get("immutability_triggers") else "NOT_VERIFIED"
        ),
        "source": "MEASURED_DATABASE",
    }


# -----------------------------------------------------------------------------
# 3. PRINTABLE RECEIPTS (real rows only; missing => 404)
# -----------------------------------------------------------------------------
@router.get("/billing/receipts/{entry_id}")
async def get_printable_receipt(
    entry_id: str,
    user: Dict[str, Any] = Security(get_current_user),
) -> Dict[str, Any]:
    try:
        uuid.UUID(entry_id)
    except ValueError:
        raise _error(status.HTTP_404_NOT_FOUND, "receipt_not_found", "Receipt not found.")

    query = """
        SELECT
            le.id AS entry_id,
            le.created_at,
            le.amount_cu,
            le.direction,
            t.id AS tx_id,
            t.type,
            t.reference,
            t.hmac,
            t.hmac_kid,
            t.signed_at,
            p.email
        FROM apex.ledger_entries le
        JOIN apex.transactions t ON t.id = le.transaction_id
        JOIN apex.accounts a ON a.id = le.account_id
        JOIN apex.profiles p ON p.id = a.owner_id
        WHERE le.id = %s AND a.owner_id = %s;
    """
    try:
        row = await db.fetch_one(query, (entry_id, user["user_id"]))
        if not row:
            raise _error(status.HTTP_404_NOT_FOUND, "receipt_not_found", "Receipt not found.")
        all_rows = await db.fetch_all(
            """
            SELECT a.code AS account_code, le.direction, le.amount_cu
            FROM apex.ledger_entries le
            JOIN apex.accounts a ON a.id = le.account_id
            WHERE le.transaction_id = %s;
            """,
            (row["tx_id"],),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise _db_unavailable("receipt", exc) from exc

    verify_meta = ledger.verify_transaction_signature(
        tx_id=str(row["tx_id"]),
        tx_type=row["type"],
        reference=row["reference"],
        signed_at_iso=_as_utc_iso(row.get("signed_at")),
        lines=[
            {
                "account_code": r["account_code"],
                "direction": r["direction"],
                "amount_cu": int(r["amount_cu"]),
            }
            for r in all_rows
        ],
        stored_hmac=row["hmac"],
        kid=row["hmac_kid"],
    )

    reference = row["reference"] or ""
    capture_id = (
        reference.replace("paypal:capture:", "", 1)
        if reference.startswith("paypal:capture:")
        else None
    )
    return {
        "receipt_id": f"REC-{str(row['entry_id'])[:8].upper()}",
        "date": row["created_at"].strftime("%Y-%m-%d %H:%M:%S UTC"),
        "customer_id": user["user_id"],
        "customer_email": row["email"],
        "amount_usd": f"${round(int(row['amount_cu']) / 100.0, 2):.2f}",
        "amount_cu": f"{int(row['amount_cu']):,} CU",
        "pack_name": reference,
        "payment_method": f"PayPal ({settings.PAYPAL_ENV.upper()})",
        "capture_id": capture_id,
        "hmac_signature_prefix": row["hmac"][:12] if row["hmac"] else "",
        "hmac_verified": verify_meta["hmac_verified"],
        "status": "SETTLED" if verify_meta["hmac_verified"] else "UNVERIFIED",
    }


# -----------------------------------------------------------------------------
# 4. PAYPAL CREATE ORDER & CAPTURE
# -----------------------------------------------------------------------------
class CreateOrderRequest(BaseModel):
    pack: str


class CaptureOrderRequest(BaseModel):
    order_id: str


@router.post("/billing/paypal/create-order")
async def paypal_create_order(
    req: CreateOrderRequest,
    user: Dict[str, Any] = Security(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
) -> Dict[str, Any]:
    if not settings.payments_enabled:
        raise _error(
            status.HTTP_403_FORBIDDEN,
            "payments_disabled",
            "Payments are not enabled for this deployment.",
        )

    pack = paypal.PAYPAL_PACKS.get(req.pack)
    if not pack:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "invalid_pack",
            f"Pack '{req.pack}' does not exist.",
        )

    amount_cents = int(pack["amount_cents"])
    if amount_cents > settings.DEPOSIT_MAX_TX_CENTS:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "deposit_limit_exceeded",
            f"Pack exceeds the max per-transaction deposit limit "
            f"(${settings.DEPOSIT_MAX_TX_CENTS // 100}).",
        )

    internal_order_id = f"apex_{uuid.uuid4().hex}"
    pp_order = await paypal.create_paypal_order(
        req.pack, user["user_id"], internal_order_id
    )
    pp_order_id = pp_order.get("id")
    if not pp_order_id:
        raise _error(
            status.HTTP_502_BAD_GATEWAY,
            "paypal_order_invalid",
            "PayPal did not return an order id.",
        )

    try:
        await db.execute(
            """
            INSERT INTO apex.paypal_orders
                (owner_id, order_id, pack, amount_cents, cu_amount, status)
            VALUES (%s, %s, %s, %s, %s, 'CREATED');
            """,
            (
                user["user_id"],
                pp_order_id,
                req.pack,
                amount_cents,
                int(pack["cu_amount"]),
            ),
        )
    except Exception as exc:
        logger.error(
            "Order persistence failed order_id=%s error=%s",
            pp_order_id,
            exc.__class__.__name__,
        )
        raise _error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "order_persistence_failed",
            "The order could not be stored; no payment should be captured.",
        ) from exc

    return {
        "order_id": pp_order_id,
        "pack": req.pack,
        "cu_amount": int(pack["cu_amount"]),
        "amount_usd": pack["amount_usd"],
        "status": "CREATED",
    }


@router.post("/billing/paypal/capture")
async def paypal_capture_order(
    req: CaptureOrderRequest,
    user: Dict[str, Any] = Security(get_current_user),
) -> Dict[str, Any]:
    """
    Capture the PayPal order and verify the captured amount. This route never
    credits CU; the verified webhook is the only credit path.
    """
    if not settings.payments_enabled:
        raise _error(
            status.HTTP_403_FORBIDDEN,
            "payments_disabled",
            "Payments are not enabled for this deployment.",
        )

    try:
        order_row = await db.fetch_one(
            "SELECT owner_id, amount_cents, cu_amount, status, capture_id "
            "FROM apex.paypal_orders WHERE order_id = %s;",
            (req.order_id,),
        )
    except Exception as exc:
        raise _db_unavailable("capture_order_lookup", exc) from exc

    if not order_row:
        raise _error(
            status.HTTP_404_NOT_FOUND,
            "order_not_found",
            "Order not found. Create the order before capturing.",
        )
    if str(order_row["owner_id"]) != str(user["user_id"]):
        raise _error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "Order does not belong to this user.",
        )
    if order_row["status"] == "COMPLETED":
        return {
            "status": "COMPLETED",
            "order_id": req.order_id,
            "capture_id": order_row.get("capture_id"),
            "already_captured": True,
        }

    capture_res = await paypal.capture_paypal_order(req.order_id)
    purchase_units = capture_res.get("purchase_units") or []
    payments = purchase_units[0].get("payments", {}) if purchase_units else {}
    captures = payments.get("captures", []) if isinstance(payments, dict) else []
    if not captures:
        raise _error(
            status.HTTP_502_BAD_GATEWAY,
            "capture_failed",
            "PayPal did not return a capture.",
        )

    capture_item = captures[0]
    capture_id = capture_item.get("id")
    capture_status = capture_item.get("status")
    captured_currency = str(
        (capture_item.get("amount") or {}).get("currency_code", "")
    ).upper()
    captured_value = (capture_item.get("amount") or {}).get("value")

    if not capture_id:
        raise _error(
            status.HTTP_502_BAD_GATEWAY,
            "capture_failed",
            "PayPal capture is missing an id.",
        )
    if capture_status != "COMPLETED":
        raise _error(
            status.HTTP_409_CONFLICT,
            "capture_incomplete",
            f"Capture status is {capture_status or 'unknown'}, not COMPLETED.",
        )
    if captured_currency != "USD":
        raise _error(
            status.HTTP_409_CONFLICT,
            "capture_currency_mismatch",
            "Captured currency does not match the stored USD order.",
        )

    try:
        captured_cents = int(Decimal(str(captured_value)) * 100)
    except (InvalidOperation, ValueError, TypeError):
        raise _error(
            status.HTTP_409_CONFLICT,
            "capture_amount_invalid",
            "Captured amount is invalid.",
        )
    if captured_cents != int(order_row["amount_cents"]):
        logger.error(
            "Capture amount mismatch order_id=%s capture_id=%s expected_cents=%s actual_cents=%s",
            req.order_id,
            capture_id,
            order_row["amount_cents"],
            captured_cents,
        )
        raise _error(
            status.HTTP_409_CONFLICT,
            "capture_amount_mismatch",
            "Captured amount does not match the stored order amount.",
        )

    try:
        updated = await db.fetch_one(
            """
            UPDATE apex.paypal_orders
               SET status = 'COMPLETED', capture_id = %s, updated_at = NOW()
             WHERE order_id = %s AND owner_id = %s
             RETURNING id;
            """,
            (capture_id, req.order_id, user["user_id"]),
        )
    except Exception as exc:
        raise _db_unavailable("capture_order_update", exc) from exc
    if not updated:
        raise _error(
            status.HTTP_404_NOT_FOUND,
            "order_not_found",
            "Order not found while recording the capture.",
        )

    return {
        "status": "COMPLETED",
        "order_id": req.order_id,
        "capture_id": capture_id,
    }


# -----------------------------------------------------------------------------
# 5. PAYPAL WEBHOOKS & STATUS
# -----------------------------------------------------------------------------
@router.post("/webhooks/paypal")
async def paypal_webhook_handler(request: Request) -> Dict[str, Any]:
    raw_body = (await request.body()).decode("utf-8")
    headers = request.headers

    transmission_id = headers.get("paypal-transmission-id", "")
    transmission_time = headers.get("paypal-transmission-time", "")
    cert_url = headers.get("paypal-cert-url", "")
    auth_algo = headers.get("paypal-auth-algo", "")
    transmission_sig = headers.get("paypal-transmission-sig", "")

    required_headers = (
        transmission_id,
        transmission_time,
        cert_url,
        auth_algo,
        transmission_sig,
    )
    if not settings.PAYPAL_WEBHOOK_ID or not all(required_headers):
        raise _error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "webhook_verification_unavailable",
            "PayPal webhook verification is not fully configured.",
        )

    is_valid = await paypal.verify_webhook_signature(
        transmission_id=transmission_id,
        transmission_time=transmission_time,
        cert_url=cert_url,
        auth_algo=auth_algo,
        transmission_sig=transmission_sig,
        raw_body=raw_body,
    )
    if not is_valid:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "invalid_webhook_signature",
            "PayPal webhook signature validation failed.",
        )

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise _error(status.HTTP_400_BAD_REQUEST, "bad_json", "Invalid JSON payload.")

    event_id = event.get("id")
    event_type = event.get("event_type")
    resource = event.get("resource") or {}
    if not event_id or not event_type:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "invalid_event",
            "Webhook event id and type are required.",
        )

    capture_id = resource.get("id") if isinstance(resource, dict) else None
    logger.info(
        "PayPal webhook received event_id=%s event_type=%s capture_id=%s",
        event_id,
        event_type,
        capture_id,
    )

    try:
        await db.execute(
            """
            INSERT INTO apex.paypal_events (event_id, event_type, summary, resource)
            VALUES (%s, %s, %s, %s::jsonb)
            ON CONFLICT (event_id) DO NOTHING;
            """,
            (event_id, event_type, event.get("summary"), json.dumps(resource)),
        )
    except Exception as exc:
        logger.error(
            "Webhook event persistence failed event_id=%s error=%s",
            event_id,
            exc.__class__.__name__,
        )
        raise _error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "webhook_persist_failed",
            "Webhook event could not be recorded.",
        ) from exc

    if event_type != "PAYMENT.CAPTURE.COMPLETED":
        return {"status": "received", "event_id": event_id, "event_type": event_type}

    # ---- Credit path: verified webhook only --------------------------------
    if not isinstance(resource, dict):
        raise _error(status.HTTP_400_BAD_REQUEST, "invalid_capture", "Capture resource is invalid.")

    capture_id = _capture_id_from_resource(resource)
    custom_id = resource.get("custom_id")
    try:
        user_id = str(uuid.UUID(str(custom_id)))
    except (ValueError, TypeError):
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "invalid_custom_id",
            "Capture custom_id is not a valid user id.",
        )

    if resource.get("status") != "COMPLETED":
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "capture_not_completed",
            "Webhook capture status is not COMPLETED.",
        )

    cu_amount, amount_usd = _parse_capture_amount(resource)

    # Validate the tenant and both accounts before minting anything.
    try:
        wallet = await db.fetch_one(
            "SELECT id, code FROM apex.accounts "
            "WHERE owner_id = %s AND kind = 'user_wallet';",
            (user_id,),
        )
        clearing = await db.fetch_one(
            "SELECT id, code FROM apex.accounts WHERE code = 'paypal_clearing';"
        )
    except Exception as exc:
        logger.error(
            "Webhook account validation failed event_id=%s capture_id=%s error=%s",
            event_id,
            capture_id,
            exc.__class__.__name__,
        )
        raise _error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "credit_validation_failed",
            "Capture accounts could not be validated.",
        ) from exc

    if not wallet or not clearing:
        logger.error(
            "Webhook account missing event_id=%s capture_id=%s wallet=%s clearing=%s",
            event_id,
            capture_id,
            bool(wallet),
            bool(clearing),
        )
        raise _error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "credit_account_missing",
            "Capture cannot be credited because a ledger account is missing.",
        )

    tx_id = str(uuid.uuid4())
    signed_at = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    reference = f"paypal:capture:{capture_id}"
    lines = [
        {
            "account_id": str(clearing["id"]),
            "account_code": clearing["code"],
            "direction": "debit",
            "amount_cu": cu_amount,
        },
        {
            "account_id": str(wallet["id"]),
            "account_code": wallet["code"],
            "direction": "credit",
            "amount_cu": cu_amount,
        },
    ]

    try:
        signature, kid = ledger.sign_transaction(
            tx_id, "TOPUP", reference, signed_at, lines
        )
    except ValueError as exc:
        logger.error("Webhook signing failed event_id=%s reason=%s", event_id, exc)
        raise _error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "credit_signing_failed",
            "Capture could not be signed for the ledger.",
        ) from exc

    rpc_sql = """
        SELECT apex.increment_user_credits(
            %s::uuid, %s::numeric, %s::integer, %s::text,
            %s::uuid, %s::text, %s::text, %s::timestamptz
        ) AS status;
    """
    try:
        row = await db.fetch_one(
            rpc_sql,
            (
                user_id,
                amount_usd,
                cu_amount,
                capture_id,
                tx_id,
                signature,
                kid,
                signed_at,
            ),
        )
        result = row.get("status") if row else None
    except Exception as exc:
        logger.error(
            "Webhook credit RPC failed event_id=%s capture_id=%s error=%s",
            event_id,
            capture_id,
            exc.__class__.__name__,
        )
        raise _error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "credit_failed",
            "Capture could not be credited. PayPal will retry.",
        ) from exc

    if result not in ("CREDITED", "DUPLICATE"):
        logger.error(
            "Webhook credit RPC returned invalid status event_id=%s capture_id=%s status=%s",
            event_id,
            capture_id,
            result,
        )
        raise _error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "credit_failed",
            "Capture could not be credited. PayPal will retry.",
        )

    logger.info(
        "PayPal capture settled event_id=%s capture_id=%s result=%s",
        event_id,
        capture_id,
        result,
    )
    return {
        "status": result.lower(),
        "event_id": event_id,
        "event_type": event_type,
        "capture_id": capture_id,
    }


@router.get("/webhooks/paypal/status")
async def get_webhook_status() -> Dict[str, Any]:
    return {
        "configured": bool(settings.PAYPAL_WEBHOOK_ID),
        "env": settings.PAYPAL_ENV,
        "endpoint": "/v1/webhooks/paypal",
    }
