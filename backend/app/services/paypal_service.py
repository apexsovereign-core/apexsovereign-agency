"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: PayPal Enterprise Gateway & Cryptographic Webhook Verifier
Author: Principal Systems Architect

Features:
- Thread-safe asynchronous OAuth2 token caching with TTL buffer.
- Order creation & capture with PayPal-Request-Id idempotency header.
- SSRF-hardened Cryptographic Webhook signature verification via PayPal API.
- Zero credential instantiation: strict reliance on require_env configuration.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, Optional
import httpx

from backend.app.config import get_settings
from backend.app.core.exceptions import PayPalVerificationError
from backend.app.core.security import validate_paypal_cert_url

logger = logging.getLogger("apexsovereign.paypal")


class PayPalService:
    """
    Production-grade asynchronous PayPal REST API v2 client.
    Handles OAuth2 token caching, order lifecycle, and cryptographic webhook verification.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0.0
        self._lock = asyncio.Lock()
        self._http_client = httpx.AsyncClient(timeout=30.0)

    async def close(self) -> None:
        """Closes the underlying HTTP client connection pool."""
        await self._http_client.aclose()

    async def get_access_token(self) -> str:
        """
        Retrieves a valid OAuth2 Bearer token, automatically refreshing when within
        the 300-second safety expiry buffer.
        """
        now = time.time()
        # Fast path without lock if token is comfortably valid
        if self._access_token and (self._token_expires_at - now > 300):
            return self._access_token

        async with self._lock:
            # Double-check inside lock
            if self._access_token and (self._token_expires_at - now > 300):
                return self._access_token

            logger.info("Requesting fresh PayPal OAuth2 access token...")
            token_url = f"{self._settings.paypal_base_url}/v1/oauth2/token"

            response = await self._http_client.post(
                token_url,
                data={"grant_type": "client_credentials"},
                auth=(self._settings.PAYPAL_CLIENT_ID, self._settings.PAYPAL_CLIENT_SECRET),
                headers={"Accept": "application/json", "Accept-Language": "en_US"},
            )

            if response.status_code != 200:
                logger.error("PayPal OAuth2 token exchange failed: %d - %s", response.status_code, response.text)
                raise RuntimeError(f"PayPal OAuth2 failure (HTTP {response.status_code}): {response.text}")

            payload = response.json()
            self._access_token = payload["access_token"]
            expires_in = float(payload.get("expires_in", 3600))
            self._token_expires_at = time.time() + expires_in
            logger.info("Acquired fresh PayPal OAuth2 token (expires in %ds).", int(expires_in))
            return self._access_token

    async def create_checkout_order(
        self,
        tenant_id: str,
        amount: float,
        currency: str,
        credits_allocated: float,
        idempotency_key: str,
        return_url: str,
        cancel_url: str,
    ) -> Dict[str, Any]:
        """
        Initializes a PayPal checkout order (v2/checkout/orders) with intent CAPTURE.
        Attaches custom_id for multi-tenant tracking and passes PayPal-Request-Id for gateway idempotency.
        """
        token = await self.get_access_token()
        url = f"{self._settings.paypal_base_url}/v2/checkout/orders"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "PayPal-Request-Id": idempotency_key,
            "Prefer": "return=representation",
        }

        order_payload = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "reference_id": f"TENANT_{tenant_id}",
                    "custom_id": f"{tenant_id}:{credits_allocated}:{idempotency_key}",
                    "description": f"ApexSovereign Enterprise Compute Credits ({credits_allocated} Credits)",
                    "amount": {
                        "currency_code": currency.upper(),
                        "value": f"{amount:.2f}",
                    },
                }
            ],
            "application_context": {
                "brand_name": "ApexSovereign.ai",
                "landing_page": "NO_PREFERENCE",
                "user_action": "PAY_NOW",
                "return_url": return_url,
                "cancel_url": cancel_url,
            },
        }

        response = await self._http_client.post(url, json=order_payload, headers=headers)
        if response.status_code not in (200, 201):
            logger.error("Failed to create PayPal order: %d - %s", response.status_code, response.text)
            raise RuntimeError(f"PayPal Order Creation Error (HTTP {response.status_code}): {response.text}")

        return response.json()

    async def get_order_details(self, order_id: str) -> Dict[str, Any]:
        """
        Retrieves live order representation directly from PayPal REST API v2.
        Used to verify capture status, amount, and custom_id bindings.
        """
        token = await self.get_access_token()
        url = f"{self._settings.paypal_base_url}/v2/checkout/orders/{order_id}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }

        response = await self._http_client.get(url, headers=headers)
        if response.status_code != 200:
            logger.error("Failed to fetch PayPal order %s: %d - %s", order_id, response.status_code, response.text)
            raise RuntimeError(f"PayPal Order Verification Failure (HTTP {response.status_code}): {response.text}")

        return response.json()

    async def capture_order(self, order_id: str, idempotency_key: str) -> Dict[str, Any]:
        """
        Captures authorized payment for a PayPal order.
        """
        token = await self.get_access_token()
        url = f"{self._settings.paypal_base_url}/v2/checkout/orders/{order_id}/capture"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "PayPal-Request-Id": idempotency_key,
            "Prefer": "return=representation",
        }

        response = await self._http_client.post(url, headers=headers)
        if response.status_code not in (200, 201):
            logger.error("Failed to capture PayPal order %s: %d - %s", order_id, response.status_code, response.text)
            raise RuntimeError(f"PayPal Capture Error (HTTP {response.status_code}): {response.text}")

        return response.json()

    async def verify_webhook_signature(
        self,
        headers: Dict[str, str],
        raw_body: Dict[str, Any],
    ) -> bool:
        """
        Cryptographically validates an incoming PayPal webhook notification.
        Enforces:
        1. SSRF prevention via validate_paypal_cert_url.
        2. Strict validation against PayPal verify-webhook-signature API.
        3. Match against configured PAYPAL_WEBHOOK_ID.
        """
        auth_algo = headers.get("paypal-auth-algo") or headers.get("PAYPAL-AUTH-ALGO")
        cert_url = headers.get("paypal-cert-url") or headers.get("PAYPAL-CERT-URL")
        transmission_id = headers.get("paypal-transmission-id") or headers.get("PAYPAL-TRANSMISSION-ID")
        transmission_sig = headers.get("paypal-transmission-sig") or headers.get("PAYPAL-TRANSMISSION-SIG")
        transmission_time = headers.get("paypal-transmission-time") or headers.get("PAYPAL-TRANSMISSION-TIME")

        if not all([auth_algo, cert_url, transmission_id, transmission_sig, transmission_time]):
            logger.warning("PayPal webhook rejected: Missing cryptographic header(s).")
            return False

        # SSRF Protection: ensure cert_url originates from legitimate PayPal domain
        if not validate_paypal_cert_url(cert_url):  # type: ignore[arg-type]
            logger.warning("PayPal webhook rejected: Untrusted cert_url domain: %s", cert_url)
            return False

        token = await self.get_access_token()
        verification_url = f"{self._settings.paypal_base_url}/v1/notifications/verify-webhook-signature"

        verification_payload = {
            "auth_algo": auth_algo,
            "cert_url": cert_url,
            "transmission_id": transmission_id,
            "transmission_sig": transmission_sig,
            "transmission_time": transmission_time,
            "webhook_id": self._settings.PAYPAL_WEBHOOK_ID,
            "webhook_event": raw_body,
        }

        verify_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }

        try:
            response = await self._http_client.post(
                verification_url,
                json=verification_payload,
                headers=verify_headers,
            )

            if response.status_code != 200:
                logger.error("PayPal verification endpoint returned status %d: %s", response.status_code, response.text)
                return False

            result = response.json()
            status = result.get("verification_status")
            if status == "SUCCESS":
                logger.info("PayPal webhook signature successfully verified [event_id=%s].", raw_body.get("id"))
                return True
            else:
                logger.warning("PayPal cryptographic verification failed: verification_status=%s", status)
                return False
        except Exception as exc:
            logger.error("Exception during PayPal webhook verification: %s", str(exc))
            return False


# Singleton service provider
_paypal_service: Optional[PayPalService] = None


def get_paypal_service() -> PayPalService:
    global _paypal_service
    if _paypal_service is None:
        _paypal_service = PayPalService()
    return _paypal_service
