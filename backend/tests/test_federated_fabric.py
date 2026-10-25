import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from federated_fabric import FederatedGroundingFabric, mask_context


class FederatedFabricTests(unittest.IsolatedAsyncioTestCase):
    async def test_live_lookup_masks_pii_and_caches_ephemerally(self):
        fabric = FederatedGroundingFabric(ttl_seconds=10)
        fabric._local_records["ACC-PII"] = {"email": "private@example.com", "tier": "enterprise"}
        first = await fabric.fetch("ACC-PII")
        second = await fabric.fetch("ACC-PII")
        self.assertEqual(first["data"]["email"], "[MASKED]")
        self.assertFalse(first["replicated"])
        self.assertEqual(second["cache"], "ephemeral_hit")

    async def test_missing_record_is_a_safe_miss(self):
        result = await FederatedGroundingFabric().fetch("missing")
        self.assertEqual(result["status"], "miss")
        self.assertIsNone(result["data"])

    def test_source_requires_https(self):
        with self.assertRaises(ValueError):
            FederatedGroundingFabric().register_source("bad", "http://internal")
        self.assertEqual(mask_context({"nested": {"api_key": "secret"}})["nested"]["api_key"], "[MASKED]")


if __name__ == "__main__":
    unittest.main()
