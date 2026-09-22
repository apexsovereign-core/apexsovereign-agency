"""Minimal root FastAPI runtime for apex-ingestion-engine."""
from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from production_ingestion import production_router
from v21_mesh import WorkflowProvision, MeshEvent, mesh


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mesh.start()
    yield
    await mesh.stop()


app = FastAPI(title="ApexSovereign.ai v21", version="21.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://apexsovereign.ai", "https://www.apexsovereign.ai"],
    allow_origin_regex=r"^https://([a-zA-Z0-9_-]+\.)?apexsovereign\.ai$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.include_router(production_router)


@app.get("/", include_in_schema=False)
async def storefront() -> FileResponse:
    return FileResponse(ROOT / "index.html", media_type="text/html")


@app.get("/health", tags=["Runtime"])
async def health() -> dict[str, Any]:
    snapshot = mesh.snapshot()
    return {"status": "ok", "version": "21.0", "supervisor": snapshot["supervisor"], "ledger": snapshot["ledger"]}


@app.get("/v21/mesh/status", tags=["v21 Enterprise Mesh"])
async def mesh_status() -> dict[str, Any]:
    return mesh.snapshot()


@app.get("/v21/telemetry/events", tags=["v21 Enterprise Mesh"])
async def telemetry_events(limit: int = 20) -> dict[str, Any]:
    events = mesh.events_since(limit)
    return {"events": events, "count": len(events)}


@app.post("/v21/workflows/provision", tags=["v21 Enterprise Mesh"])
async def provision_workflow(payload: WorkflowProvision) -> dict[str, Any]:
    metadata = {"workflow_type": payload.workflow_type, "priority": payload.priority, **payload.controls}
    result = await mesh.enqueue(
        MeshEvent(tenant_id=payload.tenant_id, event_type="workflow.provisioned", quantity=1, metadata=metadata),
        source="control_panel",
    )
    return {"status": "accepted", "workflow_id": result["event_id"], "ledger": result}


@app.get("/v21/health", include_in_schema=False)
async def v21_health() -> dict[str, Any]:
    return await health()
