"""
ApexSovereign.ai - Production Billing Invariants.
Verifies webhook-only minting, idempotent replay, tenant isolation, capture
ownership, and failure behavior without any live PayPal or PostgreSQL calls.
"""

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from app.main import app

TEST_USER_ID = "11111111-1111-4111-8111-111111111111"
OTHER_USER_ID = "22222222-2222-4222-8222-222222222222"
CAPTURE_ID = "CAPTURE-ABC-123"
WALLET_ID = "33333333-3333-4333-8333-333333333333"
CLEARING_ID = "44444444-4444-4444-8444-444444444444"
TX_ID = "55555555-5555-4555-8555-555555555555"

PAYPAL_HEADERS = {
    "paypal-transmission-id": "tx-1",
    "paypal-transmission-time": "2026-10-18T12:00:00Z",
    "paypal-cert-url": "https://api.paypal.com/cert",
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-transmission-sig": "valid-signature",
}


def _webhook_event(
    event_id: str = "WH-EVT-1",
    capture_id: str = CAPTURE_ID,
    amount: str = "50.00",
    custom_id: str = TEST_USER_ID,
    status: str = "COMPLETED",
) -> Dict[str, Any]:
    return {
        "id": event_id,
        "event_type": "PAYMENT.CAPTURE.COMPLETED",
        "summary": "Payment completed",
        "resource": {
            "id": capture_id,
            "status": status,
            "custom_id": custom_id,
            "amount": {"currency_code": "USD", "value": amount},
        },
    }


def _wallet_lookup(query: str) -> bool:
    return "kind = 'user_wallet'" in query and "owner_id" in query


def _clearing_lookup(query: str) -> bool:
    return "code = 'paypal_clearing'" in query


def _rpc_lookup(query: str) -> bool:
    return "increment_user_credits" in query


async def _account_fetch_one(query: str, params: tuple = ()):
    if _rpc_lookup(query):
        return {"status": "CREDITED"}
    if _clearing_lookup(query):
        return {"id": CLEARING_ID, "code": "paypal_clearing"}
    if _wallet_lookup(query):
        return {"id": WALLET_ID, "code": "wallet_test"}
    raise AssertionError(f"Unexpected query: {query}")


# -----------------------------------------------------------------------------
# 1. WEBHOOK-ONLY MINTING
# -----------------------------------------------------------------------------
def test_verified_webhook_credits_exact_cu_amount():
    fetch_one = AsyncMock(side_effect=_account_fetch_one)

    with patch("app.paypal.verify_webhook_signature", AsyncMock(return_value=True)):
        with patch("app.db.execute", AsyncMock(return_value=None)):
            with patch("app.db.fetch_one", fetch_one):
                with patch("app.routes_billing.ledger.sign_transaction") as sign:
                    sign.return_value = ("ab" * 32, "k1")
                    from fastapi.testclient import TestClient

                    response = TestClient(app).post(
                        "/v1/webhooks/paypal",
                        json=_webhook_event(),
                        headers=PAYPAL_HEADERS,
                    )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "credited"

    rpc_calls = [c for c in fetch_one.await_args_list if _rpc_lookup(c.args[0])]
    assert len(rpc_calls) == 1
    params = rpc_calls[0].args[1]
    assert str(params[0]) == TEST_USER_ID
    assert int(params[2]) == 5000
    assert params[3] == CAPTURE_ID


def test_concurrent_duplicate_webhooks_mint_only_once():
    rpc_lock = asyncio.Lock()
    rpc_calls = 0

    async def fetch_one(query: str, params: tuple = ()):
        nonlocal rpc_calls
        if _rpc_lookup(query):
            async with rpc_lock:
                rpc_calls += 1
                return {"status": "CREDITED" if rpc_calls == 1 else "DUPLICATE"}
        if _clearing_lookup(query):
            return {"id": CLEARING_ID, "code": "paypal_clearing"}
        if _wallet_lookup(query):
            return {"id": WALLET_ID, "code": "wallet_test"}
        raise AssertionError(f"Unexpected query: {query}")

    async def post_twice():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as async_client:
            return await asyncio.gather(
                async_client.post(
                    "/v1/webhooks/paypal", json=_webhook_event(), headers=PAYPAL_HEADERS
                ),
                async_client.post(
                    "/v1/webhooks/paypal", json=_webhook_event(), headers=PAYPAL_HEADERS
                ),
            )

    with patch("app.paypal.verify_webhook_signature", AsyncMock(return_value=True)):
        with patch("app.db.execute", AsyncMock(return_value=None)):
            with patch("app.db.fetch_one", AsyncMock(side_effect=fetch_one)):
                responses = asyncio.run(post_twice())

    assert [r.status_code for r in responses] == [200, 200]
    statuses = sorted(r.json()["status"] for r in responses)
    assert statuses == ["credited", "duplicate"]
    assert rpc_calls == 2  # both attempts reach the RPC; SQL enforces uniqueness


