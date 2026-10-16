import os
import hmac
import hashlib
from typing import Optional
from pydantic import BaseModel, Field

class IngestionPayload(BaseModel):
    event: str
    tenant_id: str = "tenant-sovereign-01"
    compute_units: float = 100.0
    timestamp: str

def _verify_signature(payload_bytes: bytes, signature: str, secret: Optional[str] = None) -> bool:
    """Verify HMAC-SHA256 signature for production ingestion payloads."""
    sec = secret or os.getenv("INGESTION_WEBHOOK_SECRET", "test-secret")
    computed = hmac.new(sec.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, signature)
