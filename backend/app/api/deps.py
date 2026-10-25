"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: FastAPI API Dependencies & Context Injectors
Author: Principal Systems Architect
"""

from __future__ import annotations

from typing import AsyncGenerator
from fastapi import Depends
from asyncpg.connection import Connection

from backend.app.core.security import verify_api_key
from backend.app.db.session import get_db_transaction
from backend.app.services.paypal_service import PayPalService, get_paypal_service


async def get_db_tx() -> AsyncGenerator[Connection, None]:
    """
    FastAPI dependency yielding an asyncpg transactional connection.
    Automatically commits on 2xx responses or rolls back on exceptions.
    """
    async with get_db_transaction() as conn:
        yield conn


def get_paypal() -> PayPalService:
    """Dependency injecting singleton PayPalService."""
    return get_paypal_service()


def require_api_key(api_key: str = Depends(verify_api_key)) -> str:
    """Enforces constant-time X-API-Key validation on administrative/internal routes."""
    return api_key
