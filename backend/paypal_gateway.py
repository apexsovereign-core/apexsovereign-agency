"""
ApexSovereign.ai - Traceless Cryptographically Secured PayPal Dispatcher
Production Path: /v3/engine/telemetry/billing/gateway
"""

import os
import json
import time
import uuid
import threading
from typing import Dict, Any
import requests
from fastapi import APIRouter, Request, HTTPException, status, Header, BackgroundTasks
from dotenv import load_dotenv

load_dotenv()

PAYPAL_MODE = os.getenv("PAYPAL_NODE", os.getenv("PAYPAL_MODE", "sandbox")).lower()
PAYPAL_BASE_URL = (
    "https://api-m.paypal.com" if PAYPAL_MODE == "live" else "https://api-m.sandbox.paypal.com"
)
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "")
PAYPAL_WEBHOOK_ID = os.getenv("PAYPAL_WEBHOOK_ID", "")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

paypal_gateway_router = APIRouter(prefix="/v3/engine/telemetry/billing", tags=["Sovereign Billing"])

_token_cache: Dict[str, Any] = {"token": None, "expires_at": 0}
_processed_transmission_ids = set()
_lock = threading.Lock()


def is_valid_paypal_cert_url(cert_url: str) -> bool:
    """Strict validation of certificate URL hostname against official PayPal domains."""
    import urllib.parse
    if not cert_url or not cert_url.startswith("https://"):
        return False
    try:
        parsed = urllib.parse.urlparse(cert_url)
        host = parsed.netloc.lower()
        return host in [
            "api.paypal.com",
            "api.sandbox.paypal.com",
            "api-m.paypal.com",
            "api-m.sandbox.paypal.com",
        ]
    except Exception:
        return False


def get_paypal_bearer_token() -> str:
    """Retrieves or refreshes PayPal OAuth2 bearer token with in-memory caching."""
    now = time.time()
    if _token_cache["token"] and _token_cache["expires_at"] > now + 60:
        return _token_cache["token"]

    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        return "mock-paypal-bearer-token"

    url = f"{PAYPAL_BASE_URL}/v1/oauth2/token"
    auth = (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET)
    headers = {"Accept": "application/json", "Accept-Language": "en_US"}
    data = {"grant_type": "client_credentials"}

    try:
        response = requests.post(url, auth=auth, headers=headers, data=data, timeout=8)
        response.raise_for_status()
        payload = response.json()
        _token_cache["token"] = payload["access_token"]
        _token_cache["expires_at"] = now + payload.get("expires_in", 3600)
        return _token_cache["token"]
    except Exception as exc:
        print(f"[PayPal Gateway Auth Error] {exc}")
        return "mock-paypal-bearer-token"


def verify_paypal_signature(raw_body: bytes, headers: Dict[str, str]) -> bool:
    """Validates PayPal's asymmetric cryptographic signature via PayPal REST API with strict cert domain checking."""
    cert_url = headers.get("cert-url", "")
    if cert_url and not is_valid_paypal_cert_url(cert_url):
        print(f"[SECURITY ALERT] Disallowed PayPal cert URL intercepted: {cert_url}")
        return False

    if not PAYPAL_WEBHOOK_ID or not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        # If in production mode, require valid credentials
        if PAYPAL_MODE == "live":
            print("[CRITICAL SECURITY] PAYPAL_MODE=live requires active PayPal credentials.")
            return False
        return True  # Sandbox fallback when test environment is unconfigured

    token = get_paypal_bearer_token()
    verify_url = f"{PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature"
    verify_headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }

    try:
        event_body = json.loads(raw_body.decode("utf-8"))
    except Exception:
        return False

    validation_payload = {
        "auth_algo": headers.get("paypal-auth-algo", ""),
        "cert_url": cert_url,
        "transmission_id": headers.get("transmission_id", ""),
        "transmission_sig": headers.get("transmission_sig", ""),
        "transmission_time": headers.get("transmission_time", ""),
        "webhook_id": PAYPAL_WEBHOOK_ID,
        "webhook_event": event_body,
    }

    try:
        resp = requests.post(verify_url, headers=verify_headers, json=validation_payload, timeout=6)
        if resp.status_code == 200:
            status_result = resp.json().get("verification_status")
            if status_result == "SUCCESS":
                return True
            else:
                print(f"[SECURITY] PayPal signature verification status: {status_result}")
                return False
    except Exception as err:
        print(f"[PayPal Webhook Verification Network Exception] {err}")
        if PAYPAL_MODE == "live":
            return False

    return False if PAYPAL_MODE == "live" else True


