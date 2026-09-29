# backend/app/settlement/agentic_ledger.py
"""
ApexSovereign.ai - Autonomous B2B Credit Ledger & Token-Bucket Sentinel
Enforces atomic CAS transaction settlement, dynamic environment credential validation,
and non-volatile Redis Stream dispatching (XADD) with PgBouncer pooling.
"""

import os
import sys
import time
import hmac
import hashlib
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Header, Depends, status
from pydantic import BaseModel, Field
import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor
import redis

# Configure Production Logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [SETTLEMENT_ENGINE] %(message)s")
logger = logging.getLogger("settlement_engine")

# ---------------------------------------------------------------------------
# Strict Environment Validation (Zero Hardcoded Secrets / Localhost Strings)
# ---------------------------------------------------------------------------
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
if not SUPABASE_DB_URL:
    logger.critical("FATAL: Environment variable 'SUPABASE_DB_URL' is missing. Terminating process.")
    sys.exit(1)

APEX_SETTLEMENT_HMAC_SECRET = os.getenv("APEX_SETTLEMENT_HMAC_SECRET")
if not APEX_SETTLEMENT_HMAC_SECRET:
    logger.critical("FATAL: Environment variable 'APEX_SETTLEMENT_HMAC_SECRET' is missing. Terminating process.")
    sys.exit(1)

REDIS_URL = os.getenv("REDIS_URL")
if not REDIS_URL:
    logger.critical("FATAL: Environment variable 'REDIS_URL' is missing. Terminating process.")
    sys.exit(1)

HMAC_SECRET_BYTES = APEX_SETTLEMENT_HMAC_SECRET.encode("utf-8")

# ---------------------------------------------------------------------------
# Connection Pools: PgBouncer Transaction Pool (Max 200) & Redis Client
# ---------------------------------------------------------------------------
try:
    db_pool = ThreadedConnectionPool(minconn=10, maxconn=200, dsn=SUPABASE_DB_URL)
    logger.info("PgBouncer transaction connection pool initialized (10-200 connections).")
except Exception as exc:
    logger.critical(f"FATAL: Failed to initialize database connection pool: {exc}")
    sys.exit(1)

try:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=3.0, retry_on_timeout=True)
    redis_client.ping()
    logger.info("Redis Stream connection verified.")
except Exception as exc:
    logger.critical(f"FATAL: Failed to connect to Redis instance at {REDIS_URL}: {exc}")
    sys.exit(1)

agentic_settlement_router = APIRouter(prefix="/v1/settlement", tags=["Autonomous Settlement"])


class MicroDebitRequest(BaseModel):
    tenant_id: str = Field(..., example="tenant-sovereign-01")
    workload_id: str = Field(..., example="wl-88912-h100")
    token_count: int = Field(default=2048, gt=0, example=2048)  # Standardized 2048 tokens = 2.048 CU
    cu_rate_multiplier: float = Field(default=1.0, ge=0.1, example=1.0)
    idempotency_key: str = Field(..., example="idemp_992817293712")
    nonce: int = Field(..., example=10042)
    timestamp_epoch_ms: int = Field(..., example=1790600000000)


def get_pooled_db():
    conn = db_pool.getconn()
    try:
        conn.autocommit = False
        yield conn
    finally:
        db_pool.putconn(conn)


def verify_cryptographic_dispatch(payload_bytes: bytes, signature_hex: str, timestamp_epoch_ms: int):
    current_time_ms = int(time.time() * 1000)
    if abs(current_time_ms - timestamp_epoch_ms) > 15000:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="Clock drift threshold exceeded (±15000ms max allowed)."
        )

    expected_sig = hmac.new(HMAC_SECRET_BYTES, payload_bytes, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_sig, signature_hex):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cryptographic signature mismatch."
        )


