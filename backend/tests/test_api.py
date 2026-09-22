"""
ApexSovereign.ai - Test Suite
Tests for Security, Cryptography, Idempotency, and Configuration
Compatible with both pytest and python3 -m unittest
"""

import os
import unittest
import secrets

try:
    import pytest
except ImportError:
    pytest = None

from backend.app.config import require_env, MissingEnvironmentVariableError, get_settings
from backend.app.core.security import (
    generate_compute_lease_token,
    verify_compute_lease_token,
    validate_paypal_cert_url,
)
from backend.app.core.idempotency import compute_request_hash
from backend.app.services.compute_broker import calculate_estimated_cost


class TestApexSovereignCore(unittest.TestCase):

    def test_require_env_success(self):
        os.environ["TEST_KEY_EXISTS"] = "valid_secret_123"
        try:
            val = require_env("TEST_KEY_EXISTS")
            self.assertEqual(val, "valid_secret_123")
        finally:
            os.environ.pop("TEST_KEY_EXISTS", None)

    def test_require_env_missing(self):
        with self.assertRaises(MissingEnvironmentVariableError) as ctx:
            require_env("DEFINITELY_NON_EXISTENT_VAR_XYZ_99")
        self.assertIn("DEFINITELY_NON_EXISTENT_VAR_XYZ_99", str(ctx.exception))

    def test_compute_lease_hmac_verification(self):
        test_settings = {
            "DATABASE_URL": "postgresql://test:test@localhost:5432/apexsovereign",
            "PAYPAL_CLIENT_ID": "test-paypal-client",
            "PAYPAL_CLIENT_SECRET": "test-paypal-secret",
            "PAYPAL_WEBHOOK_ID": "test-webhook-id",
            "APP_SECRET_API_KEY": "test-app-secret-api-key",
            "LEASE_HMAC_SECRET": "super_secret_hmac_signing_key_456",
            "ENVIRONMENT": "test",
        }
        os.environ.update(test_settings)
        get_settings.cache_clear()
        try:
            job_id = "job-uuid-12345"
            tenant_id = "tenant-uuid-67890"

            token, expires_at = generate_compute_lease_token(job_id, tenant_id, ttl_seconds=300)
            self.assertIsNotNone(token)

            # Verify legitimate token
            verified = verify_compute_lease_token(token)
            self.assertEqual(verified["job_id"], job_id)
            self.assertEqual(verified["tenant_id"], tenant_id)
            self.assertEqual(verified["expires_at"], expires_at)

            # Tampered token verification must fail
            tampered_token = token[:-4] + "dead"
            with self.assertRaises(ValueError):
                verify_compute_lease_token(tampered_token)
        finally:
            for name in test_settings:
                os.environ.pop(name, None)
            get_settings.cache_clear()

    def test_ssrf_paypal_cert_url_validation(self):
        # Legitimate PayPal URLs
        self.assertTrue(validate_paypal_cert_url("https://api.paypal.com/v1/notifications/certs/CERT-360-1234.pem"))
        self.assertTrue(validate_paypal_cert_url("https://api-m.paypal.com/v1/notifications/certs/CERT-360-5678.pem"))

        # Malicious / SSRF URLs attempting bypass
        self.assertFalse(validate_paypal_cert_url("http://api.paypal.com/cert.pem"))
        self.assertFalse(validate_paypal_cert_url("https://attacker-paypal.com/cert.pem"))
        self.assertFalse(validate_paypal_cert_url("https://169.254.169.254/latest/meta-data/"))
        self.assertFalse(validate_paypal_cert_url("https://localhost:8080/cert.pem"))

    def test_idempotency_request_hash_determinism(self):
        payload_a = {"tenant_id": "abc", "amount": 100.0, "details": {"tier": "GPU_A100"}}
        payload_b = {"details": {"tier": "GPU_A100"}, "amount": 100.0, "tenant_id": "abc"}

        # JSON key ordering differences must produce identical deterministic hashes
        hash_a = compute_request_hash(payload_a)
        hash_b = compute_request_hash(payload_b)
        self.assertEqual(hash_a, hash_b)
        self.assertEqual(len(hash_a), 64)

    def test_calculate_estimated_cost(self):
        cost_cpu = calculate_estimated_cost("STANDARD_CPU", cpu=2, memory_mb=4096, gpu_count=0)
        self.assertGreater(cost_cpu, 0.0)

        cost_gpu_a100 = calculate_estimated_cost("GPU_A100", cpu=8, memory_mb=32768, gpu_count=1)
        self.assertGreater(cost_gpu_a100, cost_cpu)
        self.assertGreater(cost_gpu_a100, 3.0)

    def test_constant_time_api_key_check(self):
        key_a = "test_api_key_api_token"
        key_b = "test_api_key_api_token"
        key_c = "test_wrong_token"

        self.assertTrue(secrets.compare_digest(key_a, key_b))
        self.assertFalse(secrets.compare_digest(key_a, key_c))


if __name__ == "__main__":
    unittest.main()
