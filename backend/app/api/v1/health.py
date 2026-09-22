"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Health & Operational Diagnostic Router
Author: Principal Systems Architect
"""

from __future__ import annotations

import time
import logging
from typing import Any, Dict
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from backend.app.config import get_settings
from backend.app.db.session import get_pool

logger = logging.getLogger("apexsovereign.health")
router = APIRouter(tags=["Health & Diagnostics"])

_START_TIME = time.time()


@router.get("/health", summary="Liveness & Readiness Health Probe")
async def health_check() -> JSONResponse:
    """
    Production health check probe for Render orchestration and container health checks.
    Probes database connection pool status, queries latency, and returns uptime.
    """
    settings = get_settings()
    now = time.time()
    uptime_seconds = int(now - _START_TIME)

    db_status = "UNKNOWN"
    db_latency_ms: float = -1.0
    pool_metrics: Dict[str, Any] = {}

    try:
        pool = get_pool()
        pool_metrics = {
            "size": pool.get_size(),
            "free": pool.get_idle_size(),
            "min_size": pool.get_min_size(),
            "max_size": pool.get_max_size(),
        }

        # Execute lightweight ping query
        t0 = time.perf_counter()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1;")
        db_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        db_status = "HEALTHY"
    except Exception as exc:
        logger.error("Health check DB probe failed: %s", str(exc))
        db_status = f"UNHEALTHY: {str(exc)}"

    is_ready = db_status == "HEALTHY"
    status_code = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "OPERATIONAL" if is_ready else "DEGRADED",
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "uptime_seconds": uptime_seconds,
            "database": {
                "status": db_status,
                "latency_ms": db_latency_ms,
                "pool": pool_metrics,
            },
            "timestamp": int(now),
        },
    )
