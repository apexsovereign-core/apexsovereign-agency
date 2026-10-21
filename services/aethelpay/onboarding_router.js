// ==============================================================================
// APEXSOVEREIGN.AI — AUTOMATED CLIENT ONBOARDING & CREDENTIAL ROUTER
// Path: services/aethelpay/onboarding_router.js
// Target: Webhook Payment Verification, Credit Allocation, and API Key Issuance
// ==============================================================================

const express = require("express");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://db.apexsovereign.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "mock-service-role-key";
const PAYPAL_WEBHOOK_SECRET =
  process.env.PAYPAL_WEBHOOK_SECRET || "sovereign-paypal-webhook-secret";
const N8N_DISPATCH_WEBHOOK_URL =
  process.env.N8N_DISPATCH_WEBHOOK_URL ||
  "https://n8n.apexsovereign.ai/webhook/onboard";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * Constant-time HMAC-SHA256 signature verification.
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
 * Generates an unhashed API key for client distribution and stores its SHA-256 hash.
 */
function generateTenantApiKey(tenantId) {
  const entropy = crypto.randomBytes(32).toString("hex");
  const rawApiKey = `apex_live_sk_${entropy}`;
  const keyHash = crypto.createHash("sha256").update(rawApiKey).digest("hex");
  return { rawApiKey, keyHash };
}

/**
 * Automated Enterprise Onboarding Endpoint
 * POST /api/v1/onboarding/payment-success
 */
router.post("/payment-success", async (req, res) => {
  const signature =
    req.headers["x-apex-signature"] || req.headers["paypal-transmission-sig"];

  // 1. Enforce Cryptographic Webhook Authenticity
  if (!verifyGatewayHmac(req.rawBody, signature, PAYPAL_WEBHOOK_SECRET)) {
    return res.status(401).json({
      error: "UNAUTHORIZED_SIGNATURE",
      message: "Cryptographic signature verification failed.",
    });
  }

  const {
    tenant_id: tenantId,
    client_email: clientEmail,
    usd_amount: rawAmount,
    transaction_id: txId,
    cluster_preference: clusterPref,
  } = req.body;

  if (!tenantId || !rawAmount || !clientEmail) {
    return res.status(400).json({
      error: "INVALID_PAYLOAD",
      message:
        "Missing mandatory onboarding fields: tenant_id, client_email, usd_amount.",
    });
  }

  const usdAmount = parseFloat(rawAmount);
  if (isNaN(usdAmount) || usdAmount <= 0) {
    return res.status(400).json({
      error: "INVALID_AMOUNT",
      message: "usd_amount must be a positive decimal value.",
    });
  }

  try {
    // 2. Execute Atomic Credit Allocation RPC ($1.00 USD = 100 CU)
    const { data: rpcOutcome, error: rpcError } = await supabase.rpc(
      "allocate_gpu_credits",
      {
        p_tenant_id: tenantId,
        p_usd_amount: usdAmount,
        p_reference_id: txId || `tx-onboard-${Date.now()}`,
      },
    );

    if (rpcError) {
      console.error(
        "[ONBOARDING_ERROR] allocate_gpu_credits failed:",
        rpcError,
      );
      return res.status(500).json({
        error: "LEDGER_SETTLEMENT_FAILED",
        details: rpcError.message,
      });
    }

    // 3. Issue and Hash Production API Key
    const { rawApiKey, keyHash } = generateTenantApiKey(tenantId);

    const { error: keyStoreError } = await supabase
      .from("tenant_api_keys")
      .insert({
        tenant_id: tenantId,
        key_hash: keyHash,
        key_prefix: rawApiKey.substring(0, 16),
        status: "ACTIVE",
        created_at: new Date().toISOString(),
      });

    if (keyStoreError) {
      console.warn(
        "[ONBOARDING_WARN] Key store record deferred or conflict:",
        keyStoreError.message,
      );
    }

    // 4. Dispatch Welcome Credentials & Onboarding Payload via n8n
    const n8nPayload = {
      event: "CLIENT_ONBOARDED_SUCCESS",
      tenant_id: tenantId,
      client_email: clientEmail,
      raw_api_key: rawApiKey,
      usd_funded: usdAmount,
      cu_minted: usdAmount * 100.0,
      cluster_preference: clusterPref || "H100_SXM5",
      endpoint: "https://api.apexsovereign.ai/v1",
      timestamp: Date.now(),
    };

    const n8nRaw = JSON.stringify(n8nPayload);
    const n8nSignature = crypto
      .createHmac("sha256", process.env.N8N_HMAC_SECRET || "n8n-default-secret")
      .update(n8nRaw)
      .digest("hex");

    fetch(N8N_DISPATCH_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Apex-Signature": n8nSignature,
      },
      body: n8nRaw,
    }).catch((err) => {
      console.error(
        "[ONBOARDING_WARN] n8n dispatch network exception:",
        err.message,
      );
    });

    return res.status(200).json({
      status: "ONBOARDING_COMPLETED",
      tenant_id: tenantId,
      usd_funded: usdAmount,
      cu_allocated: usdAmount * 100.0,
      api_key: rawApiKey,
      endpoint: "https://api.apexsovereign.ai/v1",
    });
  } catch (err) {
    console.error("[ONBOARDING_CRITICAL] Unhandled onboarding exception:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

module.exports = router;
