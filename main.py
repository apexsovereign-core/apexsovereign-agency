import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.outbound import router as outbound_router

app = FastAPI(
    title="ApexSovereign.ai Core",
    description="Autonomous Compute Utility & AI Automation Agency (AAA) Global Platform",
    version="1.0.0"
)

# Allow secure enterprise CORS communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the global outbound automation router
app.include_router(outbound_router)

@app.get("/", tags=["Root"])
async def root():
    return {
        "entity": "ApexSovereign.ai",
        "status": "Active",
        "model": "Hybrid B2B SaaS Compute Utility + AI Automation Agency",
        "domain": "apexsovereign.ai"
    }

@app.get("/v1/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "engine": "FastAPI / Supabase Core",
        "environment": os.getenv("ENVIRONMENT", "production"),
        "outbound_automation": "ready"
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)