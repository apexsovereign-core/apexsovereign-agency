"""
ApexSovereign.ai Master Core Engine - FastAPI Application Entry Point.
Production-grade routing, structured logging, CORS containment, and security headers.
"""

import time
import uuid
import logging
from contextlib import asynccontextmanager
from typing import Callable
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from . import db
from .routes_public import router as public_router
from .routes_auth import router as auth_router
from .routes_billing import router as billing_router
from .routes_clusters import router as clusters_router
from .routes_keys import router as keys_router
from .routes_waitlist import router as waitlist_router
from .routes_account import router as account_router

# Configure Structured Logging
logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}'
)
logger = logging.getLogger("apex.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail closed on missing secrets before accepting any traffic.
    settings.validate_runtime()
    logger.info(
        "Starting ApexSovereign.ai Master Core Engine (Build: %s, Env: %s, Demo: %s)",
        settings.BUILD_ID,
        settings.ENV,
        settings.DEMO_MODE,
    )
    await db.init_pool()
    yield
    logger.info("Shutting down ApexSovereign.ai Core Engine...")
    await db.close_pool()


app = FastAPI(
    title="ApexSovereign.ai Master Core Engine",
    description="Sovereign GPU Compute Exchange & Arbitrage Mesh",
    version=settings.BUILD_ID,
    lifespan=lifespan,
    docs_url="/docs" if settings.ENV != "production" else None,
    redoc_url=None
)

# -----------------------------------------------------------------------------
# 1. CORS MIDDLEWARE
# -----------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id", "Content-Disposition"]
)


# -----------------------------------------------------------------------------
# 2. TELEMETRY, TRACE ID & SECURITY HEADERS MIDDLEWARE
# -----------------------------------------------------------------------------
@app.middleware("http")
async def security_and_tracing_middleware(request: Request, call_next: Callable) -> Response:
    trace_id = request.headers.get("X-Request-Id") or f"trace_{uuid.uuid4().hex[:16]}"
    request.state.trace_id = trace_id
    start_time = time.monotonic()

    # Max body size check (64KB payload guard for public APIs)
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > 65536:
        return JSONResponse(
            status_code=413,
            content={"error": {"code": "payload_too_large", "message": "Request payload exceeds 64KB security limit."}}
        )

    response = await call_next(request)
    duration_ms = (time.monotonic() - start_time) * 1000.0

    # Attach Security & Telemetry Headers
    response.headers["X-Request-Id"] = trace_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(self 'https://www.paypal.com')"
    response.headers["X-Mesh-Latency-Target"] = "18ms"
    response.headers["X-Apex-Engine"] = "FastAPI-Core"

    # Avoid caching dynamic v1 API responses
    if request.url.path.startswith("/v1"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"

    logger.info(
        f'{{"method": "{request.method}", "path": "{request.url.path}", "status": {response.status_code}, "latency_ms": {duration_ms:.2f}, "trace_id": "{trace_id}"}}'
    )
    return response


# -----------------------------------------------------------------------------
# 3. MOUNT ROUTERS
# -----------------------------------------------------------------------------
app.include_router(public_router)
app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(clusters_router)
app.include_router(keys_router)
app.include_router(waitlist_router)
app.include_router(account_router)
