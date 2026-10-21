"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Work OS Workflow & Task Schemas
Author: Principal Systems Architect
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, Field


TaskStatus = Literal["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "BLOCKED"]


class WorkflowTaskCreate(BaseModel):
    tenant_id: str = Field(..., description="Tenant UUID")
    title: str = Field(..., min_length=3, max_length=255)
    workflow_name: str = Field(..., min_length=3, max_length=128)
    assigned_agent: str = Field(default="autonomous_broker")
    priority: int = Field(default=1, ge=1, le=5)
    payload: Dict[str, Any] = Field(default_factory=dict)
    compute_job_id: Optional[str] = None


class WorkflowTaskUpdate(BaseModel):
    status: TaskStatus
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class WorkflowTaskResponse(BaseModel):
    id: str
    tenant_id: str
    title: str
    workflow_name: str
    assigned_agent: str
    status: str
    priority: int
    payload: Dict[str, Any]
    output: Optional[Dict[str, Any]] = None
    compute_job_id: Optional[str] = None
    created_at: str
    updated_at: str
