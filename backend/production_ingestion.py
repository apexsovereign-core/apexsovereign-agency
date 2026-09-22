"""Production ingestion gateway derived from the uploaded integration contract.

This module intentionally does not create mock payment credentials or verify
PayPal webhooks by event name alone. Payment verification remains delegated to
the existing PayPal gateway; this router handles signed usage ingestion.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from usage_metering import usage_meter
from v21_mesh import MeshEvent, mesh

logger = logging.getLogger("Apex.ProductionIngestion")
production_router = APIRouter(prefix="/v1", tags=["Production Ingestion"])


class IngestionPayload(BaseModel):
    customer_id: str = Field(..., min_length=2, max_length=128)
    event_type: str = Field(..., min_length=3, max_length=128)
    quantity: int = Field(..., ge=1, le=10_000_000)
    metadata: Dict[str, Any] = Field(default_factory=dict)


def _verify_signature(raw_body: bytes, signature: Optional[str]) -> bool:
    secret = os.getenv("INGESTION_WEBHOOK_SECRET", "").strip()
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.removeprefix("sha256="))


async def log_transaction_to_supabase(payload: IngestionPayload) -> None:
    """Write usage to Supabase REST without logging secrets or customer payloads."""
    base_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not service_key:
        logger.warning("Supabase usage ledger is not configured; ingestion remains accepted but unpersisted")
        return
    record = {"customer_id": payload.customer_id, "event_type": payload.event_type, "quantity": payload.quantity, "metadata": payload.metadata}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{base_url}/rest/v1/apex_transactions",
                headers={"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json", "Prefer": "return=minimal"},
                content=json.dumps(record),
            )
            response.raise_for_status()
    except Exception:
        logger.exception("Supabase usage ledger write failed")


@production_router.post("/ingest", summary="Signed high-throughput usage ingestion")
async def ingest_data(request: Request, payload: IngestionPayload, background_tasks: BackgroundTasks, x_apex_signature: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    raw_body = await request.body()
    environment = os.getenv("ENVIRONMENT", "production").lower()
    if environment == "production" and not _verify_signature(raw_body, x_apex_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="valid ingestion signature required")
    started = time.perf_counter()
    mesh_event = await mesh.enqueue(
        MeshEvent(
            tenant_id=payload.customer_id,
            event_type=payload.event_type,
            quantity=payload.quantity,
            metadata=payload.metadata,
        ),
        source="v1.ingest",
    )
    background_tasks.add_task(usage_meter.record, tenant_id=payload.customer_id, event_type=payload.event_type, quantity=payload.quantity, metadata=payload.metadata)
    return {"status": "accepted", "ingestion_latency_ms": round((time.perf_counter() - started) * 1000, 3), "tracked_units": payload.quantity, "database_sync": "queued", "payment_gateway": "queued_via_configured_usage_bridge", "mesh_event": mesh_event}


@production_router.get("/production-health", summary="Production ingestion health")
async def production_health() -> Dict[str, Any]:
    return {"engine": "apex-production-engine", "status": "ready", "environment": os.getenv("ENVIRONMENT", "production"), "database_configured": bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY"))}
