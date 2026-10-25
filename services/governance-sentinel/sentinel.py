# services/governance-sentinel/sentinel.py
"""
ApexSovereign Holdings - Net Credit Sentinel Watchdog
Monitors Supabase cu_balance metrics every 60 seconds, enforces 15-day pre-funded credit minimums,
and commands circuit_breaker.py to isolate delinquent accounts.
"""

import os
import time
import logging
import asyncio
from typing import List, Dict, Any
import psycopg2
from psycopg2.extras import RealDictCursor

from circuit_breaker import CircuitBreakerManager

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] [CREDIT_SENTINEL] %(message)s")
logger = logging.getLogger("credit_sentinel")

SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
POLL_INTERVAL_SECONDS = 60
MINIMUM_PREFUNDED_DAYS = 15
ESTIMATED_DAILY_CU_BURN_RATE = 2400.00  # 1 H100 node @ 100 CU/hr * 24hr


class NetCreditSentinel:
    def __init__(self):
        self.breaker = CircuitBreakerManager()

    def audit_active_accounts(self) -> List[Dict[str, Any]]:
        if not SUPABASE_DB_URL:
            logger.warning("DATABASE_URL absent. Sentinel running in dry-run mode.")
            return []

        try:
            with psycopg2.connect(SUPABASE_DB_URL) as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("""
                        SELECT 
                            id, 
                            email, 
                            organization_name, 
                            cu_balance, 
                            is_throttled
                        FROM public.users;
                    """)
                    return cur.fetchall()
        except Exception as e:
            logger.error(f"Error querying user balances: {e}")
            return []

    async def execute_watchdog_cycle(self):
        logger.info("================================================================================")
        logger.info("APEXSOVEREIGN NET CREDIT SENTINEL WATCHDOG ACTIVE")
        logger.info(f"Enforcing: {MINIMUM_PREFUNDED_DAYS}-Day Credit Buffer & Zero-Overdraw Hard Floor")
        logger.info("================================================================================")

        min_buffer_cu = MINIMUM_PREFUNDED_DAYS * ESTIMATED_DAILY_CU_BURN_RATE

        while True:
            try:
                users = self.audit_active_accounts()
                logger.info(f"Auditing {len(users)} registered enterprise accounts...")

                for user in users:
                    user_id = str(user["id"])
                    cu_balance = float(user["cu_balance"])
                    is_throttled = user["is_throttled"]

                    # 1. Zero Balance Critical Isolation
                    if cu_balance <= 0.000000:
                        if not is_throttled:
                            reason = f"CRITICAL_ZERO_BALANCE: Available {cu_balance} CU breaches hard floor."
                            self.breaker.trigger_account_throttle(user_id, reason)
                    # 2. Pre-funded Headroom Warning
                    elif cu_balance < min_buffer_cu:
                        days_left = round(cu_balance / ESTIMATED_DAILY_CU_BURN_RATE, 1)
                        logger.warning(
                            f"[LOW_BUFFER_WARNING] User {user['email']} has {cu_balance:.2f} CU "
                            f"(Approx {days_left} days remaining < {MINIMUM_PREFUNDED_DAYS}d required)."
                        )
                    # 3. Automatic Recovery
                    elif is_throttled and cu_balance >= min_buffer_cu:
                        logger.info(f"User {user['email']} replenished balance ({cu_balance:.2f} CU). Lifting throttle.")
                        self.breaker.restore_account_access(user_id)

            except Exception as loop_err:
                logger.error(f"Unhandled error in sentinel cycle: {loop_err}")

            await asyncio.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    sentinel = NetCreditSentinel()
    asyncio.run(sentinel.execute_watchdog_cycle())
