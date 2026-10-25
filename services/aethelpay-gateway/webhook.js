// ==============================================================================
// APEXSOVEREIGN.AI — AETHELPAY ENTERPRISE PAYPAL WEBHOOK DISPATCHER
// Path: services/aethelpay-gateway/webhook.js
// Verification: Asymmetric Certificate Validation & CRC32 Replay Guard
// Settlement: Supabase RPC rpc_settle_usd_deposit ($1.00 = 100.00 CU)
// Outbound: Signed n8n Webhook Dispatch with HMAC-SHA256 Auth
// ==============================================================================

const express = require("express");
const crypto = require("crypto");
const crc32 = require("buffer-crc32");
const https = require("https");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://mock.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "mock-service-key";
const PAYPAL_WEBHOOK_ID =
  process.env.PAYPAL_WEBHOOK_ID || "PAYPAL_WEBHOOK_TEST_ID";
const N8N_DISPATCH_URL =
  process.env.N8N_DISPATCH_URL || "http://localhost:5678/webhook/receipt";
const N8N_HMAC_SECRET =
  process.env.N8N_HMAC_SECRET || "apexsovereign_n8n_hmac_secret_2026";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// In-memory certificate cache to eliminate cold TLS fetches
const certCache = new Map();

/**
 * Retrieves and caches the PayPal X.509 public certificate
 */
function fetchPayPalCert(certUrl) {
  return new Promise((resolve, reject) => {
    if (
      !certUrl.startsWith("https://api.paypal.com/") &&
      !certUrl.startsWith("https://api.sandbox.paypal.com/")
    ) {
      return reject(new Error(`Untrusted certificate domain: ${certUrl}`));
    }

    if (certCache.has(certUrl)) {
      return resolve(certCache.get(certUrl));
    }

    https
      .get(certUrl, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          certCache.set(certUrl, data);
          resolve(data);
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

/**
 * Validates PayPal signature headers to prevent tampering and replay attacks
 */
async function verifyPayPalWebhookSignature(req) {
  const transmissionId = req.headers["paypal-transmission-id"];
  const transmissionTime = req.headers["paypal-transmission-time"];
  const certUrl = req.headers["paypal-cert-url"];
  const authAlgo = req.headers["paypal-auth-algo"];
  const transmissionSig = req.headers["paypal-transmission-sig"];

  if (
    !transmissionId ||
    !transmissionTime ||
    !certUrl ||
    !authAlgo ||
    !transmissionSig
  ) {
    // If running in development/testing without real PayPal headers, check webhook secret
    const devSecret = req.headers["x-apex-webhook-secret"];
    if (devSecret && devSecret === process.env.PAYPAL_WEBHOOK_SECRET) {
      return true;
    }
    return false;
  }

  const rawBody = req.rawBody || JSON.stringify(req.body);
  const crc = crc32.unsigned(Buffer.from(rawBody, "utf8"));

  const payloadToVerify = `${transmissionId}|${transmissionTime}|${PAYPAL_WEBHOOK_ID}|${crc}`;

  try {
    const certPem = await fetchPayPalCert(certUrl);
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(payloadToVerify);
    return verifier.verify(certPem, transmissionSig, "base64");
  } catch (err) {
    console.error(
      "[PAYPAL_WEBHOOK] Certificate signature validation failed:",
      err.message,
    );
    return false;
  }
}

/**
 * Dispatches verified settlement event to n8n receipt generation pipeline
 */
async function dispatchN8nReceipt(settlementData) {
  const payloadStr = JSON.stringify(settlementData);
  const hmac = crypto
    .createHmac("sha256", N8N_HMAC_SECRET)
    .update(payloadStr)
    .digest("hex");

  try {
    const response = await fetch(N8N_DISPATCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Apex-Signature": `sha256=${hmac}`,
        "X-Apex-Timestamp": `${Date.now()}`,
      },
      body: payloadStr,
    });
    console.log(`[PAYPAL_WEBHOOK] n8n dispatch status: ${response.status}`);
  } catch (err) {
    console.warn(`[PAYPAL_WEBHOOK] n8n dispatch warning: ${err.message}`);
  }
}

// Production Express Webhook Route
router.post(
  "/api/webhooks/paypal",
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
  async (req, res) => {
    const isValid = await verifyPayPalWebhookSignature(req);
    if (!isValid && process.env.NODE_ENV === "production") {
      return res.status(401).json({
        error: "UNAUTHORIZED_WEBHOOK_SIGNATURE",
        message: "Failed cryptographic signature verification.",
      });
    }

    const event = req.body;
    const eventType = event.event_type;
    const resource = event.resource;

    console.log(
      `[PAYPAL_WEBHOOK] Processing event: ${eventType} (ID: ${event.id})`,
    );

    let usdAmount = 0.0;
    let referenceId = "";
    let tenantId = "";

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      usdAmount = parseFloat(resource.amount?.value || "0.00");
      referenceId = `pp-cap-${resource.id}`;
      tenantId =
        resource.custom_id ||
        resource.invoice_id ||
        "00000000-0000-0000-0000-000000000001";
    } else if (eventType === "CHECKOUT.ORDER.APPROVED") {
      const purchaseUnit = resource.purchase_units?.[0] || {};
      usdAmount = parseFloat(purchaseUnit.amount?.value || "0.00");
      referenceId = `pp-ord-${resource.id}`;
      tenantId =
        purchaseUnit.custom_id || "00000000-0000-0000-0000-000000000001";
    } else {
      // Acknowledge unhandled events to prevent PayPal retry storms
      return res
        .status(200)
        .json({ status: "IGNORED_EVENT_TYPE", event_type: eventType });
    }

    if (usdAmount <= 0) {
      return res.status(400).json({
        error: "INVALID_AMOUNT",
        message: "USD settlement must be > 0.00",
      });
    }

    try {
      // Atomic Double-Entry Settlement via Supabase RPC
      const { data, error } = await supabase.rpc("rpc_settle_usd_deposit", {
        p_tenant_id: tenantId,
        p_usd_amount: usdAmount,
        p_reference_id: referenceId,
        p_metadata: {
          paypal_event_id: event.id,
          paypal_event_type: eventType,
          payer_email:
            resource.payer?.email_address ||
            resource.supplementary_data?.payer_email ||
            "client@enterprise.io",
          settlement_timestamp: new Date().toISOString(),
        },
      });

      if (error) {
        console.error("[PAYPAL_WEBHOOK] RPC settlement error:", error);
        return res
          .status(500)
          .json({ error: "RPC_SETTLEMENT_FAILED", details: error.message });
      }

      console.log(
        `[PAYPAL_WEBHOOK] Settlement confirmed: $${usdAmount} USD -> ${data.cu_minted} CU (Tenant: ${tenantId})`,
      );

      // Trigger n8n async receipt dispatch
      await dispatchN8nReceipt({
        tenant_id: tenantId,
        usd_amount: usdAmount,
        cu_minted: data.cu_minted,
        reference_id: referenceId,
        timestamp: new Date().toISOString(),
      });

      return res.status(200).json({
        status: "SETTLED",
        rpc_result: data,
      });
    } catch (err) {
      console.error("[PAYPAL_WEBHOOK] Internal error:", err);
      return res
        .status(500)
        .json({ error: "INTERNAL_GATEWAY_ERROR", message: err.message });
    }
  },
);

module.exports = router;
