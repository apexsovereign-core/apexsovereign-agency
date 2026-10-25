# APEXSOVEREIGN.AI — SOVEREIGN COMPUTE EXCHANGE & ARBITRAGE MESH

ApexSovereign.ai is a sovereign GPU compute exchange and spot arbitrage mesh. Customers buy GPU capacity at market rates (H100, B200, A100, L40S) across 11 legal jurisdictions with prepaid compute credits ($1.00 = 100 CU).

---

## 1. ARCHITECTURE & ZERO-COLLISION DATABASE ISOLATION

* **Frontend:** Single-file enterprise SPA (`index.html`) deployed on Vercel Edge with strict Content Security Policy and edge rewrites.
* **Backend:** FastAPI high-throughput mesh on Render (`apexsovereign-mesh.onrender.com`).
* **Database Isolation:** Supabase Postgres 17. All platform objects reside in a dedicated schema named `apex`. Existing legacy tables in schema `public` (`ledger_entries`, `token_ledger`, etc.) are completely unreferenced, isolated, and protected. Legacy RPCs have execution revoked from public/anon/authenticated roles.
* **Accounting Model:** Double-entry immutable ledger signed with HMAC-SHA256 (`$1.00 = 100 CU` integer precision).
* **Payments:** PayPal REST API v2 server-side orders and capture with cryptographic webhook verification.

---

## 2. REAL VS. SIMULATED DISCLOSURE MATRIX

| Component | In Simulated Mode (`simulated`) | In Production Supplier Mode (`supplier`) |
| :--- | :--- | :--- |
| **Market Rates** | Reference baselines (`price_source: "reference"`) | Live upstream pricing (`price_source: "supplier"`) |
| **Hardware Provisioning** | Realistic simulation (`demo: true`, 0 CU charges) | Physical hardware allocation via supplier API |
| **Escrow & Ledger** | Zero ledger debits or charges | Double-entry wallet deduction to escrow on allocation |
| **Billing Settlement** | PayPal Sandbox testing | PayPal Live API (strictly gated by Rule 4) |
| **Mesh Nodes** | 14 real geographic cities & coordinates | 14 real geographic cities & coordinates |

---

## 3. ORDERED DEPLOYMENT RUNBOOK

### Step 1: Database Migration (Supabase SQL Editor)
1. Open your Supabase Project Dashboard (`ap-southeast-1`).
2. Navigate to the SQL Editor.
3. Run `supabase/migrations/001_apex_core.sql` to instantiate the `apex` schema, charts of accounts, RLS policies, and functions.
4. Run `supabase/migrations/002_legacy_function_hardening.sql` to revoke public execution privileges on legacy RPCs.

### Step 2: Render Backend Web Service & Crons
1. Log in to Render and create a new Web Service using Blueprint or Manual creation.
2. Service Name: `apexsovereign-mesh` (Hostname: `apexsovereign-mesh.onrender.com`).
3. Runtime: Python 3.12, Root Directory: `backend`.
4. Build Command: `pip install -r requirements.txt`.
5. Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2 --proxy-headers`.
6. Health Check Path: `/health`.
7. Configure Environment Variables as specified in `.env.example`.

### Step 3: PayPal Sandbox Configuration
1. Log in to developer.paypal.com.
2. Create an App under Sandbox with USD support.
3. Register a Webhook pointing to `https://www.apexsovereign.ai/v1/webhooks/paypal` subscribing to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, and `CUSTOMER.DISPUTE.CREATED`.
4. Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID` on Render.

### Step 4: Vercel Frontend Deployment
1. Connect GitHub repository to Vercel.
2. Framework Preset: Other (Static HTML).
3. Root Directory: `./`.
4. Deploy. Vercel automatically applies rewrites from `vercel.json` routing `/health`, `/v1/*`, and `/api/*` to Render.
5. Place a 1200×630 `og.png` social share image in the root directory.

---

## 4. GO-LIVE CHECKLIST FOR REAL MONEY (PRODUCTION SUPPLIER CUTOVER)

Before enabling real live credit card or PayPal processing, the operator must complete this verification:

- [ ] **Supplier Master Agreement:** Commercial agreement signed with GPU compute supplier and upstream REST API credentials verified via `self_test()`.
- [ ] **PayPal Live Production App:** Approved for live transactions; live webhook ID registered at `https://www.apexsovereign.ai/v1/webhooks/paypal`.
- [ ] **Legal Counsel Review:** Terms of Service, Privacy Policy, Acceptable Use Policy, and Refund schedules reviewed and approved.
- [ ] **Refund & Dispute Operations:** Dedicated team staffed to monitor `CUSTOMER.DISPUTE.CREATED` events and manage PayPal resolutions within 48 hours.
- [ ] **Sanctions & KYC Enforcement:** Jurisdiction blocking verified against OFAC/sanctions lists.
- [ ] **Tax & Invoicing:** Tax collection and jurisdictional invoicing rules established.
- [ ] **Native Translation Review:** All 8 supported language dictionaries reviewed by native speakers.
- [ ] **Telemetry & Alerting:** Sentry DSN configured; Render uptime alerts active on `/health`.
- [ ] **Disaster Recovery:** Automated Supabase backups verified and tested for point-in-time restore.
- [ ] **Production Variable Cutover:** Set the following environment variables on Render:
  ```bash
  PAYPAL_ENV=live
  PROVIDER_MODE=supplier
  LAUNCH_MODE=live
  LIVE_PAYMENTS_ACK=I_CONFIRM_SERVICE_CAN_BE_DELIVERED
  ```
