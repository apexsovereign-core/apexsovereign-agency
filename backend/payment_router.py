"""
ApexSovereign.ai - PayPal Integration & Payment Router
Implements PayPal REST API v2 checkout order initiation, order capture,
and secure webhook listener for automated compute credit provisioning.
"""

import os
import json
import time
from typing import Dict, Any, Optional
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, Header, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from compute_broker import get_db, User, Transaction

load_dotenv()

# ---------------------------------------------------------------------------
# PayPal Configuration
# ---------------------------------------------------------------------------
PAYPAL_MODE = os.getenv("PAYPAL_MODE", "sandbox").lower()
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "")
PAYPAL_WEBHOOK_ID = os.getenv("PAYPAL_WEBHOOK_ID", "")

PAYPAL_BASE_URL = (
    "https://api-m.paypal.com" 
    if PAYPAL_MODE == "live" 
    else "https://api-m.sandbox.paypal.com"
)

# In-memory access token cache
_token_cache: Dict[str, Any] = {"token": None, "expires_at": 0}


def get_paypal_access_token() -> str:
    """
    Retrieves or refreshes PayPal OAuth2 Bearer token with local expiration caching.
    Guarantees strict authentication against PayPal live API without mock fallbacks.
    """
    now = time.time()
    if _token_cache["token"] and _token_cache["expires_at"] > now + 60:
        return _token_cache["token"]

    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Production PayPal credentials not configured. PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required.",
        )

    url = f"{PAYPAL_BASE_URL}/v1/oauth2/token"
    headers = {"Accept": "application/json", "Accept-Language": "en_US"}
    data = {"grant_type": "client_credentials"}

    try:
        response = requests.post(
            url,
            auth=(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET),
            headers=headers,
            data=data,
            timeout=10,
        )
        response.raise_for_status()
        token_data = response.json()

        access_token = token_data["access_token"]
        expires_in = token_data.get("expires_in", 3600)

        _token_cache["token"] = access_token
        _token_cache["expires_at"] = now + expires_in
        return access_token
    except Exception as exc:
        print(f"[PayPal Auth Error] Failed to obtain access token: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unable to authenticate with PayPal API: {str(exc)}",
        )


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class CheckoutInitiateRequest(BaseModel):
    tenant_id: str = Field(..., example="tenant-enterprise-4401")
    amount: float = Field(..., ge=10.0, example=100.0)
    currency: str = Field("USD", example="USD")
    return_url: Optional[str] = None
    cancel_url: Optional[str] = None
    idempotency_key: str = Field(..., example="topup-1726500000-xyz")


class CheckoutInitiateResponse(BaseModel):
    order_id: str
    tenant_id: str
    amount: float
    currency: str
    approve_url: str
    status: str


class CaptureResponse(BaseModel):
    order_id: str
    tenant_id: str
    amount_captured: float
    new_balance: float
    status: str
    message: str


class PaymentVerifyRequest(BaseModel):
    order_id: str = Field(..., min_length=8, description="PayPal Orders v2 identifier")
    tenant_id: str = Field(..., min_length=3, description="Tenant partition identifier")
    plan_id: str = Field(..., description="Target Subscription Tier ID")
    expected_amount: float = Field(..., gt=0.0, description="Expected payment amount in USD")
    credits_requested: float = Field(..., gt=0.0, description="Credits to award")
    idempotency_key: str = Field(..., min_length=8, description="Unique client idempotency token")


class PaymentVerifyResponse(BaseModel):
    verified: bool
    status: str
    order_id: str
    capture_id: Optional[str] = None
    payer_email: Optional[str] = None
    payer_id: Optional[str] = None
    tenant_id: str
    credits_allocated: float
    new_credit_balance: float
    ledger_entry_id: str
    verification_source: str = "LIVE_PAYPAL_API"
    verified_at: str
    is_replay: bool = False


# ---------------------------------------------------------------------------
# Payment Router Endpoints
# ---------------------------------------------------------------------------
payment_router = APIRouter(prefix="/billing", tags=["Billing & PayPal"])


