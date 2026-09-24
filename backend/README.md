# ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker

Production-grade FastAPI backend architected for extreme horizontal scalability, asynchronous PostgreSQL pooling (via Supabase / `asyncpg`), idempotent double-entry financial ledgers, and cryptographically verified PayPal webhook ingestion.

---

## 🏛️ Architectural Pillars

1. **Zero-Trust Environment & Configuration (`backend/app/config.py`)**:
   - `require_env(name: str)` utility guarantees zero hardcoded secrets or raw connection strings in codebase files.
   - Raises `MissingEnvironmentVariableError` on missing or empty secrets with zero silent failure fallbacks.

2. **Asynchronous Database Pool with SSL Enforcement (`backend/app/db/session.py`)**:
   - High-throughput `asyncpg.create_pool` with tuned connection limits (`min_size=5`, `max_size=20`, `command_timeout=60s`).
   - Strict SSL context enforcement designed specifically for Supabase transaction poolers (port 6543).

3. **Idempotent Financial Ledger & Row-Level Locking (`backend/app/services/ledger_service.py` & `schema.sql`)**:
   - Double-entry accounting structure with `SELECT ... FOR UPDATE` row locks on tenant credit balances.
   - Replay defense (`IdempotencyManager`) guaranteeing zero duplicate charges or double-dispatches under concurrent retries.

4. **Cryptographic Payment & Webhook Gateway (`backend/app/services/paypal_service.py`)**:
   - PayPal v2 REST client with asynchronous OAuth2 token caching.
   - Cryptographic Webhook signature verification against PayPal `/v1/notifications/verify-webhook-signature` using `PAYPAL_WEBHOOK_ID`.
   - SSRF protection validating certificate URLs strictly originate from `api.paypal.com` or `api-m.paypal.com`.

5. **Compute Broker & Modular Work OS Router (`backend/app/api/v1/`)**:
   - `/health`: Liveness & readiness probes for Render container health checks.
   - `/compute/dispatch`: Upfront hardware tier cost estimation, credit reservation, and cryptographically signed worker lease tokens (`HMAC-SHA256`).
   - `/billing/webhook`: Verified PayPal event ingestion and idempotent balance allocation.
   - `/workflow/tasks`: Work OS task lifecycle and DAG orchestration.
   - Strict `X-API-Key` validation using `secrets.compare_digest` to prevent timing attacks.

---

## 🚀 Quickstart & Local Execution

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and populate:
```env
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require"
PAYPAL_CLIENT_ID="your_paypal_client_id"
PAYPAL_CLIENT_SECRET="your_paypal_client_secret"
PAYPAL_WEBHOOK_ID="WH-91827364501928374"
PAYPAL_MODE="sandbox"
APP_SECRET_API_KEY="generate-a-random-server-side-secret"
ENVIRONMENT="development"
PORT=3000
```

### 3. Apply PostgreSQL Schema
Execute `backend/app/db/schema.sql` in the Supabase SQL Editor.

### 4. Run Server
```bash
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 3000 --reload
```

Interactive OpenAPI docs will be available at: `http://localhost:3000/docs`

---

## 🚢 Render Deployment (Infrastructure as Code)

Deploy instantly to Render using the included `render.yaml`:
1. In Render Dashboard, click **New +** -> **Blueprint**.
2. Connect your Git repository.
3. Render reads `render.yaml` and auto-configures the Web Service, health check (`/health`), and environment variable prompts.
4. Add your secrets (`DATABASE_URL`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`) in the Render environment panel.
