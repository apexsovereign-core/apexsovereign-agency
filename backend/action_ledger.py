"""Idempotent agent action ledger.

The in-process cache is a safety layer for retries; production persistence belongs
in the tenant-scoped agent_runs/activity_logs tables defined in enterprise_fabric.sql.
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class ActionCommit:
    status: str
    idempotency_key: str
    agent: str | None = None
    transaction_id: str | None = None
    action: str | None = None
    resource: str | None = None


class ActionLedger:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._commits: Dict[str, ActionCommit] = {}

    async def commit(self, *, idempotency_key: str, agent_identity: str, action_type: str, target_resource: str) -> ActionCommit:
        if not agent_identity.strip():
            raise PermissionError("Agent Identity Verification Failed.")
        if not idempotency_key.strip() or not action_type.strip() or not target_resource.strip():
            raise ValueError("idempotency_key, action_type, and target_resource are required")
        async with self._lock:
            existing = self._commits.get(idempotency_key)
            if existing:
                return existing
            commit = ActionCommit("committed", idempotency_key, agent_identity, str(uuid.uuid4()), action_type, target_resource)
            self._commits[idempotency_key] = commit
            return commit


ledger = ActionLedger()