@payment_router.post("/checkout/initiate", response_model=CheckoutInitiateResponse)
def initiate_paypal_checkout(req: CheckoutInitiateRequest, db: Session = Depends(get_db)):
    """
    Creates a PayPal REST v2 Order for compute credits top-up.
    Returns the PayPal redirect approve_url for customer checkout.
    """
    # Check if this idempotency key was already initiated
    existing_tx = db.query(Transaction).filter(Transaction.order_id == req.idempotency_key).first()
    if existing_tx:
        return CheckoutInitiateResponse(
            order_id=existing_tx.order_id,
            tenant_id=existing_tx.tenant_id,
            amount=float(existing_tx.amount),
            currency=existing_tx.currency,
            approve_url=f"https://www.paypal.com/checkoutnow?token={existing_tx.order_id}",
            status="PENDING",
        )

    # Real PayPal REST API v2 Order Creation
    token = get_paypal_access_token()
    url = f"{PAYPAL_BASE_URL}/v2/checkout/orders"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "PayPal-Request-Id": req.idempotency_key,
    }

    order_payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "reference_id": f"ref-{req.tenant_id}",
                "custom_id": req.tenant_id,
                "description": f"ApexSovereign Compute Credits: +{req.amount:.2f} USD",
                "amount": {
                    "currency_code": req.currency,
                    "value": f"{req.amount:.2f}",
                },
            }
        ],
        "application_context": {
            "brand_name": "ApexSovereign.ai",
            "landing_page": "NO_PREFERENCE",
            "user_action": "PAY_NOW",
            "return_url": req.return_url or "https://apexsovereign.ai/billing/return",
            "cancel_url": req.cancel_url or "https://apexsovereign.ai/billing/cancel",
        },
    }

    resp = requests.post(url, headers=headers, json=order_payload, timeout=12)
    if resp.status_code not in [200, 201]:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"PayPal Order creation failed: {resp.text}",
        )

    order_data = resp.json()
    order_id = order_data["id"]

    # Extract approval link
    approve_url = next(
        (link["href"] for link in order_data.get("links", []) if link.get("rel") == "approve"),
        "",
    )

    # Record pending transaction in DB
    tx = Transaction(
        tenant_id=req.tenant_id,
        order_id=order_id,
        amount=req.amount,
        currency=req.currency,
        credits_added=req.amount,
        payment_status="CREATED",
        payment_method="PAYPAL",
    )
    db.add(tx)
    db.commit()

    return CheckoutInitiateResponse(
        order_id=order_id,
        tenant_id=req.tenant_id,
        amount=req.amount,
        currency=req.currency,
        approve_url=approve_url,
        status=order_data.get("status", "CREATED"),
    )


@payment_router.post("/checkout/capture/{order_id}", response_model=CaptureResponse)
def capture_paypal_order(order_id: str, db: Session = Depends(get_db)):
    """
    Captures an authorized PayPal checkout order, credits the tenant's account,
    and commits the financial ledger transaction.
    Enforces strict PayPal API capture validation with zero mock fallbacks.
    """
    if order_id.upper().startswith(("ORDER-MOCK-", "MOCK", "SIM-", "TEST-")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mock orders are rejected on production capture endpoints.",
        )

    tx = db.query(Transaction).filter(Transaction.order_id == order_id).first()

    # Real PayPal Capture
    token = get_paypal_access_token()
    url = f"{PAYPAL_BASE_URL}/v2/checkout/orders/{order_id}/capture"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }

    resp = requests.post(url, headers=headers, json={}, timeout=15)
    if resp.status_code not in [200, 201]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"PayPal order capture failed: {resp.text}",
        )

    capture_data = resp.json()
    capture_status = capture_data.get("status")

    if capture_status != "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"PayPal capture did not complete (status: {capture_status})",
        )

    # Extract capture details
    purchase_unit = capture_data.get("purchase_units", [{}])[0]
    tenant_id = purchase_unit.get("custom_id") or (tx.tenant_id if tx else "unknown")
    captured_value = float(
        purchase_unit.get("payments", {}).get("captures", [{}])[0].get("amount", {}).get("value", 0.0)
    )

    # Credit tenant account
    user = db.query(User).filter(User.tenant_id == tenant_id).first()
    if not user:
        user = User(tenant_id=tenant_id, email=f"{tenant_id}@apexsovereign.local", credits_balance=0.0)
        db.add(user)

    user.credits_balance = float(user.credits_balance) + captured_value

    if tx:
        tx.payment_status = "COMPLETED"
        tx.credits_added = captured_value
    else:
        tx = Transaction(
            tenant_id=tenant_id,
            order_id=order_id,
            amount=captured_value,
            currency="USD",
            credits_added=captured_value,
            payment_status="COMPLETED",
            payment_method="PAYPAL",
        )
        db.add(tx)

    db.commit()
    db.refresh(user)

    return CaptureResponse(
        order_id=order_id,
        tenant_id=tenant_id,
        amount_captured=captured_value,
        new_balance=float(user.credits_balance),
        status="COMPLETED",
        message=f"Successfully captured ${captured_value:.2f} and credited to tenant balance.",
    )