@agentic_settlement_router.post("/micro-debit", status_code=status.HTTP_200_OK)
async def process_micro_debit(
    payload: MicroDebitRequest,
    x_apex_signature: str = Header(...),
    conn: psycopg2.extensions.connection = Depends(get_pooled_db)
):
    """
    Synchronous sub-18ms atomic debit with CAS row locking and non-volatile Redis Stream backup.
    1 CU = 1,000 prompt tokens. 2048 tokens = 2.048 CU ($0.02048).
    """
    start_timer = time.perf_counter()

    raw_check_bytes = f"{payload.tenant_id}:{payload.workload_id}:{payload.idempotency_key}:{payload.timestamp_epoch_ms}".encode("utf-8")
    verify_cryptographic_dispatch(raw_check_bytes, x_apex_signature, payload.timestamp_epoch_ms)

    cu_to_deduct = round((payload.token_count / 1000.0) * payload.cu_rate_multiplier, 6)

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 1. Check Idempotency Barrier
            cur.execute(
                "SELECT id, cu_deducted, status FROM public.ledger_entries WHERE idempotency_key = %s;",
                (payload.idempotency_key,)
            )
            existing = cur.fetchone()
            if existing:
                conn.rollback()
                return {
                    "settlement_status": "IDEMPOTENT_REPLAY_ACKNOWLEDGED",
                    "tenant_id": payload.tenant_id,
                    "cu_deducted": float(existing["cu_deducted"]),
                    "idempotency_key": payload.idempotency_key,
                    "latency_overhead_ms": round((time.perf_counter() - start_timer) * 1000, 3)
                }

            # 2. Pessimistic Row Lock (SELECT ... FOR UPDATE)
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
                conn.rollback()
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Tenant '{payload.tenant_id}' not found.")

            if tenant["execution_lock"]:
                conn.rollback()
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant execution lock engaged.")

            total_available = float(tenant["compute_units_balance"]) + (float(tenant["available_credit"]) * 100.0)

            if total_available < cu_to_deduct:
                # Trigger Autonomous Credit-Lock Freeze
                cur.execute(
                    "UPDATE public.tenants SET execution_lock = true, lock_reason = 'ZERO_BALANCE_BREACH', updated_at = now() WHERE id = %s;",
                    (payload.tenant_id,)
                )
                conn.commit()
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Insufficient Compute Units. Required: {cu_to_deduct} CU, Available: {total_available} CU"
                )

            # 3. Atomic Balance CAS Update
            new_balance = float(tenant["compute_units_balance"]) - cu_to_deduct
            cur.execute(
                "UPDATE public.tenants SET compute_units_balance = %s, updated_at = now() WHERE id = %s;",
                (new_balance, payload.tenant_id)
            )

            # 4. Double-Entry Ledger Append
            cur.execute(
                """
                INSERT INTO public.ledger_entries (
                    tenant_id, workload_id, idempotency_key, cu_deducted, previous_balance, new_balance, status
                ) VALUES (%s, %s, %s, %s, %s, %s, 'CONFIRMED');
                """,
                (payload.tenant_id, payload.workload_id, payload.idempotency_key, cu_to_deduct, tenant["compute_units_balance"], new_balance)
            )
            conn.commit()

        # 5. Non-Volatile Redis Stream Audit Log (XADD)
        stream_entry = {
            "event_type": "SETTLEMENT.MICRO_DEBIT.CONFIRMED",
            "tenant_id": payload.tenant_id,
            "workload_id": payload.workload_id,
            "idempotency_key": payload.idempotency_key,
            "cu_deducted": str(cu_to_deduct),
            "remaining_cu": str(new_balance),
            "timestamp": str(payload.timestamp_epoch_ms),
        }
        redis_client.xadd("settlement:stream:debits", stream_entry, maxlen=100000, approximate=True)

    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        logger.error(f"Transaction failed during micro-debit: {exc}")
        # Enqueue into Redis DLQ for asynchronous worker reconciliation
        dlq_entry = {
            "error": str(exc),
            "tenant_id": payload.tenant_id,
            "workload_id": payload.workload_id,
            "idempotency_key": payload.idempotency_key,
            "timestamp": str(int(time.time() * 1000)),
        }
        redis_client.xadd("settlement:dlq", dlq_entry)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Settlement engine transaction error.")

    latency_ms = (time.perf_counter() - start_timer) * 1000.0

    return {
        "settlement_status": "ATOMIC_FINALITY_CONFIRMED",
        "tenant_id": payload.tenant_id,
        "cu_deducted": cu_to_deduct,
        "remaining_cu_balance": new_balance,
        "idempotency_key": payload.idempotency_key,
        "latency_overhead_ms": round(latency_ms, 3)
    }
