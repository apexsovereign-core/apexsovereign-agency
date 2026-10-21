"""
Early Access Waitlist Registration Route.
Enforces explicit consent, honeypot protection, privacy-preserving IP hashing, and rate limiting.
"""

import hashlib
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request, HTTPException, status
from pydantic import BaseModel, EmailStr

from .config import settings
from .security import rate_limit_gate
from . import db

router = APIRouter(prefix="/v1", tags=["waitlist"])


class WaitlistRequest(BaseModel):
    email: EmailStr
    consent: bool
    # Honeypot field: real users leave this empty
    website: Optional[str] = None


@router.post("/waitlist", status_code=status.HTTP_201_CREATED)
async def register_waitlist(req: WaitlistRequest, request: Request) -> Dict[str, Any]:
    # 1. Consent Requirement
    if not req.consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "consent_required", "message": "Consent to receive early access communications is required."}}
        )

    # 2. Honeypot check: silently accept bot submissions without storing
    if req.website:
        return {"status": "enrolled", "message": "You are on the priority access queue."}

    # 3. Privacy-Preserving Salted IP Hash
    raw_ip = request.client.host if request.client else "127.0.0.1"
    salt = settings.WAITLIST_IP_SALT
    ip_hash = hashlib.sha256(f"{salt}:{raw_ip}".encode("utf-8")).hexdigest()

    # 4. Rate Limit: 5 requests per hour per IP hash
    rate_limit_gate(f"waitlist_{ip_hash}", capacity=5, refill_per_sec=5.0 / 3600.0)

    normalized_email = str(req.email).strip().lower()

    # 5. Persist Idempotently
    try:
        await db.execute(
            """
            INSERT INTO apex.waitlist (email, consent, ip_hash, user_agent)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (email) DO NOTHING;
            """,
            (normalized_email, req.consent, ip_hash, request.headers.get("user-agent", ""))
        )
    except Exception:
        pass

    return {
        "status": "enrolled",
        "email": normalized_email,
        "message": "Registered for priority sovereign compute allocation."
    }
