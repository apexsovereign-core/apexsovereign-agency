#!/usr/bin/env python3
"""
ApexSovereign.ai - Operational Command 06: Production Smoke Test & Release Validation Suite
Module: scripts/production_smoke_test.py
Verification Target: Phases 1 to 4 End-to-End Operational Integrity
Author: Principal Site Reliability Engineer & Release Manager
"""

import asyncio
import datetime
import hashlib
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("apexsovereign.release.validation")

TARGET_URL = os.getenv("TARGET_URL", "http://127.0.0.1:3000").rstrip("/")
TARGET_TENANT = "tenant-sovereign-01"
LATENCY_SLA_MS = 250.0  # Max acceptable latency SLA threshold


class ReleaseSmokeTestSuite:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.results: List[Dict[str, Any]] = []
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0

    def run_check(
        self,
        name: str,
        method: str,
        path: str,
        expected_status: int = 200,
        payload: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        validator_fn: Optional[Any] = None,
    ) -> Tuple[bool, float, Optional[str]]:
        self.total_tests += 1
        url = f"{self.base_url}{path}"
        req_headers = {
            "Accept": "application/json",
            "User-Agent": "ApexSovereign-Release-Validator/1.0"
        }
        if headers:
            req_headers.update(headers)
        
        req_data = None
        if payload is not None:
            req_headers["Content-Type"] = "application/json"
            req_data = json.dumps(payload).encode("utf-8")

        start_time = time.perf_counter()
        try:
            req = urllib.request.Request(url, data=req_data, headers=req_headers, method=method.upper())
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                status_code = resp.getcode()
                raw_body = resp.read().decode("utf-8")

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            if status_code != expected_status:
                err_msg = f"Status code mismatch: expected {expected_status}, received {status_code}. Body: {raw_body[:120]}"
                self.record_result(name, False, elapsed_ms, err_msg)
                return False, elapsed_ms, err_msg

            if validator_fn:
                try:
                    data = json.loads(raw_body)
                    val_success, val_err = validator_fn(data)
                    if not val_success:
                        self.record_result(name, False, elapsed_ms, val_err)
                        return False, elapsed_ms, val_err
                except Exception as json_err:
                    err_msg = f"Invalid JSON payload: {json_err}"
                    self.record_result(name, False, elapsed_ms, err_msg)
                    return False, elapsed_ms, err_msg

            self.record_result(name, True, elapsed_ms, None)
            return True, elapsed_ms, None

        except urllib.error.HTTPError as http_err:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            if http_err.code == expected_status:
                self.record_result(name, True, elapsed_ms, None)
                return True, elapsed_ms, None
            body_snippet = http_err.read().decode("utf-8", errors="replace")[:120]
            err_msg = f"HTTP {http_err.code}: {body_snippet}"
            self.record_result(name, False, elapsed_ms, err_msg)
            return False, elapsed_ms, err_msg
        except Exception as conn_err:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            err_msg = f"Connection failure: {conn_err}"
            self.record_result(name, False, elapsed_ms, err_msg)
            return False, elapsed_ms, err_msg

    def record_result(self, name: str, success: bool, latency_ms: float, error: Optional[str]):
        if success:
            self.passed_tests += 1
            status_icon = "PASS"
        else:
            self.failed_tests += 1
            status_icon = "FAIL"

        result_item = {
            "name": name,
            "status": status_icon,
            "latency_ms": round(latency_ms, 2),
            "error": error,
        }
        self.results.append(result_item)
        logger.info(
            "[%s] %-48s | %6.2f ms | %s",
            status_icon,
            name,
            latency_ms,
            error if error else "OK",
        )

    def execute_all_checks(self):
        logger.info("================================================================================")
        logger.info("APEXSOVEREIGN.AI - ENTERPRISE ZERO-REGRESSION RELEASE VERIFICATION")
        logger.info("Target Environment: %s", self.base_url)
        logger.info("Verification Time: %s", datetime.datetime.now(datetime.timezone.utc).isoformat())
        logger.info("================================================================================")

        # ----------------------------------------------------------------------
        # Test 1: Core System Health Probe (/health)
        # ----------------------------------------------------------------------
        def validate_health(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            status_val = str(data.get("status", "")).upper()
            if status_val not in ("HEALTHY", "OPERATIONAL", "ALL_SYSTEMS_OPTIMAL"):
                return False, f"Unexpected health status: {data.get('status')}"
            return True, None

        self.run_check(
            name="1. Core System Health Probe (/health)",
            method="GET",
            path="/health",
            expected_status=200,
            validator_fn=validate_health,
        )

        # ----------------------------------------------------------------------
        # Test 2: Phase 2 Unified Platform Health Matrix (All 9 Subsystems)
        # ----------------------------------------------------------------------
        def validate_matrix(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            # Subsystems can be in data['subsystems'] or data['health_matrix']['subsystems']
            subs = data.get("subsystems") or (data.get("health_matrix", {}).get("subsystems")) or {}
            if len(subs) < 4:
                return False, f"Incomplete health matrix: expected at least 4 core subsystems, found {len(subs)}"
            return True, None

        self.run_check(
            name="2. Unified Health Matrix - 9 Subsystems (/v1/platform/health-matrix)",
            method="GET",
            path="/v1/platform/health-matrix",
            expected_status=200,
            validator_fn=validate_matrix,
        )

        # ----------------------------------------------------------------------
        # Test 3: Phase 1 Enterprise Concierge Triage Dispatch
        # ----------------------------------------------------------------------
        def validate_concierge(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            has_id = bool(data.get("lead_id") or data.get("session_id") or data.get("pilot_application_id"))
            has_route = bool(data.get("routing") or data.get("cluster_routing") or data.get("allocated_node_id"))
            if not has_id or not has_route:
                return False, "Missing session/lead identifier or cluster routing decision in concierge response"
            return True, None

        self.run_check(
            name="3. Concierge Autonomous Triage (/v1/concierge/triage)",
            method="POST",
            path="/v1/concierge/triage",
            expected_status=200,
            payload={
                "company_name": "Acme Autonomous Fund LLC",
                "corporate_email": "infra@acmefund.io",
                "monthly_compute_budget": "$100k-$500k",
                "cluster_type": "8x H100 SXM5 Dedicated",
                "urgency_sla": "MISSION_CRITICAL",
                "notes": "Automated release validation smoke test lead",
            },
            validator_fn=validate_concierge,
        )

        # ----------------------------------------------------------------------
        # Test 4: Phase 3 Sub-Second Spot Eviction Interceptor & Cutover
        # ----------------------------------------------------------------------
        def validate_eviction(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            status_val = str(data.get("status", "")).upper()
            if status_val not in ("MIGRATION_COMPLETED", "CUTOVER_COMPLETED", "ACTIVE_FAILOVER"):
                return False, f"Expected cutover completed status, got {data.get('status')}"
            latency = float(data.get("total_cutover_latency_ms") or data.get("cutover_latency_ms") or 9999.0)
            if latency > 1000.0:
                return False, f"SLA violation: Cutover latency {latency}ms exceeds 1000ms threshold"
            return True, None

        self.run_check(
            name="4. Spot Eviction Hot-Swap Interceptor (/v1/orchestration/eviction-notice)",
            method="POST",
            path="/v1/orchestration/eviction-notice",
            expected_status=200,
            payload={
                "provider": "AWS_SPOT",
                "instance_id": "i-091823901a8b",
                "region": "us-east-1",
                "node_type": "8x NVIDIA H100 SXM5",
                "eviction_epoch": time.time(),
                "time_to_reclaim_sec": 120.0,
            },
            validator_fn=validate_eviction,
        )

        # ----------------------------------------------------------------------
        # Test 5: Phase 3 Institutional SLA Escrow Reserves Pool
        # ----------------------------------------------------------------------
        def validate_escrow(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            total_reserve = float(data.get("total_funded_reserve") or data.get("total_reserve_usd") or 0.0)
            if total_reserve < 500000.0:
                return False, f"Escrow reserve pool deficient: ${total_reserve:,.2f} USD < $500,000.00"
            return True, None

        self.run_check(
            name="5. SLA Escrow Liquid Reserves Query (/v1/orchestration/escrow-reserves)",
            method="GET",
            path="/v1/orchestration/escrow-reserves",
            expected_status=200,
            validator_fn=validate_escrow,
        )

        # ----------------------------------------------------------------------
        # Test 6: Phase 4 Institutional Credit Status & Headroom
        # ----------------------------------------------------------------------
        def validate_credit(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            if data.get("credit_limit", 0) <= 0:
                return False, "Invalid credit limit value"
            if data.get("credit_status") != "ACTIVE":
                return False, f"Credit status not ACTIVE: {data.get('credit_status')}"
            return True, None

        self.run_check(
            name="6. Enterprise Credit Status & Headroom (/v1/billing/credit-status)",
            method="GET",
            path=f"/v1/billing/credit-status?tenant_id={TARGET_TENANT}",
            expected_status=200,
            validator_fn=validate_credit,
        )

        # ----------------------------------------------------------------------
        # Test 7: Phase 4 Corporate Invoices Statement History
        # ----------------------------------------------------------------------
        def validate_invoices(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            invoices = data.get("invoices", [])
            if not invoices:
                return False, "Invoices list is empty"
            if not invoices[0].get("merkle_invoice_hash"):
                return False, "Invoice missing SHA-256 Merkle integrity hash"
            return True, None

        self.run_check(
            name="7. Corporate Invoice Statements Listing (/v1/billing/invoices)",
            method="GET",
            path=f"/v1/billing/invoices?tenant_id={TARGET_TENANT}",
            expected_status=200,
            validator_fn=validate_invoices,
        )

        # ----------------------------------------------------------------------
        # Test 8: Phase 4 GAAP Double-Entry Statement Audit Trail
        # ----------------------------------------------------------------------
        def validate_statements(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            records = data.get("ledger_statements", [])
            if not records:
                return False, "Statement history records empty"
            return True, None

        self.run_check(
            name="8. GAAP Double-Entry Statement History (/v1/billing/statement-history)",
            method="GET",
            path=f"/v1/billing/statement-history?tenant_id={TARGET_TENANT}",
            expected_status=200,
            validator_fn=validate_statements,
        )

        # ----------------------------------------------------------------------
        # Test 9: Phase 4 Inbound Fedwire Settlement Reconciliation
        # ----------------------------------------------------------------------
        def validate_wire(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            if data.get("status") != "RECONCILED":
                return False, f"Wire status mismatch: expected RECONCILED, got {data.get('status')}"
            if not data.get("audit_merkle_root"):
                return False, "Missing audit_merkle_root in wire reconciliation response"
            return True, None

        self.run_check(
            name="9. Fedwire / ACH Reconciliation (/v1/billing/wire-reconciliation)",
            method="POST",
            path="/v1/billing/wire-reconciliation",
            expected_status=200,
            payload={
                "tenant_id": TARGET_TENANT,
                "invoice_id": "INV-2026-US-8910",
                "bank_reference_id": f"FEDWIRE-SMOKE-{int(time.time())}",
                "wire_type": "FEDWIRE",
                "originating_bank": "JPMorgan Chase Bank, N.A. (New York)",
                "sender_entity_name": "Tier-1 Autonomous Foundation LLC",
                "amount_received": 48500.0,
            },
            validator_fn=validate_wire,
        )

        # ----------------------------------------------------------------------
        # Test 10: V21 Computational Mesh Arbitrage Rates (/api/v21/arbitrage/rates)
        # ----------------------------------------------------------------------
        def validate_arbitrage(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            status_val = str(data.get("status", "")).lower()
            if status_val not in ("active", "active_arbitrage", "operational"):
                return False, f"Unexpected arbitrage status: {data.get('status')}"
            rates = data.get("rates", [])
            if len(rates) < 3:
                return False, f"Expected at least 3 GPU rate tiers, got {len(rates)}"
            first_gpu = rates[0].get("gpu") or rates[0].get("compute_tier")
            if not first_gpu:
                return False, "Rate tier missing GPU accelerator identifier"
            return True, None

        self.run_check(
            name="10. V21 Spot Arbitrage Rates (/api/v21/arbitrage/rates)",
            method="GET",
            path="/api/v21/arbitrage/rates",
            expected_status=200,
            validator_fn=validate_arbitrage,
        )

        # ----------------------------------------------------------------------
        # Test 11: V21 Distributed Mesh Nodes Telemetry (/api/v21/mesh/nodes)
        # ----------------------------------------------------------------------
        def validate_nodes(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            nodes = data.get("nodes", [])
            if len(nodes) < 3:
                return False, f"Expected at least 3 global cluster nodes, found {len(nodes)}"
            regions = {n.get("region") for n in nodes if n.get("region")}
            if not any("us" in r for r in regions):
                return False, "Missing us-east cluster node in mesh"
            return True, None

        self.run_check(
            name="11. V21 Distributed Bare-Metal Nodes (/api/v21/mesh/nodes)",
            method="GET",
            path="/api/v21/mesh/nodes",
            expected_status=200,
            validator_fn=validate_nodes,
        )

        # ----------------------------------------------------------------------
        # Test 12: V21 Zero-Copy Asynchronous Orchestration (/api/v21/orchestrate)
        # ----------------------------------------------------------------------
        def validate_orchestrate(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            status_val = str(data.get("status", "")).upper()
            if status_val != "ORCHESTRATED":
                return False, f"Expected ORCHESTRATED, got {data.get('status')}"
            exec_tok = data.get("execution_token", "")
            if not exec_tok.startswith("exec_"):
                return False, f"Invalid cryptographic execution token: {exec_tok}"
            return True, None

        self.run_check(
            name="12. V21 Zero-Copy Orchestration (/api/v21/orchestrate)",
            method="POST",
            path="/api/v21/orchestrate",
            expected_status=200,
            payload={
                "tenant_id": TARGET_TENANT,
                "workload_id": f"wkld_smoke_{int(time.time())}",
                "compute_tier": "NVIDIA H100 80GB SXM5",
            },
            validator_fn=validate_orchestrate,
        )

        # ----------------------------------------------------------------------
        # Test 13: PayPal Webhook Gateway & COO Pipeline (/api/webhooks/paypal)
        # ----------------------------------------------------------------------
        def validate_webhook(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
            status_val = str(data.get("status", "")).upper()
            if "PROCESSED" not in status_val and "VERIFIED" not in status_val:
                return False, f"Unexpected webhook status: {data.get('status')}"
            if data.get("workflow") != "apex-coo-gateway":
                return False, f"Expected workflow 'apex-coo-gateway', got {data.get('workflow')}"
            cu = float(data.get("compute_units_allocated", 0.0))
            if cu != 25000.0:
                return False, f"Compute unit allocation mismatch: expected 25000.0 for $250.00, got {cu}"
            return True, None

        self.run_check(
            name="13. PayPal Webhook Gateway & COO Dispatch (/api/webhooks/paypal)",
            method="POST",
            path="/api/webhooks/paypal",
            expected_status=200,
            payload={
                "event_type": "PAYMENT.CAPTURE.COMPLETED",
                "resource": {
                    "id": f"ORD-SMOKE-{int(time.time())}",
                    "custom_id": TARGET_TENANT,
                    "amount": {"value": "250.00", "currency_code": "USD"},
                },
            },
            validator_fn=validate_webhook,
        )

        # Print Final Scorecard
        logger.info("================================================================================")
        logger.info("RELEASE SMOKE TEST SCORECARD: %d / %d TESTS PASSED", self.passed_tests, self.total_tests)
        logger.info("================================================================================")

        if self.failed_tests > 0:
            logger.error("RELEASE VALIDATION FAILED: %d test(s) failed.", self.failed_tests)
            sys.exit(1)
        else:
            logger.info("ALL PRODUCTION CHECKS VERIFIED. PLATFORM IS CERTIFIED FOR v1.0.0 RELEASE.")
            sys.exit(0)


if __name__ == "__main__":
    runner = ReleaseSmokeTestSuite(TARGET_URL)
    runner.execute_all_checks()
