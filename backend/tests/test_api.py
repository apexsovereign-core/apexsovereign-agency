"""
ApexSovereign.ai - Configuration, Startup & Key-Management Tests.
No network and no live database are required.
"""

import json

import pytest
from pydantic import ValidationError

from app import db
from app.config import Settings, settings
from app.ledger import sign_transaction


def test_missing_required_secret_aborts_settings_construction():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, SUPABASE_JWT_SECRET="")


def test_missing_database_url_aborts_settings_construction():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, DATABASE_URL="")


def test_invalid_ledger_keyring_json_aborts():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, LEDGER_HMAC_KEYS_JSON="not-json")


def test_active_kid_must_exist_in_keyring():
    keyring = json.dumps({"k1": "a-valid-test-secret-value"})
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            LEDGER_HMAC_KID="k2",
            LEDGER_HMAC_KEYS_JSON=keyring,
        )


def test_validate_runtime_rejects_blank_required_value(monkeypatch):
    monkeypatch.setattr(settings, "DATABASE_URL", "")
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        settings.validate_runtime()


def test_signing_has_no_fallback_key():
    lines = [
        {"account_code": "wallet_user1", "direction": "credit", "amount_cu": 100}
    ]
    with pytest.raises(ValueError, match="Unknown or unconfigured"):
        sign_transaction(
            "00000000-0000-0000-0000-000000000001",
            "TOPUP",
            "test",
            "2026-10-18T12:00:00+00:00",
            lines,
            kid="missing-kid",
        )


@pytest.mark.asyncio
async def test_pool_init_aborts_without_database_in_production(monkeypatch):
    monkeypatch.setattr(settings, "DATABASE_URL", "")
    monkeypatch.setattr(settings, "DEMO_MODE", False)
    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        await db.init_pool()


@pytest.mark.asyncio
async def test_pool_init_offline_only_with_explicit_demo_mode(monkeypatch):
    monkeypatch.setattr(settings, "DATABASE_URL", "")
    monkeypatch.setattr(settings, "DEMO_MODE", True)
    monkeypatch.setattr(settings, "ENV", "test")
    monkeypatch.setattr(settings, "PAYPAL_ENV", "sandbox")

    assert await db.init_pool() is None


def test_cors_origins_are_parsed_without_defaults():
    assert "http://localhost:3000" in settings.cors_origins
    assert len(settings.cors_origins) >= 2
