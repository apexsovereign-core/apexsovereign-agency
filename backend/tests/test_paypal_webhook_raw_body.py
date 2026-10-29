"""PayPal webhook verification must consume the raw request body string.

These tests do not call PayPal. They pin the contract that the verifier accepts
the exact UTF-8 body before any caller-side JSON parsing, and that it fails
closed on malformed or non-object bodies.
"""

import json
from typing import Any, Dict
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.paypal_service import PayPalService

PAYPAL_HEADERS: Dict[str, str] = {
    "paypal-transmission-id": "tx-raw-body-1",
    "paypal-transmission-time": "2026-10-28T00:00:00Z",
    "paypal-cert-url": "https://api.paypal.com/v1/notifications/certs/CERT-1",
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-transmission-sig": "test-signature-not-a-secret",
}


class _FakeResponse:
    status_code = 200
    text = ""

    def json(self) -> Dict[str, Any]:
        return {"verification_status": "SUCCESS"}


class _FakeClient:
    def __init__(self) -> None:
        self.calls: list[Dict[str, Any]] = []

    async def post(self, url: str, **kwargs: Any) -> _FakeResponse:
        self.calls.append({"url": url, **kwargs})
        return _FakeResponse()

    async def aclose(self) -> None:
        return None


async def _service_with_fake_client() -> tuple[PayPalService, _FakeClient]:
    service = PayPalService()
    real_client = service._http_client
    fake_client = _FakeClient()
    service._http_client = fake_client  # type: ignore[assignment]
    await real_client.aclose()
    service.get_access_token = _async_token  # type: ignore[method-assign]
    return service, fake_client


async def _async_token() -> str:
    return "test-token-not-a-secret"


@pytest.mark.asyncio
async def test_verification_accepts_raw_body_string() -> None:
    service, fake_client = await _service_with_fake_client()
    raw_body = json.dumps(
        {
            "id": "WH-RAW-1",
            "event_type": "PAYMENT.CAPTURE.COMPLETED",
            "resource": {"id": "CAP-RAW-1", "custom_id": "tenant:100:key"},
        }
    )

    try:
        verified = await service.verify_webhook_signature(PAYPAL_HEADERS, raw_body)
    finally:
        await service.close()

    assert verified is True
    assert len(fake_client.calls) == 1
    payload = fake_client.calls[0]["json"]
    assert payload["webhook_event"] == json.loads(raw_body)
    assert payload["webhook_event"]["id"] == "WH-RAW-1"
    assert payload["webhook_id"]


@pytest.mark.asyncio
async def test_verification_rejects_malformed_json_before_calling_paypal() -> None:
    service, fake_client = await _service_with_fake_client()

    try:
        verified = await service.verify_webhook_signature(PAYPAL_HEADERS, '{"id": ')
    finally:
        await service.close()

    assert verified is False
    assert fake_client.calls == []


@pytest.mark.asyncio
async def test_verification_rejects_non_object_json_before_calling_paypal() -> None:
    service, fake_client = await _service_with_fake_client()

    try:
        verified = await service.verify_webhook_signature(PAYPAL_HEADERS, "[]")
    finally:
        await service.close()

    assert verified is False
    assert fake_client.calls == []


def test_mounted_webhook_passes_exact_raw_body_to_verifier() -> None:
    """The mounted /v1/webhooks/paypal route must verify the raw bytes.

    Sending ``content=`` instead of ``json=`` keeps the wire text exact. If the
    handler parsed and re-serialized first, the field order or spacing would
    change and this assertion would fail.
    """
    raw_text = (
        '{"id":"WH-RAW-BODY","event_type":"CHECKOUT.ORDER.APPROVED",'
        '"resource":{"id":"ORDER-RAW-1"}}'
    )
    verifier = AsyncMock(return_value=True)

    with patch("app.paypal.verify_webhook_signature", verifier):
        with patch("app.db.execute", AsyncMock(return_value=None)):
            response = TestClient(app).post(
                "/v1/webhooks/paypal",
                content=raw_text,
                headers={**PAYPAL_HEADERS, "content-type": "application/json"},
            )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "received"
    kwargs = verifier.await_args.kwargs
    assert isinstance(kwargs["raw_body"], str)
    assert kwargs["raw_body"] == raw_text
