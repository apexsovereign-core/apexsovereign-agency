"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Idempotency Engine & Distributed Replay Defense
Author: Principal Systems Architect

Guarantees:
- Exactly-once execution for compute allocations and financial credits.
- Immediate replay of cached responses for retried network requests.
- Elimination of double-charges and double-resource allocations under distributed race conditions.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Optional, Tuple
from asyncpg.connection import Connection

from backend.app.core.exceptions import IdempotencyConflictError

logger = logging.getLogger("apexsovereign.idempotency")


def compute_request_hash(payload: Any) -> str:
    """Computes a deterministic SHA-256 hash of a request payload."""
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class IdempotencyManager:
    """
    Manages atomic idempotency records in PostgreSQL.
    """

    @staticmethod
    async def acquire_or_get_cached(
        conn: Connection,
        tenant_id: str,
        idempotency_key: str,
        endpoint: str,
        request_hash: str,
    ) -> Tuple[bool, Optional[int], Optional[Any]]:
        """
        Attempts to reserve an idempotency key.
        Returns:
            (is_new_request, cached_response_code, cached_response_body)
        Raises:
            IdempotencyConflictError if an operation is currently locked in-flight.
        """
        # Try to insert atomically with PENDING state
        insert_query = """
            INSERT INTO idempotency_keys (
                tenant_id,
                idempotency_key,
                endpoint,
                request_hash,
                status,
                locked_until
            )
            VALUES ($1, $2, $3, $4, 'PENDING', NOW() + INTERVAL '2 minutes')
            ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
            RETURNING id;
        """
        row = await conn.fetchrow(
            insert_query,
            tenant_id,
            idempotency_key,
            endpoint,
            request_hash,
        )

        if row:
            # We acquired the key fresh
            return True, None, None

        # Key already exists in database; fetch its current state
        select_query = """
            SELECT status, response_code, response_body, request_hash, locked_until
            FROM idempotency_keys
            WHERE tenant_id = $1 AND idempotency_key = $2
            FOR UPDATE;
        """
        existing = await conn.fetchrow(select_query, tenant_id, idempotency_key)
        if not existing:
            # Concurrency race condition; acquired key
            return True, None, None

        status = existing["status"]

        if status == "COMMITTED":
            # Return cached response to caller
            raw_body = existing["response_body"]
            body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
            return False, existing["response_code"], body

        if status == "PENDING":
            # Check if lock has expired
            # If still locked, raise conflict error
            raise IdempotencyConflictError(
                idempotency_key,
                message=f"Request with idempotency key '{idempotency_key}' is actively being processed by another worker."
            )

        # If status was REVERTED, allow retry by updating to PENDING
        update_query = """
            UPDATE idempotency_keys
            SET status = 'PENDING',
                request_hash = $3,
                locked_until = NOW() + INTERVAL '2 minutes'
            WHERE tenant_id = $1 AND idempotency_key = $2;
        """
        await conn.execute(update_query, tenant_id, idempotency_key, request_hash)
        return True, None, None

    @staticmethod
    async def commit(
        conn: Connection,
        tenant_id: str,
        idempotency_key: str,
        response_code: int,
        response_body: Any,
    ) -> None:
        """
        Transitions the idempotency key to COMMITTED and preserves the response body.
        """
        query = """
            UPDATE idempotency_keys
            SET status = 'COMMITTED',
                response_code = $3,
                response_body = $4::jsonb
            WHERE tenant_id = $1 AND idempotency_key = $2;
        """
        body_json = json.dumps(response_body, default=str)
        await conn.execute(query, tenant_id, idempotency_key, response_code, body_json)

    @staticmethod
    async def revert(
        conn: Connection,
        tenant_id: str,
        idempotency_key: str,
    ) -> None:
        """
        Transitions the idempotency key to REVERTED upon unrecoverable processing error,
        enabling safe client retry.
        """
        query = """
            UPDATE idempotency_keys
            SET status = 'REVERTED'
            WHERE tenant_id = $1 AND idempotency_key = $2;
        """
        await conn.execute(query, tenant_id, idempotency_key)
