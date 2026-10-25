const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");

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

test("AethelPay Webhook HMAC verification succeeds with matching key and body", () => {
  const secret = "super-secret-production-key-999";
  const rawBody = Buffer.from(
    JSON.stringify({
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      amount: "100.00",
    }),
  );
  const signature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const isValid = verifyGatewayHmac(rawBody, signature, secret);
  assert.strictEqual(isValid, true, "HMAC signature should validate cleanly");
});

test("AethelPay Webhook HMAC verification fails with tampered payload", () => {
  const secret = "super-secret-production-key-999";
  const rawBody = Buffer.from(
    JSON.stringify({
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      amount: "100.00",
    }),
  );
  const tamperedBody = Buffer.from(
    JSON.stringify({
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      amount: "99999.00",
    }),
  );
  const signature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const isValid = verifyGatewayHmac(tamperedBody, signature, secret);
  assert.strictEqual(
    isValid,
    false,
    "Tampered payload signature must be rejected",
  );
});
