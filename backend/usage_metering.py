"""Usage metering for compute and agent activity with bounded persistence retries."""
from __future__ import annotations

import asyncio
import os
import time
from collections import Counter
from typing import Any, Dict

import httpx


class UsageMeter:
    def __init__(self) -> None:
        self._counts: Counter[str] = Counter()
        self._lock = asyncio.Lock()

    async def record(self, *, tenant_id: str, event_type: str, quantity: int = 1, metadata: Dict[str, Any] | None = None) -> Dict[str, Any]:
        async with self._lock:
            self._counts[f"{tenant_id}:{event_type}"] += quantity
            total = self._counts[f"{tenant_id}:{event_type}"]
        persisted = await self._persist_with_retry(tenant_id, event_type, quantity, metadata or {})
        return {"tenant_id": tenant_id, "event_type": event_type, "quantity": quantity, "tenant_total": total, "ledger_status": persisted}

    async def _persist_with_retry(self, tenant_id: str, event_type: str, quantity: int, metadata: Dict[str, Any]) -> str:
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        if url.endswith("/rest/v1"):
            url = url[:-len("/rest/v1")]
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            return "not_configured"
        record = {"tenant_id": tenant_id, "event_type": event_type, "severity": "INFO", "telemetry": {"quantity": quantity, **metadata}}
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    response = await client.post(f"{url}/rest/v1/system_logs", headers={"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "return=minimal"}, json=record)
                    response.raise_for_status()
                    return "persisted"
            except (httpx.HTTPError, ValueError):
                if attempt == 0:
                    await asyncio.sleep(0.05)
        return "retry_exhausted"

    def snapshot(self) -> Dict[str, int]:
        return dict(self._counts)


usage_meter = UsageMeter()
