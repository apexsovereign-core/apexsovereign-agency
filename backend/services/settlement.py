import os
import hmac
import hashlib
from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel
from supabase import create_client, Client

router = APIRouter(prefix="/v1/settlement", tags=["Settlement"])

# Initialize Supabase Service Role Client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
HMAC_SECRET = os.environ.get("APEX_SETTLEMENT_HMAC_SECRET")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY or not HMAC_SECRET:
    raise RuntimeError("CRITICAL: Missing mandatory settlement environment variables.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

class SettlementPayload(BaseModel):
    user_id: str
    compute_units: int

def execute_atomic_settlement(user_id: str, units: int) -> dict:
    """Executes atomic Supabase RPC to deduct or credit compute units with row-level locking."""
    response = supabase.rpc(
        "deduct_compute_units",
        {
            "p_user_id": user_id,
            "p_cu_amount": units
        }
    ).execute()
    
    return response.data

@router.post("/paypal-webhook")
async def verify_and_settle(
    request: Request,
    x_paypal_signature: str = Header(...)
):
    body_bytes = await request.body()
    
    # 1. Cryptographic Signature Verification
    computed_signature = hmac.new(
        HMAC_SECRET.encode("utf-8"),
        body_bytes,
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(computed_signature, x_paypal_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cryptographic signature verification failed."
        )
        
    payload = await request.json()
    user_id = payload.get("user_id")
    units = payload.get("compute_units", 100) # Default $1.00 = 100 CU
    
    # 2. Execute Atomic Settlement
    result = execute_atomic_settlement(user_id, units)
    
    return {"status": "success", "settlement": result}
