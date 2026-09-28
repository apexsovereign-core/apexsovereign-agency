# backend/app/settlement/agentic_ledger.py
"""
ApexSovereign.ai - Autonomous B2B Credit Ledger & Token-Bucket Sentinel
Enforces atomic CAS transaction settlement and programmatic balance deductions.
"""

import os
import time
import hmac
import hashlib
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Header, Depends, status
from pydantic import BaseModel, Field
import psycopg2
from psycopg2.extras import RealDictCursor

agentic_settlement_router = APIRouter(prefix="/v1/settlement", tags=["Autonomous Settlement"])

DATABASE_URL = os.getenv("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:5432/postgres")
HMAC_SECRET = os.getenv("APEX_SETTLEMENT_HMAC_SECRET", "sovereign_settlement_master_key_2026").encode("utf-8")


class MicroDebitRequest(BaseModel):
    tenant_id: str = Field(..., example="tenant-sovereign-01")
    workload_id: str = Field(..., example="wl-88912-h100")
    token_count: int = Field(..., gt=0, example=4096)
    cu_rate_multiplier: float = Field(default=1.0, ge=0.1, example=1.0)
    idempotency_key: str = Field(..., example="idemp_992817293712")
    nonce: int = Field(..., example=10042)
    timestamp_epoch_ms: int = Field(..., example=1790600000000)


def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()


def verify_cryptographic_dispatch(payload_bytes: bytes, signature_hex: str, timestamp_epoch_ms: int):
    current_time_ms = int(time.time() * 1000)
    if abs(current_time_ms - timestamp_epoch_ms) > 15000:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="Clock drift threshold exceeded (±15000ms max allowed)."
        )

    expected_sig = hmac.new(HMAC_SECRET, payload_bytes, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_sig, signature_hex):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cryptographic signature mismatch."
        )


@agentic_settlement_router.post("/micro-debit", status_code=status.HTTP_200_OK)
async def process_micro_debit(
    payload: MicroDebitRequest,
    x_apex_signature: str = Header(...),
    conn: psycopg2.extensions.connection = Depends(get_db_connection)
):
    start_timer = time.perf_counter()

    raw_check_bytes = f"{payload.tenant_id}:{payload.workload_id}:{payload.idempotency_key}:{payload.timestamp_epoch_ms}".encode("utf-8")
    verify_cryptographic_dispatch(raw_check_bytes, x_apex_signature, payload.timestamp_epoch_ms)

    # 1 CU = 10,000 prompt tokens or 2,500 output tokens. Multiplier applies for high-memory GPUs.
    cu_to_deduct = round((payload.token_count / 10000.0) * payload.cu_rate_multiplier, 6)

    with conn:
        with conn.cursor() as cur:
            # Check idempotency barrier
            cur.execute(
                "SELECT id, cu_deducted, status FROM public.ledger_entries WHERE idempotency_key = %s;",
                (payload.idempotency_key,)
            )
            existing = cur.fetchone()
            if existing:
                return {
                    "settlement_status": "IDEMPOTENT_REPLAY_ACKNOWLEDGED",
                    "tenant_id": payload.tenant_id,
                    "cu_deducted": float(existing["cu_deducted"]),
                    "idempotency_key": payload.idempotency_key,
                    "latency_overhead_ms": round((time.perf_counter() - start_timer) * 1000, 3)
                }

            # Enforce Row-Level Write Lock
            cur.execute(
                """
                SELECT id, compute_units_balance, available_credit, execution_lock 
                FROM public.tenants 
                WHERE id = %s 
                FOR UPDATE;
                """,
                (payload.tenant_id,)
            )
            tenant = cur.fetchone()

            if not tenant:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant does not exist.")

            if tenant["execution_lock"]:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant execution lock engaged.")

            total_available = float(tenant["compute_units_balance"]) + (float(tenant["available_credit"]) * 100.0)

            if total_available < cu_to_deduct:
                # Lock tenant out if delinquent
                cur.execute(
                    "UPDATE public.tenants SET execution_lock = true, lock_reason = 'ZERO_BALANCE_BREACH' WHERE id = %s;",
                    (payload.tenant_id,)
                )
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Insufficient CU balance. Required: {cu_to_deduct}, Available: {total_available}"
                )

            # Atomic CAS balance deduction
            new_balance = float(tenant["compute_units_balance"]) - cu_to_deduct
            cur.execute(
                "UPDATE public.tenants SET compute_units_balance = %s, updated_at = now() WHERE id = %s;",
                (new_balance, payload.tenant_id)
            )

            # Double-entry ledger append
            cur.execute(
                """
                INSERT INTO public.ledger_entries (
                    tenant_id, workload_id, idempotency_key, cu_deducted, previous_balance, new_balance, status
                ) VALUES (%s, %s, %s, %s, %s, %s, 'CONFIRMED');
                """,
                (payload.tenant_id, payload.workload_id, payload.idempotency_key, cu_to_deduct, tenant["compute_units_balance"], new_balance)
            )

    latency_ms = (time.perf_counter() - start_timer) * 1000.0

    return {
        "settlement_status": "ATOMIC_FINALITY_CONFIRMED",
        "tenant_id": payload.tenant_id,
        "cu_deducted": cu_to_deduct,
        "remaining_cu_balance": new_balance,
        "idempotency_key": payload.idempotency_key,
        "latency_overhead_ms": round(latency_ms, 3)
    }
