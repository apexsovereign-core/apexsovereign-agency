"""v21 enterprise execution mesh.

The mesh is deliberately fail-closed for compliance and non-financial by default:
usage is cryptographically chained and persisted to Supabase when configured;
PayPal metering is emitted only to an explicitly configured usage endpoint and
never creates or captures a payment order implicitly.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, Optional

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger("Apex.V21Mesh")


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _canonical(value: Dict[str, Any]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()


class MeshEvent(BaseModel):
    tenant_id: str = Field(min_length=2, max_length=128)
    event_type: str = Field(min_length=3, max_length=128)
    quantity: int = Field(default=1, ge=1, le=10_000_000)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    request_id: Optional[str] = None


class WorkflowProvision(BaseModel):
    tenant_id: str = Field(min_length=2, max_length=128)
    workflow_type: str = Field(min_length=3, max_length=128)
    priority: str = Field(default="standard", pattern="^(standard|high|critical)$")
    controls: Dict[str, Any] = Field(default_factory=dict)


class V21Mesh:
    def __init__(self) -> None:
        self.started_at = time.time()
        self.queue: Deque[Dict[str, Any]] = deque(maxlen=5000)
        self.events: Deque[Dict[str, Any]] = deque(maxlen=200)
        self._last_hash = os.getenv("V21_LEDGER_GENESIS", "apexsovereign-v21-genesis")
        self._lock = asyncio.Lock()
        self._worker: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()
        self.processed = 0
        self.failed = 0
        self.rerouted = 0
        self.last_error: Optional[str] = None
        self.last_event_at: Optional[str] = None
        self._paypal_token: Optional[str] = None
        self._paypal_token_expiry = 0.0

    @property
    def supabase_configured(self) -> bool:
        return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

    @property
    def paypal_configured(self) -> bool:
        return bool(os.getenv("PAYPAL_CLIENT_ID") and os.getenv("PAYPAL_CLIENT_SECRET"))

    @property
    def paypal_usage_enabled(self) -> bool:
        return bool(os.getenv("PAYPAL_USAGE_ENDPOINT")) and self.paypal_configured

    async def start(self) -> None:
        if self._worker and not self._worker.done():
            return
        self._stop.clear()
        self._worker = asyncio.create_task(self._supervisor(), name="v21-mesh-supervisor")
        logger.info("v21 autonomous supervisor started")

    async def stop(self) -> None:
        self._stop.set()
        if self._worker:
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass
            self._worker = None

    async def enqueue(self, event: MeshEvent, source: str = "ingest") -> Dict[str, Any]:
        async with self._lock:
            now = _utc()
            body = {
                "event_id": str(uuid.uuid4()),
                "tenant_id": event.tenant_id,
                "event_type": event.event_type,
                "quantity": event.quantity,
                "metadata": event.metadata,
                "request_id": event.request_id,
                "source": source,
                "occurred_at": now,
            }
            digest = hashlib.sha256(self._last_hash.encode() + _canonical(body)).hexdigest()
            body["previous_hash"] = self._last_hash
            body["event_hash"] = digest
            self._last_hash = digest
            self.queue.append(body)
            self.events.appendleft({**body, "state": "queued"})
            self.last_event_at = now
            return {"event_id": body["event_id"], "event_hash": digest, "state": "queued"}

    async def _supervisor(self) -> None:
        while not self._stop.is_set():
            try:
                item = None
                async with self._lock:
                    if self.queue:
                        item = self.queue.popleft()
                if item is None:
                    await asyncio.sleep(0.15)
                    continue
                await self._process(item)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.failed += 1
                self.last_error = str(exc)[:240]
                logger.exception("v21 supervisor loop recovered from error")
                await asyncio.sleep(0.5)

    async def _process(self, item: Dict[str, Any]) -> None:
        # Compliance gate: never forward a restricted event without an explicit approval marker.
        metadata = item.get("metadata") or {}
        if metadata.get("restricted_data") and metadata.get("compliance_approved") is not True:
            self.failed += 1
            self.last_error = "restricted_data_requires_compliance_approval"
            await self._mark(item["event_id"], "blocked")
            return
        await self._persist_supabase(item)
        await self._sync_paypal_usage(item)
        self.processed += 1
        await self._mark(item["event_id"], "processed")

    async def _mark(self, event_id: str, state: str) -> None:
        async with self._lock:
            for event in self.events:
                if event.get("event_id") == event_id:
                    event["state"] = state
                    break

    async def _persist_supabase(self, item: Dict[str, Any]) -> None:
        if not self.supabase_configured:
            return
        base = os.environ["SUPABASE_URL"].rstrip("/")
        if base.endswith("/rest/v1"):
            base = base[:-len("/rest/v1")]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        record = {
            "tenant_id": item["tenant_id"],
            "event_type": item["event_type"],
            "quantity": item["quantity"],
            "metadata": {**item["metadata"], "v21_event_id": item["event_id"], "source": item["source"], "occurred_at": item["occurred_at"], "previous_hash": item["previous_hash"], "event_hash": item["event_hash"]},
        }
        table = os.getenv("SUPABASE_V21_LEDGER_TABLE", "apex_transactions")
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{base}/rest/v1/{table}",
                headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "return=minimal"},
                content=json.dumps(record, default=str),
            )
            response.raise_for_status()

    async def _paypal_access_token(self) -> Optional[str]:
        if not self.paypal_configured:
            return None
        if self._paypal_token and time.time() < self._paypal_token_expiry - 30:
            return self._paypal_token
        node = os.getenv("PAYPAL_NODE", "live").lower()
        base = "https://api-m.paypal.com" if node == "live" else "https://api-m.sandbox.paypal.com"
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                f"{base}/v1/oauth2/token",
                auth=(os.environ["PAYPAL_CLIENT_ID"], os.environ["PAYPAL_CLIENT_SECRET"]),
                data={"grant_type": "client_credentials"},
                headers={"Accept": "application/json", "Accept-Language": "en_US"},
            )
            response.raise_for_status()
            data = response.json()
        self._paypal_token = data.get("access_token")
        self._paypal_token_expiry = time.time() + int(data.get("expires_in", 300))
        return self._paypal_token

    async def _sync_paypal_usage(self, item: Dict[str, Any]) -> None:
        # PayPal has no universal arbitrary usage-event endpoint. Integrators opt in
        # with PAYPAL_USAGE_ENDPOINT pointing at their approved metering bridge.
        if not self.paypal_usage_enabled:
            return
        token = await self._paypal_access_token()
        if not token:
            return
        endpoint = os.environ["PAYPAL_USAGE_ENDPOINT"]
        node = os.getenv("PAYPAL_NODE", "live").lower()
        base = "https://api-m.paypal.com" if node == "live" else "https://api-m.sandbox.paypal.com"
        target = endpoint if endpoint.startswith("http") else f"{base}{endpoint}"
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                target,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "PayPal-Request-Id": item["event_id"]},
                json={"event_id": item["event_id"], "tenant_id": item["tenant_id"], "quantity": item["quantity"], "event_type": item["event_type"], "event_hash": item["event_hash"]},
            )
            response.raise_for_status()

    def snapshot(self) -> Dict[str, Any]:
        return {
            "version": "21.0",
            "queue_depth": len(self.queue),
            "processed_events": self.processed,
            "failed_events": self.failed,
            "rerouted_events": self.rerouted,
            "last_error": self.last_error,
            "last_event_at": self.last_event_at,
            "ledger": {"supabase_configured": self.supabase_configured, "chain_head": self._last_hash},
            "paypal": {"credentials_configured": self.paypal_configured, "usage_bridge_enabled": self.paypal_usage_enabled, "webhook_id_configured": bool(os.getenv("PAYPAL_WEBHOOK_ID"))},
            "supervisor": {"running": bool(self._worker and not self._worker.done()), "uptime_seconds": round(time.time() - self.started_at, 2)},
            "recent_events": list(self.events)[:20],
        }

    def events_since(self, limit: int = 20) -> list[Dict[str, Any]]:
        return list(self.events)[: max(1, min(limit, 100))]


mesh = V21Mesh()


def verify_mesh_signature(raw_body: bytes, signature: Optional[str]) -> bool:
    secret = os.getenv("INGESTION_WEBHOOK_SECRET", "").strip()
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.removeprefix("sha256="))
