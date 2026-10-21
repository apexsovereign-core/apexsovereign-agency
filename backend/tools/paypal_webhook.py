import json
import os
from fastapi import FastAPI, Request, HTTPException

app = FastAPI(title="ApexSovereign Settlement Gateway")

@app.post("/v1/settlement/paypal-webhook")
async def handle_paypal_webhook(request: Request):
    try:
        payload = await request.json()
        if payload.get("event_type") == "PAYMENT.CAPTURE.COMPLETED":
            res = payload.get("resource", {})
            txn_id = res.get("id", "")
            val = float(res.get("amount", {}).get("value", 0.0))
            tenant = res.get("custom_id", "default_tenant")
            print(f"[SETTLEMENT] Received PayPal Deposit: ${val} USD from Tenant: {tenant} (Txn: {txn_id})")
            return {"status": "ACCEPTED", "tenant_id": tenant, "amount_usd": val, "cu_credited": val * 100.0, "transaction_id": txn_id}
        return {"status": "IGNORED"}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid payload signature")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
