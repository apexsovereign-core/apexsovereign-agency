"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Main Application Entry Point
Author: Principal Systems Architect
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.config import get_settings
from backend.app.db.session import init_db_pool, close_db_pool
from backend.app.services.paypal_service import get_paypal_service
from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.compute import router as compute_router
from backend.app.api.v1.billing import router as billing_router
from backend.app.api.v1.workflow import router as workflow_router
from backend.app.api.v1.api_keys import router as api_keys_router
from backend.app.services.gpu_arbitrage_engine import router as arbitrage_router
from backend.app.services.corporate_invoicing_engine import router as corporate_invoicing_router
from backend.app.services.compliance_audit_pipeline import (
    router as compliance_router,
    SOC2AuditMiddleware,
)
from backend.app.services.decentralized_marketplace import router as marketplace_router
from backend.app.services.predictive_autoscaling_engine import router as autoscaling_router
from backend.app.services.treasury_tax_engine import router as treasury_tax_router
from backend.app.services.confidential_enclave_gateway import router as enclave_router
from backend.app.services.fleet_security_daemon import router as fleet_security_router
from backend.app.services.anycast_mesh_controller import router as anycast_mesh_router
from backend.app.services.pqc_lattice_engine import router as pqc_crypto_router
from backend.app.services.neural_spot_arbitrage import router as neural_arbitrage_router
from backend.app.services.dao_treasury_engine import router as dao_treasury_router
from backend.app.agency import router as agency_router
from backend.app.api.v1.leads import router as leads_router
from backend.app.api.v1.neural_chat import router as neural_router
from backend.app.api.v1.telemetry_ws import router as telemetry_ws_router
from backend.app.api.v1.concierge import router as concierge_router
from backend.app.routers.telemetry import router as telemetry_router
from backend.app.core.exceptions import (
    ApexSovereignBaseException,
    IdempotencyConflictError,
    InsufficientCreditsError,
    PayPalVerificationError,
)

# Configure enterprise structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("apexsovereign.main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.
    Initializes the asyncpg connection pool and services on startup;
    gracefully drains connections and cleans up resources on shutdown.
    """
    settings = get_settings()
    logger.info("Starting %s (%s) in %s mode...", settings.APP_NAME, settings.APP_VERSION, settings.ENVIRONMENT)

    # Initialize asyncpg database pool
    try:
        await init_db_pool()
        logger.info("Database connection pool established successfully.")
    except Exception as exc:
        logger.critical("Database initialization failure during startup: %s", str(exc))
        if settings.is_production:
            raise

    yield

    # Shutdown sequence
    logger.info("Initiating graceful shutdown...")
    paypal = get_paypal_service()
    await paypal.close()
    await close_db_pool()
    logger.info("Shutdown complete. All connections closed.")


settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Enterprise Work OS & Autonomous Compute Broker backend engineered for extreme "
        "horizontal scalability, asynchronous Supabase PostgreSQL pooling, idempotent double-entry "
        "financial ledgers, and cryptographically verified PayPal webhook ingestion."
    ),
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

# Enterprise CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SOC 2 Tamper-Evident Immutable Audit Log Middleware
app.add_middleware(SOC2AuditMiddleware)


# Global Exception Handlers
@app.exception_handler(InsufficientCreditsError)
async def insufficient_credits_handler(request: Request, exc: InsufficientCreditsError):
    return JSONResponse(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        content={
            "error": exc.code,
            "message": exc.message,
            "tenant_id": exc.tenant_id,
            "required": exc.required,
            "available": exc.available,
        },
    )


@app.exception_handler(IdempotencyConflictError)
async def idempotency_conflict_handler(request: Request, exc: IdempotencyConflictError):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"error": exc.code, "message": exc.message, "key": exc.key},
    )


@app.exception_handler(PayPalVerificationError)
async def paypal_verification_handler(request: Request, exc: PayPalVerificationError):
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"error": exc.code, "message": exc.message},
    )


@app.exception_handler(ApexSovereignBaseException)
async def domain_exception_handler(request: Request, exc: ApexSovereignBaseException):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": exc.code, "message": exc.message},
    )


# Mount Modular API Routers
app.include_router(health_router)
app.include_router(compute_router)
app.include_router(billing_router)
app.include_router(workflow_router)
app.include_router(api_keys_router)
app.include_router(arbitrage_router)
app.include_router(corporate_invoicing_router)
app.include_router(compliance_router)
app.include_router(marketplace_router)
app.include_router(autoscaling_router)
app.include_router(treasury_tax_router)
app.include_router(enclave_router)
app.include_router(fleet_security_router)
app.include_router(anycast_mesh_router)
app.include_router(pqc_crypto_router)
app.include_router(neural_arbitrage_router)
app.include_router(dao_treasury_router)
app.include_router(agency_router)
app.include_router(leads_router)
app.include_router(neural_router)
app.include_router(telemetry_ws_router)
app.include_router(concierge_router)
app.include_router(telemetry_router)


@app.get("/", summary="Root API Index")
async def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "OPERATIONAL",
        "documentation": "/docs" if not settings.is_production else "DISABLED_IN_PROD",
        "endpoints": {
            "health": "/health",
            "compute_dispatch": "/compute/dispatch",
            "billing_webhook": "/billing/webhook",
            "workflow_tasks": "/workflow/tasks",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
