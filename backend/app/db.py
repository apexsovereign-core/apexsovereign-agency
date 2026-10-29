"""
Database connection pool and query execution utilities using psycopg v3.
Provides async connection pooling, schema isolation (apex), and cached health checks.
"""

import time
import logging
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager

from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row

from .config import settings

logger = logging.getLogger("apex.db")

_pool: Optional[AsyncConnectionPool] = None
_last_health_check_time: float = 0.0
_last_health_status: bool = False
_HEALTH_CACHE_TTL_SEC: float = 2.0


def _offline_mode_allowed() -> bool:
    """Offline operation requires explicit DEMO_MODE and a non-production env."""
    return bool(settings.DEMO_MODE) and not settings.is_production


async def init_pool() -> Optional[AsyncConnectionPool]:
    """
    Open the Postgres pool or abort startup.

    Production (ENV=production or PAYPAL_ENV=live) always fails closed. Offline
    operation is permitted only when DEMO_MODE=true is explicitly set outside
    production; callers must then return explicit simulated/unavailable states.
    """
    global _pool

    if not settings.DATABASE_URL.strip():
        if _offline_mode_allowed():
            logger.warning("DEMO_MODE=true: DATABASE_URL absent; database is offline.")
            _pool = None
            return None
        raise RuntimeError("DATABASE_URL is required; refusing to start without a database.")

    try:
        _pool = AsyncConnectionPool(
            conninfo=settings.DATABASE_URL,
            min_size=2,
            max_size=20,
            timeout=10.0,
            max_idle=300.0,
            open=False,
            kwargs={"autocommit": True, "row_factory": dict_row},
        )
        await _pool.open()
        logger.info("Database connection pool established successfully.")
        return _pool
    except Exception as exc:
        _pool = None
        if _offline_mode_allowed():
            logger.warning("DEMO_MODE=true: database pool unavailable; running offline.")
            return None
        logger.error("Failed to initialize database pool: %s", exc.__class__.__name__)
        raise RuntimeError("Database pool initialization failed; refusing to start.") from exc


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        logger.info("Database connection pool closed.")
        _pool = None


@asynccontextmanager
async def get_connection():
    global _pool
    if _pool is None:
        raise ConnectionError("Database connection pool is not available.")
    async with _pool.connection() as conn:
        yield conn


async def check_db_health() -> bool:
    """
    Fast DB health check:
    Executes SELECT 1 with 300ms timeout, cached for 2 seconds.
    """
    global _last_health_check_time, _last_health_status, _pool
    now = time.monotonic()

    if (now - _last_health_check_time) < _HEALTH_CACHE_TTL_SEC:
        return _last_health_status

    if _pool is None:
        _last_health_status = False
        _last_health_check_time = now
        return False

    try:
        async with _pool.connection(timeout=0.3) as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1;")
                row = await cur.fetchone()
                _last_health_status = bool(row)
    except Exception as e:
        logger.warning(f"Database health check probe failed: {e}")
        _last_health_status = False

    _last_health_check_time = now
    return _last_health_status


async def fetch_one(query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            return await cur.fetchone()


async def fetch_all(query: str, params: tuple = ()) -> List[Dict[str, Any]]:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            return await cur.fetchall()


async def execute(query: str, params: tuple = ()) -> None:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
