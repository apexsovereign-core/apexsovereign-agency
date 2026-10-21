import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from agent_engine import AgentEngine, GuardrailViolation, load_manifest, manifest_path


class AgentPlatformTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = load_manifest(manifest_path())
        cls.engine = AgentEngine(cls.manifest)

    def test_manifest_declares_enterprise_entities(self):
        self.assertIn("accounts", self.manifest["entities"])
        self.assertIn("agent_runs", self.manifest["entities"])
        self.assertTrue(self.manifest["security"]["require_tenant_scope"])

    def test_multi_step_inbound_pipeline_is_deterministic(self):
        payload = {"lead": {"id": "lead-1", "email": "buyer@enterprise.example", "company": "Enterprise"}, "deal": {"id": "deal-1"}}
        run = self.engine.run(tenant_id="tenant-1", agent_name="inbound_pipeline", payload=payload, idempotency_key="evt-1")
        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual([step["action"] for step in run.steps], ["classify_lead", "create_activity", "advance_deal"])
        self.assertEqual(run.output["result"]["deal"]["stage"], "QUALIFIED")

    def test_idempotency_returns_same_run(self):
        payload = {"lead": {"id": "lead-2", "email": "buyer@enterprise.example", "company": "Enterprise"}, "deal": {"id": "deal-2"}}
        first = self.engine.run(tenant_id="tenant-2", agent_name="inbound_pipeline", payload=payload, idempotency_key="same")
        second = self.engine.run(tenant_id="tenant-2", agent_name="inbound_pipeline", payload=payload, idempotency_key="same")
        self.assertEqual(first.run_id, second.run_id)

    def test_missing_inputs_are_blocked_before_execution(self):
        with self.assertRaises(Exception):
            self.engine.run(tenant_id="tenant-3", agent_name="inbound_pipeline", payload={"lead": {}}, idempotency_key="missing")

    def test_destructive_actions_are_guarded(self):
        manifest = dict(self.manifest)
        manifest["agents"] = {"unsafe": {"description": "test", "triggers": ["test"], "capabilities": ["close_ticket"], "workflow": [{"id": "close", "action": "close_ticket", "requires": ["ticket.id"]}], "guardrails": {"approval_required": True}}}
        engine = AgentEngine(manifest)
        run = engine.run(tenant_id="tenant-4", agent_name="unsafe", payload={"ticket": {"id": "t-1"}}, idempotency_key="guard")
        self.assertEqual(run.status, "BLOCKED")
        self.assertIsInstance(GuardrailViolation("x"), GuardrailViolation)


if __name__ == "__main__":
    unittest.main()
