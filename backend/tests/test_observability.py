import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from observability import RecoveryManager, TelemetryRegistry


class ObservabilityTests(unittest.TestCase):
    def test_trace_metrics_and_failure_count(self):
        telemetry = TelemetryRegistry()
        trace = telemetry.start_trace(method="POST", path="/agent-platform/runs")
        telemetry.finish_trace(trace, status="201")
        trace = telemetry.start_trace(method="POST", path="/agent-platform/runs")
        telemetry.finish_trace(trace, status="500", error="timeout")
        snapshot = telemetry.snapshot()
        self.assertEqual(snapshot["requests_total"], 2)
        self.assertEqual(snapshot["failures_total"], 1)
        self.assertGreaterEqual(snapshot["p95_latency_ms"], 0)

    def test_recovery_is_bounded_and_deterministic(self):
        manager = RecoveryManager()
        self.assertEqual(manager.recover("network timeout", agent_name="a", trace_id="t")["recovery_action"], "route_to_failover_specialist")
        self.assertEqual(manager.recover("invalid payload", agent_name="a", trace_id="t")["attempts_allowed"], 1)
        self.assertEqual(manager.recover("unknown", agent_name="a", trace_id="t")["recovery_action"], "escalate_to_human_queue")


if __name__ == "__main__":
    unittest.main()
