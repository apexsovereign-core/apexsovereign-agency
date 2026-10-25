import os
from fastapi import APIRouter, Request, HTTPException, status
import httpx

router = APIRouter(prefix="/api/v1/settle", tags=["PayPal Settlement"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY")
RUNPOD_GRAPHQL_ENDPOINT = os.getenv("RUNPOD_GRAPHQL_ENDPOINT", "https://api.runpod.io/graphql")

@router.post("/paypal")
async def paypal_webhook_listener(request: Request):
    event_json = await request.json()
    event_type = event_json.get("event_type")
    resource = event_json.get("resource", {})
    
    if event_type != "PAYMENT.SALE.COMPLETED":
        return {"status": "ignored", "reason": f"Event {event_type} not handled"}
    
    amount_str = resource.get("amount", {}).get("total", "0.00")
    amount_usd = float(amount_str)
    customer_email = resource.get("custom_id") or resource.get("payer", {}).get("email_address")
    
    if amount_usd < 1.00:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction below $1.00 USD pre-allocation floor."
        )
    
    computed_cu = int(amount_usd * 100)
    
    async with httpx.AsyncClient() as client:
        db_response = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/increment_credits",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json"
            },
            json={"p_email": customer_email, "p_cu_amount": computed_cu}
        )
        
        if db_response.status_code != 200:
            raise HTTPException(
                status_code=500, 
                detail=f"ACID ledger transaction failed: {db_response.text}"
            )
            
    async with httpx.AsyncClient() as client:
        runpod_payload = {
            "query": "mutation { gpuRentCluster(input: { gpuType: \"H100\", count: 8, durationHours: 24 }) { id status } }"
        }
        runpod_res = await client.post(
            RUNPOD_GRAPHQL_ENDPOINT,
            headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"},
            json=runpod_payload
        )
        
    return {
        "status": "success",
        "settled_usd": amount_usd,
        "credited_cu": computed_cu,
        "customer": customer_email,
        "runpod_dispatch": runpod_res.status_code == 200
    }
