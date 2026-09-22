"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Autonomous Compute Broker & Dispatch Engine
Author: Principal Systems Architect

Features:
- Algorithmic hardware tier cost estimation (Standard, High-CPU, GPU T4/A100/H100).
- Atomic credit hold before workload dispatch.
- Cryptographically signed worker execution leases (HMAC-SHA256).
- Distributed idempotency gating to prevent duplicate dispatch under network retries.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict
from asyncpg.connection import Connection

from backend.app.core.idempotency import IdempotencyManager, compute_request_hash
from backend.app.core.security import generate_compute_lease_token
from backend.app.schemas.compute import ComputeDispatchRequest, ComputeDispatchResponse
from backend.app.services.ledger_service import LedgerService

logger = logging.getLogger("apexsovereign.compute")

# Base hourly rates in Credits
TIER_BASE_RATES = {
    "STANDARD_CPU": 0.05,
    "HIGH_CPU": 0.15,
    "GPU_T4": 0.65,
    "GPU_A100": 3.20,
    "GPU_H100": 5.50,
}


def calculate_estimated_cost(tier: str, cpu: int, memory_mb: int, gpu_count: int) -> float:
    """
    Computes upfront credit cost for minimum 1-hour compute lease window.
    """
    base = TIER_BASE_RATES.get(tier, 0.10)
    cpu_factor = cpu * 0.015
    mem_factor = (memory_mb / 1024) * 0.008
    gpu_factor = gpu_count * (2.80 if "H100" in tier else 1.80 if "A100" in tier else 0.40)
    total = base + cpu_factor + mem_factor + gpu_factor
    return round(total, 4)


class ComputeBrokerService:
    """
    Coordinates multi-tenant compute job scheduling, credit holds, and worker leases.
    """

    @staticmethod
    async def dispatch_job(
        conn: Connection,
        request: ComputeDispatchRequest,
        endpoint: str = "/api/v1/compute/dispatch",
    ) -> ComputeDispatchResponse:
        """
        Dispatches compute job with strict idempotency and atomic credit deduction.
        """
        request_hash = compute_request_hash(request.model_dump())

        # 1. Idempotency Check & Atomic Key Reservation
        is_new, cached_code, cached_body = await IdempotencyManager.acquire_or_get_cached(
            conn=conn,
            tenant_id=request.tenant_id,
            idempotency_key=request.idempotency_key,
            endpoint=endpoint,
            request_hash=request_hash,
        )

        if not is_new and cached_body:
            logger.info("Replaying idempotent compute dispatch response for key: %s", request.idempotency_key)
            return ComputeDispatchResponse(**cached_body, idempotent_replay=True)

        try:
            # 2. Cost Estimation
            est_cost = calculate_estimated_cost(
                tier=request.resource_tier,
                cpu=request.cpu_cores,
                memory_mb=request.memory_mb,
                gpu_count=request.gpu_count,
            )

            # 3. Insert Compute Job in QUEUED state
            insert_job_query = """
                INSERT INTO compute_jobs (
                    tenant_id,
                    job_type,
                    resource_tier,
                    cpu_cores,
                    memory_mb,
                    gpu_count,
                    estimated_cost,
                    status,
                    idempotency_key,
                    payload
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'QUEUED', $8, $9::jsonb)
                RETURNING id;
            """
            job_row = await conn.fetchrow(
                insert_job_query,
                request.tenant_id,
                request.job_type,
                request.resource_tier,
                request.cpu_cores,
                request.memory_mb,
                request.gpu_count,
                est_cost,
                request.idempotency_key,
                json.dumps(request.payload),
            )
            job_id = str(job_row["id"])

            # 4. Atomically Hold Tenant Credits via Ledger
            ledger_result = await LedgerService.reserve_compute_credits(
                conn=conn,
                tenant_id=request.tenant_id,
                estimated_cost=est_cost,
                idempotency_key=request.idempotency_key,
                job_id=job_id,
                metadata={
                    "job_type": request.job_type,
                    "resource_tier": request.resource_tier,
                    "cpu": request.cpu_cores,
                    "ram_mb": request.memory_mb,
                    "gpus": request.gpu_count,
                },
            )

            # 5. Generate Cryptographic Worker Lease Token
            lease_token, expires_at = generate_compute_lease_token(
                job_id=job_id,
                tenant_id=request.tenant_id,
                ttl_seconds=3600,
            )

            # 6. Update Job Status to LEASED with token
            update_job_query = """
                UPDATE compute_jobs
                SET status = 'LEASED',
                    lease_token = $2,
                    lease_expires_at = to_timestamp($3)
                WHERE id = $1;
            """
            await conn.execute(update_job_query, job_row["id"], lease_token, expires_at)

            # 7. Construct Response
            response = ComputeDispatchResponse(
                job_id=job_id,
                tenant_id=request.tenant_id,
                status="LEASED",
                resource_tier=request.resource_tier,
                estimated_cost=est_cost,
                remaining_balance=ledger_result["balance_after"],
                lease_token=lease_token,
                lease_expires_at=expires_at,
                idempotent_replay=False,
            )

            # 8. Commit Idempotency Record
            await IdempotencyManager.commit(
                conn=conn,
                tenant_id=request.tenant_id,
                idempotency_key=request.idempotency_key,
                response_code=200,
                response_body=response.model_dump(),
            )

            logger.info("Successfully dispatched compute job: %s for tenant: %s", job_id, request.tenant_id)
            return response

        except Exception as exc:
            # Revert idempotency lock so tenant can retry safely
            logger.error("Compute dispatch failure for key %s: %s", request.idempotency_key, str(exc))
            await IdempotencyManager.revert(conn, request.tenant_id, request.idempotency_key)
            raise
