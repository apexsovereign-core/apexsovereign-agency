"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Security, Cryptographic Verification & Header Authentication
Author: Principal Systems Architect

Features:
- Timing-attack-resistant API Key validation (secrets.compare_digest).
- Cryptographic HMAC-SHA256 compute lease token generation and verification.
- SSRF-hardened certificate URL validation for payment webhook gateways.
"""

from __future__ import annotations

import hmac
import hashlib
import time
import secrets
from typing import Optional
from urllib.parse import urlparse
from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader

from backend.app.config import get_settings

# Header definition for administrative and internal RPC operations
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: Optional[str] = Security(API_KEY_HEADER)) -> str:
    """
    Enforces strict API key header validation using constant-time comparison (secrets.compare_digest).
    Protects against timing attacks on cryptographic key comparison.
    """
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing required 'X-API-Key' authentication header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    settings = get_settings()
    expected_key = settings.APP_SECRET_API_KEY

    # Use constant-time comparison
    is_valid = secrets.compare_digest(api_key.encode("utf-8"), expected_key.encode("utf-8"))
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid 'X-API-Key' credentials.",
        )
    return api_key


def generate_compute_lease_token(job_id: str, tenant_id: str, ttl_seconds: int = 3600) -> tuple[str, int]:
    """
    Generates a cryptographically signed lease token using HMAC-SHA256 for worker execution.
    Returns (signed_token, expires_at_epoch).
    """
    settings = get_settings()
    expires_at = int(time.time()) + ttl_seconds
    raw_payload = f"{job_id}:{tenant_id}:{expires_at}"
    signature = hmac.new(
        key=settings.LEASE_HMAC_SECRET.encode("utf-8"),
        msg=raw_payload.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    token = f"{raw_payload}:{signature}"
    return token, expires_at


def verify_compute_lease_token(token: str) -> dict:
    """
    Verifies the integrity and expiration of a compute lease token.
    Raises ValueError on tampering, signature mismatch, or expiration.
    """
    settings = get_settings()
    try:
        parts = token.split(":")
        if len(parts) != 4:
            raise ValueError("Malformed lease token structure.")
        job_id, tenant_id, expires_str, provided_sig = parts
        expires_at = int(expires_str)

        # Check expiration
        if time.time() > expires_at:
            raise ValueError("Compute lease token has expired.")

        # Re-compute expected HMAC
        raw_payload = f"{job_id}:{tenant_id}:{expires_at}"
        expected_sig = hmac.new(
            key=settings.LEASE_HMAC_SECRET.encode("utf-8"),
            msg=raw_payload.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).hexdigest()

        if not secrets.compare_digest(provided_sig, expected_sig):
            raise ValueError("Cryptographic lease signature mismatch. Potential token tampering.")

        return {
            "job_id": job_id,
            "tenant_id": tenant_id,
            "expires_at": expires_at,
        }
    except Exception as exc:
        raise ValueError(f"Invalid compute lease token: {str(exc)}") from exc


def validate_paypal_cert_url(cert_url: str) -> bool:
    """
    Hardens against SSRF (Server-Side Request Forgery) attacks by verifying
    that the certificate URL strictly belongs to legitimate PayPal domains.
    Must be HTTPS and hostname must end with .paypal.com
    """
    try:
        parsed = urlparse(cert_url)
        if parsed.scheme != "https":
            return False
        hostname = (parsed.hostname or "").lower()
        # Accept legitimate PayPal certificate distribution hosts
        if hostname == "api.paypal.com" or hostname == "api-m.paypal.com" or hostname.endswith(".paypal.com"):
            return True
        return False
    except Exception:
        return False
