"""Low-overhead tracing, telemetry, and deterministic recovery decisions."""
from __future__ import annotations

import time
import uuid
from collections import Counter, deque
from typing import Any, Dict, Optional


class TelemetryRegistry:
    def __init__(self) -> None:
        self.started_at = time.time()
        self.requests = 0
        self.failures = 0
        self.latencies_ms: deque[float] = deque(maxlen=500)
        self.events: Counter[str] = Counter()
        self.active_traces: Dict[str, Dict[str, Any]] = {}

    def start_trace(self, trace_id: Optional[str] = None, **context: Any) -> str:
        trace = trace_id or str(uuid.uuid4())
        self.active_traces[trace] = {"trace_id": trace, "started_at": time.time(), **context}
        return trace

    def finish_trace(self, trace_id: str, *, status: str, error: Optional[str] = None) -> None:
        item = self.active_traces.pop(trace_id, {})
        duration = (time.time() - item.get("started_at", time.time())) * 1000
        self.requests += 1
        self.latencies_ms.append(duration)
        self.events[f"request.{status.lower()}"] += 1
        if error:
            self.failures += 1

    def snapshot(self) -> Dict[str, Any]:
        values = list(self.latencies_ms)
        return {"requests_total": self.requests, "failures_total": self.failures, "active_traces": len(self.active_traces), "avg_latency_ms": round(sum(values) / len(values), 2) if values else 0, "p95_latency_ms": round(sorted(values)[max(0, int(len(values) * 0.95) - 1)], 2) if values else 0, "events": dict(self.events), "uptime_seconds": round(time.time() - self.started_at, 2)}


class RecoveryManager:
    """Maps known failure classes to bounded, non-circular fallback actions."""

    def recover(self, error: str, *, agent_name: str, trace_id: str) -> Dict[str, Any]:
        normalized = error.lower()
        if "timeout" in normalized or "rate" in normalized:
            action = "route_to_failover_specialist"
        elif "payload" in normalized or "required" in normalized:
            action = "prune_context_and_retry_once"
        else:
            action = "escalate_to_human_queue"
        return {"trace_id": trace_id, "agent_name": agent_name, "recovery_action": action, "attempts_allowed": 1, "status": "PLANNED"}


telemetry = TelemetryRegistry()
recovery_manager = RecoveryManager()
