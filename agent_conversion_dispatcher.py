"""
=============================================================================
APEXSOVEREIGN.AI — AUTONOMOUS CONVERSION DISPATCHER (agent_conversion_dispatcher.py)
Inbound Visitor Session Audit, Nonce Tracking & Supabase Ledger Attribution
=============================================================================
"""

import os
import sys
import time
import hmac
import hashlib
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger("agent_conversion_dispatcher")
logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","agent":"CONVERSION_DISPATCHER","msg":"%(message)s"}')

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
APEX_HMAC_SECRET = os.getenv("APEX_HMAC_SECRET", "apex_master_sovereign_secret_key_v21")
PROVISIONER_URL = os.getenv("PROVISIONER_URL", "http://localhost:8001/v1/provision/execute")

class ConversionEvent(BaseModel):
    event_id: str
    tenant_id: str
    conversion_type: str = "DEPOSIT_SETTLEMENT"
    amount_usd: float
    cu_minted: float
    order_id: str
    session_nonce: str
    signature: str
    timestamp: str

class AgentConversionDispatcher:
    """
    Autonomous attribution worker connecting client-side deposit intents,
    HMAC session signatures, and RunPod compute allocations.
    """

    def __init__(self):
        self.is_running = True
        self.processed_transactions = set()

    def verify_conversion_signature(self, event: ConversionEvent) -> bool:
        msg = f"{event.tenant_id}:{event.order_id}:{event.amount_usd}:{event.session_nonce}".encode("utf-8")
        expected = hmac.new(APEX_HMAC_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, event.signature)

    async def record_conversion_in_supabase(self, event: ConversionEvent) -> bool:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            logger.info(f"[SIMULATED_ATTRIBUTION] Recorded conversion {event.event_id} for tenant {event.tenant_id} (+$${event.amount_usd:.2f})")
            return True

        endpoint = f"{SUPABASE_URL.rstrip('/')}/rest/v1/conversion_attributions"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        payload = {
            "event_id": event.event_id,
            "tenant_id": event.tenant_id,
            "amount_usd": event.amount_usd,
            "cu_minted": event.cu_minted,
            "paypal_order_id": event.order_id,
            "nonce": event.session_nonce,
            "created_at": event.timestamp
        }
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(endpoint, headers=headers, json=payload)
            if resp.status_code not in (200, 201):
                logger.error(f"[ATTRIBUTION_DB_ERROR] HTTP {resp.status_code}: {resp.text}")
                return False
            return True

    async def auto_dispatch_workload_on_conversion(self, tenant_id: str, gpu_model: str, node_count: int, duration_hours: int):
        payload = {
            "tenant_id": tenant_id,
            "gpu_model": gpu_model,
            "node_count": node_count,
            "duration_hours": duration_hours,
            "container_image": "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04"
        }
        async with httpx.AsyncClient(timeout=8.0) as client:
            try:
                res = await client.post(PROVISIONER_URL, json=payload)
                if res.status_code == 200:
                    logger.info(f"[AUTO_PROVISION_SUCCESS] Dispatched RunPod cluster for {tenant_id}")
                else:
                    logger.warning(f"[AUTO_PROVISION_FAILED] {res.status_code}: {res.text}")
            except Exception as e:
                logger.error(f"[DISPATCH_NETWORK_ERROR] {e}")

    async def start(self):
        logger.info("[CONVERSION_DISPATCHER] Daemon online. Listening for settlement attribution events.")
        while self.is_running:
            await asyncio.sleep(2.0)

if __name__ == "__main__":
    dispatcher = AgentConversionDispatcher()
    asyncio.run(dispatcher.start())
