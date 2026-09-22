"""
ApexSovereign.ai - Milestone 2: Real-Time Telemetry & Webhook Dispatcher
Features:
- Second-by-second credit debits streamed into credit_telemetry_ticks (ready for Supabase Realtime CDC).
- Asynchronous HMAC-SHA256 signed HTTP webhook dispatcher for lifecycle events:
    * compute.leased
    * credits.low_threshold
    * lease.terminated
    * payment.disputed
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx
from asyncpg.pool import Pool

logger = logging.getLogger("apexsovereign.telemetry_webhooks")

LOW_CREDIT_THRESHOLD = 50.0  # Credits remaining


class WebhookDispatcher:
    """
    High-throughput cryptographic webhook dispatcher with exponential backoff retries.
    Signs all outbound payloads with HMAC-SHA256 in the 'X-Apex-Signature' header.
    """

    def __init__(self, pool: Pool, max_retries: int = 3):
        self.pool = pool
        self.max_retries = max_retries
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(10.0, connect=3.0),
                limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
            )
        return self._http_client

    async def close(self) -> None:
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()

    @staticmethod
    def sign_payload(secret: str, payload_bytes: bytes, timestamp: str) -> str:
        """Computes HMAC-SHA256 signature for webhook verification."""
        to_sign = f"t={timestamp}.".encode("utf-8") + payload_bytes
        mac = hmac.new(secret.encode("utf-8"), to_sign, hashlib.sha256)
        return f"t={timestamp},v1={mac.hexdigest()}"

    async def dispatch_event(
        self,
        tenant_id: str,
        event_type: str,
        data: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """
        Dispatches an enterprise lifecycle event to all active endpoints registered for the tenant.
        """
        event_id = f"evt_{uuid.uuid4().hex}"
        timestamp = str(int(time.time()))

        event_payload = {
            "id": event_id,
            "object": "event",
            "type": event_type,
            "tenant_id": tenant_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }
        payload_bytes = json.dumps(event_payload, separators=(",", ":")).encode("utf-8")

        # 1. Fetch active webhooks for this tenant subscribed to this event_type
        async with self.pool.acquire() as conn:
            webhooks = await conn.fetch(
                """
                SELECT id, url, secret_key
                FROM tenant_webhooks
                WHERE tenant_id = $1 
                  AND is_active = TRUE
                  AND $2 = ANY(subscribed_events);
                """,
                tenant_id,
                event_type,
            )

        if not webhooks:
            logger.debug("No active webhooks configured for tenant %s (event: %s)", tenant_id, event_type)
            return []

        results = []
        client = await self._get_client()

        for wh in webhooks:
            wh_id = wh["id"]
            url = wh["url"]
            secret = wh["secret_key"]
            signature = self.sign_payload(secret, payload_bytes, timestamp)

            headers = {
                "Content-Type": "application/json",
                "User-Agent": "ApexSovereign-Webhook-Dispatcher/2.5.0",
                "X-Apex-Event-Id": event_id,
                "X-Apex-Event-Type": event_type,
                "X-Apex-Signature": signature,
                "X-Apex-Timestamp": timestamp,
            }

            delivery_status = "PENDING"
            response_code: Optional[int] = None
            response_text: Optional[str] = None

            # Attempt transmission with exponential backoff
            for attempt in range(1, self.max_retries + 1):
                try:
                    resp = await client.post(url, content=payload_bytes, headers=headers)
                    response_code = resp.status_code
                    response_text = resp.text[:1000]

                    if 200 <= resp.status_code < 300:
                        delivery_status = "DELIVERED"
                        logger.info("Webhook %s delivered successfully to %s (attempt %d)", event_id, url, attempt)
                        break
                    else:
                        logger.warning("Webhook %s delivery non-2xx status (%d) to %s", event_id, resp.status_code, url)
                except Exception as exc:
                    response_text = str(exc)[:500]
                    logger.warning("Webhook delivery attempt %d failed for %s: %s", attempt, url, str(exc))

                if attempt < self.max_retries:
                    await asyncio.sleep(2 ** attempt)

            if delivery_status != "DELIVERED":
                delivery_status = "FAILED"

            # Log audit attempt in database
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO webhook_delivery_attempts (
                        webhook_id, tenant_id, event_type, event_id, payload,
                        response_code, response_body, status, last_attempt_at
                    ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, NOW())
                    ON CONFLICT (event_id) DO NOTHING;
                    """,
                    wh_id,
                    tenant_id,
                    event_type,
                    event_id,
                    json.dumps(event_payload),
                    response_code,
                    response_text,
                    delivery_status,
                )

            results.append({
                "webhook_id": str(wh_id),
                "url": url,
                "status": delivery_status,
                "response_code": response_code,
            })

        return results


