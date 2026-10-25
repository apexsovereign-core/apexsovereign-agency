import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from usage_metering import UsageMeter


class UsageMeteringTests(unittest.IsolatedAsyncioTestCase):
    async def test_usage_counter_is_deterministic_without_ledger_config(self):
        meter = UsageMeter()
        result = await meter.record(tenant_id="tenant-1", event_type="compute", quantity=3)
        self.assertEqual(result["tenant_total"], 3)
        self.assertEqual(result["ledger_status"], "not_configured")
        result = await meter.record(tenant_id="tenant-1", event_type="compute", quantity=2)
        self.assertEqual(result["tenant_total"], 5)


if __name__ == "__main__":
    unittest.main()