def test_non_capture_webhook_is_acknowledged_without_minting():
    event = {
        "id": "WH-EVT-OTHER",
        "event_type": "CHECKOUT.ORDER.APPROVED",
        "resource": {"id": "ORDER-1"},
    }
    fetch_one = AsyncMock()
    with patch("app.paypal.verify_webhook_signature", AsyncMock(return_value=True)):
        with patch("app.db.execute", AsyncMock(return_value=None)):
            with patch("app.db.fetch_one", fetch_one):
                from fastapi.testclient import TestClient

                response = TestClient(app).post(
                    "/v1/webhooks/paypal", json=event, headers=PAYPAL_HEADERS
                )

    assert response.status_code == 200
    assert response.json()["status"] == "received"
    fetch_one.assert_not_awaited()


def test_webhook_rejects_invalid_signature():
    with patch("app.paypal.verify_webhook_signature", AsyncMock(return_value=False)):
        from fastapi.testclient import TestClient

        response = TestClient(app).post(
            "/v1/webhooks/paypal", json=_webhook_event(), headers=PAYPAL_HEADERS
        )

    assert response.status_code == 400
    assert response.json()["detail"]["error"]["code"] == "invalid_webhook_signature"


def test_webhook_requires_verification_configuration():
    from fastapi.testclient import TestClient

    response = TestClient(app).post("/v1/webhooks/paypal", json=_webhook_event())
    assert response.status_code == 503
    assert (
        response.json()["detail"]["error"]["code"]
        == "webhook_verification_unavailable"
    )


def test_webhook_persistence_failure_returns_503_for_paypal_retry():
    with patch("app.paypal.verify_webhook_signature", AsyncMock(return_value=True)):
        with patch("app.db.execute", AsyncMock(side_effect=RuntimeError("db down"))):
            from fastapi.testclient import TestClient

            response = TestClient(app).post(
                "/v1/webhooks/paypal", json=_webhook_event(), headers=PAYPAL_HEADERS
            )

    assert response.status_code == 503
    assert response.json()["detail"]["error"]["code"] == "webhook_persist_failed"


def test_webhook_database_failure_during_validation_returns_503():
    with patch("app.paypal.verify_webhook_signature", AsyncMock(return_value=True)):
        with patch("app.db.execute", AsyncMock(return_value=None)):
            with patch("app.db.fetch_one", AsyncMock(side_effect=RuntimeError("db down"))):
                from fastapi.testclient import TestClient

                response = TestClient(app).post(
                    "/v1/webhooks/paypal", json=_webhook_event(), headers=PAYPAL_HEADERS
                )

    assert response.status_code == 503
    assert response.json()["detail"]["error"]["code"] == "credit_validation_failed"


def test_webhook_rejects_sub_cent_capture_amount():
    with patch("app.paypal.verify_webhook_signature", AsyncMock(return_value=True)):
        with patch("app.db.execute", AsyncMock(return_value=None)):
            with patch("app.db.fetch_one", AsyncMock(side_effect=_account_fetch_one)):
                from fastapi.testclient import TestClient

                response = TestClient(app).post(
                    "/v1/webhooks/paypal",
                    json=_webhook_event(amount="50.001"),
                    headers=PAYPAL_HEADERS,
                )

    assert response.status_code == 400
    assert (
        response.json()["detail"]["error"]["code"] == "invalid_capture_amount"
    )


def test_migration_enforces_cu_amount_equality():
    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "003_atomic_credit.sql"
    ).read_text(encoding="utf-8")
    assert "CU_MISMATCH" in migration
    assert "round(amount_usd * 100)" in migration
    assert "ON CONFLICT (idempotency_key) DO NOTHING" in migration


# -----------------------------------------------------------------------------
# 2. CAPTURE ROUTE: OWNERSHIP, AMOUNT CHECK, NO CREDITING
# -----------------------------------------------------------------------------
def _capture_response(amount: str = "50.00") -> Dict[str, Any]:
    return {
        "purchase_units": [
            {
                "payments": {
                    "captures": [
                        {
                            "id": CAPTURE_ID,
                            "status": "COMPLETED",
                            "amount": {"currency_code": "USD", "value": amount},
                        }
                    ]
                }
            }
        ]
    }


def test_capture_rejects_order_owned_by_another_user(client, auth_override):
    order_row = {
        "owner_id": OTHER_USER_ID,
        "amount_cents": 5000,
        "cu_amount": 5000,
        "status": "CREATED",
        "capture_id": None,
    }
    capture = AsyncMock(return_value=_capture_response())

    with patch("app.db.fetch_one", AsyncMock(return_value=order_row)):
        with patch("app.paypal.capture_paypal_order", capture):
            response = client.post(
                "/v1/billing/paypal/capture", json={"order_id": "ORDER-1"}
            )

    assert response.status_code == 403
    assert response.json()["detail"]["error"]["code"] == "forbidden"
    capture.assert_not_awaited()


