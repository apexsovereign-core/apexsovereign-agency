"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Autonomous Compute Broker Dispatch Router
Author: Principal Systems Architect
"""

from __future__ import annotations

import logging
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from asyncpg.connection import Connection

from backend.app.api.deps import get_db_tx, require_api_key
from backend.app.core.exceptions import InsufficientCreditsError, IdempotencyConflictError
from backend.app.schemas.compute import (
    ComputeDispatchRequest,
    ComputeDispatchResponse,
    ComputeJobStatusResponse,
)
from backend.app.services.compute_broker import ComputeBrokerService

logger = logging.getLogger("apexsovereign.compute.router")
router = APIRouter(prefix="/compute", tags=["Compute Broker"])


@router.post(
    "/dispatch",
    response_model=ComputeDispatchResponse,
    summary="Dispatch Autonomous Compute Workload",
    description="Schedules a high-performance compute job, reserves tenant credits atomically, and issues a cryptographically signed HMAC lease token.",
)
async def dispatch_compute_job(
    request: ComputeDispatchRequest,
    conn: Connection = Depends(get_db_tx),
    _api_key: str = Depends(require_api_key),
) -> ComputeDispatchResponse:
    """
    Dispatches distributed compute job with idempotency protection and atomic credit deduction.
    Protected by X-API-Key header validation.
    """
    try:
        return await ComputeBrokerService.dispatch_job(conn=conn, request=request)
    except InsufficientCreditsError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error": "INSUFFICIENT_CREDITS",
                "message": exc.message,
                "tenant_id": exc.tenant_id,
                "required": exc.required,
                "available": exc.available,
            },
        )
    except IdempotencyConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "IDEMPOTENCY_CONFLICT",
                "message": exc.message,
                "key": exc.key,
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "INVALID_REQUEST", "message": str(exc)},
        )
    except Exception as exc:
        logger.exception("Unexpected error during compute dispatch: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal compute dispatch failure. Idempotency lock reverted.",
        )


@router.get(
    "/jobs/{job_id}",
    response_model=ComputeJobStatusResponse,
    summary="Retrieve Compute Job Execution State",
)
async def get_job_status(
    job_id: str,
    conn: Connection = Depends(get_db_tx),
    _api_key: str = Depends(require_api_key),
) -> ComputeJobStatusResponse:
    """
    Inspects the status, lease validity, and outputs of an autonomous compute job.
    """
    query = """
        SELECT
            id, tenant_id, job_type, resource_tier, status,
            estimated_cost, actual_cost, payload, results,
            error_message, created_at, started_at, completed_at
        FROM compute_jobs
        WHERE id = $1;
    """
    row = await conn.fetchrow(query, job_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Compute job '{job_id}' not found.")

    return ComputeJobStatusResponse(
        job_id=str(row["id"]),
        tenant_id=str(row["tenant_id"]),
        job_type=row["job_type"],
        resource_tier=row["resource_tier"],
        status=row["status"],
        estimated_cost=float(row["estimated_cost"]),
        actual_cost=float(row["actual_cost"]) if row["actual_cost"] is not None else None,
        created_at=row["created_at"].isoformat(),
        started_at=row["started_at"].isoformat() if row["started_at"] else None,
        completed_at=row["completed_at"].isoformat() if row["completed_at"] else None,
        results=row["results"],
        error_message=row["error_message"],
    )
