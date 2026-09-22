"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Work OS Autonomous Workflow & Task Router
Author: Principal Systems Architect
"""

from __future__ import annotations

import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from asyncpg.connection import Connection

from backend.app.api.deps import get_db_tx, require_api_key
from backend.app.schemas.workflow import (
    WorkflowTaskCreate,
    WorkflowTaskResponse,
    WorkflowTaskUpdate,
)

logger = logging.getLogger("apexsovereign.workflow.router")
router = APIRouter(prefix="/workflow", tags=["Work OS Engine"])


@router.post(
    "/tasks",
    response_model=WorkflowTaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Work OS Task",
)
async def create_workflow_task(
    payload: WorkflowTaskCreate,
    conn: Connection = Depends(get_db_tx),
    _api_key: str = Depends(require_api_key),
) -> WorkflowTaskResponse:
    """
    Submits a new Work OS task into the orchestration queue.
    Protected by X-API-Key authentication.
    """
    insert_query = """
        INSERT INTO workflow_tasks (
            tenant_id, title, workflow_name, assigned_agent,
            priority, payload, compute_job_id, status
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'PENDING')
        RETURNING id, tenant_id, title, workflow_name, assigned_agent,
                  status, priority, payload, output, compute_job_id,
                  created_at, updated_at;
    """
    row = await conn.fetchrow(
        insert_query,
        payload.tenant_id,
        payload.title,
        payload.workflow_name,
        payload.assigned_agent,
        payload.priority,
        json.dumps(payload.payload),
        payload.compute_job_id,
    )

    return WorkflowTaskResponse(
        id=str(row["id"]),
        tenant_id=str(row["tenant_id"]),
        title=row["title"],
        workflow_name=row["workflow_name"],
        assigned_agent=row["assigned_agent"],
        status=row["status"],
        priority=row["priority"],
        payload=row["payload"],
        output=row["output"],
        compute_job_id=str(row["compute_job_id"]) if row["compute_job_id"] else None,
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )


@router.get(
    "/tasks",
    response_model=List[WorkflowTaskResponse],
    summary="List Work OS Tasks",
)
async def list_workflow_tasks(
    tenant_id: str = Query(..., description="Tenant UUID to filter tasks"),
    status: Optional[str] = Query(None, description="Optional status filter"),
    limit: int = Query(50, ge=1, le=200),
    conn: Connection = Depends(get_db_tx),
    _api_key: str = Depends(require_api_key),
) -> List[WorkflowTaskResponse]:
    """
    Lists tasks scheduled for a tenant's autonomous workflow.
    """
    if status:
        query = """
            SELECT id, tenant_id, title, workflow_name, assigned_agent,
                   status, priority, payload, output, compute_job_id,
                   created_at, updated_at
            FROM workflow_tasks
            WHERE tenant_id = $1 AND status = $2
            ORDER BY created_at DESC
            LIMIT $3;
        """
        rows = await conn.fetch(query, tenant_id, status, limit)
    else:
        query = """
            SELECT id, tenant_id, title, workflow_name, assigned_agent,
                   status, priority, payload, output, compute_job_id,
                   created_at, updated_at
            FROM workflow_tasks
            WHERE tenant_id = $1
            ORDER BY created_at DESC
            LIMIT $2;
        """
        rows = await conn.fetch(query, tenant_id, limit)

    return [
        WorkflowTaskResponse(
            id=str(r["id"]),
            tenant_id=str(r["tenant_id"]),
            title=r["title"],
            workflow_name=r["workflow_name"],
            assigned_agent=r["assigned_agent"],
            status=r["status"],
            priority=r["priority"],
            payload=r["payload"],
            output=r["output"],
            compute_job_id=str(r["compute_job_id"]) if r["compute_job_id"] else None,
            created_at=r["created_at"].isoformat(),
            updated_at=r["updated_at"].isoformat(),
        )
        for r in rows
    ]


@router.patch(
    "/tasks/{task_id}",
    response_model=WorkflowTaskResponse,
    summary="Update Work OS Task Progress",
)
async def update_workflow_task(
    task_id: str,
    update: WorkflowTaskUpdate,
    conn: Connection = Depends(get_db_tx),
    _api_key: str = Depends(require_api_key),
) -> WorkflowTaskResponse:
    """
    Updates the execution state or result output of a task.
    """
    update_query = """
        UPDATE workflow_tasks
        SET status = $2,
            output = COALESCE($3::jsonb, output),
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, tenant_id, title, workflow_name, assigned_agent,
                  status, priority, payload, output, compute_job_id,
                  created_at, updated_at;
    """
    row = await conn.fetchrow(
        update_query,
        task_id,
        update.status,
        json.dumps(update.output) if update.output is not None else None,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")

    return WorkflowTaskResponse(
        id=str(row["id"]),
        tenant_id=str(row["tenant_id"]),
        title=row["title"],
        workflow_name=row["workflow_name"],
        assigned_agent=row["assigned_agent"],
        status=row["status"],
        priority=row["priority"],
        payload=row["payload"],
        output=row["output"],
        compute_job_id=str(row["compute_job_id"]) if row["compute_job_id"] else None,
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )
