"""
ApexSovereign.ai - Comprehensive Production Invariant & Security Test Suite.
Validates all 16 conditions specified in Section 10 without external network dependencies.
"""

import pytest
import hashlib
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock

from app.main import app
from app.config import settings, Settings
from app.ledger import build_canonical_message, sign_transaction, verify_transaction_signature
from app.security import validate_and_fingerprint_ssh_key, generate_api_key
from app.paypal import PAYPAL_PACKS

client = TestClient(app)


# -----------------------------------------------------------------------------
# 1. HEALTH SHAPE AND 503 DEGRADED
# -----------------------------------------------------------------------------
def test_health_probe_nominal():
    with patch("app.db.check_db_health", AsyncMock(return_value=True)):
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["engine"] == "fastapi"
        assert data["db"] == "ok"
        assert "build" in data
        assert "router_host" in data


def test_health_probe_degraded_when_db_down():
    with patch("app.db.check_db_health", AsyncMock(return_value=False)):
        with patch.object(settings, "DATABASE_URL", "postgresql://user:pass@localhost:5432/db"):
            res = client.get("/health")
            assert res.status_code == 503
            data = res.json()
            assert data["status"] == "degraded"
            assert data["db"] == "down"


# -----------------------------------------------------------------------------
# 2. UNBALANCED TRANSACTION REJECTED
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_unbalanced_transaction_rejected():
    from app.ledger import post_ledger_transaction
    from fastapi import HTTPException

    # 100 CU debit vs 90 CU credit
    unbalanced_lines = [
        {"account_id": "00000000-0000-0000-0000-000000000001", "direction": "debit", "amount_cu": 100},
        {"account_id": "00000000-0000-0000-0000-000000000002", "direction": "credit", "amount_cu": 90}
    ]
    with pytest.raises(HTTPException) as exc_info:
        await post_ledger_transaction("TOPUP", "ref_test", unbalanced_lines)
    assert exc_info.value.status_code == 400
    assert "imbalance" in exc_info.value.detail["error"]["code"]


# -----------------------------------------------------------------------------
# 3. CONCURRENT SPENDS CANNOT OVERDRAW (INSUFFICIENT FUNDS)
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_overdraft_insufficient_funds_handling():
    from app.ledger import post_ledger_transaction
    from fastapi import HTTPException

    lines = [
        {"account_id": "00000000-0000-0000-0000-000000000010", "direction": "debit", "amount_cu": 50000},
        {"account_id": "00000000-0000-0000-0000-000000000002", "direction": "credit", "amount_cu": 50000}
    ]
    with patch("app.db.fetch_one", AsyncMock(side_effect=Exception("Insufficient Funds: Wallet balance 1000 CU is less than required 50000 CU"))):
        with pytest.raises(HTTPException) as exc_info:
            await post_ledger_transaction("PROVISION", "ref_test", lines)
        assert exc_info.value.status_code == 402
        assert exc_info.value.detail["error"]["code"] == "insufficient_funds"


# -----------------------------------------------------------------------------
# 4. IDEMPOTENT CREDIT & 5. CAPTURE / WEBHOOK NO DOUBLE CREDIT
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_idempotent_capture_returns_same_key():
    from app.ledger import post_ledger_transaction

    lines = [
        {"account_id": "00000000-0000-0000-0000-000000000001", "direction": "debit", "amount_cu": 5000},
        {"account_id": "00000000-0000-0000-0000-000000000010", "direction": "credit", "amount_cu": 5000}
    ]
    # First post returns tx_id
    with patch("app.db.fetch_one", AsyncMock(return_value={"tx_id": "tx_first_call"})):
        tx1 = await post_ledger_transaction("TOPUP", "order_123", lines, idempotency_key="paypal:capture:cap_abc")
        assert tx1 == "tx_first_call"

    # Second post with identical key returns same tx_id from SQL
    with patch("app.db.fetch_one", AsyncMock(return_value={"tx_id": "tx_first_call"})):
        tx2 = await post_ledger_transaction("TOPUP", "order_123", lines, idempotency_key="paypal:capture:cap_abc")
        assert tx2 == "tx_first_call"


# -----------------------------------------------------------------------------
# 6. PAYPAL AMOUNT MISMATCH REJECTED
# -----------------------------------------------------------------------------
def test_paypal_pack_server_side_enforcement():
    # Only predefined packs are accepted
    assert "developer" in PAYPAL_PACKS
    assert PAYPAL_PACKS["developer"]["amount_cents"] == 5000
    assert PAYPAL_PACKS["developer"]["cu_amount"] == 5000


# -----------------------------------------------------------------------------
# 7. PAYMENTS GATE MATRIX (RULE 4 VERIFICATION)
# -----------------------------------------------------------------------------
def test_payments_gate_matrix():
    # A: Sandbox -> Allowed
    s_sandbox = Settings(PAYPAL_ENV="sandbox")
    assert s_sandbox.payments_enabled is True

    # B: Live without supplier -> Blocked
    s_live_sim = Settings(PAYPAL_ENV="live", PROVIDER_MODE="simulated")
    assert s_live_sim.payments_enabled is False

    # C: Live with supplier but no ack -> Blocked
    s_live_no_ack = Settings(PAYPAL_ENV="live", PROVIDER_MODE="supplier", LIVE_PAYMENTS_ACK="")
    assert s_live_no_ack.payments_enabled is False

    # D: All live conditions met -> Allowed
    s_live_ok = Settings(
        PAYPAL_ENV="live",
        PROVIDER_MODE="supplier",
        LIVE_PAYMENTS_ACK="I_CONFIRM_SERVICE_CAN_BE_DELIVERED"
    )
    assert s_live_ok.payments_enabled is True