class RealtimeUsageStreamer:
    """
    Simulates / processes continuous sub-second usage ticks and persists them to
    credit_telemetry_ticks. Any insert into this table triggers PostgreSQL CDC
    (Change Data Capture) via Supabase Realtime for live WebSocket streaming to UI charts.
    """

    def __init__(self, pool: Pool, webhook_dispatcher: WebhookDispatcher):
        self.pool = pool
        self.dispatcher = webhook_dispatcher
        self.running = False

    async def start_telemetry_daemon(self, tick_rate_seconds: float = 1.0) -> None:
        """Runs the continuous background debit engine for all unpaused active leases."""
        self.running = True
        logger.info("Realtime Usage Streaming Daemon started (tick rate = %.1fs).", tick_rate_seconds)

        while self.running:
            try:
                await self.process_telemetry_tick(tick_rate_seconds)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Error in usage telemetry tick: %s", str(exc), exc_info=True)

            await asyncio.sleep(tick_rate_seconds)

    async def process_telemetry_tick(self, interval_seconds: float) -> None:
        """
        Calculates fractional per-second credit debit for all ACTIVE leases where billing_paused = FALSE.
        Inserts row to credit_telemetry_ticks and evaluates low-balance alerts.
        """
        async with self.pool.acquire() as conn:
            # Query all running unpaused leases
            active_leases = await conn.fetch(
                """
                SELECT cl.id, cl.job_id, cl.tenant_id, cl.cost_per_hour, 
                       cl.assigned_node_id, t.credit_balance
                FROM compute_leases cl
                JOIN tenants t ON cl.tenant_id = t.id::text OR cl.tenant_id = t.slug
                WHERE cl.status = 'ACTIVE' AND cl.billing_paused = FALSE;
                """
            )

            if not active_leases:
                return

            for lease in active_leases:
                lease_id = str(lease["id"])
                tenant_id = str(lease["tenant_id"])
                hourly_rate = float(lease["cost_per_hour"])
                current_balance = float(lease["credit_balance"])

                # Calculate debit for this interval
                fractional_debit = (hourly_rate / 3600.0) * interval_seconds
                new_balance = max(0.0, round(current_balance - fractional_debit, 4))

                # 1. Update tenant credit balance and insert telemetry record
                async with conn.transaction():
                    await conn.execute(
                        """
                        UPDATE tenants 
                        SET credit_balance = $1, updated_at = NOW() 
                        WHERE id::text = $2 OR slug = $2;
                        """,
                        new_balance,
                        tenant_id,
                    )

                    await conn.execute(
                        """
                        INSERT INTO credit_telemetry_ticks (
                            tenant_id, lease_id, node_id, debit_amount, balance_after, tick_timestamp
                        ) VALUES ($1, $2, $3, $4, $5, NOW());
                        """,
                        tenant_id,
                        lease_id,
                        str(lease["assigned_node_id"]) if lease["assigned_node_id"] else None,
                        fractional_debit,
                        new_balance,
                    )

                # 2. Check if balance breached low threshold and dispatch webhook event
                if current_balance > LOW_CREDIT_THRESHOLD >= new_balance:
                    logger.warning("Tenant %s breached low credit threshold (%.2f credits remaining).", tenant_id, new_balance)
                    asyncio.create_task(
                        self.dispatcher.dispatch_event(
                            tenant_id=tenant_id,
                            event_type="credits.low_threshold",
                            data={
                                "remaining_credits": new_balance,
                                "threshold": LOW_CREDIT_THRESHOLD,
                                "active_leases_count": len(active_leases),
                                "action_required": "Top up balance immediately to prevent autonomous workload termination",
                            },
                        )
                    )

                # 3. Handle balance exhaustion (Zero balance -> Terminate lease)
                if new_balance <= 0.0:
                    logger.critical("Tenant %s balance exhausted. Terminating lease %s.", tenant_id, lease_id)
                    async with conn.transaction():
                        await conn.execute(
                            """
                            UPDATE compute_leases
                            SET status = 'TERMINATED_INSUFFICIENT_CREDITS', billing_paused = TRUE
                            WHERE id::text = $1;
                            """,
                            lease_id,
                        )
                    asyncio.create_task(
                        self.dispatcher.dispatch_event(
                            tenant_id=tenant_id,
                            event_type="lease.terminated",
                            data={
                                "lease_id": lease_id,
                                "reason": "BALANCE_EXHAUSTED",
                                "final_balance": 0.0,
                            },
                        )
                    )
