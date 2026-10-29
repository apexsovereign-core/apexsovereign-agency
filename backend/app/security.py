"""
Security, Authentication & Authorization Engine
Supabase JWT verification, API Key hashing, Token-Bucket Rate Limiter, and SSH Key validation.
"""

import time
import hashlib
import base64
import re
import secrets
import hmac
from typing import Optional, Dict, Any, Tuple
from fastapi import Request, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

from .config import settings
from . import db

bearer_scheme = HTTPBearer(auto_error=False)


# -----------------------------------------------------------------------------
# 1. AUTHENTICATION (SUPABASE JWT & API KEYS)
# -----------------------------------------------------------------------------
async def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme)
) -> Dict[str, Any]:
    """
    Resolves the authenticated user from:
    1. 'Authorization: Bearer <Supabase JWT>'
    2. 'Authorization: Bearer <API Key>' (REDACTED)
    3. 'X-API-Key: <API Key>'
    """
    token: Optional[str] = None
    if creds:
        token = creds.credentials
    elif "X-API-Key" in request.headers:
        token = request.headers["X-API-Key"].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "unauthorized", "message": "Missing authentication credentials."}}
        )

    # Branch A: Programmatic API Key. Accept the legacy prefix during rotation,
    # but issue only the canonical sk_live_apex_ format below.
    if token.startswith(("sk_live_apex_", "apx_live_")):
        key_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        query = """
            SELECT owner_id, last4, revoked 
            FROM apex.api_keys 
            WHERE key_hash = %s AND revoked = FALSE;
        """
        try:
            row = await db.fetch_one(query, (key_hash,))
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={"error": {"code": "invalid_api_key", "message": "API Key is invalid or revoked."}}
                )
            # Update last_used_at in background
            await db.execute("UPDATE apex.api_keys SET last_used_at = NOW() WHERE key_hash = %s;", (key_hash,))
            return {"user_id": str(row["owner_id"]), "auth_type": "api_key", "last4": row["last4"]}
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            # If DB is not available in mock/offline mode
            if settings.ENV != "production":
                return {"user_id": "00000000-0000-0000-0000-000000000099", "auth_type": "api_key", "last4": token[-4:]}
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail={"error": {"code": "db_unavailable", "message": "Authentication service unavailable."}})

    # Branch B: Supabase JWT Token
    jwt_secret = settings.SUPABASE_JWT_SECRET
    if not jwt_secret:
        # Dev fallback when secret is not set
        if settings.ENV != "production":
            return {"user_id": "00000000-0000-0000-0000-000000000099", "email": "dev@apexsovereign.ai", "auth_type": "jwt_dev"}
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"code": "misconfigured_auth", "message": "SUPABASE_JWT_SECRET is not configured."}}
        )

    try:
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            audience="authenticated"
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": {"code": "invalid_token", "message": "Token missing subject claim."}}
            )
        return {
            "user_id": user_id,
            "email": payload.get("email", ""),
            "auth_type": "supabase_jwt",
            "app_metadata": payload.get("app_metadata", {})
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "token_expired", "message": "Session token has expired."}}
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "invalid_token", "message": "Session token validation failed."}}
        )


# -----------------------------------------------------------------------------
# 2. TOKEN BUCKET IN-MEMORY RATE LIMITER
# -----------------------------------------------------------------------------
class TokenBucketLimiter:
    def __init__(self):
        self._buckets: Dict[str, Tuple[float, float]] = {}

    def is_allowed(self, key: str, capacity: int, refill_rate_per_sec: float) -> bool:
        now = time.monotonic()
        tokens, last_time = self._buckets.get(key, (float(capacity), now))
        
        elapsed = now - last_time
        tokens = min(float(capacity), tokens + elapsed * refill_rate_per_sec)

        if tokens >= 1.0:
            tokens -= 1.0
            self._buckets[key] = (tokens, now)
            return True
        else:
            self._buckets[key] = (tokens, now)
            return False


limiter = TokenBucketLimiter()


def rate_limit_gate(key: str, capacity: int = 60, refill_per_sec: float = 1.0):
    if not limiter.is_allowed(key, capacity, refill_per_sec):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": {"code": "rate_limit_exceeded", "message": "Request rate limit exceeded. Please throttle."}}
        )


# -----------------------------------------------------------------------------
# 3. OPENSSH PUBLIC KEY VALIDATION & FINGERPRINTING
# -----------------------------------------------------------------------------
VALID_SSH_TYPES = {
    "ssh-ed25519",
    "ssh-rsa",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521"
}

def validate_and_fingerprint_ssh_key(public_key_text: str) -> Tuple[str, str]:
    """
    Validates that the provided text is an OpenSSH public key.
    Strictly rejects any text containing 'PRIVATE KEY'.
    Returns (cleaned_public_key, sha256_fingerprint).
    """
    raw = public_key_text.strip()
    if "PRIVATE KEY" in raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "invalid_key", "message": "Private keys must NEVER be uploaded. Submit public key only."}}
        )

    parts = raw.split()
    if len(parts) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "invalid_key", "message": "Invalid OpenSSH format. Expected <type> <base64-blob> [comment]."}}
        )

    key_type, b64_data = parts[0], parts[1]
    if key_type not in VALID_SSH_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "unsupported_key_type", "message": f"Supported key types: {', '.join(sorted(VALID_SSH_TYPES))}"}}
        )

    try:
        raw_bytes = base64.b64decode(b64_data, validate=True)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "invalid_base64", "message": "Malformed base64 key payload."}}
        )

    sha256_digest = hashlib.sha256(raw_bytes).digest()
    fingerprint = "SHA256:" + base64.b64encode(sha256_digest).decode("utf-8").rstrip("=")
    clean_key = f"{key_type} {b64_data}"
    if len(parts) > 2:
        clean_key += f" {' '.join(parts[2:])}"

    return clean_key, fingerprint


# -----------------------------------------------------------------------------
# 4. API KEY GENERATION HELPER
# -----------------------------------------------------------------------------
def generate_api_key() -> Tuple[str, str, str]:
    """
    Generates a secure programmatic API Key:
    Format: sk_live_apex_<64 lowercase hexadecimal characters>
    Returns: (plaintext_key, key_hash_sha256, last4)
    """
    plaintext = f"sk_live_apex_{secrets.token_hex(32)}"
    key_hash = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
    last4 = plaintext[-4:]
    return plaintext, key_hash, last4
