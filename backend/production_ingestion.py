import os
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field, model_validator

production_router = APIRouter(tags=["Production Ingestion"])

class IngestionPayload(BaseModel):
    event: Optional[str] = None
    tenant_id: str = "tenant-sovereign-01"
    compute_units: float = Field(default=100.0, gt=0)
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    customer_id: Optional[str] = None
    event_type: Optional[str] = None
    quantity: Optional[float] = Field(default=None, gt=0)

    @model_validator(mode="after")
    def normalize_legacy_fields(self) -> "IngestionPayload":
        if self.event is None:
            self.event = self.event_type
        if self.customer_id:
            self.tenant_id = self.customer_id
        if self.quantity is not None:
            self.compute_units = self.quantity
        if not self.event:
            raise ValueError("event or event_type is required")
        return self

def _verify_signature(payload_bytes: bytes, signature: str, secret: Optional[str] = None) -> bool:
    """Verify HMAC-SHA256 signature for production ingestion payloads."""
    sec = secret or os.getenv("INGESTION_WEBHOOK_SECRET", "test-secret")
    computed = hmac.new(sec.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, signature)


@production_router.post("/v1/ingestion/events", status_code=status.HTTP_202_ACCEPTED)
@production_router.post("/v1/ingest", status_code=status.HTTP_202_ACCEPTED)
async def ingest_production_event(
    request: Request,
    x_apex_signature: Optional[str] = Header(default=None, alias="X-Apex-Signature"),
    x_ingestion_signature: Optional[str] = Header(default=None, alias="X-Ingestion-Signature"),
) -> Dict[str, Any]:
    """Accept a production event only after verifying its HMAC-SHA256 signature."""
    raw_body = await request.body()
    signature = (x_apex_signature or x_ingestion_signature or "").strip()
    configured_secret = os.getenv("INGESTION_WEBHOOK_SECRET", "").strip()
    if configured_secret and not _verify_signature(raw_body, signature, configured_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid ingestion signature")
    if not configured_secret and os.getenv("ENVIRONMENT", "production").lower() == "production":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="ingestion signing secret is not configured")

    try:
        payload = IngestionPayload.model_validate_json(raw_body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return {
        "accepted": True,
        "event": payload.event,
        "tenant_id": payload.tenant_id,
        "compute_units": payload.compute_units,
        "timestamp": payload.timestamp,
    }