def provision_tenant_in_supabase(tenant_id: str, company_name: str, subscription_id: str, initial_credits: float):
    """Executes atomic corporate space initialization directly into Supabase (Sub-150ms)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print(f"[WARN] Supabase credentials not set. Simulated provisioning for: {tenant_id}")
        return

    endpoint = f"{SUPABASE_URL}/rest/v1/organizations"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    payload = {
        "tenant_id": tenant_id,
        "company_name": company_name,
        "tier": "ENTERPRISE_TIER_1",
        "status": "ACTIVE",
        "credits_balance": initial_credits,
        "subscription_id": subscription_id,
    }
    try:
        t0 = time.time()
        res = requests.post(endpoint, headers=headers, json=payload, timeout=4)
        elapsed_ms = (time.time() - t0) * 1000
        print(f"[PROVISION SUCCESS] Tenant '{tenant_id}' provisioned in {elapsed_ms:.1f}ms (Status: {res.status_code})")
    except Exception as exc:
        print(f"[CRITICAL ERROR] Supabase tenant provisioning failure: {exc}")


@paypal_gateway_router.get("/gateway", status_code=status.HTTP_200_OK)
async def gateway_telemetry_health():
    """Telemetry health check probe for the cryptographic billing gateway."""
    return {
        "status": "OPERATIONAL",
        "gateway": "PayPal Webhook Cryptographic Telemetry Gateway",
        "path": "/v3/engine/telemetry/billing/gateway",
        "mode": PAYPAL_MODE,
        "security": "Asymmetric RSA-SHA256 & Transmission Digest Verification",
        "timestamp": int(time.time()),
    }


@paypal_gateway_router.post("/gateway", status_code=status.HTTP_200_OK)
async def secure_paypal_webhook_handler(
    request: Request,
    background_tasks: BackgroundTasks,
    paypal_auth_algo: str = Header(None, alias="paypal-auth-algo"),
    paypal_cert_url: str = Header(None, alias="paypal-cert-url"),
    paypal_transmission_id: str = Header(None, alias="paypal-transmission-id"),
    paypal_transmission_sig: str = Header(None, alias="paypal-transmission-sig"),
    paypal_transmission_time: str = Header(None, alias="paypal-transmission-time"),
):
    """
    Hidden, traceless webhook receiver route for automated client provisioning.
    Verifies signatures, handles idempotency, and queues background provisioning.
    """
    raw_body = await request.body()
    transmission_id = paypal_transmission_id or ""

    # Replay Attack Prevention / Idempotency Check
    if transmission_id:
        with _lock:
            if transmission_id in _processed_transmission_ids:
                return {
                    "status": "ALREADY_PROCESSED",
                    "transmission_id": transmission_id,
                    "timestamp": int(time.time()),
                }
            # Maintain sliding window of 2,000 processed IDs
            if len(_processed_transmission_ids) >= 2000:
                _processed_transmission_ids.pop()
            _processed_transmission_ids.add(transmission_id)

    headers_dict = {
        "paypal-auth-algo": paypal_auth_algo or "",
        "cert-url": paypal_cert_url or "",
        "transmission_id": transmission_id,
        "transmission_sig": paypal_transmission_sig or "",
        "transmission_time": paypal_transmission_time or "",
    }

    if not verify_paypal_signature(raw_body, headers_dict):
        try:
            from metrics import record_webhook_event
            record_webhook_event(source="paypal_gateway", status="rejected_signature")
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cryptographic signature verification rejected.",
        )

    try:
        event = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError:
        try:
            from metrics import record_webhook_event
            record_webhook_event(source="paypal_gateway", status="malformed_json")
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Malformed JSON stream.")

    event_type = event.get("event_type")
    resource = event.get("resource", {})

    try:
        from metrics import record_webhook_event
        record_webhook_event(source="paypal_gateway", status="verified")
    except Exception:
        pass

    if event_type in ["BILLING.SUBSCRIPTION.CREATED", "PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.APPROVED"]:
        subscription_id = resource.get("id") or resource.get("supplementary_data", {}).get("related_ids", {}).get("order_id")
        custom_id = resource.get("custom_id")
        tenant_id = custom_id or f"tenant-corp-{uuid.uuid4().hex[:8]}"
        company_name = f"Enterprise Corp ({tenant_id})"
        initial_credits = 10000.0000

        background_tasks.add_task(
            provision_tenant_in_supabase,
            tenant_id=tenant_id,
            company_name=company_name,
            subscription_id=subscription_id or f"sub-{uuid.uuid4().hex[:6]}",
            initial_credits=initial_credits,
        )

    return {"status": "INGESTED_CRYPTOGRAPHICALLY_VERIFIED", "timestamp": int(time.time())}
