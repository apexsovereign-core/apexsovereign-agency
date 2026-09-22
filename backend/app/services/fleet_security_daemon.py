"""
ApexSovereign.ai - Milestone 12: Autonomous Self-Healing Fleet Security & Intrusion Detection
Features:
- Background security monitor scanning bare-metal GPU nodes for anomalous runtime behaviors:
  * Unauthorized DMA probes or unexpected PCI bus modifications.
  * Unverified kernel modules loaded into hypervisor space.
  * Burst ECC memory corruptions indicative of side-channel or Rowhammer attacks.
  * Unexpected egress tunnels bypassing platform VPC boundaries.
- Autonomous remediation daemon:
  * Immediately isolates and quarantines compromised nodes.
  * Evacuates tenant compute leases to healthy standby clusters.
  * Slashes provider collateral stake to penalize malicious or breached nodes.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from asyncpg.connection import Connection

from backend.app.api.deps import get_db_tx, require_api_key
from backend.app.db.session import get_db_pool

logger = logging.getLogger("apexsovereign.fleet_security")
router = APIRouter(prefix="/security/fleet", tags=["Autonomous Fleet Security & Intrusion Detection"])

# Threat vectors triggering automated node isolation and slashing
CRITICAL_THREAT_VECTORS = {
    "UNAUTHORIZED_DMA_PROBE": {"severity": "CRITICAL", "slash_amount": 2500.00},
    "UNVERIFIED_KERNEL_MODULE": {"severity": "HIGH", "slash_amount": 1500.00},
    "ECC_MEMORY_CORRUPTION_BURST": {"severity": "HIGH", "slash_amount": 1000.00},
    "UNEXPECTED_EGRESS_TUNNEL": {"severity": "CRITICAL", "slash_amount": 5000.00},
    "PCI_CONFIGURATION_TAMPER": {"severity": "CRITICAL", "slash_amount": 5000.00},
}


class NodeAnomalyReport(BaseModel):
    node_name: str = Field(..., description="Target node identifier e.g. node-va-h100-01")
    threat_vector: str = Field(..., regex="^(UNAUTHORIZED_DMA_PROBE|UNVERIFIED_KERNEL_MODULE|ECC_MEMORY_CORRUPTION_BURST|UNEXPECTED_EGRESS_TUNNEL|PCI_CONFIGURATION_TAMPER)$")
    threat_description: str = Field(..., min_length=10)
    raw_telemetry: Dict[str, Any] = Field(default_factory=dict)


class QuarantineResult(BaseModel):
    alert_id: str
    node_name: str
    severity: str
    threat_vector: str
    mitigation_action: str
    leases_evacuated: int
    provider_collateral_slashed: float
    quarantine_timestamp: str


class AutonomousFleetSecurityDaemon:
    """
    Autonomous intrusion detection and remediation agent protecting bare-metal clusters.
    """

    @classmethod
    async def triage_and_isolate_node(
        cls,
        conn: Connection,
        report: NodeAnomalyReport,
    ) -> QuarantineResult:
        threat_meta = CRITICAL_THREAT_VECTORS.get(
            report.threat_vector,
            {"severity": "HIGH", "slash_amount": 1000.00},
        )
        alert_id = f"ALT-{uuid.uuid4().hex[:8].upper()}"
        slash_amount = threat_meta["slash_amount"]

        # 1. Look up provider associated with this node
        provider_row = await conn.fetchrow(
            """
            SELECT p.id, p.provider_code, p.collateral_staked_amount
            FROM marketplace_providers p
            JOIN provider_gpu_listings l ON p.id = l.provider_id
            WHERE l.listing_sku LIKE '%' || $1 || '%' OR p.organization_name ILIKE '%' || $1 || '%'
            LIMIT 1;
            """,
            report.node_name,
        )

        provider_id = provider_row["id"] if provider_row else None

        # 2. Record Fleet Security Alert
        await conn.execute(
            """
            INSERT INTO fleet_security_alerts (
                alert_id, node_name, provider_id, severity, threat_vector,
                threat_description, raw_anomaly_telemetry, mitigation_action, is_resolved
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'NODE_QUARANTINED', FALSE);
            """,
            alert_id,
            report.node_name,
            provider_id,
            threat_meta["severity"],
            report.threat_vector,
            report.threat_description,
            report.raw_telemetry,
        )

        # 3. Evacuate active tenant leases on this node to standby instances
        # Mark active leases as EVACUATING
        evacuated_rows = await conn.fetch(
            """
            SELECT id, tenant_id FROM compute_leases
            WHERE status = 'ACTIVE' AND lease_id LIKE '%' || $1 || '%'
            FOR UPDATE;
            """,
            report.node_name,
        )
        evacuated_count = len(evacuated_rows)

        if evacuated_count > 0:
            await conn.execute(
                """
                UPDATE compute_leases
                SET status = 'EVACUATING_SECURITY_FAILOVER',
                    billing_paused = TRUE,
                    updated_at = NOW()
                WHERE status = 'ACTIVE' AND lease_id LIKE '%' || $1 || '%';
                """,
                report.node_name,
            )

        # 4. Slash provider collateral if applicable
        if provider_id and slash_amount > 0:
            await conn.execute(
                """
                UPDATE marketplace_providers
                SET collateral_staked_amount = GREATEST(0.0000, collateral_staked_amount - $1),
                    slashed_collateral_total = slashed_collateral_total + $1,
                    status = CASE WHEN collateral_staked_amount - $1 < 5000.00 THEN 'SLASHED' ELSE status END,
                    updated_at = NOW()
                WHERE id = $2::uuid;
                """,
                slash_amount,
                provider_id,
            )

        # 5. Insert Quarantine Record
        await conn.execute(
            """
            INSERT INTO node_quarantine_records (
                node_name, quarantine_reason, quarantined_by,
                leases_evacuated_count, provider_slashed_amount
            ) VALUES ($1, $2, 'AUTONOMOUS_SECURITY_DAEMON', $3, $4);
            """,
            report.node_name,
            f"{report.threat_vector}: {report.threat_description[:64]}",
            evacuated_count,
            slash_amount if provider_id else 0.0,
        )

        logger.critical(
            "AUTONOMOUS FLEET QUARANTINE TRIGGERED for node %s [Alert: %s, Threat: %s]. Evacuated %d leases, slashed $%.2f.",
            report.node_name,
            alert_id,
            report.threat_vector,
            evacuated_count,
            slash_amount if provider_id else 0.0,
        )

        return QuarantineResult(
            alert_id=alert_id,
            node_name=report.node_name,
            severity=threat_meta["severity"],
            threat_vector=report.threat_vector,
            mitigation_action="NODE_QUARANTINED",
            leases_evacuated=evacuated_count,
            provider_collateral_slashed=slash_amount if provider_id else 0.0,
            quarantine_timestamp=datetime.now(timezone.utc).isoformat(),
        )


@router.post(
    "/report-anomaly",
    response_model=QuarantineResult,
    summary="Ingest Threat Telemetry & Trigger Autonomous Quarantine",
    description="Analyzes anomaly telemetry, quarantines compromised nodes, and evacuates tenant workloads.",
)
async def report_anomaly(
    report: NodeAnomalyReport,
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> QuarantineResult:
    return await AutonomousFleetSecurityDaemon.triage_and_isolate_node(conn, report)


@router.get(
    "/active-quarantines",
    summary="List Quarantined Fleet Nodes",
    description="Inspects all isolated bare-metal nodes currently locked down by the security daemon.",
)
async def get_active_quarantines(
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> Dict[str, Any]:
    rows = await conn.fetch(
        """
        SELECT node_name, quarantine_reason, quarantined_by,
               leases_evacuated_count, provider_slashed_amount, quarantined_at
        FROM node_quarantine_records
        WHERE released_at IS NULL
        ORDER BY quarantined_at DESC;
        """
    )
    return {"quarantined_nodes": [dict(r) for r in rows], "count": len(rows)}


@router.get(
    "/alerts",
    summary="List Fleet Security Intrusion Alerts",
    description="Returns security audit alerts triggered by unauthorized DMA, kernel tampering, or egress violations.",
)
async def get_security_alerts(
    unresolved_only: bool = True,
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> Dict[str, Any]:
    query = "SELECT * FROM fleet_security_alerts"
    if unresolved_only:
        query += " WHERE is_resolved = FALSE"
    query += " ORDER BY detected_at DESC LIMIT 50;"

    rows = await conn.fetch(query)
    return {"alerts": [dict(r) for r in rows], "count": len(rows)}
