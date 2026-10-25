import hashlib
import hmac
import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from production_ingestion import IngestionPayload, _verify_signature


class ProductionIngestionTests(unittest.TestCase):
    def test_signature_verification(self):
        previous = os.environ.get("INGESTION_WEBHOOK_SECRET")
        os.environ["INGESTION_WEBHOOK_SECRET"] = "test-secret"
        try:
            body = json.dumps({"event": "usage"}).encode()
            signature = hmac.new(b"test-secret", body, hashlib.sha256).hexdigest()
            self.assertTrue(_verify_signature(body, signature))
            self.assertFalse(_verify_signature(body, "invalid"))
        finally:
            if previous is None:
                os.environ.pop("INGESTION_WEBHOOK_SECRET", None)
            else:
                os.environ["INGESTION_WEBHOOK_SECRET"] = previous

    def test_payload_bounds(self):
        with self.assertRaises(ValueError):
            IngestionPayload(customer_id="c", event_type="usage", quantity=0)


if __name__ == "__main__":
    unittest.main()
