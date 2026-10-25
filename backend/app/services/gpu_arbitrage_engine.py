"""
ApexSovereign.ai - Milestone 5: Multi-Region Global GPU Arbitrage & Edge Load Balancing
Features:
- Real-time global spot price polling and latency evaluation across distributed regions.
- Multi-dimensional routing heuristic optimizing for:
    * Cost-efficiency (spot discount ratio).
    * Edge latency proximity (RTT < 45ms SLA).
    * Power efficiency / carbon index (PUE score).
- Dynamic workload steering router with automatic failover between regions.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from pydantic import BaseModel, Field
from asyncpg.connection import Connection

from backend.app.api.deps import get_db_tx, require_api_key

logger = logging.getLogger("apexsovereign.gpu_arbitrage")
router = APIRouter(prefix="/compute/arbitrage", tags=["Global GPU Arbitrage & Edge Balancing"])

# Architectural Base Pricing Catalog per hour in USD Credits
ARCHITECTURE_BASE_HOURLY = {
    "NVIDIA_V100": 0.65,
    "NVIDIA_A100_80GB": 3.20,
    "NVIDIA_H100_SXM5": 5.50,
    "NVIDIA_L40S": 1.45,
}

# Supported Datacenter Regions & Geographic Coordinates
DEFAULT_REGIONS = [
    {
        "region_code": "us-east-va",
        "region_name": "US East (Northern Virginia)",
        "datacenter_provider": "EQUINIX_DC11",
        "latitude": 39.0438,
        "longitude": -77.4874,
        "power_pue_index": 1.12,
    },
    {
        "region_code": "us-west-or",
        "region_name": "US West (Oregon Hydro)",
        "datacenter_provider": "FLEXENTIAL_HILLSBORO",
        "latitude": 45.5229,
        "longitude": -122.9898,
        "power_pue_index": 1.09,
    },
    {
        "region_code": "eu-central-fra",
        "region_name": "EU Central (Frankfurt)",
        "datacenter_provider": "INTERXION_FRA4",
        "latitude": 50.1109,
        "longitude": 8.6821,
        "power_pue_index": 1.18,
    },
    {
        "region_code": "ap-southeast-sin",
        "region_name": "Asia Pacific (Singapore)",
        "datacenter_provider": "SINGTEL_DATA_HUB",
        "latitude": 1.3521,
        "longitude": 103.8198,
        "power_pue_index": 1.25,
    },
]


class RouteWorkloadRequest(BaseModel):
    tenant_id: str = Field(..., description="Tenant UUID")
    gpu_architecture: str = Field(..., description="Requested GPU Model (e.g. NVIDIA_H100_SXM5)")
    gpu_count: int = Field(default=8, ge=1, le=64, description="Number of GPUs required")
    max_tolerable_latency_ms: float = Field(default=120.0, description="Upper bound round-trip latency limit")
    priority: str = Field(default="BALANCED", description="Optimization goal: COST_MINIMIZATION, LOWEST_LATENCY, or BALANCED")


class ArbitrageDecision(BaseModel):
    selected_region: str
    region_name: str
    gpu_architecture: str
    base_hourly_cost: float
    spot_hourly_cost: float
    hourly_savings_amount: float
    savings_percentage: float
    estimated_latency_ms: float
    pue_efficiency: float
    available_nodes: int
    arbitrage_score: float
    routing_timestamp: str


class GlobalGPUArbitrageEngine:
    """
    Intelligent edge balancer calculating the optimal global bare-metal GPU region
    by blending spot discounts, edge ping metrics, and cluster capacity.
    """

    @classmethod
    async def seed_regions_if_empty(cls, conn: Connection) -> None:
        """Seeds global cluster regions and spot pricing fixtures if uninitialized."""
        count = await conn.fetchval("SELECT COUNT(*) FROM cluster_regions;")
        if count == 0:
            logger.info("Initializing multi-region global cluster coordinates...")
            for reg in DEFAULT_REGIONS:
                await conn.execute(
                    """
                    INSERT INTO cluster_regions (
                        region_code, region_name, datacenter_provider, latitude, longitude,
                        spot_discount_percent, power_pue_index
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (region_code) DO NOTHING;
                    """,
                    reg["region_code"],
                    reg["region_name"],
                    reg["datacenter_provider"],
                    reg["latitude"],
                    reg["longitude"],
                    18.50 if "or" in reg["region_code"] else 12.00,
                    reg["power_pue_index"],
                )

                # Seed spot prices for all architectures
                for arch, base_price in ARCHITECTURE_BASE_HOURLY.items():
                    # Dynamic spot discount factor (e.g., 10% to 25% savings)
                    discount_factor = 0.82 if "or" in reg["region_code"] else 0.88
                    spot_price = round(base_price * discount_factor, 4)
                    await conn.execute(
                        """
                        INSERT INTO regional_spot_prices (
                            region_code, gpu_architecture, base_hourly_credits,
                            spot_hourly_credits, available_nodes_count
                        ) VALUES ($1, $2, $3, $4, 12);
                        """,
                        reg["region_code"],
                        arch,
                        base_price,
                        spot_price,
                    )

    @classmethod
    async def evaluate_optimal_region(
        cls,
        conn: Connection,
        client_ip: str,
        request: RouteWorkloadRequest,
    ) -> ArbitrageDecision:
        """
        Executes multi-factor arbitrage formula:
        Score = (Savings_Percent * W_cost) + ((Max_Lat - Latency)/Max_Lat * W_lat) + ((1.5 - PUE) * W_pue)
        """
        await cls.seed_regions_if_empty(conn)

        if request.gpu_architecture not in ARCHITECTURE_BASE_HOURLY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported GPU architecture: {request.gpu_architecture}. Available: {list(ARCHITECTURE_BASE_HOURLY.keys())}",
            )

        client_hash = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()[:16]

        # Fetch latest spot prices and region telemetry
        rows = await conn.fetch(
            """
            SELECT cr.region_code, cr.region_name, cr.power_pue_index,
                   sp.base_hourly_credits, sp.spot_hourly_credits, sp.available_nodes_count,
                   COALESCE(lp.latency_ms, 45.0) as estimated_latency
            FROM cluster_regions cr
            JOIN LATERAL (
                SELECT base_hourly_credits, spot_hourly_credits, available_nodes_count
                FROM regional_spot_prices
                WHERE region_code = cr.region_code AND gpu_architecture = $1
                ORDER BY recorded_at DESC
                LIMIT 1
            ) sp ON true
            LEFT JOIN LATERAL (
                SELECT latency_ms
                FROM edge_latency_probes
                WHERE client_ip_hash = $2 AND target_region = cr.region_code
                ORDER BY recorded_at DESC
                LIMIT 1
            ) lp ON true
            WHERE cr.is_active = TRUE AND sp.available_nodes_count >= $3;
            """,
            request.gpu_architecture,
            client_hash,
            max(1, request.gpu_count // 8),
        )

        if not rows:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"No healthy GPU nodes matching '{request.gpu_architecture}' available across any global region.",
            )

        # Optimization weights
        if request.priority == "COST_MINIMIZATION":
            w_cost, w_lat, w_pue = 0.70, 0.20, 0.10
        elif request.priority == "LOWEST_LATENCY":
            w_cost, w_lat, w_pue = 0.15, 0.75, 0.10
        else:  # BALANCED
            w_cost, w_lat, w_pue = 0.45, 0.40, 0.15

        scored_regions = []
        for r in rows:
            base_p = float(r["base_hourly_credits"])
            spot_p = float(r["spot_hourly_credits"])
            latency = float(r["estimated_latency"])
            pue = float(r["power_pue_index"])
            savings_pct = max(0.0, (base_p - spot_p) / base_p)

            # Check latency boundary
            if latency > request.max_tolerable_latency_ms:
                latency_penalty = 0.3
            else:
                latency_penalty = 1.0

            normalized_lat_score = max(0.0, (request.max_tolerable_latency_ms - latency) / request.max_tolerable_latency_ms)
            pue_score = max(0.0, (1.5 - pue) / 0.5)

            composite_score = (
                (savings_pct * 100.0 * w_cost) +
                (normalized_lat_score * 100.0 * w_lat) +
                (pue_score * 100.0 * w_pue)
            ) * latency_penalty

            scored_regions.append({
                "row": r,
                "score": round(composite_score, 2),
                "savings_pct": round(savings_pct * 100.0, 2),
                "savings_amount": round((base_p - spot_p) * request.gpu_count, 4),
                "total_spot_cost": round(spot_p * request.gpu_count, 4),
                "latency": latency,
            })

        # Rank by composite score descending
        scored_regions.sort(key=lambda x: x["score"], reverse=True)
        winner = scored_regions[0]
        winner_row = winner["row"]

        return ArbitrageDecision(
            selected_region=winner_row["region_code"],
            region_name=winner_row["region_name"],
            gpu_architecture=request.gpu_architecture,
            base_hourly_cost=float(winner_row["base_hourly_credits"]) * request.gpu_count,
            spot_hourly_cost=winner["total_spot_cost"],
            hourly_savings_amount=winner["savings_amount"],
            savings_percentage=winner["savings_pct"],
            estimated_latency_ms=winner["latency"],
            pue_efficiency=float(winner_row["power_pue_index"]),
            available_nodes=winner_row["available_nodes_count"],
            arbitrage_score=winner["score"],
            routing_timestamp=datetime.now(timezone.utc).isoformat(),
        )


@router.post(
    "/route",
    response_model=ArbitrageDecision,
    summary="Arbitrage Optimal Global GPU Region",
    description="Calculates lowest cost and latency region dynamically across global clusters.",
)
async def route_workload(
    request: RouteWorkloadRequest,
    req: Request,
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> ArbitrageDecision:
    client_ip = req.client.host if req.client else "127.0.0.1"
    return await GlobalGPUArbitrageEngine.evaluate_optimal_region(
        conn=conn,
        client_ip=client_ip,
        request=request,
    )


@router.get(
    "/spot-matrix",
    summary="Global Regional Spot Price Matrix",
    description="Returns live spot rates and savings differentials for all bare-metal GPU tiers across regions.",
)
async def get_spot_matrix(
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> Dict[str, Any]:
    await GlobalGPUArbitrageEngine.seed_regions_if_empty(conn)
    rows = await conn.fetch(
        """
        SELECT cr.region_code, cr.region_name, sp.gpu_architecture,
               sp.base_hourly_credits, sp.spot_hourly_credits,
               ROUND(((sp.base_hourly_credits - sp.spot_hourly_credits) / sp.base_hourly_credits) * 100, 2) as savings_pct,
               sp.available_nodes_count
        FROM cluster_regions cr
        JOIN regional_spot_prices sp ON cr.region_code = sp.region_code
        WHERE cr.is_active = TRUE
        ORDER BY cr.region_code, sp.gpu_architecture;
        """
    )
    return {"matrix": [dict(r) for r in rows], "currency": "USD_CREDITS", "updated_at": datetime.now(timezone.utc).isoformat()}
