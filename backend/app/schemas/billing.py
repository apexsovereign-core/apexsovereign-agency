"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Billing, Checkout & Webhook Schemas
Author: Principal Systems Architect
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CheckoutInitiateRequest(BaseModel):
    """Payload to initiate a PayPal order for enterprise compute credit top-up."""
    tenant_id: str = Field(..., description="Target tenant UUID")
    amount: float = Field(..., gt=0.0, description="Top-up payment amount in currency")
    currency: str = Field(default="USD", description="ISO 4217 Currency code (e.g. USD, EUR)")
    credits_requested: float = Field(..., gt=0.0, description="Amount of compute credits to allocate upon capture")
    idempotency_key: str = Field(..., min_length=16, description="Client-generated unique transaction UUID")
    return_url: str = Field(..., description="Callback URL after user PayPal approval")
    cancel_url: str = Field(..., description="Callback URL if user cancels approval")


class CheckoutInitiateResponse(BaseModel):
    order_id: str
    status: str
    approval_url: Optional[str] = None
    idempotency_key: str


class CheckoutCaptureRequest(BaseModel):
    order_id: str = Field(..., description="PayPal Order ID to capture")
    tenant_id: str = Field(..., description="Tenant UUID")
    idempotency_key: str = Field(..., description="Client idempotency key")


class CheckoutCaptureResponse(BaseModel):
    status: str
    order_id: str
    capture_id: Optional[str] = None
    credits_allocated: float
    new_balance: float
    ledger_entry_id: str


class PayPalWebhookVerificationPayload(BaseModel):
    auth_algo: str = Field(..., description="Algorithm used to generate PayPal transmission signature")
    cert_url: str = Field(..., description="HTTPS URL of the PayPal certificate")
    transmission_id: str = Field(..., description="PayPal HTTP transmission ID header")
    transmission_sig: str = Field(..., description="PayPal HTTP transmission signature header")
    transmission_time: str = Field(..., description="PayPal transmission timestamp")
    webhook_id: str = Field(..., description="Configured PAYPAL_WEBHOOK_ID")
    webhook_event: Dict[str, Any] = Field(..., description="Complete raw JSON webhook event body")


class PaymentVerifyRequest(BaseModel):
    """Payload to verify live PayPal order capture and sync credits to tenant partition."""
    order_id: str = Field(..., min_length=8, description="PayPal Orders v2 identifier (e.g. 5O190127TN364715T)")
    tenant_id: str = Field(..., min_length=3, description="ApexSovereign Tenant Partition identifier")
    plan_id: str = Field(..., description="Subscription plan ID (starter, pro, enterprise)")
    expected_amount: float = Field(..., gt=0.0, description="Expected transaction amount in USD")
    credits_requested: float = Field(..., gt=0.0, description="Expected compute credits to allocate")
    idempotency_key: str = Field(..., min_length=8, description="Client idempotency key")


class PaymentVerifyResponse(BaseModel):
    """Result of live cryptographic PayPal order verification."""
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


class WebhookProcessingResult(BaseModel):
    status: str
    event_type: str
    event_id: str
    processed_at: str
    idempotent_replay: bool
    details: Dict[str, Any]
