"""
ApexSovereign.ai - Enterprise API Key Management & Ingestion Endpoints
Enables programmatic generation, revocation, and inspection of scoped API keys.
"""

from __future__ import annotations

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from asyncpg.connection import Connection

from backend.app.api.deps import get_db_tx, require_api_key
from backend.app.core.api_key_manager import (
    EnterpriseAPIKeyManager,
    APIKeyGenerationResult,
    authenticate_scoped_api_key,
    require_scopes,
    AuthenticatedPrincipal,
    VALID_SCOPES,
)

router = APIRouter(prefix="/auth/keys", tags=["Enterprise API Key Management"])


class CreateAPIKeyRequest(BaseModel):
    tenant_id: str = Field(..., description="Tenant UUID")
    name: str = Field(..., min_length=3, max_length=64, description="Friendly label for the API key")
    scopes: List[str] = Field(default=["compute:read", "compute:write"], description="Assigned permission scopes")
    rate_limit_rpm: int = Field(default=120, ge=10, le=1000, description="Requests per minute sliding rate limit")
    expires_in_days: Optional[int] = Field(default=365, ge=1, le=730, description="Expiration in days")


class APIKeyInfo(BaseModel):
    id: str
    name: str
    key_prefix: str
    scopes: List[str]
    rate_limit_rpm: int
    expires_at: Optional[str]
    is_active: bool
    created_at: str


@router.post(
    "/generate",
    response_model=APIKeyGenerationResult,
    summary="Generate Scoped Enterprise API Key",
    description="Generates an unforgeable as_live_ API key with granular scopes and sliding rate limits.",
)
async def generate_key(
    payload: CreateAPIKeyRequest,
    conn: Connection = Depends(get_db_tx),
    _admin_auth: str = Depends(require_api_key),
) -> APIKeyGenerationResult:
    """Generates an as_live_ API key and persists its cryptographic hash."""
    try:
        plaintext_key, prefix, key_hash, expires_at = EnterpriseAPIKeyManager.generate_api_key(
            tenant_id=payload.tenant_id,
            name=payload.name,
            scopes=payload.scopes,
            rate_limit_rpm=payload.rate_limit_rpm,
            expires_in_days=payload.expires_in_days,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))

    row = await conn.fetchrow(
        """
        INSERT INTO api_keys (
            tenant_id, key_prefix, key_hash, name, scopes, rate_limit_rpm, expires_at, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        RETURNING id, created_at;
        """,
        payload.tenant_id,
        prefix,
        key_hash,
        payload.name,
        payload.scopes,
        payload.rate_limit_rpm,
        expires_at,
    )

    return APIKeyGenerationResult(
        key_id=str(row["id"]),
        name=payload.name,
        plaintext_key=plaintext_key,
        prefix=prefix,
        scopes=payload.scopes,
        rate_limit_rpm=payload.rate_limit_rpm,
        expires_at=expires_at.isoformat() if expires_at else None,
    )


@router.get(
    "/list",
    response_model=List[APIKeyInfo],
    summary="List Active Keys for Tenant",
    description="Lists all API key metadata for a tenant (never reveals plaintext secrets).",
)
async def list_keys(
    tenant_id: str,
    conn: Connection = Depends(get_db_tx),
    _admin_auth: str = Depends(require_api_key),
) -> List[APIKeyInfo]:
    rows = await conn.fetch(
        """
        SELECT id, name, key_prefix, scopes, rate_limit_rpm, expires_at, is_active, created_at
        FROM api_keys
        WHERE tenant_id = $1
        ORDER BY created_at DESC;
        """,
        tenant_id,
    )
    return [
        APIKeyInfo(
            id=str(r["id"]),
            name=r["name"],
            key_prefix=r["key_prefix"],
            scopes=list(r["scopes"]),
            rate_limit_rpm=r["rate_limit_rpm"],
            expires_at=r["expires_at"].isoformat() if r["expires_at"] else None,
            is_active=r["is_active"],
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]


@router.delete(
    "/{key_id}/revoke",
    summary="Revoke API Key",
    description="Immediately disables an API key.",
)
async def revoke_key(
    key_id: str,
    conn: Connection = Depends(get_db_tx),
    _admin_auth: str = Depends(require_api_key),
):
    result = await conn.execute(
        "UPDATE api_keys SET is_active = FALSE WHERE id = $1::uuid;",
        key_id,
    )
    return {"status": "REVOKED", "key_id": key_id}
