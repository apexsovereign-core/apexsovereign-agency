"""
PayPal REST API v2 Integration (Orders, Capture, and Webhook Verification).
Enforces exact server-side pack pricing: $1.00 = 100 CU ($50 -> 5,000 CU, $100 -> 10,000 CU, etc.).
Client never submits payment amounts; only the pack identifier.
Strictly adheres to Rule 4 for payments enablement.
"""

import time
import logging
from typing import Dict, Any, Optional, Tuple
import httpx
from fastapi import HTTPException, status

from .config import settings

logger = logging.getLogger("apex.paypal")

PAYPAL_PACKS: Dict[str, Dict[str, Any]] = {
    "developer": {
        "name": "Developer Pack",
        "amount_usd": "50.00",
        "amount_cents": 5000,
        "cu_amount": 5000
    },
    "prototype": {
        "name": "Prototype Pack",
        "amount_usd": "100.00",
        "amount_cents": 10000,
        "cu_amount": 10000
    },
    "enterprise": {
        "name": "Enterprise Cluster Pack",
        "amount_usd": "500.00",
        "amount_cents": 50000,
        "cu_amount": 50000
    },
    "sovereign": {
        "name": "Sovereign Scale Pack",
        "amount_usd": "1000.00",
        "amount_cents": 100000,
        "cu_amount": 100000
    }
}

_access_token_cache: Optional[str] = None
_access_token_expires_at: float = 0.0


def get_paypal_base_url() -> str:
    return "https://api-m.paypal.com" if settings.PAYPAL_ENV == "live" else "https://api-m.sandbox.paypal.com"


async def get_paypal_access_token() -> str:
    global _access_token_cache, _access_token_expires_at
    now = time.time()

    if _access_token_cache and now < (_access_token_expires_at - 60):
        return _access_token_cache

    if not settings.PAYPAL_CLIENT_ID or not settings.PAYPAL_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"code": "paypal_unconfigured", "message": "PayPal credentials not configured on backend."}}
        )

    url = f"{get_paypal_base_url()}/v1/oauth2/token"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.post(
                url,
                data={"grant_type": "client_credentials"},
                auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET),
                headers={"Accept": "application/json", "Accept-Language": "en_US"}
            )
            if res.status_code != 200:
                logger.error(f"PayPal token failure: {res.status_code} - {res.text}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"error": {"code": "paypal_auth_failed", "message": "Failed to authenticate with PayPal API."}}
                )
            data = res.json()
            _access_token_cache = data["access_token"]
            _access_token_expires_at = now + data.get("expires_in", 3600)
            return _access_token_cache
        except httpx.RequestError as e:
            logger.error(f"Network error obtaining PayPal token: {e}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail={"error": {"code": "paypal_timeout", "message": "PayPal token request timed out."}}
            )


async def create_paypal_order(
    pack_id: str,
    user_id: str,
    internal_order_id: str
) -> Dict[str, Any]:
    """
    Creates a PayPal v2 order for a defined pack.
    """
    pack = PAYPAL_PACKS.get(pack_id)
    if not pack:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "invalid_pack", "message": f"Pack '{pack_id}' is invalid."}}
        )

    token = await get_paypal_access_token()
    url = f"{get_paypal_base_url()}/v2/checkout/orders"

    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "reference_id": f"ref_{internal_order_id}",
                "custom_id": user_id,
                "invoice_id": internal_order_id,
                "description": f"ApexSovereign.ai Compute Top-Up: {pack['name']} ({pack['cu_amount']} CU)",
                "amount": {
                    "currency_code": "USD",
                    "value": pack["amount_usd"]
                }
            }
        ],
        "application_context": {
            "brand_name": "ApexSovereign.ai",
            "landing_page": "NO_PREFERENCE",
            "user_action": "PAY_NOW"
        }
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            res = await client.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
            )
            if res.status_code not in (200, 201):
                logger.error(f"PayPal create order error: {res.status_code} - {res.text}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"error": {"code": "paypal_order_failed", "message": "Failed to create order with PayPal."}}
                )
            return res.json()
        except httpx.RequestError as e:
            logger.error(f"Network error creating PayPal order: {e}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail={"error": {"code": "paypal_timeout", "message": "PayPal order creation timed out."}}
            )


async def capture_paypal_order(order_id: str) -> Dict[str, Any]:
    """
    Captures authorized payment for the order.
    """
    token = await get_paypal_access_token()
    url = f"{get_paypal_base_url()}/v2/checkout/orders/{order_id}/capture"

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            res = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
            )
            if res.status_code not in (200, 201):
                logger.error(f"PayPal capture order error: {res.status_code} - {res.text}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": {"code": "paypal_capture_failed", "message": f"Capture rejected by PayPal: {res.text}"}}
                )
            return res.json()
        except httpx.RequestError as e:
            logger.error(f"Network error capturing PayPal order: {e}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail={"error": {"code": "paypal_timeout", "message": "PayPal payment capture timed out."}}
            )


async def verify_webhook_signature(
    transmission_id: str,
    transmission_time: str,
    cert_url: str,
    auth_algo: str,
    transmission_sig: str,
    raw_body: str
) -> bool:
    """
    Calls PayPal's /v1/notifications/verify-webhook-signature endpoint.
    Strictly enforces server-side validation.
    """
    if not settings.PAYPAL_WEBHOOK_ID:
        logger.error("PAYPAL_WEBHOOK_ID is not configured.")
        return False

    token = await get_paypal_access_token()
    url = f"{get_paypal_base_url()}/v1/notifications/verify-webhook-signature"

    payload = {
        "transmission_id": transmission_id,
        "transmission_time": transmission_time,
        "cert_url": cert_url,
        "auth_algo": auth_algo,
        "transmission_sig": transmission_sig,
        "webhook_id": settings.PAYPAL_WEBHOOK_ID,
        "webhook_event": httpx.Response(200, content=raw_body).json()
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            )
            if res.status_code == 200:
                data = res.json()
                return data.get("verification_status") == "SUCCESS"
            return False
        except Exception as e:
            logger.error(f"Error calling PayPal webhook verification: {e}")
            return False
