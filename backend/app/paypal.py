"""
PayPal REST API v2 Integration (Orders, Capture, and Webhook Verification).
Enforces exact server-side pack pricing: $1.00 = 100 CU.
Client never submits payment amounts; only the pack identifier.
"""

import json
import logging
import time
import uuid
from typing import Dict, Any, Optional

import httpx
from fastapi import HTTPException, status

from .config import settings

logger = logging.getLogger("apex.paypal")

PAYPAL_PACKS: Dict[str, Dict[str, Any]] = {
    "developer": {
        "name": "Developer Pack",
        "amount_usd": "50.00",
        "amount_cents": 5000,
        "cu_amount": 5000,
    },
    "prototype": {
        "name": "Prototype Pack",
        "amount_usd": "100.00",
        "amount_cents": 10000,
        "cu_amount": 10000,
    },
    "enterprise": {
        "name": "Enterprise Cluster Pack",
        "amount_usd": "500.00",
        "amount_cents": 50000,
        "cu_amount": 50000,
    },
    "sovereign": {
        "name": "Sovereign Scale Pack",
        "amount_usd": "1000.00",
        "amount_cents": 100000,
        "cu_amount": 100000,
    },
}

_access_token_cache: Optional[str] = None
_access_token_expires_at: float = 0.0


def _correlation_id() -> str:
    return f"pp_{uuid.uuid4().hex[:16]}"


def _upstream_failure(
    operation: str,
    correlation_id: str,
    status_code: Optional[int] = None,
    error_code: str = "paypal_upstream_error",
) -> HTTPException:
    """Log only operation/status/correlation id; never log PayPal response bodies."""
    logger.error(
        "PayPal upstream failure operation=%s status=%s correlation_id=%s",
        operation,
        status_code,
        correlation_id,
    )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail={
            "error": {
                "code": error_code,
                "message": "PayPal request failed. Retry or contact support with the correlation id.",
                "correlation_id": correlation_id,
            }
        },
    )


def get_paypal_base_url() -> str:
    return (
        "https://api-m.paypal.com"
        if settings.PAYPAL_ENV == "live"
        else "https://api-m.sandbox.paypal.com"
    )


async def get_paypal_access_token() -> str:
    global _access_token_cache, _access_token_expires_at
    now = time.time()

    if _access_token_cache and now < (_access_token_expires_at - 60):
        return _access_token_cache

    if not settings.PAYPAL_CLIENT_ID or not settings.PAYPAL_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "paypal_unconfigured",
                    "message": "PayPal credentials are not configured on the backend.",
                }
            },
        )

    url = f"{get_paypal_base_url()}/v1/oauth2/token"
    correlation_id = _correlation_id()
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.post(
                url,
                data={"grant_type": "client_credentials"},
                auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET),
                headers={"Accept": "application/json", "Accept-Language": "en_US"},
            )
        except httpx.RequestError:
            raise _upstream_failure("oauth_token", correlation_id)

    if res.status_code != 200:
        raise _upstream_failure("oauth_token", correlation_id, res.status_code)

    try:
        data = res.json()
        token = data["access_token"]
    except (ValueError, KeyError):
        raise _upstream_failure("oauth_token_parse", correlation_id, res.status_code)

    _access_token_cache = token
    _access_token_expires_at = now + int(data.get("expires_in", 3600))
    return _access_token_cache


async def create_paypal_order(
    pack_id: str, user_id: str, internal_order_id: str
) -> Dict[str, Any]:
    """Create a PayPal v2 order for a server-side pack."""
    pack = PAYPAL_PACKS.get(pack_id)
    if not pack:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "invalid_pack", "message": f"Pack '{pack_id}' is invalid."}},
        )

    token = await get_paypal_access_token()
    url = f"{get_paypal_base_url()}/v2/checkout/orders"
    correlation_id = _correlation_id()

    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "reference_id": f"ref_{internal_order_id}",
                "custom_id": user_id,
                "invoice_id": internal_order_id,
                "description": (
                    f"ApexSovereign.ai Compute Top-Up: {pack['name']} "
                    f"({pack['cu_amount']} CU)"
                ),
                "amount": {"currency_code": "USD", "value": pack["amount_usd"]},
            }
        ],
        "application_context": {
            "brand_name": "ApexSovereign.ai",
            "landing_page": "NO_PREFERENCE",
            "user_action": "PAY_NOW",
        },
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            res = await client.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
        except httpx.RequestError:
            raise _upstream_failure("create_order", correlation_id)

    if res.status_code not in (200, 201):
        raise _upstream_failure("create_order", correlation_id, res.status_code)

    try:
        return res.json()
    except ValueError:
        raise _upstream_failure("create_order_parse", correlation_id, res.status_code)


async def capture_paypal_order(order_id: str) -> Dict[str, Any]:
    """Capture an authorized order. Never returns PayPal's error body to clients."""
    token = await get_paypal_access_token()
    url = f"{get_paypal_base_url()}/v2/checkout/orders/{order_id}/capture"
    correlation_id = _correlation_id()

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            res = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
        except httpx.RequestError:
            raise _upstream_failure("capture_order", correlation_id)

    if res.status_code not in (200, 201):
        raise _upstream_failure("capture_order", correlation_id, res.status_code)

    try:
        return res.json()
    except ValueError:
        raise _upstream_failure("capture_order_parse", correlation_id, res.status_code)


async def verify_webhook_signature(
    transmission_id: str,
    transmission_time: str,
    cert_url: str,
    auth_algo: str,
    transmission_sig: str,
    raw_body: str,
) -> bool:
    """
    Call PayPal's /v1/notifications/verify-webhook-signature endpoint.
    Returns True only for verification_status == SUCCESS. Upstream outages raise
    503 so PayPal retries instead of us silently discarding a valid event.
    """
    if not settings.PAYPAL_WEBHOOK_ID:
        logger.error("PAYPAL_WEBHOOK_ID is not configured.")
        return False

    try:
        webhook_event = json.loads(raw_body)
    except ValueError:
        return False

    token = await get_paypal_access_token()
    url = f"{get_paypal_base_url()}/v1/notifications/verify-webhook-signature"
    correlation_id = _correlation_id()

    payload = {
        "transmission_id": transmission_id,
        "transmission_time": transmission_time,
        "cert_url": cert_url,
        "auth_algo": auth_algo,
        "transmission_sig": transmission_sig,
        "webhook_id": settings.PAYPAL_WEBHOOK_ID,
        "webhook_event": webhook_event,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
        except httpx.RequestError:
            logger.error(
                "PayPal webhook verification unavailable correlation_id=%s", correlation_id
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "error": {
                        "code": "webhook_verification_unavailable",
                        "message": "PayPal webhook verification is temporarily unavailable.",
                        "correlation_id": correlation_id,
                    }
                },
            )

    if res.status_code != 200:
        logger.error(
            "PayPal webhook verification failure status=%s correlation_id=%s",
            res.status_code,
            correlation_id,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "webhook_verification_unavailable",
                    "message": "PayPal webhook verification is temporarily unavailable.",
                    "correlation_id": correlation_id,
                }
            },
        )

    try:
        data = res.json()
    except ValueError:
        return False
    return data.get("verification_status") == "SUCCESS"
