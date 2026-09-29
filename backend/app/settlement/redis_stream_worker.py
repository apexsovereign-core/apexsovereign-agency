# backend/app/settlement/redis_stream_worker.py
"""
ApexSovereign.ai - Autonomous Redis Stream Settlement & DLQ Worker
Consumes event streams via XREADGROUP, processes ledger reconciliations,
and routes failed transactions to Dead-Letter Queue (DLQ) with exponential backoff.
"""

import os
import sys
import time
import json
import logging
from typing import Dict, Any
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
    r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    init_redis_consumer_group(r)

    db_conn = psycopg2.connect(SUPABASE_DB_URL)
    db_conn.autocommit = False
    logger.info(f"Worker {CONSUMER_NAME} started. Listening for settlement events...")

    while True:
        try:
            # Read batch of up to 50 events with 2-second block timeout
            streams = r.xreadgroup(CONSUMER_GROUP, CONSUMER_NAME, {STREAM_NAME: ">"}, count=50, block=2000)
            if not streams:
                continue

            for stream_data in streams:
                _, messages = stream_data
                for msg_id, payload in messages:
                    retry_count = int(payload.get("retry_count", 0))

                    try:
                        with db_conn.cursor(cursor_factory=RealDictCursor) as cur:
                            # Reconcile ledger audit row
                            cur.execute("""
                                INSERT INTO public.settlement_audit_log (
                                    stream_msg_id, tenant_id, workload_id, cu_deducted, idempotency_key, processed_at
                                ) VALUES (%s, %s, %s, %s, %s, now())
                                ON CONFLICT (stream_msg_id) DO NOTHING;
                            """, (
                                msg_id,
                                payload.get("tenant_id"),
                                payload.get("workload_id"),
                                float(payload.get("cu_deducted", 0.0)),
                                payload.get("idempotency_key")
                            ))
                            db_conn.commit()

                        # Acknowledge processed message in Redis Stream
                        r.xack(STREAM_NAME, CONSUMER_GROUP, msg_id)

                    except Exception as err:
                        db_conn.rollback()
                        logger.error(f"Failed processing message {msg_id}: {err}")
                        if retry_count < MAX_RETRIES:
                            payload["retry_count"] = retry_count + 1
                            r.xadd(STREAM_NAME, payload)
                        else:
                            # Route to Dead-Letter Queue
                            payload["fatal_error"] = str(err)
                            payload["failed_at"] = str(int(time.time() * 1000))
                            r.xadd(DLQ_STREAM, payload)
                            logger.critical(f"Message {msg_id} moved to DLQ '{DLQ_STREAM}' after {MAX_RETRIES} failures.")

                        r.xack(STREAM_NAME, CONSUMER_GROUP, msg_id)

        except KeyboardInterrupt:
            logger.info("Worker gracefully shutting down.")
            break
        except Exception as loop_err:
            logger.error(f"Worker loop encountered exception: {loop_err}")
            time.sleep(1.0)

    db_conn.close()


if __name__ == "__main__":
    process_stream_batch()