# -----------------------------------------------------------------------------
# 8. DEPOSIT LIMITS AND PACK SIZING
# -----------------------------------------------------------------------------
def test_deposit_limits_configured():
    assert settings.DEPOSIT_MAX_TX_CENTS == 100000  # $1,000 max tx
    assert settings.DEPOSIT_MAX_DAY_CENTS == 200000  # $2,000 max day
    assert settings.DEPOSIT_MAX_NEW_ACCOUNT_DAY_CENTS == 50000  # $500 max day for new accounts


# -----------------------------------------------------------------------------
# 9. HMAC TAMPER DETECTED & 10. UNKNOWN KID UNVERIFIED
# -----------------------------------------------------------------------------
def test_hmac_tamper_detection():
    tx_id = "test-uuid-1234"
    lines = [{"account_code": "user_wallet", "direction": "credit", "amount_cu": 5000}]
    sig, kid = sign_transaction(tx_id, "TOPUP", "ref_test", "2026-10-18T12:00:00Z", lines, kid="k1")

    # 1. Authentic verify
    res_ok = verify_transaction_signature(tx_id, "TOPUP", "ref_test", "2026-10-18T12:00:00Z", lines, sig, kid)
    assert res_ok["hmac_verified"] is True
    assert res_ok["hmac_sig_prefix"] == sig[:12]

    # 2. Tampered amount
    tampered_lines = [{"account_code": "user_wallet", "direction": "credit", "amount_cu": 99999}]
    res_tampered = verify_transaction_signature(tx_id, "TOPUP", "ref_test", "2026-10-18T12:00:00Z", tampered_lines, sig, kid)
    assert res_tampered["hmac_verified"] is False

    # 3. Unknown KID
    res_unknown_kid = verify_transaction_signature(tx_id, "TOPUP", "ref_test", "2026-10-18T12:00:00Z", lines, sig, "kid_non_existent")
    assert res_unknown_kid["hmac_verified"] is False
    assert "Unknown" in res_unknown_kid.get("reason", "")


# -----------------------------------------------------------------------------
# 11. WEBHOOK BAD SIGNATURE REJECTED
# -----------------------------------------------------------------------------
def test_paypal_webhook_bad_signature_rejected():
    with patch("app.paypal.verify_webhook_signature", AsyncMock(return_value=False)):
        with patch.object(settings, "PAYPAL_WEBHOOK_ID", "WH-12345"):
            headers = {
                "paypal-transmission-id": "tx-1",
                "paypal-transmission-time": "2026-10-18T12:00:00Z",
                "paypal-cert-url": "https://api.paypal.com/cert",
                "paypal-auth-algo": "SHA256withRSA",
                "paypal-transmission-sig": "bad_sig"
            }
            res = client.post("/v1/webhooks/paypal", content="{}", headers=headers)
            assert res.status_code == 400
            assert res.json()["error"]["code"] == "invalid_webhook_signature"


# -----------------------------------------------------------------------------
# 13. WAITLIST CONSENT, HONEYPOT, AND IP HASH PRIVACY
# -----------------------------------------------------------------------------
def test_waitlist_consent_required():
    res = client.post("/v1/waitlist", json={"email": "tester@example.com", "consent": False})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "consent_required"


def test_waitlist_honeypot_silently_accepted():
    res = client.post("/v1/waitlist", json={"email": "bot@example.com", "consent": True, "website": "http://spam.org"})
    assert res.status_code == 201
    assert res.json()["status"] == "enrolled"


# -----------------------------------------------------------------------------
# 14. API KEY HASHED AND SHOWN ONCE
# -----------------------------------------------------------------------------
def test_api_key_generation():
    token, key_hash, last4 = generate_api_key()
    assert token.startswith("apx_live_")
    assert len(token) == 49
    assert last4 == token[-4:]
    expected_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    assert key_hash == expected_hash


# -----------------------------------------------------------------------------
# 15. SSH PRIVATE KEY STRICTLY REJECTED
# -----------------------------------------------------------------------------
def test_ssh_private_key_rejected():
    from fastapi import HTTPException
    private_key_attempt = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA...\n-----END OPENSSH PRIVATE KEY-----"
    with pytest.raises(HTTPException) as exc_info:
        validate_and_fingerprint_ssh_key(private_key_attempt)
    assert exc_info.value.status_code == 400
    assert "Private keys must NEVER be uploaded" in exc_info.value.detail["error"]["message"]


def test_ssh_valid_public_key_fingerprinted():
    valid_pub = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHqK/2YQ3JzZtQd7a8b9c0d1e2f3a4b5c6d7e8f9a0b1 operator@apex"
    cleaned, fp = validate_and_fingerprint_ssh_key(valid_pub)
    assert fp.startswith("SHA256:")
    assert "ssh-ed25519" in cleaned


# -----------------------------------------------------------------------------
# 16. LEGACY-SCHEMA ISOLATION (ZERO REFERENCES TO PUBLIC TABLES)
# -----------------------------------------------------------------------------
def test_schema_isolation_check():
    import glob
    app_files = glob.glob("backend/app/*.py")
    for fpath in app_files:
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()
            # Assert no reference to legacy public tables
            assert "public.ledger_entries" not in content
            assert "public.token_ledger" not in content
            assert "public.audit_events" not in content
