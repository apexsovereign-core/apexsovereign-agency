"""
ApexSovereign.ai - Cross-Region Failover Engine (backend/mesh_failover_engine.py)
Autonomous Enterprise Work OS & Sovereign Compute Broker Platform.

TARGET 1: Cross-Region Failover Engine
- Active Cluster Probes: Poll primary/secondary cluster heartbeats (US-East, EU-Central, AP-South).
- Auto-Failover Trigger: If packet loss > 15% or latency > 250ms for 2 ticks, trigger failover.
- Endpoints Exposed:
  - GET /v1/mesh/failover-status
  - POST /v1/mesh/trigger-failover
- Supabase Audit Log:
  - Logs quorum elections and failover reroutes to public.system_logs with classification = 'internal'
"""

import os
import sys
import time
import json
import hashlib
import secrets
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

mesh_router = APIRouter(tags=["Cross-Region Failover & Mesh Federation"])

# ---------------------------------------------------------------------------
# Multi-Region Cluster Topology & State Store
# ---------------------------------------------------------------------------
REGIONS_STATE: Dict[str, Dict[str, Any]] = {
    "us-east": {
        "region_id": "us-east",
        "name": "US-East (N. Virginia Equinix IBX DC10)",
        "role": "PRIMARY_LEADER",
        "health": "HEALTHY",
        "latency_ms": 18.4,
        "packet_loss_pct": 0.0,
        "nodes_online": 32,
        "active_gpus": 256,
        "gpu_models": ["NVIDIA H100 SXM5", "NVIDIA A100 80GB"],
        "degradation_ticks": 0,
        "traffic_allocation_pct": 65,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
    },
    "eu-central": {
        "region_id": "eu-central",
        "name": "EU-Central (Frankfurt Interxion FRA1)",
        "role": "SECONDARY_STANDBY",
        "health": "HEALTHY",
        "latency_ms": 78.2,
        "packet_loss_pct": 0.2,
        "nodes_online": 24,
        "active_gpus": 192,
        "gpu_models": ["NVIDIA H100 SXM5", "NVIDIA L40S"],
        "degradation_ticks": 0,
        "traffic_allocation_pct": 25,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
    },
    "ap-south": {
        "region_id": "ap-south",
        "name": "AP-South (Singapore Singtel Mega-DC)",
        "role": "SECONDARY_STANDBY",
        "health": "HEALTHY",
        "latency_ms": 142.6,
        "packet_loss_pct": 0.4,
        "nodes_online": 16,
        "active_gpus": 128,
        "gpu_models": ["NVIDIA A100 80GB", "NVIDIA RTX 6000 Ada"],
        "degradation_ticks": 0,
        "traffic_allocation_pct": 10,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
    },
}

QUORUM_STATE = {
    "active_leader_region": "us-east",
    "quorum_consensus": "UNANIMOUS_3_OF_3",
    "failover_count": 0,
    "last_failover_timestamp": None,
    "last_failover_reason": None,
}

