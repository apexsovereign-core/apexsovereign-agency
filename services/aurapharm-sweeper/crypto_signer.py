# services/aurapharm-sweeper/crypto_signer.py
"""
ApexSovereign Holdings - AuraPharm Autonomous Molecular IP Cryptographic Signer
Generates ED25519-signed JSON Web Signatures (JWS) for bio-molecular candidate discovery proofs.
"""

import os
import json
import base64
import time
from typing import Dict, Any, Tuple
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


class Ed25519CryptoSigner:
    def __init__(self, private_seed_hex: str = None):
        if private_seed_hex:
            self._private_key = ed25519.Ed25519PrivateKey.from_private_bytes(bytes.fromhex(private_seed_hex))
        else:
            self._private_key = ed25519.Ed25519PrivateKey.generate()
        self._public_key = self._private_key.public_key()

    def get_public_key_hex(self) -> str:
        return self._public_key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw
        ).hex()

    def sign_molecular_ip_asset(self, payload: Dict[str, Any]) -> Tuple[str, str]:
        """
        Signs candidate metadata into standard ED25519 compact JWS.
        Returns: (compact_jws_string, public_key_hex)
        """
        header = {
            "alg": "EdDSA",
            "crv": "Ed25519",
            "typ": "JWT",
            "iss": "AuraPharm.ai-Synthetix-Engine",
            "iat": int(time.time())
        }
        header_b64 = b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        payload_b64 = b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))

        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        raw_signature = self._private_key.sign(signing_input)
        signature_b64 = b64url_encode(raw_signature)

        compact_jws = f"{header_b64}.{payload_b64}.{signature_b64}"
        return compact_jws, self.get_public_key_hex()
