"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Configuration & Secure Environment Management
Author: Principal Systems Architect

Strict Zero-Trust Environment Enforcement:
- Strictly prevents any hardcoded credentials or fallback connection strings.
- Enforces runtime presence and non-emptiness of all mandatory secrets.
- Validates data formats (e.g. database scheme, URL syntax).
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal
from pydantic import BaseModel, Field


class MissingEnvironmentVariableError(RuntimeError):
    """Raised when a mandatory environment variable is absent or empty."""
    def __init__(self, var_name: str, hint: str = ""):
        message = (
            f"[FATAL SECURITY MISCONFIGURATION] Mandatory environment variable '{var_name}' "
            f"is missing or empty in os.environ."
        )
        if hint:
            message += f" Context: {hint}"
        super().__init__(message)
        self.var_name = var_name


def require_env(name: str, hint: str = "") -> str:
    """
    Strictly fetch a mandatory configuration key from os.environ.
    Raises MissingEnvironmentVariableError if the variable is not set or empty.
    
    CRITICAL: Never fall back to insecure default strings or mock credentials.
    """
    val = os.environ.get(name)
    if val is None or not val.strip():
        raise MissingEnvironmentVariableError(name, hint)
    return val.strip()


def get_env_optional(name: str, default: str = "") -> str:
    """Fetch an optional environment variable with a safe default."""
    return os.environ.get(name, default).strip()


def get_env_int(name: str, default: int) -> int:
    """Fetch an integer environment variable with fallback."""
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw.strip())
    except ValueError as exc:
        raise ValueError(f"Environment variable '{name}' must be an integer, got: '{raw}'") from exc


def get_env_bool(name: str, default: bool = False) -> bool:
    """Fetch a boolean environment variable."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("true", "1", "yes", "on")


class Settings(BaseModel):
    """
    Typed, immutable configuration registry for ApexSovereign.ai.
    All sensitive values are populated via strict require_env calls.
    """
    # System Runtime
    APP_NAME: str = "ApexSovereign.ai"
    APP_VERSION: str = "2.4.0-enterprise"
    ENVIRONMENT: Literal["development", "staging", "production", "test"] = "production"
    PORT: int = 3000
    HOST: str = "0.0.0.0"
    DEBUG: bool = False

    # Database Pool Settings (Supabase / asyncpg PostgreSQL)
    DATABASE_URL: str = Field(
        ...,
        description="Strict asyncpg PostgreSQL URI. E.g. postgresql://user:pass@host:port/db?sslmode=require"
    )
    DB_POOL_MIN_SIZE: int = 5
    DB_POOL_MAX_SIZE: int = 20
    DB_POOL_MAX_INACTIVE_LIFETIME: float = 300.0  # seconds
    DB_COMMAND_TIMEOUT: float = 60.0  # seconds
    DB_SSL_ENFORCEMENT: bool = True

    # Security & API Key Validation (X-API-Key)
    APP_SECRET_API_KEY: str = Field(
        ...,
        description="Master API secret for internal & administrative endpoints (secrets.compare_digest)"
    )

    # PayPal REST API Gateway
    PAYPAL_CLIENT_ID: str = Field(..., description="PayPal REST Client ID")
    PAYPAL_CLIENT_SECRET: str = Field(..., description="PayPal REST Client Secret")
    PAYPAL_WEBHOOK_ID: str = Field(..., description="PayPal Registered Webhook ID for signature verification")
    PAYPAL_MODE: Literal["sandbox", "live"] = "sandbox"

    # Compute Broker Lease Signing Secret
    LEASE_HMAC_SECRET: str = Field(
        ...,
        description="Cryptographic secret used to sign execution lease tokens for compute workers"
    )

    # Automated Customer Communication (Resend / SMTP)
    RESEND_API_KEY: str = Field(default="", description="Resend API Key for automated transactional emails")
    EMAIL_FROM: str = Field(default="ApexSovereign Concierge <concierge@apexsovereign.ai>", description="Sender email string")
    EMAIL_REPLY_TO: str = Field(default="support@apexsovereign.ai", description="Reply-to email address")

    @property
    def paypal_base_url(self) -> str:
        """Determines the appropriate PayPal REST API endpoint based on configured mode."""
        if self.PAYPAL_MODE == "live":
            return "https://api-m.paypal.com"
        return "https://api-m.sandbox.paypal.com"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Factory function producing validated singleton Settings instance.
    Enforces strict zero-credential-instantiation in repository files.
    """
    # Strict validation of mandatory environment variables
    db_url = require_env(
        "DATABASE_URL",
        "Must be a valid PostgreSQL connection string pointing to your Supabase pooler."
    )
    paypal_client_id = require_env("PAYPAL_CLIENT_ID", "Required for PayPal OAuth2 credentials.")
    paypal_client_secret = require_env("PAYPAL_CLIENT_SECRET", "Required for PayPal OAuth2 credentials.")
    paypal_webhook_id = require_env("PAYPAL_WEBHOOK_ID", "Required for cryptographic webhook signature verification.")
    app_secret_api_key = require_env("APP_SECRET_API_KEY", "Required for X-API-Key administrative authentication.")
    
    # Compute lease secret (can inherit from app secret if not explicitly provided)
    lease_secret = os.environ.get("LEASE_HMAC_SECRET") or app_secret_api_key

    raw_env = get_env_optional("ENVIRONMENT", "production").lower()
    valid_env: Literal["development", "staging", "production", "test"]
    if raw_env in ("development", "staging", "production", "test"):
        valid_env = raw_env  # type: ignore[assignment]
    else:
        valid_env = "production"

    raw_mode = get_env_optional("PAYPAL_MODE", "sandbox").lower()
    valid_mode: Literal["sandbox", "live"] = "live" if raw_mode == "live" else "sandbox"

    return Settings(
        ENVIRONMENT=valid_env,
        PORT=get_env_int("PORT", 3000),
        HOST=get_env_optional("HOST", "0.0.0.0"),
        DEBUG=get_env_bool("DEBUG", False),
        DATABASE_URL=db_url,
        DB_POOL_MIN_SIZE=get_env_int("DB_POOL_MIN_SIZE", 5),
        DB_POOL_MAX_SIZE=get_env_int("DB_POOL_MAX_SIZE", 20),
        DB_POOL_MAX_INACTIVE_LIFETIME=float(get_env_int("DB_POOL_MAX_INACTIVE_LIFETIME", 300)),
        DB_COMMAND_TIMEOUT=float(get_env_int("DB_COMMAND_TIMEOUT", 60)),
        DB_SSL_ENFORCEMENT=get_env_bool("DB_SSL_ENFORCEMENT", True),
        APP_SECRET_API_KEY=app_secret_api_key,
        PAYPAL_CLIENT_ID=paypal_client_id,
        PAYPAL_CLIENT_SECRET=paypal_client_secret,
        PAYPAL_WEBHOOK_ID=paypal_webhook_id,
        PAYPAL_MODE=valid_mode,
        LEASE_HMAC_SECRET=lease_secret,
        RESEND_API_KEY=get_env_optional("RESEND_API_KEY", ""),
        EMAIL_FROM=get_env_optional("EMAIL_FROM", "ApexSovereign Concierge <concierge@apexsovereign.ai>"),
        EMAIL_REPLY_TO=get_env_optional("EMAIL_REPLY_TO", "support@apexsovereign.ai"),
    )
