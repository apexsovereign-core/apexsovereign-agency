"""Deterministic compliance gate for every agent plan and tool step."""
from __future__ import annotations

import hashlib
import json
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    reason: str
    decision_id: str
    escalation_required: bool = False


class HumanEscalationQueue:
    def __init__(self) -> None:
        self._items: list[Dict[str, Any]] = []

    def enqueue(self, *, tenant_id: str, agent_name: str, reason: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        item = {"escalation_id": str(uuid.uuid4()), "tenant_id": tenant_id, "agent_name": agent_name, "reason": reason, "payload_digest": hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest(), "created_at": time.time(), "status": "OPEN"}
        self._items.append(item)
        return item

    def list(self, tenant_id: Optional[str] = None) -> list[Dict[str, Any]]:
        return [item for item in self._items if tenant_id is None or item["tenant_id"] == tenant_id]


class ImmutableAuditTrail:
    def __init__(self) -> None:
        self._events: list[Dict[str, Any]] = []
        self._last_hash = "GENESIS"

    def record(self, *, tenant_id: str, event_type: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        event = {"event_id": str(uuid.uuid4()), "tenant_id": tenant_id, "event_type": event_type, "payload": dict(payload), "timestamp": time.time(), "previous_hash": self._last_hash}
        event["event_hash"] = hashlib.sha256(json.dumps(event, sort_keys=True, default=str).encode()).hexdigest()
        self._last_hash = event["event_hash"]
        self._events.append(event)
        return event

    def events(self, tenant_id: Optional[str] = None) -> list[Dict[str, Any]]:
        return [event for event in self._events if tenant_id is None or event["tenant_id"] == tenant_id]


class ComplianceGate:
    """Pure deterministic policy gate; no LLM or network call can approve a step."""

    def __init__(self, manifest: Mapping[str, Any]) -> None:
        self.manifest = manifest
        self.escalations = HumanEscalationQueue()
        self.audit = ImmutableAuditTrail()
        self.max_steps = int(manifest.get("platform", {}).get("max_steps_per_run", 12)) if isinstance(manifest.get("platform"), Mapping) else 12
        self.max_budget = 50.0
        for entry in manifest.get("agent_registry", []):
            self.max_budget = max(self.max_budget, float(entry.get("guardrails", {}).get("max_budget_per_task_usd", 0)))

    def validate_plan(self, *, tenant_id: str, agent_name: str, step_count: int, payload: Mapping[str, Any]) -> PolicyDecision:
        if step_count < 1 or step_count > self.max_steps:
            return self._deny(tenant_id, agent_name, "step_count_exceeds_policy", payload, escalate=True)
        requested_budget = float(payload.get("max_budget_usd", payload.get("budget_usd", 0)) or 0)
        if requested_budget > self.max_budget:
            return self._deny(tenant_id, agent_name, "budget_cap_exceeded", payload, escalate=True)
        return self._allow(tenant_id, agent_name, "plan_compliant", payload)

    def validate_step(self, *, tenant_id: str, agent_name: str, action: str, payload: Mapping[str, Any]) -> PolicyDecision:
        blocked = {"send_external_message", "close_ticket", "delete_record", "transfer_funds", "execute_unverified_tool"}
        if action in blocked:
            return self._deny(tenant_id, agent_name, f"action_requires_human_approval:{action}", payload, escalate=True)
        if action.endswith("webhook") and self.manifest.get("security", {}).get("allow_network_actions") is not True:
            return self._deny(tenant_id, agent_name, "network_action_disabled", payload, escalate=True)
        return self._allow(tenant_id, agent_name, f"step_compliant:{action}", payload)

    def _allow(self, tenant_id: str, agent_name: str, reason: str, payload: Mapping[str, Any]) -> PolicyDecision:
        decision_id = str(uuid.uuid4())
        self.audit.record(tenant_id=tenant_id, event_type="POLICY_ALLOW", payload={"decision_id": decision_id, "agent_name": agent_name, "reason": reason, "payload_digest": self._digest(payload)})
        return PolicyDecision(True, reason, decision_id)

    def _deny(self, tenant_id: str, agent_name: str, reason: str, payload: Mapping[str, Any], *, escalate: bool) -> PolicyDecision:
        decision_id = str(uuid.uuid4())
        self.audit.record(tenant_id=tenant_id, event_type="POLICY_DENY", payload={"decision_id": decision_id, "agent_name": agent_name, "reason": reason, "payload_digest": self._digest(payload)})
        if escalate:
            self.escalations.enqueue(tenant_id=tenant_id, agent_name=agent_name, reason=reason, payload=payload)
        return PolicyDecision(False, reason, decision_id, escalate)

    @staticmethod
    def _digest(payload: Mapping[str, Any]) -> str:
        return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
