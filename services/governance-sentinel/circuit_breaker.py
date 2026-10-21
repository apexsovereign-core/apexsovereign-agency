# services/governance-sentinel/circuit_breaker.py
"""
ApexSovereign Holdings - Autonomous Credit Circuit Breaker
Instantly throttles enterprise client API access and drops active routes when balance hits zero.
"""

import os
import logging
from typing import Dict, Any
import psycopg2

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] [CIRCUIT_BREAKER] %(message)s")
logger = logging.getLogger("circuit_breaker")

SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "postgresql://postgres:postgres@localhost:5432/postgres")


class CircuitBreakerManager:
    @staticmethod
    def trigger_account_throttle(user_id: str, reason: str) -> bool:
        """
        Engages the circuit breaker: sets is_throttled = true and writes audit reason.
        """
        logger.critical(f"ENGAGING CIRCUIT BREAKER for user {user_id}: {reason}")
        if not SUPABASE_DB_URL:
            logger.warning("DATABASE_URL absent. Simulated circuit trip.")
            return True

        try:
            with psycopg2.connect(SUPABASE_DB_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE public.users
                        SET is_throttled = true,
                            throttle_reason = %s,
                            updated_at = timezone('utc', now())
                        WHERE id = %s::uuid;
                    """, (reason, user_id))
                    conn.commit()
            logger.info(f"CIRCUIT BREAKER ENGAGED. User {user_id} throttled.")
            return True
        except Exception as e:
            logger.error(f"Failed to engage circuit breaker for user {user_id}: {e}")
            return False

    @staticmethod
    def restore_account_access(user_id: str) -> bool:
        """
        Disengages the circuit breaker when balance requirements are replenished.
        """
        logger.info(f"Restoring access for user {user_id}...")
        try:
            with psycopg2.connect(SUPABASE_DB_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE public.users
                        SET is_throttled = false,
                            throttle_reason = NULL,
                            updated_at = timezone('utc', now())
                        WHERE id = %s::uuid;
                    """, (user_id,))
                    conn.commit()
            logger.info(f"CIRCUIT BREAKER RESET. User {user_id} access active.")
            return True
        except Exception as e:
            logger.error(f"Failed to reset circuit breaker for user {user_id}: {e}")
            return False
