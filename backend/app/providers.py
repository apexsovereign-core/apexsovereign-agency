"""
Compute Provider Abstraction & Adapters (SimulatedProvider & RestSupplierProvider).
Strict isolation between demo mode (no charges, demo=True) and real supplier mode.
"""

import abc
import time
import uuid
import math
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import httpx
from fastapi import HTTPException, status

from .config import settings
from . import ledger
from . import db


class ComputeProvider(abc.ABC):
    @abc.abstractmethod
    async def provision(self, cluster_spec: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Provisions hardware capacity."""
        pass

    @abc.abstractmethod
    async def scale(self, cluster_id: str, new_nodes: int, user_id: str) -> Dict[str, Any]:
        """Scales active cluster node count."""
        pass

    @abc.abstractmethod
    async def release(self, cluster_id: str, user_id: str) -> Dict[str, Any]:
        """Tears down cluster and deallocates hardware."""
        pass

    @abc.abstractmethod
    async def status(self, cluster_id: str) -> Dict[str, Any]:
        """Queries live hardware status."""
        pass

    @abc.abstractmethod
    async def list_capacity(self) -> List[Dict[str, Any]]:
        """Returns capacity availability."""
        pass

    @abc.abstractmethod
    async def self_test(self) -> bool:
        """Startup self-test for provider health."""
        pass


class SimulatedProvider(ComputeProvider):
    """
    Default Provider: Operates in sandbox/demo mode.
    Guarantees zero charges, demo=True flags, and simulated progression.
    """
    async def provision(self, cluster_spec: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        cluster_id = str(uuid.uuid4())
        model = cluster_spec.get("model", "H100-SXM5-80GB")
        nodes = int(cluster_spec.get("nodes", 1))
        region = cluster_spec.get("region", "us-east-va")
        jurisdiction = cluster_spec.get("jurisdiction", "US-VA")
        term = cluster_spec.get("term", "spot")

        # Base rate
        rate_map = {"H100-SXM5-80GB": 194, "B200-NVL72-192GB": 285, "A100-SXM4-80GB": 142, "L40S-PCIE-48GB": 89}
        base_rate = rate_map.get(model, 194)
        
        # Apply term discounts (-5% for 1mo, -10% for 3mo, -15% for 6mo)
        discount = 0.0
        if term == "1mo":
            discount = 0.05
        elif term == "3mo":
            discount = 0.10
        elif term == "6mo":
            discount = 0.15

        burn_cu_hr = math.ceil(base_rate * nodes * (1.0 - discount))
        pseudo_ip = f"10.{hash(region) % 250 + 1}.{nodes}.{hash(cluster_id) % 250 + 1}"
        host = f"apex-node-{cluster_id[:8]}.{region}.apexsovereign.mesh"

        return {
            "id": cluster_id,
            "name": cluster_spec.get("name", f"Apex-{model[:4]}-{nodes}x"),
            "model": model,
            "region": region,
            "nodes": nodes,
            "term": term,
            "jurisdiction": jurisdiction,
            "status": "provisioning",
            "demo": True,
            "provider": "simulated",
            "host": host,
            "ip": pseudo_ip,
            "burn_cu_hr": burn_cu_hr,
            "accrued_cu": 0,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "notice": "Simulated cluster: no real hardware or charges."
        }

    async def scale(self, cluster_id: str, new_nodes: int, user_id: str) -> Dict[str, Any]:
        return {
            "cluster_id": cluster_id,
            "nodes": new_nodes,
            "status": "scaling",
            "demo": True,
            "notice": "Simulated cluster scaling initiated."
        }

    async def release(self, cluster_id: str, user_id: str) -> Dict[str, Any]:
        return {
            "cluster_id": cluster_id,
            "status": "stopped",
            "released_at": datetime.now(timezone.utc).isoformat(),
            "demo": True,
            "notice": "Simulated cluster released."
        }

    async def status(self, cluster_id: str) -> Dict[str, Any]:
        return {
            "cluster_id": cluster_id,
            "status": "running",
            "health": "nominal",
            "telemetry": {"gpu_util_pct": 98.4, "power_w": 685, "temp_c": 64},
            "demo": True
        }

    async def list_capacity(self) -> List[Dict[str, Any]]:
        return [
            {"model": "H100-SXM5-80GB", "available_nodes": 64, "stock_status": "HIGH_AVAILABILITY"},
            {"model": "B200-NVL72-192GB", "available_nodes": 16, "stock_status": "ALLOCATION_ONLY"},
            {"model": "A100-SXM4-80GB", "available_nodes": 32, "stock_status": "HIGH_AVAILABILITY"},
            {"model": "L40S-PCIE-48GB", "available_nodes": 128, "stock_status": "HIGH_AVAILABILITY"}
        ]

    async def self_test(self) -> bool:
        return True


class RestSupplierProvider(ComputeProvider):
    """
    Live Hardware Supplier Adapter: Connects to upstream sovereign GPU mesh.
    Enforces real double-entry escrow deductions and server-side hardware calls.
    """
    def __init__(self):
        self.base_url = settings.SUPPLIER_BASE_URL.rstrip("/")
        self.api_key = settings.SUPPLIER_API_KEY

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "ApexSovereign-Core/2.4.8"
        }

    async def self_test(self) -> bool:
        if not self.base_url or not self.api_key:
            return False
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(f"{self.base_url}/health", headers=self._headers())
                return res.status_code == 200
        except Exception:
            return False

    async def provision(self, cluster_spec: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        # 1. Fetch user wallet and escrow accounts
        wallet_row = await db.fetch_one("SELECT id FROM apex.accounts WHERE owner_id = %s AND kind = 'user_wallet';", (user_id,))
        escrow_row = await db.fetch_one("SELECT id FROM apex.accounts WHERE owner_id = %s AND kind = 'user_escrow';", (user_id,))
        if not wallet_row or not escrow_row:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": {"code": "no_account", "message": "User accounts not initialized."}})

        wallet_id = str(wallet_row["id"])
        escrow_id = str(escrow_row["id"])

        # 2. Upstream Supplier Call
        async with httpx.AsyncClient(timeout=25.0) as client:
            try:
                res = await client.post(
                    f"{self.base_url}/v1/clusters/allocate",
                    json=cluster_spec,
                    headers=self._headers()
                )
                if res.status_code not in (200, 201):
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail={"error": {"code": "supplier_failed", "message": f"Supplier hardware allocation rejected: {res.text}"}}
                    )
                upstream_data = res.json()
            except httpx.RequestError as e:
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail={"error": {"code": "supplier_timeout", "message": f"Upstream supplier timed out: {e}"}}
                )

        # 3. Post PROVISION to Ledger: Move Initial 1-Hour Escrow Hold
        burn_cu_hr = int(upstream_data.get("burn_cu_hr", 194))
        tx_lines = [
            {"account_id": wallet_id, "direction": "debit", "amount_cu": burn_cu_hr},
            {"account_id": escrow_id, "direction": "credit", "amount_cu": burn_cu_hr}
        ]
        await ledger.post_ledger_transaction(
            tx_type="PROVISION",
            reference=f"escrow_hold:{upstream_data.get('id')}",
            lines=tx_lines,
            idempotency_key=f"provision:{upstream_data.get('id')}"
        )

        upstream_data["demo"] = False
        upstream_data["provider"] = "supplier"
        return upstream_data

    async def scale(self, cluster_id: str, new_nodes: int, user_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{self.base_url}/v1/clusters/{cluster_id}/scale",
                json={"nodes": new_nodes},
                headers=self._headers()
            )
            if res.status_code != 200:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail={"error": {"code": "supplier_scale_failed", "message": res.text}})
            return res.json()

    async def release(self, cluster_id: str, user_id: str) -> Dict[str, Any]:
        # Upstream deallocation
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{self.base_url}/v1/clusters/{cluster_id}/release",
                headers=self._headers()
            )
            if res.status_code != 200:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail={"error": {"code": "supplier_release_failed", "message": res.text}})
            release_data = res.json()

        # Return unused escrow to wallet
        escrow_row = await db.fetch_one("SELECT id FROM apex.accounts WHERE owner_id = %s AND kind = 'user_escrow';", (user_id,))
        wallet_row = await db.fetch_one("SELECT id FROM apex.accounts WHERE owner_id = %s AND kind = 'user_wallet';", (user_id,))
        if escrow_row and wallet_row:
            escrow_id = str(escrow_row["id"])
            wallet_id = str(wallet_row["id"])
            escrow_bal = await db.fetch_one("SELECT apex.account_balance(%s::uuid) AS bal;", (escrow_id,))
            remaining_escrow = escrow_bal["bal"] if escrow_bal else 0
            if remaining_escrow > 0:
                refund_lines = [
                    {"account_id": escrow_id, "direction": "debit", "amount_cu": remaining_escrow},
                    {"account_id": wallet_id, "direction": "credit", "amount_cu": remaining_escrow}
                ]
                await ledger.post_ledger_transaction(
                    tx_type="RELEASE",
                    reference=f"escrow_release:{cluster_id}",
                    lines=refund_lines,
                    idempotency_key=f"release:{cluster_id}"
                )

        return release_data

    async def status(self, cluster_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{self.base_url}/v1/clusters/{cluster_id}", headers=self._headers())
            return res.json()

    async def list_capacity(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{self.base_url}/v1/capacity", headers=self._headers())
            return res.json()


def get_compute_provider() -> ComputeProvider:
    if settings.PROVIDER_MODE == "supplier":
        return RestSupplierProvider()
    return SimulatedProvider()
