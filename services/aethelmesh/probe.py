#!/usr/bin/env python3
# ==============================================================================
# APEXSOVEREIGN.AI — AETHELMESH AUTONOMOUS NODE DISCOVERY & LATENCY PROBE
# Path: services/aethelmesh/probe.py
# Target: High-Concurrency Sub-18ms Verification & Dynamic Geothermal Failover
# ==============================================================================

import os
import sys
import time
import asyncio
import logging
from typing import Dict, Any, List
import asyncpg
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [AETHELMESH_PROBE] %(message)s"
)

DATABASE_URL = os.getenv("DATABASE_URL")
LATENCY_BUDGET_MS = float(os.getenv("MAX_LATENCY_MS", "18.0"))
MAX_THERMAL_HEADROOM_C = float(os.getenv("MIN_THERMAL_HEADROOM_C", "10.0"))
PROBE_INTERVAL_SECONDS = int(os.getenv("PROBE_INTERVAL_SECONDS", "5"))

# Fallback failover cluster
ICELAND_GEOTHERMAL_FALLBACK = {
    "node_id": "cluster-iceland-geo-01",
    "region": "EU-NORTH-IS",
    "power_source": "GEOTHERMAL_CLEAN",
    "spot_price_usd_hr": 1.42,
    "status": "ACTIVE_RESERVE"
}

if not DATABASE_URL:
    logging.critical("DATABASE_URL is missing. Node probe terminating (Strict Failure Mode).")
    sys.exit(1)


async def check_node_telemetry(client: httpx.AsyncClient, node: Dict[str, Any]) -> Dict[str, Any]:
    """Probes an individual GPU node endpoint for latency, thermals, and memory."""
    node_id = node.get("node_id")
    endpoint = node.get("endpoint_url", "http://127.0.0.1:8080/health")
    
    start_ns = time.perf_counter_ns()
    try:
        resp = await client.get(f"{endpoint}/telemetry", timeout=1.0)
        elapsed_ms = (time.perf_counter_ns() - start_ns) / 1_000_000.0

        if resp.status_code == 200:
            payload = resp.json()
            thermal_c = payload.get("thermal_c", 65.0)
            ram_util_pct = payload.get("ram_utilization_pct", 45.0)
            thermal_headroom = payload.get("thermal_headroom_c", 15.0)

            # Failure criteria: latency breach or thermal headroom collapse
            is_healthy = (elapsed_ms <= LATENCY_BUDGET_MS) and (thermal_headroom >= MAX_THERMAL_HEADROOM_C)

            return {
                "node_id": node_id,
                "latency_ms": round(elapsed_ms, 2),
                "thermal_headroom_c": thermal_headroom,
                "ram_utilization_pct": ram_util_pct,
                "is_healthy": is_healthy,
                "action": "NOMINAL" if is_healthy else "FAILOVER_TRIGGERED"
            }
        else:
            return {
                "node_id": node_id,
                "latency_ms": 999.0,
                "thermal_headroom_c": 0.0,
                "ram_utilization_pct": 100.0,
                "is_healthy": False,
                "action": "FAILOVER_TRIGGERED"
            }
    except Exception as exc:
        return {
            "node_id": node_id,
            "latency_ms": 999.0,
            "thermal_headroom_c": 0.0,
            "ram_utilization_pct": 100.0,
            "is_healthy": False,
            "action": f"TIMEOUT_OR_UNREACHABLE: {exc}"
        }


async def sync_mesh_state(pool: asyncpg.Pool, results: List[Dict[str, Any]]):
    """Updates node status in PostgreSQL RLS tables and engages failover."""
    async with pool.acquire() as conn:
        for res in results:
            node_id = res["node_id"]
            if not res["is_healthy"]:
                logging.warning(
                    f"[IMPAIRED_NODE] {node_id} latency: {res['latency_ms']}ms, "
                    f"headroom: {res['thermal_headroom_c']}C. Redirecting to Iceland geothermal cluster."
                )
                await conn.execute(
                    """
                    UPDATE public.compute_nodes
                    SET status = 'INACTIVE',
                        failover_target = $2,
                        last_probed_at = NOW(),
                        latency_ms = $3
                    WHERE node_id = $1;
                    """,
                    node_id,
                    ICELAND_GEOTHERMAL_FALLBACK["node_id"],
                    res["latency_ms"]
                )
            else:
                await conn.execute(
                    """
                    UPDATE public.compute_nodes
                    SET status = 'ACTIVE',
                        failover_target = NULL,
                        last_probed_at = NOW(),
                        latency_ms = $2
                    WHERE node_id = $1;
                    """,
                    node_id,
                    res["latency_ms"]
                )


async def run_probe_cycle(pool: asyncpg.Pool):
    # Fetch active compute nodes
    async with pool.acquire() as conn:
        records = await conn.fetch("SELECT node_id, endpoint_url, region FROM public.compute_nodes;")
        nodes = [dict(r) for r in records]

    if not nodes:
        # Default mock probe verification for self-hosted instances
        nodes = [{"node_id": "node-virginia-01", "endpoint_url": "http://127.0.0.1:8080"}]

    async with httpx.AsyncClient(limits=httpx.Limits(max_keepalive_connections=50, max_connections=100)) as client:
        tasks = [check_node_telemetry(client, node) for node in nodes]
        results = await asyncio.gather(*tasks)
        await sync_mesh_state(pool, results)


async def node_probe_loop():
    logging.info(f"Initializing AethelMesh High-Concurrency Node Probe (SLA: <{LATENCY_BUDGET_MS}ms)...")
    try:
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    except Exception as err:
        logging.critical(f"Failed to connect to Supabase PostgreSQL: {err}")
        sys.exit(1)

    while True:
        try:
            await run_probe_cycle(pool)
        except Exception as exc:
            logging.error(f"Error during node probe cycle: {exc}")
        await asyncio.sleep(PROBE_INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        asyncio.run(node_probe_loop())
    except (KeyboardInterrupt, SystemExit):
        logging.info("Node probe daemon shutdown cleanly.")
