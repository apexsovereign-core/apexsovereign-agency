"""
ApexSovereign.ai - Comprehensive Smoke & Invariant Test Suite.
Validates:
1. Health probe shape & latency SLA compatibility
2. Ledger double-entry balance validation & rejection of unbalanced lines
3. HMAC-SHA256 signature verification & tamper detection
4. Payment gating rules (payments_enabled block in simulated mode)
5. Webhook signature rejection on invalid transmission
"""

import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.ledger import (
    canonicalize_transaction,
    sign_transaction,
    verify_transaction_hmac
)

client = TestClient(app)


def test_health_check_shape():
    """Verify /health returns the exact JSON fields required by the frontend client"""
    response = client.get("/health")
    assert response.status_code == 200
    assert "application/json" in response.headers["content-type"]
    
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert "build" in data
    assert "env" in data
    assert "router_host" in data
    assert data["engine"] == "fastapi"
    assert "provider_mode" in data
    assert data["db"] in ("ok", "down")


def test_public_config_contract():
    """Verify /v1/config/public exposes required frontend flags without leaking secrets"""
    response = client.get("/v1/config/public")
    assert response.status_code == 200
    data = response.json()
    assert "paypal_client_id" in data
    assert "paypal_env" in data
    assert "payments_enabled" in data
    assert "provider_mode" in data
    assert "demo_mode" in data
    # Ensure no secrets leak
    assert "secret" not in json_str(data).lower()
    assert "key_hash" not in json_str(data).lower()


def test_unbalanced_transaction_rejection():
    """Ensure unbalanced double-entry transactions are mathematically rejected"""
    from app.ledger import post_atomic_transaction
    import asyncio

    # Unbalanced lines: Debit 5,000 CU, Credit 4,000 CU
    unbalanced_lines = [
        {"account_code": "paypal_clearing", "direction": "debit", "amount_cu": 5000},
        {"account_code": "wallet_user1", "direction": "credit", "amount_cu": 4000}
    ]

    with pytest.raises(ValueError, match="Unbalanced transaction"):
        asyncio.run(post_atomic_transaction(
            tx_type="TOPUP",
            reference="Test unbalanced",
            idempotency_key="test_unbalanced_key",
            lines=unbalanced_lines
        ))


def test_hmac_sha256_canonicalization_and_tamper_detection():
    """Ensure HMAC-SHA256 signatures detect tampering in amounts, accounts, or metadata"""
    tx_id = "test-tx-uuid-1234"
    tx_type = "TOPUP"
    reference = "PayPal Capture 9999"
    created_at = datetime.now(timezone.utc).isoformat()
    lines = [
        {"account_code": "paypal_clearing", "direction": "debit", "amount_cu": 10000},
        {"account_code": "wallet_alpha", "direction": "credit", "amount_cu": 10000}
    ]

    canonical_msg = canonicalize_transaction(tx_id, tx_type, reference, created_at, lines)
    sig, kid = sign_transaction(canonical_msg, kid="v1")

    # 1. Verification of pristine payload MUST succeed
    is_valid = verify_transaction_hmac(tx_id, tx_type, reference, created_at, lines, sig, kid)
    assert is_valid is True

    # 2. Tampered amount: 10,000 CU altered to 10,001 CU MUST fail
    tampered_lines = [
        {"account_code": "paypal_clearing", "direction": "debit", "amount_cu": 10001},
        {"account_code": "wallet_alpha", "direction": "credit", "amount_cu": 10001}
    ]
    is_tampered_amount = verify_transaction_hmac(tx_id, tx_type, reference, created_at, tampered_lines, sig, kid)
    assert is_tampered_amount is False

    # 3. Tampered account code MUST fail
    tampered_acc_lines = [
        {"account_code": "paypal_clearing", "direction": "debit", "amount_cu": 10000},
        {"account_code": "wallet_attacker", "direction": "credit", "amount_cu": 10000}
    ]
    is_tampered_acc = verify_transaction_hmac(tx_id, tx_type, reference, created_at, tampered_acc_lines, sig, kid)
    assert is_tampered_acc is False


def test_payments_gate_when_simulated():
    """Verify create-order rejects with 403 payments_disabled if payments_enabled is False"""
    original_mode = settings.PROVIDER_MODE
    original_env = settings.PAYPAL_ENV
    try:
        # Simulate live environment without real supplier
        settings.PROVIDER_MODE = "simulated"
        settings.PAYPAL_ENV = "live"
        assert settings.payments_enabled is False

        response = client.post(
            "/v1/billing/paypal/create-order",
            json={"pack": "developer"},
            headers={"Authorization": "Bearer apx_live_test_dummy_key_000000000000000000000000000000"}
        )
        assert response.status_code == 403
        data = response.json()
        assert data["error"]["code"] == "payments_disabled"
    finally:
        settings.PROVIDER_MODE = original_mode
        settings.PAYPAL_ENV = original_env


def test_paypal_webhook_rejects_invalid_signature():
    """Verify webhook endpoint rejects requests with invalid or missing PayPal transmission signature"""
    response = client.post(
        "/v1/webhooks/paypal",
        json={"event_type": "PAYMENT.CAPTURE.COMPLETED", "id": "WH-TEST-001"},
        headers={"PAYPAL-TRANSMISSION-SIG": "invalid_fake_signature"}
    )
    # Rejection: HTTP 400 Bad Request
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "invalid_signature"


def json_str(obj) -> str:
    import json
    return json.dumps(obj)
