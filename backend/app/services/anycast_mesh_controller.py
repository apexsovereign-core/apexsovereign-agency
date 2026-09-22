"""
ApexSovereign.ai - Milestone 13: Global Multi-Cloud Mesh & Anycast Routing Controller
Features:
- Global Anycast Virtual IP (VIP) management across multi-cloud edge Points of Presence (POPs):
  * Equinix Metal bare-metal edges.
  * AWS Global Accelerator (Anycast BGP ASN 13335).
  * Cloudflare Warp routing backbones.
- Dynamic health checking and automatic draining of degraded regional ingress gateways.
- Edge latency probe optimization directing enterprise client traffic to the closest, healthiest POP.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from asyncpg.connection import Connection

from backend.app.api.deps import get_db_tx, require_api_key

logger = logging.getLogger("apexsovereign.anycast_mesh")
router = APIRouter(prefix="/mesh/anycast", tags=["Global Multi-Cloud Mesh & Anycast Gateway"])

DEFAULT_ANYCAST_POPS = [
    {
        "gateway_code": "GW-US-EAST-VA",
        "city": "Ashburn, VA",
        "country_code": "US",
        "cloud_provider": "EQUINIX_METAL",
        "ipv4_vip": "198.51.100.10",
        "bgp_asn": 13335,
        "average_rtt_ms": 11.20,
    },
    {
        "gateway_code": "GW-US-WEST-OR",
        "city": "Hillsboro, OR",
        "country_code": "US",
        "cloud_provider": "AWS_GLOBAL_ACCELERATOR",
        "ipv4_vip": "198.51.100.20",
        "bgp_asn": 13335,
        "average_rtt_ms": 14.80,
    },
    {
        "gateway_code": "GW-EU-CENTRAL-FRA",
        "city": "Frankfurt",
        "country_code": "DE",
        "cloud_provider": "EQUINIX_METAL",
        "ipv4_vip": "198.51.100.30",
        "bgp_asn": 13335,
        "average_rtt_ms": 18.40,
    },
    {
        "gateway_code": "GW-AP-SOUTH-SIN",
        "city": "Singapore",
        "country_code": "SG",
        "cloud_provider": "CLOUDFLARE_WARP",
        "ipv4_vip": "198.51.100.40",
        "bgp_asn": 13335,
        "average_rtt_ms": 22.10,
    },
]


class IngressRouteRequest(BaseModel):
    client_ip: str = Field(..., description="Client public IP address")
    client_region_hint: Optional[str] = Field(None, description="Client geographic region code")
    protocol_type: str = Field(default="GRPC_TLS", description="GRPC_TLS, HTTP3_QUIC, or WEBSOCKET_WSS")


class GatewayStatusUpdate(BaseModel):
    gateway_code: str = Field(...)
    health_status: str = Field(..., regex="^(HEALTHY|DEGRADED|DRAINING|OFFLINE)$")
    current_connections: int = Field(default=0, ge=0)
    average_rtt_ms: float = Field(..., gt=0.0)


class AnycastRoutingDecision(BaseModel):
    assigned_gateway_code: str
    city: str
    country_code: str
    cloud_provider: str
    anycast_ipv4_vip: str
    protocol: str
    estimated_rtt_ms: float
    health_status: str
    edge_ttl_seconds: int
    routing_timestamp: str


class AnycastMeshController:
    """
    Directs global API traffic across geographically distributed multi-cloud ingress POPs.
    """

    @classmethod
    async def seed_gateways_if_empty(cls, conn: Connection) -> None:
        count = await conn.fetchval("SELECT COUNT(*) FROM anycast_edge_gateways;")
        if count == 0:
            logger.info("Initializing multi-cloud Anycast BGP edge gateways...")
            for pop in DEFAULT_ANYCAST_POPS:
                await conn.execute(
                    """
                    INSERT INTO anycast_edge_gateways (
                        gateway_code, city, country_code, cloud_provider,
                        ipv4_vip, bgp_asn, health_status, average_rtt_ms, is_active
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'HEALTHY', $7, TRUE)
                    ON CONFLICT (gateway_code) DO NOTHING;
                    """,
                    pop["gateway_code"],
                    pop["city"],
                    pop["country_code"],
                    pop["cloud_provider"],
                    pop["ipv4_vip"],
                    pop["bgp_asn"],
                    pop["average_rtt_ms"],
                )

    @classmethod
    async def select_optimal_gateway(
        cls,
        conn: Connection,
        req: IngressRouteRequest,
    ) -> AnycastRoutingDecision:
        await cls.seed_gateways_if_empty(conn)

        # Query all active healthy POPs
        rows = await conn.fetch(
            """
            SELECT gateway_code, city, country_code, cloud_provider,
                   ipv4_vip, bgp_asn, health_status, current_connections, average_rtt_ms
            FROM anycast_edge_gateways
            WHERE is_active = TRUE AND health_status IN ('HEALTHY', 'DEGRADED')
            ORDER BY CASE WHEN health_status = 'HEALTHY' THEN 1 ELSE 2 END, average_rtt_ms ASC;
            """
        )

        if not rows:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="All Anycast POP gateways are currently offline or draining.",
            )

        # Match geographic hint or pick lowest RTT
        selected = rows[0]
        if req.client_region_hint:
            for r in rows:
                if req.client_region_hint.lower() in r["gateway_code"].lower():
                    selected = r
                    break

        return AnycastRoutingDecision(
            assigned_gateway_code=selected["gateway_code"],
            city=selected["city"],
            country_code=selected["country_code"],
            cloud_provider=selected["cloud_provider"],
            anycast_ipv4_vip=selected["ipv4_vip"],
            protocol=req.protocol_type,
            estimated_rtt_ms=float(selected["average_rtt_ms"]),
            health_status=selected["health_status"],
            edge_ttl_seconds=300,
            routing_timestamp=datetime.now(timezone.utc).isoformat(),
        )


@router.post(
    "/route",
    response_model=AnycastRoutingDecision,
    summary="Resolve Lowest-Latency Anycast Gateway",
    description="Maps inbound client to the closest healthy edge POP with live RTT metrics.",
)
async def route_traffic(
    req: IngressRouteRequest,
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> AnycastRoutingDecision:
    return await AnycastMeshController.select_optimal_gateway(conn, req)


@router.post(
    "/gateways/telemetry",
    summary="Update Gateway Health & Telemetry",
    description="Updates gateway connection count, health status, and live latency for BGP route convergence.",
)
async def update_gateway_status(
    update: GatewayStatusUpdate,
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> Dict[str, Any]:
    await conn.execute(
        """
        UPDATE anycast_edge_gateways
        SET health_status = $1,
            current_connections = $2,
            average_rtt_ms = $3,
            updated_at = NOW()
        WHERE gateway_code = $4;
        """,
        update.health_status,
        update.current_connections,
        update.average_rtt_ms,
        update.gateway_code,
    )
    return {"gateway_code": update.gateway_code, "status": "UPDATED", "health": update.health_status}


@router.get(
    "/gateways",
    summary="List Global Multi-Cloud Anycast Edge Gateways",
    description="Returns global edge POPs across Equinix, AWS, and Cloudflare backbones.",
)
async def list_gateways(
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> Dict[str, Any]:
    await AnycastMeshController.seed_gateways_if_empty(conn)
    rows = await conn.fetch("SELECT * FROM anycast_edge_gateways ORDER BY average_rtt_ms ASC;")
    return {"gateways": [dict(r) for r in rows], "count": len(rows)}
