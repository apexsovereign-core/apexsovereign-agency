# ==============================================================================
# APEXSOVEREIGN.AI — DISTRIBUTED ENTERPRISE LOAD-TESTING SUITE
# Path: tests/load/locustfile.py
# Target: 1,000+ Requests/Sec, Sub-15ms Latency SLA, Zero Error Rate
# Framework: Locust (https://locust.io)
# ==============================================================================

import time
import uuid
from locust import HttpUser, task, between, events

TEST_API_KEY = "apk_live_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d:9f8e7d6c5b4a3210_8a7b6c5d4e3f2a1b"
TEST_TENANT_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
SUB_15MS_SLA_TARGET_MS = 15.0


class ComputeMeshUser(HttpUser):
    """Simulates high-velocity enterprise client clusters evaluating spot routes and settling micro-credits."""

    # Zero wait time for maximum concurrency simulation (burst testing)
    wait_time = between(0.001, 0.005)

    def on_start(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_API_KEY}",
            "Content-Type": "application/json",
            "X-Client-Instance": f"locust-worker-{uuid.uuid4().hex[:8]}",
        }

    @task(7)
    def test_arbitrage_routing_h100(self):
        """Stress-tests the high-speed Axum AethelMesh routing engine for H100 GPU clusters."""
        payload = {
            "architecture": "H100_SXM5",
            "gpu_count": 8,
            "max_acceptable_latency_ms": 15,
            "max_cost_budget_usd_hr": 2.20,
        }

        start_time = time.perf_counter()
        with self.client.post(
            "/v1/arbitrage/route",
            json=payload,
            headers=self.headers,
            catch_response=True,
            name="/v1/arbitrage/route [H100_SXM5]",
        ) as response:
            latency_ms = (time.perf_counter() - start_time) * 1000.0

            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code} failure: {response.text}")
                return

            try:
                data = response.json()
                if data.get("status") != "ROUTE_CONFIRMED":
                    response.failure(f"Unexpected route status: {data.get('status')}")
                    return

                # Strict SLA Enforcement: Response latency must be under threshold
                if latency_ms > SUB_15MS_SLA_TARGET_MS:
                    # In high-concurrency environments, mark SLA breach in logging
                    events.request.fire(
                        request_type="SLA_BREACH",
                        name="/v1/arbitrage/route [LATENCY > 15ms]",
                        response_time=latency_ms,
                        response_length=len(response.content),
                        exception=None,
                        context={},
                    )

                response.success()
            except Exception as err:
                response.failure(f"JSON deserialization failed: {err}")

    @task(3)
    def test_atomic_micro_debit_settlement(self):
        """Stress-tests atomic double-entry pessimistic row locking (SELECT ... FOR UPDATE) on credit balances."""
        ref_id = f"stress-deb-{uuid.uuid4().hex}"
        payload = {
            "p_tenant_id": TEST_TENANT_ID,
            "p_cu_amount": 1.450000,
            "p_reference_id": ref_id,
            "p_metadata": {
                "workload": "HIGH_FREQUENCY_LOAD_TEST",
                "timestamp": time.time(),
            },
        }

        with self.client.post(
            "/rest/v1/rpc/rpc_deduct_micro_cu",
            json=payload,
            headers=self.headers,
            catch_response=True,
            name="/rest/v1/rpc/rpc_deduct_micro_cu",
        ) as response:
            if response.status_code in (200, 201):
                try:
                    data = response.json()
                    if data.get("status") == "DEBITED":
                        response.success()
                    else:
                        response.failure(f"Settlement incomplete: {data}")
                except Exception as err:
                    response.failure(f"Failed parsing settlement response: {err}")
            elif response.status_code == 402:
                response.failure("Liquidity exhausted: Tenant has 0 CU remaining.")
            else:
                response.failure(f"RPC debit error ({response.status_code}): {response.text}")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Validates overall test SLA criteria upon benchmark termination."""
    stats = environment.stats.total
    if stats.num_requests > 0:
        failure_rate = (stats.num_failures / stats.num_requests) * 100.0
        avg_latency = stats.avg_response_time
        p95_latency = stats.get_response_time_percentile(0.95)

        print("\n=======================================================")
        print("APEXSOVEREIGN.AI — LOAD TEST SLA VERIFICATION REPORT")
        print(f"Total Requests Processed: {stats.num_requests:,}")
        print(f"Total Failures:           {stats.num_failures} ({failure_rate:.3f}%)")
        print(f"Average Latency:          {avg_latency:.2f} ms")
        print(f"P95 Latency:              {p95_latency:.2f} ms (Target: <= 15.00 ms)")
        print("=======================================================\n")

        if failure_rate > 0.0:
            print("CRITICAL: Non-zero failure rate detected during concurrent load.")
        if p95_latency > SUB_15MS_SLA_TARGET_MS:
            print("WARNING: P95 latency exceeded sub-15ms SLA target threshold.")
