import express, { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-key';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.apexsovereign.ai/webhook/provision';
const N8N_HMAC_SECRET = process.env.N8N_HMAC_SECRET || 'sovereign-master-n8n-hmac-secret-2026';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Capture raw body for signature verification before JSON parsing
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// -----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// -----------------------------------------------------------------------------
const PayPalWebhookSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  resource: z.object({
    id: z.string(),
    status: z.string(),
    amount: z.object({
      value: z.string().regex(/^\d+(\.\d{1,2})?$/),
      currency_code: z.string().length(3),
    }),
    custom_id: z.string().uuid({ message: "custom_id must match client's Supabase UUID" }),
  }),
});

// Middleware for generic Zod validation
const validateBody = (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'SCHEMA_VALIDATION_ERROR', details: result.error.format() });
  }
  next();
};

// -----------------------------------------------------------------------------
// ROUTE: PAYPAL CAPTURE WEBHOOK & ATOMIC SETTLEMENT DISPATCH
// -----------------------------------------------------------------------------
app.post(
  '/api/v1/webhooks/paypal',
  validateBody(PayPalWebhookSchema),
  async (req: Request, res: Response) => {
    const t0 = performance.now();
    const event = req.body;

    if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
      return res.status(200).json({ status: 'ACKNOWLEDGED_NON_ACTIONABLE' });
    }

    const { custom_id: userId, amount, id: captureId } = event.resource;
    const usdAmount = parseFloat(amount.value);

    try {
      // 1. Execute Atomic RPC Settlement on Supabase ($1.00 = 100 CU)
      const { data: rpcResult, error: rpcError } = await supabase.rpc('credit_user_account_atomic', {
        p_user_id: userId,
        p_amount_usd: usdAmount,
        p_txn_reference: `paypal_capture_${captureId}`,
        p_metadata: {
          gateway: 'PAYPAL_V2',
          capture_id: captureId,
          currency: amount.currency_code,
        },
      });

      if (rpcError) {
        throw new Error(`Supabase Atomic RPC failed: ${rpcError.message}`);
      }

      // 2. Prepare payload for n8n Automated Compute Provisioning Workflow
      const n8nPayload = {
        event_id: crypto.randomUUID(),
        user_id: userId,
        usd_settled: usdAmount,
        cu_credited: usdAmount * 100.0,
        txn_reference: captureId,
        timestamp: Date.now(),
      };

      const rawSerializedPayload = JSON.stringify(n8nPayload);
      const signature = crypto
        .createHmac('sha256', N8N_HMAC_SECRET)
        .update(rawSerializedPayload)
        .digest('hex');

      // 3. Fire non-blocking dispatch to n8n
      fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Apex-Signature': signature,
          'X-Apex-Timestamp': n8nPayload.timestamp.toString(),
        },
        body: rawSerializedPayload,
      }).catch((err) => {
        console.error('[GATEWAY_EXPRESS] n8n dispatch network error:', err);
      });

      const elapsed = (performance.now() - t0).toFixed(2);

      // 4. Log Webhook Audit
      await supabase.from('webhook_audit_logs').insert({
        gateway_source: 'PAYPAL',
        external_event_id: event.id,
        payload_sha256: crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex'),
        raw_payload: event,
        processed_status: 'SUCCESS',
        execution_time_ms: parseFloat(elapsed),
      });

      return res.status(200).json({
        status: 'SUCCESS_SETTLED',
        rpc_result: rpcResult,
        execution_ms: elapsed,
      });
    } catch (err: any) {
      console.error('[GATEWAY_EXPRESS] Settlement Error:', err);
      return res.status(500).json({ error: 'INTERNAL_SETTLEMENT_ERROR', message: err.message });
    }
  }
);

app.get('/health', (_req, res) => {
  res.status(200).json({ service: 'ApexSovereign Gateway Express', status: 'HEALTHY' });
});

app.listen(PORT, () => {
  console.log(`[GATEWAY_EXPRESS] Listening on port ${PORT}`);
});
