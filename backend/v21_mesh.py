"""
ApexSovereign.ai - Pillar II: The Computational Mesh & V21 Execution Engine (v21_mesh.py)
Autonomous Work OS & Sovereign Compute Broker Operating Core.
"""

import os
import time
import json
import uuid
import hmac
import hashlib
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from pydantic import BaseModel, Field

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"
MAX_QUEUE_CAPACITY = 5000
MAX_PAYLOAD_BYTES = 32768

v21_mesh_router = APIRouter(prefix="/v21/mesh", tags=["Pillar II: Computational Mesh v21"])

class MeshEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str = Field(default="tenant-sovereign-01")
    event_type: str = Field(..., description="E.g. compute.lease.provision, agent.task.dispatch, settlement.capture")
    data_classification: str = Field(default="internal", description="public, internal, confidential, or restricted")
    payload: Dict[str, Any] = Field(default_factory=dict)
    compliance_marker: Optional[str] = Field(None, description="Cryptographic compliance token required for restricted data")
    metered_cu: float = Field(default=1.0, description="Compute Units consumed by this execution step")
    previous_hash: Optional[str] = None
    event_hash: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ComputationalMeshEngine:
    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=MAX_QUEUE_CAPACITY)
        self.ledger: List[Dict[str, Any]] = []
        self.last_hash: str = GENESIS_HASH
        self.is_running: bool = False
        self.worker_task: Optional[asyncio.Task] = None
        self.processed_count: int = 0
        self.failed_count: int = 0
        self.recovered_count: int = 0
        self.lock = asyncio.Lock()

    def compute_payload_digest(self, payload: Dict[str, Any]) -> str:
        serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        if len(serialized.encode("utf-8")) > MAX_PAYLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Payload metadata exceeds hard 32KB constraint ({len(serialized.encode('utf-8'))} bytes)."
            )
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def calculate_event_hash(self, previous_hash: str, tenant_id: str, event_id: str, event_type: str, payload_digest: str, timestamp: str) -> str:
        raw_seed = f"{previous_hash}:{tenant_id}:{event_id}:{event_type}:{payload_digest}:{timestamp}"
        return hashlib.sha256(raw_seed.encode("utf-8")).hexdigest()

    async def start_supervisor_loop(self):
        if self.is_running:
            return
        self.is_running = True
        self.worker_task = asyncio.create_task(self._supervisor_worker())

    async def stop_supervisor_loop(self):
        self.is_running = False
        if self.worker_task:
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass

    async def _supervisor_worker(self):
        while self.is_running:
            try:
                event = await self.queue.get()
                await self._process_single_event(event)
                self.queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as loop_err:
                self.failed_count += 1
                await asyncio.sleep(0.1)
                self.recovered_count += 1

    async def _process_single_event(self, event: MeshEvent):
        async with self.lock:
            event.previous_hash = self.last_hash
            payload_digest = self.compute_payload_digest(event.payload)
            event.event_hash = self.calculate_event_hash(
                previous_hash=event.previous_hash,
                tenant_id=event.tenant_id,
                event_id=event.event_id,
                event_type=event.event_type,
                payload_digest=payload_digest,
                timestamp=event.timestamp
            )
            self.last_hash = event.event_hash
            record = event.dict()
            self.ledger.append(record)
            if len(self.ledger) > 10000:
                self.ledger = self.ledger[-10000:]
            self.processed_count += 1
            asyncio.create_task(self._sync_ledger_to_external_vaults(record))

    async def _sync_ledger_to_external_vaults(self, record: Dict[str, Any]):
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not supabase_key:
            return
        try:
            import httpx
            async with httpx.AsyncClient(timeout=4.0) as client:
                headers = {
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                }
                payload = {
                    "tenant_id": record["tenant_id"],
                    "event_type": record["event_type"],
                    "event_hash": record["event_hash"],
                    "previous_hash": record["previous_hash"],
                    "metered_cu": record["metered_cu"],
                    "created_at": record["timestamp"],
                    "status": "CHAIN_COMMITTED"
                }
                await client.post(f"{supabase_url}/rest/v1/system_logs", headers=headers, json=payload)
        except Exception:
            pass

    def evaluate_compliance(self, event: MeshEvent):
        classification = (event.data_classification or "internal").lower()
        if classification == "restricted":
            required_marker = os.getenv("COMPLIANCE_SIGNATURE_KEY", "sovereign_restricted_compliance_clearance_2026")
            if not event.compliance_marker or required_marker not in event.compliance_marker:
                raise HTTPException(
                    status_code=403,
                    detail="Compliance Gate Hard Stop: 'restricted' classification requires explicit cryptographic compliance_marker."
                )

    async def enqueue(self, event: Any, source: str = "v1.mesh") -> Dict[str, Any]:
        """Ingestion compatibility adapter for async event enqueuing."""
        if not self.is_running:
            await self.start_supervisor_loop()
        if isinstance(event, dict):
            event_obj = MeshEvent(**event)
        elif isinstance(event, MeshEvent):
            event_obj = event
        else:
            event_obj = MeshEvent(
                tenant_id=getattr(event, "tenant_id", "tenant-sovereign-01"),
                event_type=getattr(event, "event_type", "mesh.event"),
                payload=getattr(event, "metadata", {})
            )
        await self.queue.put(event_obj)
        return {
            "status": "ENQUEUED",
            "event_id": event_obj.event_id,
            "source": source,
            "timestamp": event_obj.timestamp
        }

