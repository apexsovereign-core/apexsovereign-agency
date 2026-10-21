const express = require("express");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || "https://mock.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "mock-service-role-key";
const PAYPAL_WEBHOOK_SECRET =
  process.env.PAYPAL_WEBHOOK_SECRET || "sovereign-paypal-webhook-secret";
const N8N_DISPATCH_WEBHOOK_URL =
  process.env.N8N_DISPATCH_WEBHOOK_URL ||
  "https://n8n.apexsovereign.ai/webhook/provision";

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
 * Validates HMAC signature from PayPal or ACH gateway webhook transmission
 */
function verifyGatewayHmac(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !rawBody) {
    return false;
  }
  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // Constant-time comparison to mitigate timing attacks
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
 * PayPal / ACH Inbound Webhook Listener
 * Endpoint: POST /api/v1/settlement/paypal-webhook
 */
app.post("/api/v1/settlement/paypal-webhook", async (req, res) => {
  const signature =
    req.headers["x-apex-signature"] || req.headers["paypal-transmission-sig"];

  if (!verifyGatewayHmac(req.rawBody, signature, PAYPAL_WEBHOOK_SECRET)) {
    return res.status(401).json({
      error: "UNAUTHORIZED_GATEWAY_SIGNATURE",
      message: "Cryptographic signature verification failed.",
    });
  }

  const event = req.body;
  const eventType = event.event_type;

  // We act on settled payment captures
  if (eventType !== "PAYMENT.CAPTURE.COMPLETED") {
    return res
      .status(200)
      .json({ status: "ACKNOWLEDGED_NON_SETTLEMENT_EVENT" });
  }

  const resource = event.resource || {};
  const userId = resource.custom_id; // Bound User UUID
  const usdAmount = parseFloat(resource.amount?.value || "0.00");
  const captureId = resource.id || `cap_${Date.now()}`;
  const idempotencyKey = `paypal_${captureId}`;

  if (!userId || usdAmount <= 0) {
    return res.status(400).json({
      error: "INVALID_PAYLOAD_STRUCTURE",
      message: "Missing valid user_id (custom_id) or positive USD amount.",
    });
  }

  try {
    // 1. Invoke Atomic Supabase Deposit RPC: $1.00 USD = 100 Compute Units
    const { data: rpcOutcome, error: rpcError } = await supabase.rpc(
      "process_atomic_deposit",
      {
        p_user_id: userId,
        p_usd_amount: usdAmount,
        p_idempotency_key: idempotencyKey,
        p_metadata: {
          source_gateway: "PAYPAL_REST_V2",
          capture_id: captureId,
          currency: resource.amount?.currency_code || "USD",
          event_id: event.id,
        },
      },
    );

    if (rpcError) {
      console.error("[AETHELPAY_ERROR] Supabase RPC Failed:", rpcError.message);
      return res.status(500).json({
        error: "SETTLEMENT_DATABASE_FAILURE",
        details: rpcError.message,
      });
    }

    // 2. Prepare HMAC dispatch for n8n automated compute provisioning workflow
    const n8nPayload = {
      event_id: crypto.randomUUID(),
      user_id: userId,
      usd_amount: usdAmount,
      cu_credited: usdAmount * 100.0,
      idempotency_key: idempotencyKey,
      timestamp: Date.now(),
    };

    const rawN8nBody = JSON.stringify(n8nPayload);
    const n8nSig = crypto
      .createHmac("sha256", PAYPAL_WEBHOOK_SECRET)
      .update(rawN8nBody)
      .digest("hex");

    // Fire non-blocking dispatch to n8n
    fetch(N8N_DISPATCH_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Apex-Signature": n8nSig,
        "X-Apex-Timestamp": n8nPayload.timestamp.toString(),
      },
      body: rawN8nBody,
    }).catch((err) => {
      console.error(
        "[AETHELPAY_WARN] n8n dispatch network error:",
        err.message,
      );
    });

    return res.status(200).json({
      status: "SUCCESS_SETTLED",
      user_id: userId,
      usd_deposited: usdAmount,
      cu_minted: usdAmount * 100.0,
      rpc_result: rpcOutcome,
    });
  } catch (err) {
    console.error("[AETHELPAY_CRITICAL] Webhook processing exception:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ONLINE",
    service: "AethelPay Atomic Financial Ledger Express Gateway",
    conversion_rate: "$1.00 USD = 100 CU",
  });
});

app.listen(PORT, () => {
  console.log(
    `[AETHELPAY_EXPRESS] Settlement gateway listening on port ${PORT}`,
  );
});
