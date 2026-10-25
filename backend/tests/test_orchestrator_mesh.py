import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from orchestrator_mesh import ApexSupervisoryRouter, FederatedDataMesh, SpecialistAgent


class OrchestratorMeshTests(unittest.IsolatedAsyncioTestCase):
    async def test_routes_to_registered_specialist(self):
        router = ApexSupervisoryRouter()
        router.register_specialist(SpecialistAgent("pricing", "sales", ("quote",)))
        result = await router.route_and_execute("quote", "pricing", {"record_id": "DEAL-1"})
        self.assertEqual(result["result"]["status"], "success")
        self.assertEqual(result["result"]["mutated_records"], "DEAL-1")

    async def test_unknown_specialist_does_not_loop(self):
        result = await ApexSupervisoryRouter().route_and_execute("quote", "missing", {})
        self.assertIn("error", result)

    def test_federated_lookup_is_not_replicated(self):
        mesh = FederatedDataMesh({"ACC-1": {"tier": "enterprise"}})
        result = mesh.fetch_live_external_object("ACC-1")
        self.assertEqual(result["status"], "hit")
        self.assertFalse(result["replicated"])
        self.assertEqual(mesh.fetch_live_external_object("missing")["status"], "miss")


if __name__ == "__main__":
    unittest.main()