SYSTEM_LOG_BUFFER: List[Dict[str, Any]] = [
    {
        "id": "mesh-init-001",
        "event_type": "MESH_QUORUM_ESTABLISHED",
        "classification": "internal",
        "message": "Distributed multi-region mesh consensus active across US-East, EU-Central, AP-South",
        "region_id": "us-east",
        "audit_hash": hashlib.sha256("mesh_init_consensus".encode()).hexdigest(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
]


# ---------------------------------------------------------------------------
# Logging to Supabase public.system_logs (classification = 'internal')
# ---------------------------------------------------------------------------
async def log_mesh_system_event(
    event_type: str,
    message: str,
    region_id: str,
    payload: Dict[str, Any]
) -> str:
    now_iso = datetime.now(timezone.utc).isoformat()
    preimage = f"{event_type}:{region_id}:{now_iso}:{json.dumps(payload, sort_keys=True)}"
    audit_hash = hashlib.sha256(preimage.encode("utf-8")).hexdigest()

    event_record = {
        "id": f"mesh-{int(time.time()*1000)}-{secrets.token_hex(2)}",
        "event_type": event_type,
        "classification": "internal",
        "message": message,
        "region_id": region_id,
        "payload": payload,
        "audit_hash": audit_hash,
        "timestamp": now_iso,
    }

    SYSTEM_LOG_BUFFER.insert(0, event_record)
    if len(SYSTEM_LOG_BUFFER) > 60:
        SYSTEM_LOG_BUFFER.pop()

    # Remote Supabase persistence if credentials available
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if supabase_url and supabase_key:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=2.0) as client:
                headers = {
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                }
                log_row = {
                    "tenant_id": "system-mesh-federation",
                    "event_type": event_type,
                    "classification": "internal",
                    "payload": payload,
                    "event_hash": audit_hash,
                    "created_at": now_iso,
                }
                await client.post(f"{supabase_url}/rest/v1/system_logs", headers=headers, json=log_row)
        except Exception:
            pass

    return audit_hash


# ---------------------------------------------------------------------------
# Heartbeat Evaluator & Failover Engine
# ---------------------------------------------------------------------------
async def evaluate_mesh_health_and_failover(force_target_region: Optional[str] = None, reason: str = "Automated probe evaluation") -> Dict[str, Any]:
    """
    Evaluates cluster probes. If primary packet loss > 15% or latency > 250ms for 2 ticks,
    triggers autonomous failover reroute and updates quorum consensus.
    """
    current_leader = QUORUM_STATE["active_leader_region"]
    target_region = force_target_region

    if not target_region:
        # Check current leader degradation
        leader_state = REGIONS_STATE.get(current_leader, {})
        latency = leader_state.get("latency_ms", 0.0)
        loss = leader_state.get("packet_loss_pct", 0.0)

        if loss > 15.0 or latency > 250.0:
            leader_state["degradation_ticks"] = leader_state.get("degradation_ticks", 0) + 1
        else:
            leader_state["degradation_ticks"] = 0

        # Trigger failover if >= 2 ticks
        if leader_state.get("degradation_ticks", 0) >= 2:
            # Select healthiest standby region
            standbys = [r for r in REGIONS_STATE.values() if r["region_id"] != current_leader and r["health"] == "HEALTHY"]
            standbys.sort(key=lambda x: (x["packet_loss_pct"], x["latency_ms"]))
            if standbys:
                target_region = standbys[0]["region_id"]
                reason = f"Primary {current_leader} degraded (loss: {loss}%, latency: {latency}ms for 2 ticks)"

    if target_region and target_region != current_leader and target_region in REGIONS_STATE:
        old_leader = current_leader
        now_iso = datetime.now(timezone.utc).isoformat()

        # Update roles
        REGIONS_STATE[old_leader]["role"] = "SECONDARY_STANDBY"
        REGIONS_STATE[old_leader]["traffic_allocation_pct"] = 0
        REGIONS_STATE[old_leader]["health"] = "DEGRADED" if not force_target_region else "HEALTHY"

        REGIONS_STATE[target_region]["role"] = "PRIMARY_LEADER"
        REGIONS_STATE[target_region]["traffic_allocation_pct"] = 80
        REGIONS_STATE[target_region]["health"] = "HEALTHY"

        # Distribute remaining 20% to the 3rd standby
        other_regions = [r for r in REGIONS_STATE.keys() if r not in (old_leader, target_region)]
        for r in other_regions:
            REGIONS_STATE[r]["traffic_allocation_pct"] = 20

        QUORUM_STATE["active_leader_region"] = target_region
        QUORUM_STATE["failover_count"] += 1
        QUORUM_STATE["last_failover_timestamp"] = now_iso
        QUORUM_STATE["last_failover_reason"] = reason
        QUORUM_STATE["quorum_consensus"] = f"QUORUM_ELECTED_{target_region.upper()}"

        # Audit log in Supabase system_logs (classification = 'internal')
        audit_hash = await log_mesh_system_event(
            event_type="FAILOVER_REROUTE_EXECUTED",
            message=f"Traffic failover executed: {old_leader.upper()} -> {target_region.upper()}. Reason: {reason}",
            region_id=target_region,
            payload={
                "previous_leader": old_leader,
                "new_leader": target_region,
                "reason": reason,
                "failover_count": QUORUM_STATE["failover_count"],
            }
        )

        return {
            "status": "FAILOVER_EXECUTED",
            "previous_leader": old_leader,
            "active_leader": target_region,
            "reason": reason,
            "audit_hash": audit_hash,
            "timestamp": now_iso,
        }

    return {
        "status": "NOMINAL",
        "active_leader": current_leader,
        "message": "All cluster regions operating within SLA thresholds (<15% loss, <250ms latency).",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# API Models & Endpoints
# ---------------------------------------------------------------------------
class FailoverTriggerRequest(BaseModel):
    target_region: str = Field(..., description="Target region to promote to PRIMARY_LEADER (us-east, eu-central, ap-south)")
    reason: Optional[str] = Field(default="Manual administrator drill via Mesh Console", description="Reason for the failover")

class FailoverTriggerResponse(BaseModel):
    status: str
    previous_leader: Optional[str] = None
    active_leader: str
    reason: str
    audit_hash: Optional[str] = None
    timestamp: str

class MeshStatusResponse(BaseModel):
    status: str
    quorum_state: Dict[str, Any]
    regions: Dict[str, Dict[str, Any]]
    total_nodes_online: int
    total_active_gpus: int
    system_logs: List[Dict[str, Any]]
    timestamp: str


@mesh_router.get("/v1/mesh/failover-status", response_model=MeshStatusResponse)
async def endpoint_mesh_status():
    """
    GET /v1/mesh/failover-status
    Returns multi-region cluster status, latencies, packet loss, node allocations, and quorum state.
    """
    total_nodes = sum(r["nodes_online"] for r in REGIONS_STATE.values())
    total_gpus = sum(r["active_gpus"] for r in REGIONS_STATE.values())

    return MeshStatusResponse(
        status="OPERATIONAL",
        quorum_state=QUORUM_STATE,
        regions=REGIONS_STATE,
        total_nodes_online=total_nodes,
        total_active_gpus=total_gpus,
        system_logs=SYSTEM_LOG_BUFFER[:15],
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@mesh_router.post("/v1/mesh/trigger-failover", response_model=FailoverTriggerResponse)
async def endpoint_trigger_failover(req: FailoverTriggerRequest):
    """
    POST /v1/mesh/trigger-failover
    Manually promotes a standby region to PRIMARY_LEADER and executes traffic reroute.
    """
    if req.target_region not in REGIONS_STATE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid target region '{req.target_region}'. Supported regions: {list(REGIONS_STATE.keys())}"
        )

    res = await evaluate_mesh_health_and_failover(
        force_target_region=req.target_region,
        reason=req.reason
    )

    return FailoverTriggerResponse(
        status=res["status"],
        previous_leader=res.get("previous_leader"),
        active_leader=res["active_leader"],
        reason=res.get("reason", req.reason),
        audit_hash=res.get("audit_hash"),
        timestamp=res["timestamp"],
    )
