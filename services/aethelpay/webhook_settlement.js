// services/aethelpay/webhook_settlement.js
// ApexSovereign Holdings - AethelPay Atomic Settlement Webhook Handler
// Peg: $1.00 USD = 100.000000 Compute Units (CU)

const express = require("express");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://db.apexsovereign.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "mock-service-role-key";
const PAYPAL_WEBHOOK_SECRET =
  process.env.PAYPAL_WEBHOOK_SECRET || "sovereign-live-webhook-secret";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Middleware to capture the exact raw buffer for HMAC verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

/**
 * Validates HMAC signature using constant-time comparison to prevent timing attacks.
 */
function verifyGatewayHmac(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !rawBody) {
    return false;
  }
  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, "hex"),
      Buffer.from(expectedHmac, "hex"),
    );
  } catch (_) {
    return false;
  }
}

/**
 * Inbound Webhook Listener
 * Endpoint: POST /api/v1/settlement/webhook
 */
app.post("/api/v1/settlement/webhook", async (req, res) => {
  const signature =
    req.headers["x-apex-signature"] || req.headers["paypal-transmission-sig"];

  if (!verifyGatewayHmac(req.rawBody, signature, PAYPAL_WEBHOOK_SECRET)) {
    return res.status(401).json({
      error: "UNAUTHORIZED_SIGNATURE",
      message: "Cryptographic signature verification failed.",
    });
  }

  const { event_type, custom_id, amount, id: webhookEventId } = req.body;

  if (event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return res.status(200).json({ status: "IGNORED_EVENT_TYPE", event_type });
  }

  const tenantId = custom_id;
  const usdAmount = parseFloat(amount?.value || amount);

  if (!tenantId || isNaN(usdAmount) || usdAmount <= 0) {
    return res.status(400).json({
      error: "MALFORMED_PAYLOAD",
      message: "Missing or invalid tenant custom_id and payment amount.",
    });
  }

  try {
    // Atomically execute PostgreSQL Stored Procedure with Row-Level Lock
    const { data, error } = await supabase.rpc("rpc_settle_usd_deposit", {
      p_tenant_id: tenantId,
      p_usd_amount: usdAmount,
      p_reference_id: `tx-${webhookEventId || Date.now()}`,
      p_metadata: {
        raw_event_id: webhookEventId,
        source_gateway: "PAYPAL_REST_V2",
        settled_at: new Date().toISOString(),
      },
    });

    if (error) {
      console.error("[SETTLEMENT_RPC_ERROR]", error);
      return res.status(500).json({
        error: "LEDGER_SETTLEMENT_FAILED",
        details: error.message,
      });
    }

    return res.status(200).json({
      status: "SETTLEMENT_SUCCESSFUL",
      settlement_record: data,
    });
  } catch (err) {
    console.error("[SETTLEMENT_FATAL_ERROR]", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ONLINE",
    service: "AethelPay Ledger Gateway",
    peg: "$1.00 USD = 100.000000 CU",
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[AETHELPAY_GATEWAY] Listening on port ${PORT}`);
  });
}

module.exports = app;
