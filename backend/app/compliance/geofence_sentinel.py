# backend/app/compliance/geofence_sentinel.py
"""
ApexSovereign.ai - Hard-Boundary Geofencing Sentinel
Enforces jurisdictional isolation matrices (GDPR, FedRAMP, BSI C5).
"""

from enum import Enum
from typing import Set, Dict, Any
from fastapi import APIRouter, HTTPException, Request, Header, status
from pydantic import BaseModel, Field

geofence_router = APIRouter(prefix="/v1/compliance/geofence", tags=["Data Sovereignty"])


class JurisdictionRegime(str, Enum):
    GLOBAL = "GLOBAL"
    GDPR_EU = "GDPR_EU"
    FEDRAMP_US = "FEDRAMP_US"
    BSI_DE = "BSI_DE"


SOVEREIGN_ALLOW_MAP: Dict[JurisdictionRegime, Set[str]] = {
    JurisdictionRegime.GLOBAL: {"node-us-east-01", "node-us-central-02", "node-eu-central-01", "node-ap-south-01"},
    JurisdictionRegime.GDPR_EU: {"node-eu-central-01", "node-eu-west-01", "node-eu-north-01"},
    JurisdictionRegime.FEDRAMP_US: {"node-us-gov-east-01", "node-us-east-01"},
    JurisdictionRegime.BSI_DE: {"node-eu-central-01"},
}


class RoutingValidationRequest(BaseModel):
    tenant_id: str
    workload_id: str
    target_node_id: str
    jurisdiction: JurisdictionRegime = Field(default=JurisdictionRegime.GLOBAL)
    contains_pii: bool = False
    data_classification: str = Field(default="RESTRICTED")


def verify_jurisdiction_boundary(regime: JurisdictionRegime, target_node_id: str):
    allowed_nodes = SOVEREIGN_ALLOW_MAP.get(regime, set())
    if target_node_id not in allowed_nodes:
        raise HTTPException(
            status_code=status.HTTP_451_UNAVAILABLE_FOR_LEGAL_REASONS,
            detail={
                "error": "SOVEREIGNTY_BREACH_DETECTED",
                "violating_node": target_node_id,
                "mandated_regime": regime.value,
                "permitted_nodes": list(allowed_nodes),
                "remediation": "Request terminated at edge. Cross-border prompt transmission blocked."
            }
        )


@geofence_router.post("/validate-route", status_code=status.HTTP_200_OK)
async def validate_routing_path(request: RoutingValidationRequest):
    if request.contains_pii and request.jurisdiction == JurisdictionRegime.GLOBAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workloads marked contains_pii=True must declare explicit jurisdiction (e.g. GDPR_EU or FEDRAMP_US)."
        )

    verify_jurisdiction_boundary(request.jurisdiction, request.target_node_id)

    return {
        "status": "COMPLIANCE_VERIFIED",
        "tenant_id": request.tenant_id,
        "workload_id": request.workload_id,
        "target_node_id": request.target_node_id,
        "jurisdiction": request.jurisdiction.value,
        "boundary_pass": True
    }
