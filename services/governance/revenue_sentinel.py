#!/usr/bin/env python3
# ==============================================================================
# APEXSOVEREIGN.AI — REVENUE SENTINEL & COMMERCIAL TELEMETRY ENGINE
# Path: services/governance/revenue_sentinel.py
# Target: Polling GMV, Burn Rates, and Dispatching Slack/Discord/n8n Metric Alerts
# ==============================================================================

import os
import sys
import time
import asyncio
import logging
from typing import Dict, Any, Optional
import asyncpg
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [REVENUE_SENTINEL] %(message)s"
)

DATABASE_URL = os.getenv("DATABASE_URL")
COMMERCIAL_WEBHOOK_URL = os.getenv("COMMERCIAL_WEBHOOK_URL")  # Slack / Discord / n8n
POLL_INTERVAL_SECONDS = int(os.getenv("REVENUE_POLL_INTERVAL", "3600"))  # Default: hourly
ARR_TARGET_USD = float(os.getenv("ARR_TARGET_USD", "1000000.0"))

if not DATABASE_URL:
    logging.critical("DATABASE_URL is not configured. Revenue Sentinel aborting (Strict Failure Mode).")
    sys.exit(1)


async def fetch_commercial_kpis(pool: asyncpg.Pool) -> Dict[str, Any]:
    """Invokes the PostgreSQL RPC function get_commercial_kpi_snapshot()."""
    async with pool.acquire() as conn:
        raw_json = await conn.fetchval("SELECT public.get_commercial_kpi_snapshot();")
        return raw_json if isinstance(raw_json, dict) else {}


async def dispatch_commercial_telemetry(kpi_data: Dict[str, Any]):
    """Dispatches commercial metrics summary to external operations webhook."""
    if not COMMERCIAL_WEBHOOK_URL:
        logging.info("COMMERCIAL_WEBHOOK_URL not configured. Logging metric snapshot locally.")
        logging.info(f"SNAPSHOT: {kpi_data}")
        return

    arr_current = kpi_data.get("arr_run_rate_usd", 0.0)
    progress_pct = kpi_data.get("milestone_arr_progress_pct", 0.0)
    burn_24h = kpi_data.get("usd_burn_last_24h", 0.0)
    active_tenants = kpi_data.get("active_tenants_7d", 0)

    payload = {
        "text": f"🚀 *ApexSovereign.ai Commercial Revenue Sentinel Pulse*",
        "attachments": [
            {
                "color": "#10B981" if progress_pct >= 50.0 else "#3B82F6",
                "fields": [
                    {"title": "Current ARR Run Rate", "value": f"${arr_current:,.2f}", "short": True},
                    {"title": "$1M ARR Milestone Progress", "value": f"{progress_pct:.2f}%", "short": True},
                    {"title": "24h Compute Burn (USD)", "value": f"${burn_24h:,.2f}", "short": True},
                    {"title": "Active Tenants (7d)", "value": f"{active_tenants}", "short": True},
                    {"title": "All-Time GMV", "value": f"${kpi_data.get('all_time_gmv_usd', 0.0):,.2f}", "short": True}
                ],
                "footer": "ApexSovereign Holdings Autonomous Financial Intelligence",
                "ts": int(time.time())
            }
        ]
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(COMMERCIAL_WEBHOOK_URL, json=payload)
            if resp.status_code in (200, 204):
                logging.info(f"Commercial telemetry dispatched successfully: ARR ${arr_current:,.2f} ({progress_pct:.2f}%)")
            else:
                logging.warning(f"Telemetry webhook returned HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            logging.error(f"Failed to transmit commercial telemetry webhook: {e}")


async def revenue_sentinel_loop():
    logging.info("Starting Revenue Sentinel daemon...")
    pool = None
    try:
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=3)
    except Exception as exc:
        logging.critical(f"Failed to initialize database pool: {exc}")
        sys.exit(1)

    while True:
        try:
            kpi_data = await fetch_commercial_kpis(pool)
            await dispatch_commercial_telemetry(kpi_data)
        except Exception as err:
            logging.error(f"Revenue Sentinel evaluation error: {err}")

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        asyncio.run(revenue_sentinel_loop())
    except (KeyboardInterrupt, SystemExit):
        logging.info("Revenue Sentinel shutdown cleanly.")
