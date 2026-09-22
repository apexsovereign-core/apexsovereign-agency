"""HTTP control plane for the manifest-driven enterprise agent fabric."""
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from agent_engine import AgentEngine, AgentPlatformError, build_default_engine
from agent_middleware import audit_context, verify_webhook_signature
from apex_orchestrator import ApexOrchestrator
from orchestrator_mesh import federated_mesh, mesh_router
from action_ledger import ledger
from federated_fabric import federated_fabric
from usage_metering import usage_meter


agent_router = APIRouter(prefix="/agent-platform", tags=["agent-platform"])
engine: AgentEngine = build_default_engine()


class AgentRunRequest(BaseModel):
    agent_name: str = Field(..., min_length=2, max_length=128)
    payload: Dict[str, Any] = Field(default_factory=dict)


class AgentEventRequest(BaseModel):
    event_type: str = Field(..., min_length=3, max_length=128)
    payload: Dict[str, Any] = Field(default_factory=dict)


class OrchestrationRequest(BaseModel):
    agent_id: str = Field(..., min_length=2, max_length=128)
    user_intent: str = Field(..., min_length=3, max_length=1000)
    context_data: Dict[str, Any] = Field(default_factory=dict)


class MeshRouteRequest(BaseModel):
    intent: str = Field(..., min_length=3, max_length=1000)
    target_agent: str = Field(..., min_length=2, max_length=128)
    payload: Dict[str, Any] = Field(default_factory=dict)


class AgentActionRequest(BaseModel):
    idempotency_key: str = Field(..., min_length=8, max_length=128)
    action_type: str = Field(..., min_length=2, max_length=128)
    target_resource: str = Field(..., min_length=2, max_length=255)


def _serialize_run(run: Any) -> Dict[str, Any]:
    return {
        "run_id": run.run_id,
        "tenant_id": run.tenant_id,
        "agent_name": run.agent_name,
        "status": run.status,
        "input_payload": run.input_payload,
        "output": run.output,
        "steps": run.steps,
        "error": run.error,
        "idempotency_key": run.idempotency_key,
        "created_at": run.created_at,
    }


def _register_builtin_handlers() -> None:
    def classify_lead(context: Dict[str, Any]) -> Dict[str, Any]:
        lead = context.get("lead", {})
        has_business_email = bool(lead.get("email")) and not str(lead.get("email", "")).endswith(("gmail.com", "yahoo.com", "hotmail.com"))
        return {"lead": {**lead, "qualification": "HIGH" if has_business_email and lead.get("company") else "REVIEW"}}

    def classify_ticket(context: Dict[str, Any]) -> Dict[str, Any]:
        ticket = context.get("ticket", {})
        subject = str(ticket.get("subject", "")).lower()
        classification = "URGENT" if any(word in subject for word in ("outage", "security", "breach")) else "GENERAL"
        return {"ticket": {**ticket, "classification": classification}}

    def create_activity(context: Dict[str, Any]) -> Dict[str, Any]:
        return {"activity": {"event": "agent_step_completed", "entity": "lead" if "lead" in context else "ticket"}}

    def advance_deal(context: Dict[str, Any]) -> Dict[str, Any]:
        deal = context.get("deal", {})
        return {"deal": {**deal, "stage": "QUALIFIED" if context.get("lead", {}).get("qualification") == "HIGH" else deal.get("stage", "REVIEW")}}

    def draft_resolution(context: Dict[str, Any]) -> Dict[str, Any]:
        ticket = context.get("ticket", {})
        return {"resolution_plan": "Escalate to security response" if ticket.get("classification") == "URGENT" else "Prepare standard support response"}

    def execute_compute_arbitrage_quote(context: Dict[str, Any]) -> Dict[str, Any]:
        lead = context.get("lead", {})
        return {"quote": {"id": f"quote-{lead.get('id', 'unknown')}", "amount_usd": min(float(context.get("max_budget_usd", 50.0)), 50.0), "status": "PREPARED"}}

    def dispatch_crm_webhook(context: Dict[str, Any]) -> Dict[str, Any]:
        return {"crm_dispatch": {"status": "QUEUED_FOR_APPROVED_CONNECTOR", "network_action": False}}

    def reroute_baremetal_node(context: Dict[str, Any]) -> Dict[str, Any]:
        incident = context.get("incident", {})
        return {"reroute": {"node_id": incident.get("node_id"), "status": "PLAN_READY", "network_action": False}}

    def generate_audit_trace(context: Dict[str, Any]) -> Dict[str, Any]:
        return {"audit_trace": {"status": "RECORDED", "source_of_truth": "ApexUnifiedLedger"}}

    for action, handler in {"classify_lead": classify_lead, "classify_ticket": classify_ticket, "create_activity": create_activity, "advance_deal": advance_deal, "draft_resolution": draft_resolution, "execute_compute_arbitrage_quote": execute_compute_arbitrage_quote, "dispatch_crm_webhook": dispatch_crm_webhook, "reroute_baremetal_node": reroute_baremetal_node, "generate_audit_trace": generate_audit_trace}.items():
        engine.register_handler(action, handler)


_register_builtin_handlers()


