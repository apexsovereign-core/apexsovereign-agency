"""
ApexSovereign.ai - Smoke & Invariant Tests.
Covers health/config contracts, HMAC integrity, CU precision, and payments gating.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from app.config import settings
from app.ledger import (
    amount_to_cu,
    post_ledger_transaction,
    sign_transaction,
    verify_transaction_signature,
    verify_transaction_hmac,
)
from app.main import app
from app.paypal import PAYPAL_PACKS

client = TestClient(app)


def test_health_check_shape_nominal():
    with patch("app.db.check_db_health", AsyncMock(return_value=True)):
        response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["engine"] == "fastapi"
    assert data["db"] == "ok"
    assert data["build"]
    assert "router_host" in data
    assert "demo_mode" in data


def test_health_check_degraded_when_database_down():
    with patch("app.db.check_db_health", AsyncMock(return_value=False)):
        response = client.get("/health")
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["db"] == "down"


def test_public_config_does_not_leak_secrets():
    response = client.get("/v1/config/public")
    assert response.status_code == 200
    data = response.json()
    assert "paypal_client_id" in data
    assert "paypal_env" in data
    assert "payments_enabled" in data
    assert "provider_mode" in data
    assert data["demo_mode"] is True

    serialized = json.dumps(data).lower()
    for forbidden in (
        "secret",
        "database_url",
        "supabase_service_role",
        "ledger_hmac_keys_json",
        "waitlist_ip_salt",
    ):
        assert forbidden not in serialized


def test_hmac_canonicalization_and_tamper_detection():
    tx_id = "test-tx-uuid-1234"
    tx_type = "TOPUP"
    reference = "paypal:capture:cap_123"
    signed_at = datetime.now(timezone.utc).isoformat()
    lines = [
        {"account_code": "paypal_clearing", "direction": "debit", "amount_cu": 10000},
        {"account_code": "wallet_alpha", "direction": "credit", "amount_cu": 10000},
    ]

    sig, kid = sign_transaction(tx_id, tx_type, reference, signed_at, lines, kid="k1")

    # Timestamp normalization must not break verification.
    assert verify_transaction_hmac(
        tx_id, tx_type, reference, signed_at, lines, sig, kid
    ) is True

    tampered_amount = [
        {"account_code": "paypal_clearing", "direction": "debit", "amount_cu": 10001},
        {"account_code": "wallet_alpha", "direction": "credit", "amount_cu": 10001},
    ]
    assert verify_transaction_hmac(
        tx_id, tx_type, reference, signed_at, tampered_amount, sig, kid
    ) is False

    tampered_account = [
        {"account_code": "paypal_clearing", "direction": "debit", "amount_cu": 10000},
        {"account_code": "wallet_attacker", "direction": "credit", "amount_cu": 10000},
    ]
    assert verify_transaction_hmac(
        tx_id, tx_type, reference, signed_at, tampered_account, sig, kid
    ) is False

    unknown_kid = verify_transaction_signature(
        tx_id, tx_type, reference, signed_at, lines, sig, "kid_does_not_exist"
    )
    assert unknown_kid["hmac_verified"] is False
    assert "Unknown" in unknown_kid["reason"]

    missing_signed_at = verify_transaction_signature(
        tx_id, tx_type, reference, None, lines, sig, kid
    )
    assert missing_signed_at["hmac_verified"] is False


def test_amount_to_cu_uses_exact_integer_precision():
    assert amount_to_cu("1.00") == 100
    assert amount_to_cu("19.40") == 1940
    assert amount_to_cu("1000.00") == 100000
    with pytest.raises(ValueError):
        amount_to_cu("19.401")
    with pytest.raises(ValueError):
        amount_to_cu("0.00")
    with pytest.raises(ValueError):
        amount_to_cu("-1.00")


@pytest.mark.asyncio
async def test_unbalanced_transaction_is_rejected_before_sql():
    lines = [
        {
            "account_id": "00000000-0000-0000-0000-000000000001",
            "account_code": "paypal_clearing",
            "direction": "debit",
            "amount_cu": 5000,
        },
        {
            "account_id": "00000000-0000-0000-0000-000000000002",
            "account_code": "wallet_user1",
            "direction": "credit",
            "amount_cu": 4000,
        },
    ]
    with patch("app.db.fetch_one", AsyncMock()) as fetch_one:
        with pytest.raises(HTTPException) as exc_info:
            await post_ledger_transaction(
                tx_type="TOPUP",
                reference="test imbalance",
                lines=lines,
                idempotency_key="test_unbalanced",
            )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["error"]["code"] == "ledger_imbalance"
    fetch_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_insufficient_funds_maps_to_402():
    lines = [
        {
            "account_id": "00000000-0000-0000-0000-000000000010",
            "account_code": "wallet_user1",
            "direction": "debit",
            "amount_cu": 50000,
        },
        {
            "account_id": "00000000-0000-0000-0000-000000000011",
            "account_code": "user_escrow",
            "direction": "credit",
            "amount_cu": 50000,
        },
    ]
    with patch(
        "app.db.fetch_one",
        AsyncMock(
            side_effect=Exception(
                "Insufficient Funds: Wallet balance 1000 CU is less than required 50000 CU"
            )
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await post_ledger_transaction(
                tx_type="PROVISION", reference="cluster:test", lines=lines
            )
    assert exc_info.value.status_code == 402
    assert exc_info.value.detail["error"]["code"] == "insufficient_funds"


def test_payments_gate_in_simulated_live_mode():
    original_provider = settings.PROVIDER_MODE
    original_env = settings.PAYPAL_ENV
    try:
        settings.PROVIDER_MODE = "simulated"
        settings.PAYPAL_ENV = "live"
        assert settings.payments_enabled is False
    finally:
        settings.PROVIDER_MODE = original_provider
        settings.PAYPAL_ENV = original_env


def test_paypal_pack_server_side_pricing():
    for pack_id, pack in PAYPAL_PACKS.items():
        assert pack["amount_cents"] == pack["cu_amount"], pack_id
        assert amount_to_cu(pack["amount_usd"]) == pack["cu_amount"], pack_id


def test_app_sources_do_not_reference_legacy_public_ledger_tables():
    app_dir = Path(__file__).resolve().parents[1] / "app"
    for path in app_dir.glob("*.py"):
        content = path.read_text(encoding="utf-8")
        assert "public.ledger_entries" not in content, path.name
        assert "public.token_ledger" not in content, path.name
        assert "public.audit_events" not in content, path.name
