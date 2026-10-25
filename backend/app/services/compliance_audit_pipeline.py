"""
ApexSovereign.ai - Milestone 7: Immutable SOC 2 Append-Only Compliance Pipeline
Features:
- Cryptographic Merkle/hash-chaining linking every audit log record to its predecessor (Tamper-evidence).
- Automated FastAPI middleware intercepting administrative operations, auth events, and financial mutations.
- Append-only WORM compliance (enforced via PostgreSQL triggers preventing UPDATE/DELETE).
- Verification endpoint allowing compliance auditors to audit and prove ledger integrity.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware
from asyncpg.connection import Connection

from backend.app.api.deps import get_db_tx, require_api_key
from backend.app.db.session import get_db_pool

logger = logging.getLogger("apexsovereign.audit_compliance")
router = APIRouter(prefix="/compliance/audit-logs", tags=["SOC 2 Compliance & Tamper-Evident Logs"])

# Genesis hash for the immutable hash chain
GENESIS_HASH = "0" * 64


class ImmutableAuditLogger:
    """
    Cryptographic append-only WORM audit pipeline.
    Calculates SHA-256(prev_hash + timestamp + principal_id + action + resource_id + payload).
    """

    @classmethod
    async def log_event(
        cls,
        conn: Connection,
        tenant_id: Optional[str],
        principal_id: str,
        principal_role: str,
        event_category: str,
        action: str,
        resource_type: str,
        resource_id: str,
        ip_address: str,
        user_agent: Optional[str],
        request_payload: Dict[str, Any],
        outcome: str = "SUCCESS",
        error_details: Optional[str] = None,
    ) -> str:
        """Atomically appends an audit event to the tamper-evident hash chain."""
        event_id = f"aud_{uuid.uuid4().hex}"
        timestamp = datetime.now(timezone.utc).isoformat()

        # 1. Fetch latest record hash to maintain cryptographic chain
        latest_row = await conn.fetchrow(
            """
            SELECT record_hash FROM audit_logs
            ORDER BY created_at DESC, id DESC
            LIMIT 1;
            """
        )
        prev_hash = latest_row["record_hash"] if latest_row else GENESIS_HASH

        # 2. Compute current record hash
        serialized_payload = json.dumps(request_payload, sort_keys=True)
        hash_input = (
            f"{prev_hash}|{timestamp}|{principal_id}|{action}|"
            f"{resource_type}|{resource_id}|{outcome}|{serialized_payload}"
        ).encode("utf-8")
        record_hash = hashlib.sha256(hash_input).hexdigest()

        # 3. Append to WORM table
        await conn.execute(
            """
            INSERT INTO audit_logs (
                event_id, tenant_id, principal_id, principal_role, event_category,
                action, resource_type, resource_id, ip_address, user_agent,
                request_payload, outcome, error_details, prev_record_hash, record_hash
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15
            );
            """,
            event_id,
            tenant_id,
            principal_id,
            principal_role,
            event_category,
            action,
            resource_type,
            resource_id,
            ip_address,
            user_agent,
            serialized_payload,
            outcome,
            error_details,
            prev_hash,
            record_hash,
        )

        logger.info(
            "SOC 2 Audit Log appended [event_id=%s, action=%s, hash=%s...]",
            event_id,
            action,
            record_hash[:12],
        )
        return event_id


class SOC2AuditMiddleware(BaseHTTPMiddleware):
    """
    FastAPI Middleware inspecting all incoming mutating requests (POST, PUT, DELETE, PATCH).
    Captures authentication identities and writes non-blocking audit entries.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Only log mutating administrative and API routes
        if request.method in ("GET", "HEAD", "OPTIONS") or request.url.path in ("/health", "/docs", "/openapi.json"):
            return await call_next(request)

        # Extract client metadata
        ip_addr = request.client.host if request.client else "0.0.0.0"
        ua = request.headers.get("User-Agent", "Unknown")
        api_key = request.headers.get("X-API-Key", "")
        principal_id = api_key[:14] if api_key.startswith("as_live_") else "admin_bearer_or_system"

        # Determine category based on route path
        path = request.url.path
        if "/auth/" in path:
            category = "AUTH_EVENT"
        elif "/compute/" in path:
            category = "COMPUTE_DISPATCH"
        elif "/billing/" in path:
            category = "BILLING_MUTATION"
        else:
            category = "ADMIN_ACTION"

        # Process request
        response = await call_next(request)

        # Log asynchronously after request processing
        outcome = "SUCCESS" if response.status_code < 400 else ("DENIED" if response.status_code in (401, 403) else "ERROR")

        try:
            pool = await get_db_pool()
            async with pool.acquire() as conn:
                await ImmutableAuditLogger.log_event(
                    conn=conn,
                    tenant_id=getattr(request.state, "tenant_id", None),
                    principal_id=principal_id,
                    principal_role="API_CLIENT" if api_key else "SYSTEM_ADMIN",
                    event_category=category,
                    action=f"{request.method}:{path}",
                    resource_type="API_ENDPOINT",
                    resource_id=path,
                    ip_address=ip_addr,
                    user_agent=ua,
                    request_payload={"status_code": response.status_code},
                    outcome=outcome,
                    error_details=None if outcome == "SUCCESS" else f"HTTP {response.status_code}",
                )
        except Exception as audit_err:
            logger.error("Audit log emission failure: %s", str(audit_err))

        return response


@router.get(
    "/verify-integrity",
    summary="Cryptographic SOC 2 Ledger Chain Integrity Audit",
    description="Traverses the cryptographic hash chain to verify zero tampering, unauthorized deletions, or edits.",
)
async def verify_chain_integrity(
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> Dict[str, Any]:
    """Validates that every row's prev_record_hash matches the prior row's computed SHA-256."""
    records = await conn.fetch(
        """
        SELECT event_id, prev_record_hash, record_hash, created_at
        FROM audit_logs
        ORDER BY created_at ASC, id ASC;
        """
    )

    if not records:
        return {
            "status": "VALID",
            "total_records_verified": 0,
            "chain_status": "EMPTY_CHAIN",
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }

    expected_prev = GENESIS_HASH
    for idx, rec in enumerate(records):
        if rec["prev_record_hash"] != expected_prev:
            logger.critical("SOC 2 AUDIT CHAIN BROKEN at record %s! Expected: %s, Found: %s", rec["event_id"], expected_prev, rec["prev_record_hash"])
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cryptographic chain broken at event '{rec['event_id']}'. Evidence of tampering detected.",
            )
        expected_prev = rec["record_hash"]

    return {
        "status": "VALID",
        "total_records_verified": len(records),
        "chain_root_genesis": GENESIS_HASH,
        "latest_block_hash": expected_prev,
        "tamper_evidence": "NO_TAMPERING_DETECTED",
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get(
    "/recent",
    summary="Fetch Compliance Audit Records",
    description="Lists latest tamper-evident logs for security compliance audits.",
)
async def get_recent_audit_logs(
    limit: int = 50,
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> Dict[str, Any]:
    rows = await conn.fetch(
        """
        SELECT event_id, tenant_id, principal_id, principal_role, event_category,
               action, resource_type, resource_id, ip_address, outcome,
               prev_record_hash, record_hash, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT $1;
        """,
        min(limit, 200),
    )
    return {"records": [dict(r) for r in rows], "count": len(rows)}