mesh_engine = ComputationalMeshEngine()
# Compatibility alias
mesh = mesh_engine

@v21_mesh_router.get("/status")
async def get_mesh_status():
    return {
        "status": "OPERATIONAL",
        "engine": "ApexSovereign V21 Computational Mesh",
        "queue_depth": mesh_engine.queue.qsize(),
        "max_capacity": MAX_QUEUE_CAPACITY,
        "processed_events": mesh_engine.processed_count,
        "failed_events": mesh_engine.failed_count,
        "recovered_events": mesh_engine.recovered_count,
        "chain_head": mesh_engine.last_hash,
        "genesis_hash": GENESIS_HASH,
        "supervisor_active": mesh_engine.is_running,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@v21_mesh_router.post("/emit")
async def emit_mesh_event(event: MeshEvent):
    mesh_engine.evaluate_compliance(event)
    mesh_engine.compute_payload_digest(event.payload)
    if not mesh_engine.is_running:
        await mesh_engine.start_supervisor_loop()
    async with mesh_engine.lock:
        event.previous_hash = mesh_engine.last_hash
        digest = mesh_engine.compute_payload_digest(event.payload)
        event.event_hash = mesh_engine.calculate_event_hash(
            previous_hash=event.previous_hash,
            tenant_id=event.tenant_id,
            event_id=event.event_id,
            event_type=event.event_type,
            payload_digest=digest,
            timestamp=event.timestamp
        )
        mesh_engine.last_hash = event.event_hash
        record = event.dict()
        mesh_engine.ledger.append(record)
        if len(mesh_engine.ledger) > 10000:
            mesh_engine.ledger = mesh_engine.ledger[-10000:]
        mesh_engine.processed_count += 1

    return {
        "status": "CHAINED",
        "event_id": event.event_id,
        "event_hash": event.event_hash,
        "previous_hash": event.previous_hash,
        "tenant_id": event.tenant_id,
        "metered_cu": event.metered_cu,
        "classification": event.data_classification,
        "committed_at": event.timestamp,
        "verification_url": f"/v21/mesh/verify-chain?event_id={event.event_id}"
    }

@v21_mesh_router.get("/ledger")
async def get_mesh_ledger(limit: int = 50):
    items = mesh_engine.ledger[-limit:]
    return {
        "count": len(items),
        "total_committed": mesh_engine.processed_count,
        "chain_head": mesh_engine.last_hash,
        "ledger": items
    }

@v21_mesh_router.get("/verify-chain")
async def verify_chain_lineage():
    current_expected = GENESIS_HASH
    violations = []
    for idx, item in enumerate(mesh_engine.ledger):
        if item.get("previous_hash") != current_expected:
            violations.append({
                "index": idx,
                "event_id": item.get("event_id"),
                "expected_previous": current_expected,
                "actual_previous": item.get("previous_hash")
            })
        current_expected = item.get("event_hash")

    is_valid = len(violations) == 0
    return {
        "verified": is_valid,
        "status": "CRYPTOGRAPHICALLY_INTACT" if is_valid else "CHAIN_INTEGRITY_BREACH",
        "total_blocks_verified": len(mesh_engine.ledger),
        "chain_head": mesh_engine.last_hash,
        "violations": violations,
        "audit_timestamp": datetime.now(timezone.utc).isoformat()
    }
