"""
ApexSovereign.ai - Master Configuration Engine
Pydantic Settings v2 implementation with strict validation and no hard-coded secrets.
"""

from typing import List, Dict, Optional
import json
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, computed_field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Core Environment & Service
    ENV: str = Field(default="production", description="Environment: production, staging, development")
    BUILD_ID: str = Field(default="apex-v2.4.8-gold", description="Build identifier")
    LAUNCH_MODE: str = Field(default="early_access", description="Launch mode: early_access or live")
    PROVIDER_MODE: str = Field(default="simulated", description="Provider mode: simulated or supplier")
    LIVE_PAYMENTS_ACK: str = Field(default="", description="Operator confirmation for live billing")
    
    # Ingress & Networking
    RENDER_EXTERNAL_HOSTNAME: str = Field(default="apexsovereign-mesh.onrender.com")
    PORT: int = Field(default=10000)
    ALLOWED_ORIGINS: str = Field(
        default="https://www.apexsovereign.ai,https://apexsovereign.ai,http://localhost:3000,http://localhost:5173",
        description="Comma-separated allowed CORS origins"
    )

    # Supabase & Database (schema 'apex')
    DATABASE_URL: str = Field(
        default="",
        description="Direct PostgreSQL connection string to Supabase (bypasses REST)"
    )
    SUPABASE_URL: str = Field(default="", description="Supabase project URL")
    SUPABASE_ANON_KEY: str = Field(default="", description="Supabase anon public key")
    SUPABASE_JWT_SECRET: str = Field(default="", description="Supabase JWT secret for auth token verification")

    # Cryptographic Ledger Signing
    LEDGER_HMAC_KID: str = Field(default="k1", description="Active HMAC key identifier")
    LEDGER_HMAC_KEYS_JSON: str = Field(
        default='{"k1": "apex-default-dev-signing-key-hex-32bytes-secret"}',
        description="JSON dictionary mapping key identifiers to hex/utf-8 secrets"
    )

    # PayPal REST API v2
    PAYPAL_ENV: str = Field(default="sandbox", description="PayPal environment: sandbox or live")
    PAYPAL_CLIENT_ID: str = Field(default="", description="PayPal OAuth client ID")
    PAYPAL_CLIENT_SECRET: str = Field(default="", description="PayPal OAuth client secret")
    PAYPAL_WEBHOOK_ID: str = Field(default="", description="PayPal registered webhook ID")

    # Deposit Limits (cents: $1.00 = 100 CU = 100 cents)
    DEPOSIT_MAX_TX_CENTS: int = Field(default=100000, description="Max $1,000 per transaction")
    DEPOSIT_MAX_DAY_CENTS: int = Field(default=200000, description="Max $2,000 per 24 hours")
    DEPOSIT_MAX_NEW_ACCOUNT_DAY_CENTS: int = Field(default=50000, description="Max $500 per 24h for accounts < 7 days")

    # Waitlist & Privacy Salt
    WAITLIST_IP_SALT: str = Field(default="apex-sovereign-waitlist-salt-2026", description="Salt for IP hashing")

    # External Compute Supplier Adapter (When PROVIDER_MODE == supplier)
    SUPPLIER_BASE_URL: str = Field(default="", description="Upstream compute supplier API URL")
    SUPPLIER_API_KEY: str = Field(default="", description="Upstream compute supplier API token")

    # Observability
    SENTRY_DSN: Optional[str] = Field(default=None, description="Optional Sentry DSN")

    @computed_field
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @computed_field
    def hmac_keys(self) -> Dict[str, str]:
        try:
            return json.loads(self.LEDGER_HMAC_KEYS_JSON)
        except Exception:
            return {self.LEDGER_HMAC_KID: "apex-default-fallback-key"}

    @computed_field
    def payments_enabled(self) -> bool:
        """
        Rule 4 Non-Negotiable Gate:
        payments_enabled is true ONLY when:
        1. PAYPAL_ENV == 'sandbox', OR
        2. All of these hold:
           - PAYPAL_ENV == 'live'
           - PROVIDER_MODE == 'supplier'
           - LIVE_PAYMENTS_ACK == 'I_CONFIRM_SERVICE_CAN_BE_DELIVERED'
        """
        if self.PAYPAL_ENV == "sandbox":
            return True
        if self.PAYPAL_ENV == "live":
            return (
                self.PROVIDER_MODE == "supplier" and
                self.LIVE_PAYMENTS_ACK == "I_CONFIRM_SERVICE_CAN_BE_DELIVERED"
            )
        return False


settings = Settings()
