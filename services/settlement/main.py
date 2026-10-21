import os
import hmac
import hashlib
import json
from fastapi import FastAPI, Request, HTTPException, Header, Depends
from pydantic import BaseModel, Field

app = FastAPI(title="AethelPay Settlement Engine", version="0.3.0")

PAYPAL_WEBHOOK_SECRET = os.getenv("PAYPAL_WEBHOOK_SECRET", "SOVEREIGN_HMAC_SECRET_KEY")

class SettlementPayload(BaseModel):
    tenant_id: str
    usd_amount: float = Field(gt=0, description="USD deposit amount")
    paypal_capture_id: str
    event_type: str

def verify_hmac_signature(payload_body: bytes, signature: str) -> bool:
    if not signature:
        return False
    expected_signature = hmac.new(
        PAYPAL_WEBHOOK_SECRET.encode('utf-8'),
        payload_body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected_signature, signature)

@app.post("/api/v1/settlement/paypal-webhook")
async def handle_paypal_webhook(
    request: Request,
    x_signature_hmac: str = Header(None, alias="X-Signature-HMAC")
):
    body_bytes = await request.body()
    
    if not verify_hmac_signature(body_bytes, x_signature_hmac):
        raise HTTPException(status_code=401, detail="INVALID_HMAC_SIGNATURE")

    try:
        data = json.loads(body_bytes)
        payload = SettlementPayload(**data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"INVALID_PAYLOAD: {str(e)}")

    if payload.event_type != "PAYMENT.CAPTURE.COMPLETED":
        return {"status": "IGNORED", "reason": "EVENT_NOT_ACTIONABLE"}

    # Compute unit calculation: $1.00 = 100 CU
    cu_credited = payload.usd_amount * 100.0

    # In production, dispatch RPC call via Supabase client library
    return {
        "status": "SETTLED",
        "tenant_id": payload.tenant_id,
        "usd_amount": payload.usd_amount,
        "cu_credited": cu_credited,
        "reference_id": payload.paypal_capture_id
    }

@app.get("/health")
async def health_check():
    return {
        "status": "NOMINAL",
        "service": "AethelPay Settlement Engine",
        "ratio": "$1.00 = 100 CU",
        "hmac_enforcement": True
    }
