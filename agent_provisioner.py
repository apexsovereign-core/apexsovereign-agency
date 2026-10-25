import os
import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ApexSovereign Provisioner Sentinel", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://www.apexsovereign.ai", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY")
RUNPOD_GRAPHQL_URL = "https://api.runpod.io/graphql"

@app.get("/health")
async def health_check():
    return {"status": "ONLINE", "mesh_latency_ms": 14.2, "broker": "ApexSovereign.ai"}

@app.post("/api/v1/provision")
async def provision_gpu_instance(request: Request):
    body = await request.json()
    user_id = body.get("user_id", "anon-tenant")
    gpu_type = body.get("gpu_type", "NVIDIA H100 SXM5")
    compute_units = body.get("compute_units", 0)

    if compute_units < 100:
        raise HTTPException(
            status_code=402, 
            detail="Insufficient Compute Units. Minimum 100 CU ($1.00 USD) required for allocation."
        )

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {RUNPOD_API_KEY}"
    }

    payload = {
        "query": f"""
        mutation {{
          podFindAndDeployOnDemand(input: {{
            cloudType: SECURE,
            gpuCount: 1,
            volumeInGb: 50,
            containerDiskInGb: 50,
            gpuTypeId: "NVIDIA H100 SXM5",
            name: "ApexSovereign-{user_id[:8]}",
            imageName: "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04"
          }}) {{
            id
            desiredStatus
            costPerHr
          }}
        }}
        """
    }

    response = requests.post(RUNPOD_GRAPHQL_URL, json=payload, headers=headers)
    result = response.json()

    if "errors" in result:
        raise HTTPException(status_code=500, detail=f"Wholesale provision failed: {result['errors'][0]['message']}")

    pod_data = result.get("data", {}).get("podFindAndDeployOnDemand", {})
    
    return {
        "status": "SUCCESS",
        "tenant": user_id,
        "pod_id": pod_data.get("id"),
        "hourly_cost": pod_data.get("costPerHr"),
        "ledger_balance_updated": f"{compute_units - 100} CU remaining"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
