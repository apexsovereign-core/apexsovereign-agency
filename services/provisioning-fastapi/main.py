import os
import sys
import time
import uuid
import logging
from typing import Literal
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [FASTAPI_PROVISION] %(message)s")
logger = logging.getLogger("fastapi_provisioning")

SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "postgresql://postgres:postgres@localhost:5432/postgres")

try:
    db_pool = ThreadedConnectionPool(minconn=5, maxconn=50, dsn=SUPABASE_DB_URL)
    logger.info("Initialized PostgreSQL threaded connection pool (5-50 sockets).")
except Exception as e:
    logger.critical(f"FATAL: Database connection failed: {e}")
    sys.exit(1)

app = FastAPI(
    title="ApexSovereign High-Speed Provisioning API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None
)

class ProvisionRequest(BaseModel):
    user_id: uuid.UUID = Field(..., description="Authenticated User UUID")
    gpu_arch: Literal["H100_SXM5", "B200_NVL72", "A100_SXM4"]
    allocated_gpus: int = Field(gt=0, le=512, description="Node GPU cluster allocation count")
    duration_hours: float = Field(gt=0.1, le=720.0, description="Reservation duration in hours")
    preferred_region: str = Field(default="ANY", description="Target region or datacenter colo")

class ProvisionResponse(BaseModel):
    reservation_id: uuid.UUID
    dispatch_token: str
    cu_deducted: float
    remaining_cu_balance: float
    cluster_node_id: str
    status: str
    latency_ms: float

@app.post("/api/v1/compute/provision", response_model=ProvisionResponse, status_code=status.HTTP_201_CREATED)
async def provision_compute_instance(payload: ProvisionRequest):
    t_start = time.perf_counter()
    conn = db_pool.getconn()

    try:
        conn.autocommit = False
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 1. Lock and fetch optimal inventory node satisfying architecture & capacity
            cur.execute(
                """
                SELECT inventory_id, node_id, arbitrage_rate_usd_hr, available_gpus
                FROM public.gpu_inventories
                WHERE architecture = %s AND available_gpus >= %s AND is_operational = TRUE
                ORDER BY arbitrage_rate_usd_hr ASC
                LIMIT 1
                FOR UPDATE;
                """,
                (payload.gpu_arch, payload.allocated_gpus)
            )
            node = cur.fetchone()
            if not node:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"INSUFFICIENT_INVENTORY: No node supports {payload.allocated_gpus}x {payload.gpu_arch}"
                )

            # Compute cost: Rate * Hours * GPUs * 100 CU/$
            total_usd = float(node["arbitrage_rate_usd_hr"]) * payload.duration_hours * payload.allocated_gpus
            total_cu = round(total_usd * 100.0, 6)

            reservation_id = uuid.uuid4()
            reference_id = f"resv_lock_{reservation_id.hex[:12]}"
            dispatch_token = f"sovereign_hw_token_{uuid.uuid4().hex}"

            # 2. Call Atomic CU Deduction RPC
            cur.execute(
                """
                SELECT public.deduct_compute_units_atomic(%s, %s, %s, %s) AS deduction;
                """,
                (str(payload.user_id), total_cu, str(reservation_id), reference_id)
            )
            deduction_result = cur.fetchone()["deduction"]

            # 3. Decrement Inventory Available GPUs
            cur.execute(
                """
                UPDATE public.gpu_inventories
                SET available_gpus = available_gpus - %s,
                    updated_at = NOW()
                WHERE inventory_id = %s;
                """,
                (payload.allocated_gpus, node["inventory_id"])
            )

            # 4. Create Compute Reservation Row
            cur.execute(
                """
                INSERT INTO public.compute_reservations (
                    reservation_id,
                    user_id,
                    inventory_id,
                    allocated_gpus,
                    duration_hours,
                    total_cu_locked,
                    status,
                    dispatch_token
                ) VALUES (%s, %s, %s, %s, %s, %s, 'ACTIVE', %s);
                """,
                (
                    str(reservation_id),
                    str(payload.user_id),
                    node["inventory_id"],
                    payload.allocated_gpus,
                    payload.duration_hours,
                    total_cu,
                    dispatch_token
                )
            )

            conn.commit()

        elapsed_ms = (time.perf_counter() - t_start) * 1000.0

        return ProvisionResponse(
            reservation_id=reservation_id,
            dispatch_token=dispatch_token,
            cu_deducted=total_cu,
            remaining_cu_balance=float(deduction_result["remaining_cu"]),
            cluster_node_id=node["node_id"],
            status="RESERVATION_ACTIVE",
            latency_ms=round(elapsed_ms, 3)
        )

    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        logger.error(f"Provisioning transaction aborted: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PROVISIONING_FAILED: {str(exc)}"
        )
    finally:
        db_pool.putconn(conn)

@app.get("/healthz")
async def health():
    return {"status": "ONLINE", "runtime": "Python 3.11/FastAPI"}
