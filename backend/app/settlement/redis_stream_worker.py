# backend/app/settlement/redis_stream_worker.py
"""
ApexSovereign.ai - Autonomous Redis Stream Settlement & DLQ Worker
Consumes event streams via XREADGROUP, processes ledger reconciliations,
preserves unmutated original payloads, routes to DLQ after MAX_RETRIES = 3,
and auto-heals database connections on transient network disconnects.
"""

import os
import sys
import time
import json
import logging
from typing import Dict, Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor
import redis

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [REDIS_STREAM_WORKER] %(message)s")
logger = logging.getLogger("redis_stream_worker")

# Environment Validation
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
if not SUPABASE_DB_URL:
    logger.critical("FATAL: Environment variable 'SUPABASE_DB_URL' is missing. Terminating worker.")
    sys.exit(1)

REDIS_URL = os.getenv("REDIS_URL")
if not REDIS_URL:
    logger.critical("FATAL: Environment variable 'REDIS_URL' is missing. Terminating worker.")
    sys.exit(1)

STREAM_NAME = "settlement:stream:debits"
CONSUMER_GROUP = "sovereign_ledger_workers"
CONSUMER_NAME = f"worker_{os.getpid()}"
DLQ_STREAM = "settlement:dlq"
MAX_RETRIES = 3


def get_db_connection() -> psycopg2.extensions.connection:
    """
    Active reconnect loop to recover from transient Supabase network drops
    without crashing or terminating the consumer process.
    """
    backoff = 1.0
    while True:
        try:
            conn = psycopg2.connect(SUPABASE_DB_URL, connect_timeout=5)
            conn.autocommit = False
            return conn
        except Exception as e:
            logger.warning(f"Database connection dropped ({e}). Retrying in {backoff:.1f}s...")
            time.sleep(backoff)
            backoff = min(backoff * 1.5, 15.0)


def init_redis_consumer_group(r: redis.Redis):
    try:
        r.xgroup_create(STREAM_NAME, CONSUMER_GROUP, id="0", mkstream=True)
        logger.info(f"Consumer group '{CONSUMER_GROUP}' created on stream '{STREAM_NAME}'.")
    except redis.exceptions.ResponseError as e:
        if "BUSYGROUP" in str(e):
            logger.info(f"Consumer group '{CONSUMER_GROUP}' already active.")
        else:
            logger.error(f"Error creating consumer group: {e}")
            raise


def process_stream_batch():
    r = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=5.0)
    init_redis_consumer_group(r)

    db_conn = get_db_connection()
    logger.info(f"Worker {CONSUMER_NAME} started. Listening for settlement events on '{STREAM_NAME}'...")

    while True:
        try:
            # Read batch of up to 50 events with 2-second block timeout
            streams = r.xreadgroup(CONSUMER_GROUP, CONSUMER_NAME, {STREAM_NAME: ">"}, count=50, block=2000)
            if not streams:
                continue

            for stream_data in streams:
                _, messages = stream_data
                for msg_id, payload in messages:
                    # Maintain unmutated clone of original stream payload
                    original_payload = dict(payload)
                    retry_count = int(payload.get("retry_count", 0))

                    try:
                        # Test DB connection viability, reconnect if broken
                        if db_conn.closed != 0:
                            db_conn = get_db_connection()

                        with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
                            cur.execute("SET statement_timeout = '3000ms';")
                            cur.execute("""
                                INSERT INTO public.settlement_audit_log (
                                    stream_msg_id, tenant_id, workload_id, cu_deducted, idempotency_key, processed_at
                                ) VALUES (%s, %s, %s, %s, %s, now())
                                ON CONFLICT (stream_msg_id) DO NOTHING;
                            """, (
                                msg_id,
                                original_payload.get("tenant_id"),
                                original_payload.get("workload_id"),
                                float(original_payload.get("cu_deducted", 0.0)),
                                original_payload.get("idempotency_key")
                            ))
                            db_conn.commit()

                        # Acknowledge processed message in Redis Stream
                        r.xack(STREAM_NAME, CONSUMER_GROUP, msg_id)

                    except Exception as err:
                        if db_conn and not db_conn.closed:
                            db_conn.rollback()

                        logger.error(f"Failed processing message {msg_id}: {err}")

                        if retry_count < MAX_RETRIES:
                            # Re-enqueue with incremented retry count
                            retry_payload = dict(original_payload)
                            retry_payload["retry_count"] = str(retry_count + 1)
                            r.xadd(STREAM_NAME, retry_payload)
                        else:
                            # DLQ Escalation: Route unmutated payload with error diagnostics
                            dlq_payload = dict(original_payload)
                            dlq_payload["fatal_error"] = str(err)
                            dlq_payload["failed_at"] = str(int(time.time() * 1000))
                            r.xadd(DLQ_STREAM, dlq_payload)
                            logger.critical(f"Message {msg_id} escalated to DLQ '{DLQ_STREAM}' after {MAX_RETRIES} attempts.")

                        # ACK the original message to preserve stream forward velocity
                        r.xack(STREAM_NAME, CONSUMER_GROUP, msg_id)

        except redis.exceptions.ConnectionError as r_err:
            logger.warning(f"Redis connection interrupted: {r_err}. Reconnecting in 2.0s...")
            time.sleep(2.0)
            try:
                r = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=5.0)
            except Exception:
                pass
        except KeyboardInterrupt:
            logger.info("Worker gracefully shutting down.")
            break
        except Exception as loop_err:
            logger.error(f"Worker loop encountered unhandled exception: {loop_err}")
            time.sleep(1.0)

    if db_conn and not db_conn.closed:
        db_conn.close()


if __name__ == "__main__":
    process_stream_batch()
