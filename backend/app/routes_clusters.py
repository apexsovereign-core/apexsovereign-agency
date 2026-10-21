"""
Cluster Provisioning, Lifecycle & Node Scale Routes.
Delegates to active ComputeProvider (SimulatedProvider or RestSupplierProvider).
Schema: apex.clusters
"""

from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Request, HTTPException, Security, status, Header
from pydantic import BaseModel, Field

from .security import get_current_user
from .providers import get_compute_provider
from . import db

router = APIRouter(prefix="/v1/clusters", tags=["clusters"])


class ProvisionClusterRequest(BaseModel):
    name: Optional[str] = None
    model: str = Field(default="H100-SXM5-80GB")
    region: str = Field(default="us-east-va")
    nodes: int = Field(default=1, ge=1, le=64)
    term: str = Field(default="spot")
    jurisdiction: str = Field(default="US-VA")
    ssh_key_id: Optional[str] = None


class ScaleClusterRequest(BaseModel):
    nodes: int = Field(ge=1, le=64)


@router.get("")
async def list_user_clusters(user: Dict[str, Any] = Security(get_current_user)) -> List[Dict[str, Any]]:
    try:
        rows = await db.fetch_all(
            "SELECT * FROM apex.clusters WHERE owner_id = %s ORDER BY created_at DESC;",
            (user["user_id"],)
        )
        if rows:
            return rows
    except Exception:
        pass

    # Fallback demo cluster for immediate console exploration
    return [
        {
            "id": "c-9482-h100-demo",
            "name": "Production-Inference-Node-A",
            "model": "H100-SXM5-80GB",
            "region": "us-east-va",
            "nodes": 4,
            "term": "spot",
            "jurisdiction": "US-VA",
            "status": "running",
            "demo": True,
            "provider": "simulated",
            "host": "apex-node-c9482.us-east-va.apexsovereign.mesh",
            "burn_cu_hr": 776,
            "accrued_cu": 1552,
            "created_at": "2026-10-18T10:00:00Z"
        }
    ]


@router.post("/provision")
async def provision_cluster(
    req: ProvisionClusterRequest,
    user: Dict[str, Any] = Security(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")
) -> Dict[str, Any]:
    provider = get_compute_provider()
    cluster_data = await provider.provision(req.model_dump(), user["user_id"])

    # Persist in apex.clusters
    try:
        await db.execute(
            """
            INSERT INTO apex.clusters (
                id, owner_id, name, model, region, nodes, term, jurisdiction,
                status, demo, provider, host, burn_cu_hr, accrued_cu, started_at
            ) VALUES (
                %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, NOW()
            );
            """,
            (
                cluster_data["id"],
                user["user_id"],
                cluster_data["name"],
                cluster_data["model"],
                cluster_data["region"],
                cluster_data["nodes"],
                cluster_data["term"],
                cluster_data["jurisdiction"],
                cluster_data["status"],
                cluster_data["demo"],
                cluster_data["provider"],
                cluster_data["host"],
                cluster_data["burn_cu_hr"],
                cluster_data["accrued_cu"]
            )
        )
    except Exception:
        pass

    return cluster_data


@router.get("/{cluster_id}")
async def get_cluster_detail(
    cluster_id: str,
    user: Dict[str, Any] = Security(get_current_user)
) -> Dict[str, Any]:
    try:
        row = await db.fetch_one("SELECT * FROM apex.clusters WHERE id = %s AND owner_id = %s;", (cluster_id, user["user_id"]))
        if row:
            return row
    except Exception:
        pass

    provider = get_compute_provider()
    return await provider.status(cluster_id)


@router.patch("/{cluster_id}/scale")
async def scale_cluster(
    cluster_id: str,
    req: ScaleClusterRequest,
    user: Dict[str, Any] = Security(get_current_user)
) -> Dict[str, Any]:
    provider = get_compute_provider()
    res = await provider.scale(cluster_id, req.nodes, user["user_id"])
    try:
        await db.execute("UPDATE apex.clusters SET nodes = %s WHERE id = %s AND owner_id = %s;", (req.nodes, cluster_id, user["user_id"]))
    except Exception:
        pass
    return res


@router.delete("/{cluster_id}")
async def release_cluster(
    cluster_id: str,
    user: Dict[str, Any] = Security(get_current_user)
) -> Dict[str, Any]:
    provider = get_compute_provider()
    res = await provider.release(cluster_id, user["user_id"])
    try:
        await db.execute("UPDATE apex.clusters SET status = 'stopped', released_at = NOW() WHERE id = %s AND owner_id = %s;", (cluster_id, user["user_id"]))
    except Exception:
        pass
    return res
