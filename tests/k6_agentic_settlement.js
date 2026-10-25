// tests/k6_agentic_settlement.js
// Enterprise Load-Testing Suite for ApexSovereign.ai
// Target: 5,000 concurrent agentic micro-debits per second with HMAC-SHA256 signature generation

import http from 'k6/http';
import { check, sleep } from 'k6';
import crypto from 'k6/crypto';

export const options = {
  scenarios: {
    constant_request_rate: {
      executor: 'constant-arrival-rate',
      rate: 5000,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 500,
      maxVUs: 2000,
    },
  },
  thresholds: {
    http_req_duration: ['p(99)<18'], // Sub-18ms SLA enforcement
    http_req_failed: ['rate<0.001'],  // < 0.1% failure tolerance
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://127.0.0.1:3000';
const HMAC_SECRET = __ENV.APEX_SETTLEMENT_HMAC_SECRET || 'sovereign_settlement_master_key_2026';

export default function () {
  const vuId = __VU;
  const iterId = __ITER;
  const timestamp = Date.now();
  const tenantId = `tenant-benchmark-${vuId % 50}`;
  const workloadId = `wl-stress-${vuId}-${iterId}`;
  const idempotencyKey = `idemp_k6_${vuId}_${iterId}_${timestamp}`;

  const tokenCount = 2048;
  const cuRateMultiplier = 1.0;

  const payload = JSON.stringify({
    tenant_id: tenantId,
    workload_id: workloadId,
    token_count: tokenCount,
    cu_rate_multiplier: cuRateMultiplier,
    idempotency_key: idempotencyKey,
    nonce: iterId,
    timestamp_epoch_ms: timestamp,
  });

  const canonicalMessage = `${tenantId}:${workloadId}:${tokenCount}:${cuRateMultiplier}:${idempotencyKey}:${iterId}:${timestamp}`;
  const signature = crypto.hmac('sha256', HMAC_SECRET, canonicalMessage, 'hex');

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Apex-Signature': signature,
      'X-Apex-Timestamp': timestamp.toString(),
    },
    timeout: '5s',
  };

  const res = http.post(`${BASE_URL}/v1/settlement/micro-debit`, payload, params);

  check(res, {
    'status is 200 (finality confirmed)': (r) => r.status === 200,
    'latency is within sub-18ms SLA': (r) => r.timings.duration < 18,
    'idempotency respected on response': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.idempotency_key === idempotencyKey;
      } catch (e) {
        return false;
      }
    },
  });
}
