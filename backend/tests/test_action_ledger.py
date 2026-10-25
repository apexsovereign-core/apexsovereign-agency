import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from action_ledger import ActionLedger


class ActionLedgerTests(unittest.IsolatedAsyncioTestCase):
    async def test_duplicate_action_returns_same_transaction(self):
        ledger = ActionLedger()
        first = await ledger.commit(idempotency_key="same-action", agent_identity="agent-a", action_type="quote", target_resource="deal-1")
        second = await ledger.commit(idempotency_key="same-action", agent_identity="agent-a", action_type="quote", target_resource="deal-1")
        self.assertEqual(first.status, "committed")
        self.assertEqual(first.transaction_id, second.transaction_id)

    async def test_identity_is_required(self):
        with self.assertRaises(PermissionError):
            await ActionLedger().commit(idempotency_key="identity-test", agent_identity="", action_type="quote", target_resource="deal-1")


if __name__ == "__main__":
    unittest.main()
