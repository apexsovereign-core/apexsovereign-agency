import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from compliance_guardrails import ComplianceGate


class ComplianceGuardrailTests(unittest.TestCase):
    def setUp(self):
        self.gate = ComplianceGate({"platform": {"max_steps_per_run": 3}, "security": {"allow_network_actions": False}, "agent_registry": [{"guardrails": {"max_budget_per_task_usd": 50}}]})

    def test_budget_cap_escalates(self):
        decision = self.gate.validate_plan(tenant_id="t1", agent_name="sales", step_count=1, payload={"max_budget_usd": 51})
        self.assertFalse(decision.allowed)
        self.assertTrue(decision.escalation_required)
        self.assertEqual(len(self.gate.escalations.list("t1")), 1)

    def test_network_action_is_denied(self):
        decision = self.gate.validate_step(tenant_id="t1", agent_name="sales", action="dispatch_webhook", payload={})
        self.assertFalse(decision.allowed)

    def test_audit_chain_links_events(self):
        self.gate.validate_step(tenant_id="t1", agent_name="sales", action="classify_lead", payload={})
        self.gate.validate_step(tenant_id="t1", agent_name="sales", action="create_activity", payload={})
        events = self.gate.audit.events("t1")
        self.assertEqual(events[1]["previous_hash"], events[0]["event_hash"])


if __name__ == "__main__":
    unittest.main()
