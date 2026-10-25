import os
import json
import time
import unittest

try:
    import pytest
except ImportError:
    pytest = None

try:
    from cryptography.hazmat.primitives.asymmetric import ed25519
    from cryptography.hazmat.primitives import serialization
    import jwt
    HAS_CRYPTO_AND_JWT = True
except ImportError:
    HAS_CRYPTO_AND_JWT = False


class TestAuraPharmEd25519(unittest.TestCase):
    @unittest.skipUnless(HAS_CRYPTO_AND_JWT, "cryptography and PyJWT required for ED25519 tests")
    def test_ed25519_jws_mint_and_verify(self):
        """Validates ED25519 cryptographic minting and signature verification for AuraPharm molecular IP."""
        private_key = ed25519.Ed25519PrivateKey.generate()
        public_key = private_key.public_key()

        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        public_pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )

        payload = {
            "job_id": "job-bio-test-1001",
            "target_protein": "EGFR_MUTANT_V3",
            "sequence_hash": "sha256-a8f10b83e490c21",
            "gpu_cluster_id": "cluster-iceland-geo-01",
            "energy_cost_usd_hr": 0.55,
            "timestamp": time.time()
        }

        token = jwt.encode(
            payload,
            private_pem,
            algorithm="EdDSA",
            headers={"typ": "JWT", "alg": "EdDSA", "entity": "AuraPharm.ai"}
        )

        self.assertIsNotNone(token)
        self.assertEqual(len(token.split(".")), 3)

        # Verify using public key
        decoded = jwt.decode(token, public_pem, algorithms=["EdDSA"])
        self.assertEqual(decoded["job_id"], payload["job_id"])
        self.assertEqual(decoded["target_protein"], "EGFR_MUTANT_V3")
        self.assertEqual(decoded["energy_cost_usd_hr"], 0.55)

    @unittest.skipUnless(HAS_CRYPTO_AND_JWT, "cryptography and PyJWT required for ED25519 tests")
    def test_ed25519_invalid_signature_rejected(self):
        """Ensures tampered payloads fail verification."""
        private_key_1 = ed25519.Ed25519PrivateKey.generate()
        private_key_2 = ed25519.Ed25519PrivateKey.generate()

        private_pem = private_key_1.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        public_pem_2 = private_key_2.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )

        token = jwt.encode({"job_id": "forged-job"}, private_pem, algorithm="EdDSA")

        with self.assertRaises(jwt.InvalidSignatureError):
            jwt.decode(token, public_pem_2, algorithms=["EdDSA"])


if __name__ == "__main__":
    unittest.main()