def test_capture_amount_mismatch_is_rejected(client, auth_override):
    order_row = {
        "owner_id": TEST_USER_ID,
        "amount_cents": 5000,
        "cu_amount": 5000,
        "status": "CREATED",
        "capture_id": None,
    }

    with patch("app.db.fetch_one", AsyncMock(return_value=order_row)):
        with patch(
            "app.paypal.capture_paypal_order",
            AsyncMock(return_value=_capture_response("49.99")),
        ):
            response = client.post(
                "/v1/billing/paypal/capture", json={"order_id": "ORDER-1"}
            )

    assert response.status_code == 409
    assert (
        response.json()["detail"]["error"]["code"] == "capture_amount_mismatch"
    )


def test_capture_route_never_posts_ledger_credit(client, auth_override):
    queries: List[str] = []

    async def fetch_one(query: str, params: tuple = ()):
        queries.append(query)
        if "FROM apex.paypal_orders" in query and "UPDATE" not in query:
            return {
                "owner_id": TEST_USER_ID,
                "amount_cents": 5000,
                "cu_amount": 5000,
                "status": "CREATED",
                "capture_id": None,
            }
        if "UPDATE apex.paypal_orders" in query:
            return {"id": "order-db-id"}
        raise AssertionError(f"Unexpected query: {query}")

    with patch("app.db.fetch_one", AsyncMock(side_effect=fetch_one)):
        with patch(
            "app.paypal.capture_paypal_order",
            AsyncMock(return_value=_capture_response()),
        ):
            with patch("app.db.execute", AsyncMock()) as execute:
                response = client.post(
                    "/v1/billing/paypal/capture", json={"order_id": "ORDER-1"}
                )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "COMPLETED"
    assert not any(_rpc_lookup(query) for query in queries)
    execute.assert_not_awaited()


# -----------------------------------------------------------------------------
# 3. TENANT ISOLATION: CLEARING LINES NEVER RETURNED
# -----------------------------------------------------------------------------
def test_ledger_hides_clearing_lines_from_tenant(client, auth_override):
    now = datetime.now(timezone.utc)
    rows = [
        {
            "tx_id": TX_ID,
            "type": "TOPUP",
            "reference": f"paypal:capture:{CAPTURE_ID}",
            "hmac": "ab" * 32,
            "hmac_kid": "k1",
            "created_at": now,
            "signed_at": now,
            "entry_id": "66666666-6666-4666-8666-666666666666",
            "account_id": WALLET_ID,
            "direction": "credit",
            "amount_cu": 5000,
            "entry_created_at": now,
            "account_code": "wallet_test",
            "account_kind": "user_wallet",
            "owner_id": TEST_USER_ID,
        },
        {
            "tx_id": TX_ID,
            "type": "TOPUP",
            "reference": f"paypal:capture:{CAPTURE_ID}",
            "hmac": "ab" * 32,
            "hmac_kid": "k1",
            "created_at": now,
            "signed_at": now,
            "entry_id": "77777777-7777-4777-8777-777777777777",
            "account_id": CLEARING_ID,
            "direction": "debit",
            "amount_cu": 5000,
            "entry_created_at": now,
            "account_code": "paypal_clearing",
            "account_kind": "clearing",
            "owner_id": None,
        },
    ]

    verify = MagicMock(
        return_value={
            "hmac_verified": True,
            "hmac_algo": "HMAC-SHA256",
            "hmac_kid": "k1",
            "hmac_sig_prefix": "abababababab",
        }
    )

    with patch("app.db.fetch_all", AsyncMock(return_value=rows)):
        with patch(
            "app.routes_billing.ledger.verify_transaction_signature", verify
        ):
            response = client.get("/v1/billing/ledger")

    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data) == 1
    assert data[0]["account_code"] == "wallet_test"
    assert all(entry["account_code"] != "paypal_clearing" for entry in data)

    # Verification must still cover the complete transaction, including clearing.
    verified_lines = verify.call_args.kwargs["lines"]
    assert len(verified_lines) == 2
    assert {line["account_code"] for line in verified_lines} == {
        "wallet_test",
        "paypal_clearing",
    }


def test_balance_failure_returns_503(client, auth_override):
    with patch("app.db.fetch_one", AsyncMock(side_effect=RuntimeError("db down"))):
        response = client.get("/v1/billing/balance")

    assert response.status_code == 503
    assert response.json()["detail"]["error"]["code"] == "db_unavailable"


def test_unknown_receipt_returns_404(client, auth_override):
    with patch("app.db.fetch_one", AsyncMock(return_value=None)):
        response = client.get(
            "/v1/billing/receipts/99999999-9999-4999-8999-999999999999"
        )

    assert response.status_code == 404
    assert response.json()["detail"]["error"]["code"] == "receipt_not_found"
