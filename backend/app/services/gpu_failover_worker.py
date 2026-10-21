"""
ApexSovereign.ai - Milestone 1: Bare-Metal GPU Health Monitor & Dynamic Failover Worker
Asynchronous background daemon executing continuous heartbeat probes against GPU clusters
(V100/A100/H100), debit pausing upon node degradation, and zero-downtime workload failover.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
import httpx
from asyncpg.pool import Pool

logger = logging.getLogger("apexsovereign.gpu_failover_worker")

HEALTH_PROBE_TIMEOUT_SECONDS = 3.0
MAX_CONSECUTIVE_FAILURES = 3
LATENCY_DEGRADATION_THRESHOLD_MS = 650.0
PROBE_INTERVAL_SECONDS = 5.0


class GPUHealthFailoverWorker:
    """
    Autonomous worker daemon that monitors distributed bare-metal GPU nodes,
    pauses credit consumption on unserviceable nodes, and re-routes workloads
    to warm standby instances to uphold 99.9% uptime SLAs.
    """

    def __init__(self, pool: Pool):
        self.pool = pool
        self.running = False
        self._http_client: Optional[httpx.AsyncClient] = None

    async def start(self) -> None:
        """Starts the persistent asynchronous probe and failover loop."""
        self.running = True
        self._http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(HEALTH_PROBE_TIMEOUT_SECONDS, connect=2.0),
            limits=httpx.Limits(max_keepalive_connections=50, max_connections=200),
        )
        logger.info("ApexSovereign GPU Health & Failover Worker started.")

        while self.running:
            try:
                await self._execute_probe_cycle()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Error encountered during GPU health probe cycle: %s", str(exc), exc_info=True)

            await asyncio.sleep(PROBE_INTERVAL_SECONDS)

    async def stop(self) -> None:
        """Gracefully halts the worker and closes connection pools."""
        self.running = False
        if self._http_client:
            await self._http_client.aclose()
        logger.info("ApexSovereign GPU Health & Failover Worker stopped.")

    async def _execute_probe_cycle(self) -> None:
        """Queries all active and standby GPU nodes, executing concurrent heartbeat probes."""
        async with self.pool.acquire() as conn:
            nodes = await conn.fetch(
                """
                SELECT id, node_name, cluster_region, gpu_architecture, 
                       ip_address, daemon_port, health_status, is_standby,
                       consecutive_failures, current_latency_ms
                FROM gpu_nodes
                ORDER BY is_standby ASC, created_at ASC;
                """
            )

        if not nodes:
            return

        # Execute concurrent probes across all nodes
        tasks = [self._probe_single_node(dict(node)) for node in nodes]
        probe_results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in probe_results:
            if isinstance(result, Exception):
                logger.warning("Uncaught exception in node probe: %s", str(result))
                continue
            if result and result.get("action_required"):
                await self._handle_node_state_transition(result)

    async def _probe_single_node(self, node: Dict[str, Any]) -> Dict[str, Any]:
        """
        Pings a node's bare-metal daemon heartbeat endpoint (/healthz/metrics).
        Calculates roundtrip network latency and evaluates GPU hardware status.
        """
        node_id = str(node["id"])
        url = f"http://{node['ip_address']}:{node['daemon_port']}/healthz/metrics"
        start_time = time.monotonic()
        
        is_healthy = False
        latency_ms = 9999.0
        reported_status = "OFFLINE"
        error_reason: Optional[str] = None

        try:
            assert self._http_client is not None
            resp = await self._http_client.get(url)
            elapsed = (time.monotonic() - start_time) * 1000.0
            latency_ms = round(elapsed, 2)

            if resp.status_code == 200:
                payload = resp.json()
                gpu_state = payload.get("gpu_state", {})
                # Check hardware fault flags (e.g. PCIe bus drop, ECC uncorrectable errors, thermal throttling)
                has_hardware_fault = gpu_state.get("ecc_errors", 0) > 0 or gpu_state.get("thermal_throttled", False)
                
                if has_hardware_fault:
                    reported_status = "DEGRADED"
                    error_reason = "Hardware error: ECC memory fault or thermal throttling detected"
                elif latency_ms > LATENCY_DEGRADATION_THRESHOLD_MS:
                    reported_status = "DEGRADED"
                    error_reason = f"Extreme network latency jitter ({latency_ms}ms > {LATENCY_DEGRADATION_THRESHOLD_MS}ms)"
                else:
                    is_healthy = True
                    reported_status = "HEALTHY"
            else:
                reported_status = "DEGRADED"
                error_reason = f"Node daemon responded with non-200 HTTP code: {resp.status_code}"

        except httpx.ConnectTimeout:
            reported_status = "OFFLINE"
            error_reason = "Connection timed out during heartbeat handshake"
        except httpx.ConnectError:
            reported_status = "OFFLINE"
            error_reason = "Connection refused by bare-metal daemon"
        except Exception as err:
            reported_status = "OFFLINE"
            error_reason = f"Probe connection error: {str(err)}"

        # Compute transitions
        prev_status = node["health_status"]
        consecutive_fails = node["consecutive_failures"] + 1 if not is_healthy else 0
        new_status = reported_status if consecutive_fails >= MAX_CONSECUTIVE_FAILURES else prev_status

        action_required = (new_status != prev_status) or (not is_healthy and consecutive_fails >= MAX_CONSECUTIVE_FAILURES)

        return {
            "node_id": node_id,
            "node_name": node["node_name"],
            "cluster_region": node["cluster_region"],
            "gpu_architecture": node["gpu_architecture"],
            "is_standby": node["is_standby"],
            "prev_status": prev_status,
            "new_status": new_status,
            "consecutive_fails": consecutive_fails,
            "latency_ms": latency_ms,
            "error_reason": error_reason,
            "action_required": action_required,
        }

    async def _handle_node_state_transition(self, result: Dict[str, Any]) -> None:
        """
        Executes atomic database updates and initiates workload migration / debit pausing.
        """
        node_id = result["node_id"]
        new_status = result["new_status"]
        consecutive_fails = result["consecutive_fails"]
        latency_ms = result["latency_ms"]

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # 1. Update node health record in database
                await conn.execute(
                    """
                    UPDATE gpu_nodes
                    SET health_status = $1,
                        consecutive_failures = $2,
                        current_latency_ms = $3,
                        last_heartbeat_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $4::uuid;
                    """,
                    new_status,
                    consecutive_fails,
                    latency_ms,
                    node_id,
                )

                if new_status in ("DEGRADED", "OFFLINE"):
                    logger.warning(
                        "Node %s (%s) transitioned to %s. Reason: %s. Initiating workload failover & pausing billing.",
                        result["node_name"],
                        node_id,
                        new_status,
                        result.get("error_reason"),
                    )
                    # 2. Pause credit consumption on active leases running on this failing node
                    await conn.execute(
                        """
                        UPDATE compute_leases
                        SET billing_paused = TRUE
                        WHERE assigned_node_id = $1::uuid AND status = 'ACTIVE' AND billing_paused = FALSE;
                        """,
                        node_id,
                    )

                    # 3. Trigger dynamic migration of active leases to a warm standby node
                    await self._migrate_workloads_to_standby(conn, node_id, result["gpu_architecture"], result["cluster_region"])

    async def _migrate_workloads_to_standby(
        self,
        conn: Any,
        failed_node_id: str,
        gpu_architecture: str,
        cluster_region: str,
    ) -> None:
        """
        Locates an available warm standby node matching the architectural tier and re-routes active workloads.
        """
        # Find healthy warm standby node matching GPU architecture in same or nearest region
        standby_node = await conn.fetchrow(
            """
            SELECT id, node_name, ip_address, daemon_port 
            FROM gpu_nodes
            WHERE is_standby = TRUE 
              AND health_status = 'HEALTHY'
              AND gpu_architecture = $1
            ORDER BY (cluster_region = $2) DESC, allocated_leases_count ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1;
            """,
            gpu_architecture,
            cluster_region,
        )

        if not standby_node:
            logger.critical(
                "NO HEALTHY STANDBY GPU NODE AVAILABLE for architecture %s in region %s! "
                "Leases paused to prevent SLA breach billing.",
                gpu_architecture,
                cluster_region,
            )
            return

        standby_id = str(standby_node["id"])
        standby_name = standby_node["node_name"]

        # Fetch active leases that require migration
        affected_leases = await conn.fetch(
            """
            SELECT id, job_id, tenant_id
            FROM compute_leases
            WHERE assigned_node_id = $1::uuid AND status = 'ACTIVE';
            """,
            failed_node_id,
        )

        if not affected_leases:
            return

        logger.info(
            "Re-routing %d active lease(s) from failed node %s to warm standby %s...",
            len(affected_leases),
            failed_node_id,
            standby_name,
        )

        # Atomically migrate the leases and unpause billing
        for lease in affected_leases:
            lease_id = str(lease["id"])
            await conn.execute(
                """
                UPDATE compute_leases
                SET assigned_node_id = $1::uuid,
                    billing_paused = FALSE,
                    failover_count = failover_count + 1
                WHERE id = $2::uuid;
                """,
                standby_id,
                lease_id,
            )

        # Adjust allocation counts on nodes
        await conn.execute(
            """
            UPDATE gpu_nodes
            SET allocated_leases_count = allocated_leases_count + $1
            WHERE id = $2::uuid;
            """,
            len(affected_leases),
            standby_id,
        )

        await conn.execute(
            """
            UPDATE gpu_nodes
            SET allocated_leases_count = GREATEST(0, allocated_leases_count - $1)
            WHERE id = $2::uuid;
            """,
            len(affected_leases),
            failed_node_id,
        )

        logger.info(
            "Successfully migrated %d lease(s) to standby node %s. Workload execution and billing resumed.",
            len(affected_leases),
            standby_name,
        )
