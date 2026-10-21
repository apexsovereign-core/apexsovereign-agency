"""Manifest-driven autonomous agent execution engine.

The engine is deterministic-first: it plans from declared workflow steps, applies
input and guardrail checks, persists an auditable run event stream through an
optional repository, and never performs network or destructive actions implicitly.
"""
from __future__ import annotations

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Mapping, Optional

import yaml
from compliance_guardrails import ComplianceGate, PolicyDecision
from observability import recovery_manager


class AgentPlatformError(Exception):
    """Base platform error."""


class ManifestValidationError(AgentPlatformError):
    """Raised when the declarative manifest is incomplete or unsafe."""


class GuardrailViolation(AgentPlatformError):
    """Raised when a requested action violates the manifest policy."""


@dataclass(frozen=True)
class AgentStep:
    id: str
    action: str
    requires: tuple[str, ...] = ()


@dataclass(frozen=True)
class AgentDefinition:
    name: str
    description: str
    triggers: tuple[str, ...]
    capabilities: tuple[str, ...]
    workflow: tuple[AgentStep, ...]
    approval_required: bool = False


@dataclass
class AgentRun:
    run_id: str
    tenant_id: str
    agent_name: str
    status: str = "PENDING"
    input_payload: Dict[str, Any] = field(default_factory=dict)
    output: Dict[str, Any] = field(default_factory=dict)
    steps: list[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    idempotency_key: Optional[str] = None
    created_at: float = field(default_factory=time.time)


def _lookup(payload: Mapping[str, Any], dotted_key: str) -> Any:
    value: Any = payload
    for part in dotted_key.split("."):
        if not isinstance(value, Mapping) or part not in value:
            return None
        value = value[part]
    return value


def load_manifest(path: Path) -> Dict[str, Any]:
    document = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(document, dict) or str(document.get("version", "")).split(".")[0] not in {"1", "2"}:
        raise ManifestValidationError("manifest version 1.x or 2.x is required")
    agents = document.get("agents")
    if not isinstance(agents, dict) or not agents:
        raise ManifestValidationError("manifest must declare at least one agent")
    for name, raw in agents.items():
        if not raw.get("workflow") or not raw.get("capabilities"):
            raise ManifestValidationError(f"agent {name!r} needs workflow and capabilities")
        for step in raw["workflow"]:
            if step["action"] not in raw["capabilities"]:
                raise ManifestValidationError(f"{name}.{step['id']} uses undeclared capability")
    security = document.get("security", {})
    if security.get("require_tenant_scope") is not True:
        raise ManifestValidationError("tenant scoping must be enabled")
    return document


class AgentEngine:
    """Plans and executes manifest-defined workflows with deterministic handlers."""

    def __init__(self, manifest: Mapping[str, Any], *, max_steps: int = 12) -> None:
        self.manifest = manifest
        platform_config = manifest.get("platform", {})
        configured_max_steps = platform_config.get("max_steps_per_run", 12) if isinstance(platform_config, Mapping) else 12
        self.max_steps = min(max_steps, int(configured_max_steps))
        self._runs: Dict[str, AgentRun] = {}
        self._idempotency: Dict[tuple[str, str], str] = {}
        self._handlers: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {}
        self.compliance = ComplianceGate(manifest)

        for name, raw in manifest["agents"].items():
            if len(raw.get("workflow", [])) > self.max_steps:
                raise ManifestValidationError(f"agent {name!r} exceeds max step policy")

    def register_handler(self, action: str, handler: Callable[[Dict[str, Any]], Dict[str, Any]]) -> None:
        self._handlers[action] = handler

    def agents(self) -> list[AgentDefinition]:
        result = []
        for name, raw in self.manifest["agents"].items():
            result.append(AgentDefinition(
                name=name,
                description=raw.get("description", ""),
                triggers=tuple(raw.get("triggers", [])),
                capabilities=tuple(raw.get("capabilities", [])),
                workflow=tuple(AgentStep(s["id"], s["action"], tuple(s.get("requires", []))) for s in raw["workflow"]),
                approval_required=bool(raw.get("guardrails", {}).get("approval_required", False)),
            ))
        return result

    def plan(self, agent_name: str, payload: Mapping[str, Any]) -> list[AgentStep]:
        definition = next((agent for agent in self.agents() if agent.name == agent_name), None)
        if definition is None:
            raise AgentPlatformError(f"unknown agent: {agent_name}")
        available = set(self._payload_paths(payload))
        produced_by_action = {
            "classify_lead": {"lead.qualification"},
            "classify_ticket": {"ticket.classification"},
            "create_activity": {"activity"},
            "advance_deal": {"deal.stage"},
            "draft_resolution": {"resolution_plan"},
        }
        for step in definition.workflow:
            missing = [key for key in step.requires if key not in available]
            if missing:
                raise AgentPlatformError(f"missing required inputs: {sorted(set(missing))}")
            available.update(produced_by_action.get(step.action, set()))
        return list(definition.workflow)

    @staticmethod
    def _payload_paths(payload: Mapping[str, Any], prefix: str = "") -> set[str]:
        paths: set[str] = set()
        for key, value in payload.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            paths.add(path)
            if isinstance(value, Mapping):
                paths.update(AgentEngine._payload_paths(value, path))
        return paths

    def run(self, *, tenant_id: str, agent_name: str, payload: Mapping[str, Any], idempotency_key: str) -> AgentRun:
        if not tenant_id.strip():
            raise GuardrailViolation("tenant_id is required")
        if not idempotency_key.strip():
            raise GuardrailViolation("idempotency_key is required")
        key = (tenant_id, idempotency_key)
        existing_id = self._idempotency.get(key)
        if existing_id:
            return self._runs[existing_id]
        plan = self.plan(agent_name, payload)
        plan_decision = self.compliance.validate_plan(tenant_id=tenant_id, agent_name=agent_name, step_count=len(plan), payload=payload)
        if not plan_decision.allowed:
            run = AgentRun(str(uuid.uuid4()), tenant_id, agent_name, status="ESCALATED", input_payload=dict(payload), idempotency_key=idempotency_key)
            run.error = plan_decision.reason
            self._runs[run.run_id] = run
            self._idempotency[key] = run.run_id
            return run
        definition = next(agent for agent in self.agents() if agent.name == agent_name)
        run = AgentRun(str(uuid.uuid4()), tenant_id, agent_name, input_payload=dict(payload), idempotency_key=idempotency_key)
        self._runs[run.run_id] = run
        self._idempotency[key] = run.run_id
        context = dict(payload)
        run.status = "PROCESSING"
        try:
            for step in plan:
                started = time.perf_counter()
                step_decision = self.compliance.validate_step(tenant_id=tenant_id, agent_name=agent_name, action=step.action, payload=context)
                if not step_decision.allowed:
                    raise GuardrailViolation(step_decision.reason)
                missing = [key for key in step.requires if _lookup(context, key) is None]
                if missing:
                    raise AgentPlatformError(f"missing required inputs: {sorted(set(missing))}")
                handler = self._handlers.get(step.action)
                if handler is None:
                    step_output = self._default_handler(step.action, context)
                else:
                    step_output = handler(context)
                if not isinstance(step_output, dict):
                    raise AgentPlatformError(f"handler {step.action!r} must return an object")
                context.update(step_output)
                run.steps.append({"id": step.id, "action": step.action, "status": "SUCCEEDED", "duration_ms": round((time.perf_counter() - started) * 1000, 3)})
            run.output = {"result": context, "plan": [step.id for step in plan], "digest": self._digest(context)}
            run.status = "SUCCEEDED"
        except Exception as exc:
            run.error = str(exc)
            run.status = "BLOCKED" if isinstance(exc, GuardrailViolation) else "FAILED"
            run.output = {"recovery": recovery_manager.recover(str(exc), agent_name=agent_name, trace_id=run.run_id)}
        return run

    def get_run(self, run_id: str) -> Optional[AgentRun]:
        return self._runs.get(run_id)

    @staticmethod
    def _default_handler(action: str, context: Dict[str, Any]) -> Dict[str, Any]:
        if action == "classify_lead":
            lead = context.get("lead", {})
            qualified = bool(lead.get("company") and lead.get("email"))
            return {"lead": {**lead, "qualification": "HIGH" if qualified else "REVIEW"}}
        if action == "advance_deal":
            deal = context.get("deal", {})
            stage = "QUALIFIED" if context.get("lead", {}).get("qualification") == "HIGH" else deal.get("stage", "REVIEW")
            return {"deal": {**deal, "stage": stage}}
        if action == "classify_ticket":
            ticket = context.get("ticket", {})
            return {"ticket": {**ticket, "classification": "GENERAL"}}
        if action == "draft_resolution":
            return {"resolution_plan": "Prepare standard support response"}
        return {"last_action": action, "context_keys": sorted(context.keys())}

    @staticmethod
    def _digest(context: Mapping[str, Any]) -> str:
        return hashlib.sha256(json.dumps(context, sort_keys=True, default=str).encode()).hexdigest()[:16]


def manifest_path() -> Path:
    return Path(__file__).with_name("apex_manifest.yaml")


def build_default_engine() -> AgentEngine:
    manifest = load_manifest(manifest_path())
    return AgentEngine(manifest)
