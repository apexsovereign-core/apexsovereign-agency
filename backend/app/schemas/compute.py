"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Compute Broker Schemas
Author: Principal Systems Architect
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, Field


ResourceTierType = Literal[
    "STANDARD_CPU",
    "HIGH_CPU",
    "GPU_T4",
    "GPU_A100",
    "GPU_H100"
]


class ComputeDispatchRequest(BaseModel):
    """Payload to dispatch an autonomous distributed compute job."""
    tenant_id: str = Field(..., description="Tenant UUID requesting compute execution")
    job_type: str = Field(..., description="Job archetype (e.g. LLM_FINE_TUNE, DATA_PIPELINE, EMBEDDING_GEN)")
    resource_tier: ResourceTierType = Field(default="STANDARD_CPU", description="Compute hardware tier")
    cpu_cores: int = Field(default=2, ge=1, le=128, description="Allocated CPU cores")
    memory_mb: int = Field(default=4096, ge=1024, le=524288, description="Allocated RAM in Megabytes")
    gpu_count: int = Field(default=0, ge=0, le=8, description="Number of GPUs requested")
    idempotency_key: str = Field(..., min_length=16, description="Idempotency key for atomic billing and dispatch")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Job parameters and container instructions")


class ComputeDispatchResponse(BaseModel):
    job_id: str
    tenant_id: str
    status: str
    resource_tier: str
    estimated_cost: float
    remaining_balance: float
    lease_token: str
    lease_expires_at: int
    idempotent_replay: bool = False


class ComputeJobStatusResponse(BaseModel):
    job_id: str
    tenant_id: str
    job_type: str
    resource_tier: str
    status: str
    estimated_cost: float
    actual_cost: Optional[float] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    results: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