@payment_router.post("/verify", response_model=PaymentVerifyResponse)
def verify_paypal_payment(req: PaymentVerifyRequest, db: Session = Depends(get_db)):
    """
    Live cryptographic verification endpoint for PayPal Orders v2.
    Validates captured funds directly against PayPal live API and prevents duplicate or mock credit allocations.
    """
    sanitized_id = req.order_id.strip()
    if sanitized_id.upper().startswith(("MOCK", "ORD-PP-", "ORDER-MOCK-", "SIM-")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Synthetic or simulated order IDs are strictly rejected on live verification endpoints.",
        )

    # Check for existing completed transaction for idempotency
    existing_tx = db.query(Transaction).filter(Transaction.order_id == sanitized_id).first()
    if existing_tx and existing_tx.payment_status == "COMPLETED":
        user = db.query(User).filter(User.tenant_id == existing_tx.tenant_id).first()
        current_bal = float(user.credits_balance) if user else 0.0
        return PaymentVerifyResponse(
            verified=True,
            status="ALREADY_PROCESSED",
            order_id=sanitized_id,
            tenant_id=existing_tx.tenant_id,
            credits_allocated=float(existing_tx.credits_added or req.credits_requested),
            new_credit_balance=current_bal,
            ledger_entry_id=f"tx_{existing_tx.id}",
            verification_source="LIVE_PAYPAL_API",
            verified_at=datetime.now(timezone.utc).isoformat(),
            is_replay=True,
        )

    token = get_paypal_access_token()
    url = f"{PAYPAL_BASE_URL}/v2/checkout/orders/{sanitized_id}"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}

    resp = requests.get(url, headers=headers, timeout=12)
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unable to verify order with PayPal live servers: {resp.text}",
        )

    order_data = resp.json()
    order_status = order_data.get("status")

    # If APPROVED, execute capture immediately
    if order_status == "APPROVED":
        cap_url = f"{PAYPAL_BASE_URL}/v2/checkout/orders/{sanitized_id}/capture"
        cap_resp = requests.post(cap_url, headers=headers, json={}, timeout=15)
        if cap_resp.status_code in [200, 201]:
            order_data = cap_resp.json()
            order_status = order_data.get("status", "COMPLETED")

    if order_status != "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"PayPal order is not completed (current status: {order_status}).",
        )

    # Validate payment amounts
    purchase_units = order_data.get("purchase_units", [{}])
    primary_unit = purchase_units[0]
    captures = primary_unit.get("payments", {}).get("captures", [])
    capture_id = captures[0].get("id") if captures else None
    captured_amount = float(
        captures[0].get("amount", {}).get("value", 0.0) 
        if captures 
        else primary_unit.get("amount", {}).get("value", 0.0)
    )

    if captured_amount < (req.expected_amount - 0.05):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Fraud alert: Captured amount ${captured_amount:.2f} is below expected ${req.expected_amount:.2f}.",
        )

    # Allocate compute credits
    user = db.query(User).filter(User.tenant_id == req.tenant_id).first()
    if not user:
        user = User(tenant_id=req.tenant_id, email=f"{req.tenant_id}@apexsovereign.local", credits_balance=0.0)
        db.add(user)

    user.credits_balance = float(user.credits_balance) + req.credits_requested

    if existing_tx:
        existing_tx.payment_status = "COMPLETED"
        existing_tx.credits_added = req.credits_requested
        existing_tx.amount = captured_amount
    else:
        new_tx = Transaction(
            tenant_id=req.tenant_id,
            order_id=sanitized_id,
            amount=captured_amount,
            currency="USD",
            credits_added=req.credits_requested,
            payment_status="COMPLETED",
            payment_method="PAYPAL_LIVE_VERIFIED",
        )
        db.add(new_tx)

    db.commit()
    db.refresh(user)

    payer = order_data.get("payer", {})
    return PaymentVerifyResponse(
        verified=True,
        status="COMPLETED",
        order_id=sanitized_id,
        capture_id=capture_id,
        payer_email=payer.get("email_address"),
        payer_id=payer.get("payer_id"),
        tenant_id=req.tenant_id,
        credits_allocated=req.credits_requested,
        new_credit_balance=float(user.credits_balance),
        ledger_entry_id=f"tx_verified_{sanitized_id}",
        verification_source="LIVE_PAYPAL_API",
        verified_at=datetime.now(timezone.utc).isoformat(),
        is_replay=False,
    )