@agent_router.get("/manifest")
async def get_manifest() -> Dict[str, Any]:
    return {"version": engine.manifest["version"], "platform": engine.manifest["platform"], "architecture_standard": engine.manifest.get("architecture_standard"), "metadata_fabric": engine.manifest.get("metadata_fabric"), "agent_registry": engine.manifest.get("agent_registry", []), "agents": engine.manifest["agents"], "distribution_layer": engine.manifest.get("distribution_layer", {}), "entities": engine.manifest["entities"]}


@agent_router.get("/agents")
async def list_agents() -> Dict[str, Any]:
    return {"agents": [{"name": agent.name, "description": agent.description, "triggers": agent.triggers, "capabilities": agent.capabilities, "approval_required": agent.approval_required} for agent in engine.agents()]}


@agent_router.post("/runs", status_code=status.HTTP_201_CREATED)
async def start_run(request: Request, body: AgentRunRequest, x_tenant_id: str = Header(...), x_idempotency_key: str = Header(...)) -> Dict[str, Any]:
    try:
        run = engine.run(tenant_id=x_tenant_id, agent_name=body.agent_name, payload=body.payload, idempotency_key=x_idempotency_key)
        meter = await usage_meter.record(tenant_id=x_tenant_id, event_type="agent_run", metadata={"agent_name": body.agent_name, "status": run.status})
        return {"run": _serialize_run(run), "meter": meter, "audit": audit_context(request, body.payload)}
    except AgentPlatformError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@agent_router.get("/runs/{run_id}")
async def get_run(run_id: str, x_tenant_id: str = Header(...)) -> Dict[str, Any]:
    run = engine.get_run(run_id)
    if run is None or run.tenant_id != x_tenant_id:
        raise HTTPException(status_code=404, detail="agent run not found")
    return {"run": _serialize_run(run)}


@agent_router.post("/events", status_code=status.HTTP_202_ACCEPTED)
async def ingest_event(request: Request, body: AgentEventRequest, x_tenant_id: str = Header(...), x_idempotency_key: str = Header(...), x_apex_signature: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    secret = os.getenv("AGENT_WEBHOOK_SECRET", "")
    if secret:
        raw_body = await request.body()
        if not verify_webhook_signature(raw_body, x_apex_signature or "", secret):
            raise HTTPException(status_code=401, detail="invalid webhook signature")
    routes = {trigger: agent.name for agent in engine.agents() for trigger in agent.triggers}
    agent_name = routes.get(body.event_type)
    if not agent_name:
        raise HTTPException(status_code=422, detail=f"no agent configured for event {body.event_type}")
    try:
        run = engine.run(tenant_id=x_tenant_id, agent_name=agent_name, payload=body.payload, idempotency_key=x_idempotency_key)
        return {"accepted": True, "event_type": body.event_type, "run": _serialize_run(run)}
    except AgentPlatformError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@agent_router.post("/orchestrate")
async def orchestrate(request: Request, body: OrchestrationRequest, x_tenant_id: str = Header(...), x_idempotency_key: str = Header(...)) -> Dict[str, Any]:
    """Run the supplied high-level reasoning loop with bounded, auditable steps."""
    record = await ApexOrchestrator(body.agent_id).execute_autonomous_loop(body.user_intent, body.context_data)
    return {"run": record, "audit": audit_context(request, body.context_data), "idempotency_key": x_idempotency_key, "tenant_id": x_tenant_id}


@agent_router.post("/mesh/route")
async def route_mesh(request: Request, body: MeshRouteRequest, x_tenant_id: str = Header(...), x_idempotency_key: str = Header(...)) -> Dict[str, Any]:
    result = await mesh_router.route_and_execute(body.intent, body.target_agent, body.payload)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return {"tenant_id": x_tenant_id, "idempotency_key": x_idempotency_key, "result": result, "audit": audit_context(request, body.payload)}


@agent_router.get("/federated/{object_key}")
async def federated_lookup(object_key: str, x_tenant_id: str = Header(...)) -> Dict[str, Any]:
    return {"tenant_id": x_tenant_id, "result": await federated_fabric.fetch(object_key)}


@agent_router.post("/actions/commit")
async def commit_agent_action(body: AgentActionRequest, x_agent_identity: Optional[str] = Header(default=None), x_tenant_id: str = Header(...), x_idempotency_key: str = Header(...)) -> Dict[str, Any]:
    if not x_agent_identity:
        raise HTTPException(status_code=403, detail="Agent Identity Verification Failed.")
    try:
        commit = await ledger.commit(idempotency_key=body.idempotency_key, agent_identity=x_agent_identity, action_type=body.action_type, target_resource=body.target_resource)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    meter = await usage_meter.record(tenant_id=x_tenant_id, event_type="agent_action", metadata={"action": body.action_type, "resource": body.target_resource})
    return {"tenant_id": x_tenant_id, "status": commit.status, "idempotency_key": commit.idempotency_key, "agent": commit.agent, "transaction_id": commit.transaction_id, "action": commit.action, "resource": commit.resource, "meter": meter}


@agent_router.get("/compliance/escalations")
async def compliance_escalations(x_tenant_id: str = Header(...)) -> Dict[str, Any]:
    return {"tenant_id": x_tenant_id, "items": engine.compliance.escalations.list(x_tenant_id)}


@agent_router.get("/compliance/audit")
async def compliance_audit(x_tenant_id: str = Header(...)) -> Dict[str, Any]:
    return {"tenant_id": x_tenant_id, "events": engine.compliance.audit.events(x_tenant_id)}
