"""Test bootstrap: deterministic env before importing the FastAPI app."""

import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Deterministic test-only values. These are not production secrets and are never
# used outside the test process.
os.environ["ENV"] = "test"
os.environ["DEMO_MODE"] = "true"
os.environ["DATABASE_URL"] = "postgresql://test:test@127.0.0.1:5432/apex_test"
os.environ["SUPABASE_JWT_SECRET"] = "test-jwt-secret-not-for-production"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000,http://localhost:5173"
os.environ["LEDGER_HMAC_KID"] = "k1"
os.environ["LEDGER_HMAC_KEYS_JSON"] = (
    '{"k1":"test-ledger-hmac-secret-32-bytes-minimum","v1":"test-rotated-key"}'
)
os.environ["WAITLIST_IP_SALT"] = "test-waitlist-salt"
os.environ["PAYPAL_ENV"] = "sandbox"
os.environ["PAYPAL_CLIENT_ID"] = "test-paypal-client-id"
os.environ["PAYPAL_CLIENT_SECRET"] = "test-paypal-client-secret"
os.environ["PAYPAL_WEBHOOK_ID"] = "WH-TEST-12345"
os.environ["PROVIDER_MODE"] = "simulated"

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.security import get_current_user  # noqa: E402

TEST_USER_ID = "11111111-1111-4111-8111-111111111111"
OTHER_USER_ID = "22222222-2222-4222-8222-222222222222"


@pytest.fixture
def client():
    # No context manager: tests do not start the real DB lifespan.
    return TestClient(app)


@pytest.fixture
def auth_override():
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": TEST_USER_ID,
        "email": "test@apexsovereign.ai",
        "auth_type": "test",
    }
    yield
    app.dependency_overrides.pop(get_current_user, None)
