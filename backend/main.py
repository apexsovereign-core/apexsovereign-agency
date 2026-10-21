import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Import the settlement router generated in the previous step
try:
    from backend.services.settlement import router as settlement_router
except ImportError:
    from services.settlement import router as settlement_router

# Configure structured JSON logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("apexsovereign-core")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler verifying critical environment variables on startup."""
    required_vars = [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "APEX_SETTLEMENT_HMAC_SECRET"
    ]
    missing_vars = [var for var in required_vars if not os.environ.get(var)]
    
    if missing_vars:
        logger.critical(f"STARTUP FAILED: Missing mandatory environment variables: {missing_vars}")
        raise RuntimeError(f"Missing mandatory environment variables: {missing_vars}")
        
    logger.info("ApexSovereign Core Engine successfully initialized. All environment checks passed.")
    yield
    logger.info("ApexSovereign Core Engine shutting down gracefully.")

# Initialize FastAPI application with strict OpenAPI documentation shielding in production
IS_PRODUCTION = os.environ.get("ENVIRONMENT", "development").lower() == "production"

app = FastAPI(
    title="ApexSovereign Core Engine",
    description="Sovereign GPU Compute Broker Arbitrage & Settlement API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json"
)

# Configure strict CORS settings
origins = [
    "https://apexsovereign.ai",
    "https://www.apexsovereign.ai",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Global Unhandled Exception Trap
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Exception on {request.method} {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"status": "error", "message": "Internal sovereign system error."}
    )

# Healthcheck & Telemetry Endpoints
@app.get("/health", tags=["Telemetry"])
@app.get("/v1/health", tags=["Telemetry"])
async def health_check():
    return {
        "status": "ok",
        "system": "ApexSovereign Core Engine",
        "version": "1.0.0",
        "build": "v2.4-prod",
        "env": "mesh",
        "router_host": "apexsovereign-mesh.onrender.com",
        "engine": "FastAPI/Axum"
    }

# PayPal Webhook Ingress
try:
    from backend.services.settlement import verify_and_settle
except ImportError:
    from services.settlement import verify_and_settle

@app.post("/v1/webhooks/paypal", tags=["Webhooks"])
async def paypal_webhook_ingress(request: Request):
    sig = request.headers.get("x-paypal-signature", "")
    return await verify_and_settle(request, sig)

# Mount the Settlement Router
app.include_router(settlement_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=not IS_PRODUCTION)