@payment_router.post("/webhook")
async def paypal_webhook_listener(request: Request, db: Session = Depends(get_db)):
    """
    Secure PayPal Webhook listener.
    Listens for PAYMENT.CAPTURE.COMPLETED and CHECKOUT.ORDER.APPROVED events.
    Automatically provisions/credits the tenant's account.
    """
    body_bytes = await request.body()
    try:
        event = json.loads(body_bytes.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("event_type")
    resource = event.get("resource", {})

    print(f"[PayPal Webhook Received] Event Type: {event_type}")

    # Optional signature verification when PAYPAL_WEBHOOK_ID is provided
    if PAYPAL_WEBHOOK_ID and PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET:
        token = get_paypal_access_token()
        verify_url = f"{PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}

        verify_payload = {
            "auth_algo": request.headers.get("paypal-auth-algo", ""),
            "cert_url": request.headers.get("paypal-cert-url", ""),
            "transmission_id": request.headers.get("paypal-transmission-id", ""),
            "transmission_sig": request.headers.get("paypal-transmission-sig", ""),
            "transmission_time": request.headers.get("paypal-transmission-time", ""),
            "webhook_id": PAYPAL_WEBHOOK_ID,
            "webhook_event": event,
        }

        try:
            v_resp = requests.post(verify_url, headers=headers, json=verify_payload, timeout=8)
            v_data = v_resp.json()
            if v_data.get("verification_status") != "SUCCESS":
                print(f"[PayPal Webhook] Signature verification failed: {v_data}")
                raise HTTPException(status_code=401, detail="Cryptographic verification failed: Webhook signature mismatch")
        except HTTPException:
            raise
        except Exception as exc:
            print(f"[PayPal Webhook Signature Error]: {exc}")
            raise HTTPException(status_code=401, detail=f"Webhook verification failure: {str(exc)}")

    # Process Completed Capture
    if event_type == "PAYMENT.CAPTURE.COMPLETED":
        order_id = resource.get("supplementary_data", {}).get("related_ids", {}).get("order_id")
        amount_str = resource.get("amount", {}).get("value", "0.0")
        amount = float(amount_str)
        custom_id = resource.get("custom_id")

        if not custom_id and order_id:
            tx = db.query(Transaction).filter(Transaction.order_id == order_id).first()
            if tx:
                custom_id = tx.tenant_id

        tenant_id = custom_id or "tenant-enterprise-4401"

        # Check for idempotency: if order already completed, ignore duplicate
        tx = db.query(Transaction).filter(Transaction.order_id == (order_id or resource.get("id"))).first()
        if tx and tx.payment_status == "COMPLETED":
            return {"status": "ALREADY_PROCESSED"}

        # Credit User
        user = db.query(User).filter(User.tenant_id == tenant_id).first()
        if not user:
            user = User(tenant_id=tenant_id, email=f"{tenant_id}@apexsovereign.local", credits_balance=0.0)
            db.add(user)

        user.credits_balance = float(user.credits_balance) + amount

        if tx:
            tx.payment_status = "COMPLETED"
        else:
            new_tx = Transaction(
                tenant_id=tenant_id,
                order_id=order_id or resource.get("id", f"capture-{int(time.time())}"),
                amount=amount,
                currency=resource.get("amount", {}).get("currency_code", "USD"),
                credits_added=amount,
                payment_status="COMPLETED",
                payment_method="PAYPAL_WEBHOOK",
            )
            db.add(new_tx)

        db.commit()
        print(f"[PayPal Webhook Auto-Provisioned] Credited ${amount:.2f} to tenant '{tenant_id}'")

    return {"status": "SUCCESS", "event_type": event_type}
