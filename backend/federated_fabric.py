"""Zero-copy federated grounding fabric for live enterprise records.

The fabric fetches records on demand, stores only short-lived redacted cache
entries, and never persists source data or credentials in the application.
"""
from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional

import httpx


PII_KEYS = {"email", "phone", "mobile", "address", "ssn", "tax_id", "access_token", "refresh_token", "api_key", "authorization"}


def mask_context(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): "[MASKED]" if str(key).lower() in PII_KEYS else mask_context(item) for key, item in value.items()}
    if isinstance(value, list):
        return [mask_context(item) for item in value]
    return value


@dataclass
class CacheEntry:
    value: Dict[str, Any]
    expires_at: float


class FederatedGroundingFabric:
    def __init__(self, *, ttl_seconds: float = 15.0, timeout_seconds: float = 3.0) -> None:
        self.ttl_seconds = ttl_seconds
        self.timeout_seconds = timeout_seconds
        self._cache: Dict[str, CacheEntry] = {}
        self._source_urls: Dict[str, str] = {}
        self._local_records = {"ACC-1099": {"name": "Sovereign Global Logistics", "tier": "Enterprise-Tier-1", "credit_limit": 250000}}

    def register_source(self, source_name: str, base_url: str) -> None:
        if not base_url.startswith("https://"):
            raise ValueError("federated sources must use HTTPS")
        self._source_urls[source_name] = base_url.rstrip("/")

    def _cache_key(self, source: str, object_key: str) -> str:
        return hashlib.sha256(f"{source}:{object_key}".encode()).hexdigest()

    def _cache_lookup(self, key: str) -> Optional[Dict[str, Any]]:
        entry = self._cache.get(key)
        if entry and entry.expires_at > time.monotonic():
            return {**entry.value, "cache": "ephemeral_hit"}
        if entry:
            self._cache.pop(key, None)
        return None

    async def fetch(self, object_key: str, *, source: str = "local") -> Dict[str, Any]:
        started = time.perf_counter()
        cache_key = self._cache_key(source, object_key)
        cached = self._cache_lookup(cache_key)
        if cached:
            cached["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
            return cached
        record: Optional[Dict[str, Any]] = None
        if source == "local":
            record = self._local_records.get(object_key)
        elif source in self._source_urls:
            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    response = await client.get(f"{self._source_urls[source]}/{object_key}")
                    if response.is_success and isinstance(response.json(), dict):
                        record = response.json()
            except (httpx.HTTPError, ValueError):
                record = None
        safe_record = mask_context(record) if record else None
        result = {"status": "hit" if safe_record else "miss", "grounding_source": source, "data": safe_record, "replicated": False, "cache": "miss", "lookup_digest": hashlib.sha256(object_key.encode()).hexdigest()[:16], "latency_ms": round((time.perf_counter() - started) * 1000, 2)}
        self._cache[cache_key] = CacheEntry({key: value for key, value in result.items() if key != "latency_ms"}, time.monotonic() + self.ttl_seconds)
        return result


federated_fabric = FederatedGroundingFabric()
_configured_source = os.getenv("FEDERATED_SOURCE_URL", "").strip()
if _configured_source:
    federated_fabric.register_source("enterprise", _configured_source)
