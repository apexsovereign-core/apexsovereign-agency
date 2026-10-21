# APEXSOVEREIGN.AI — TENANT QUICKSTART INTEGRATION GUIDE
**Target:** AI Engineers, Infrastructure Developers, Data Scientists  
**Integration Time:** Under 5 minutes  
**Compatibility:** 100% Drop-in replacement for OpenAI SDK, Anthropic SDK, and raw REST API  

---

### 1. ENVIRONMENT CONFIGURATION
Acquire your API key from the onboarding confirmation payload or dashboard, then export it:

```bash
export APEX_API_KEY="apex_live_sk_xxxxxxxxxxxxxxxxxxxxxxxx"
export APEX_BASE_URL="https://api.apexsovereign.ai/v1"
```

---

### 2. PYTHON INTEGRATION (OPENAI SDK COMPATIBLE)
Simply change the `base_url` parameter. No existing pipeline or application code needs rewriting:

```python
import os
from openai import OpenAI

# Initialize client targeting ApexSovereign low-latency routing mesh
client = OpenAI(
    api_key=os.environ.get("APEX_API_KEY"),
    base_url=os.environ.get("APEX_BASE_URL")
)

# Execute inference request against arbitrated H100 SXM5 compute
completion = client.chat.completions.create(
    model="h100-sxm5-arbitrage",
    messages=[
        {"role": "system", "content": "You are an autonomous high-throughput reasoning engine."},
        {"role": "user", "content": "Benchmark token generation latency on distributed mesh."}
    ],
    temperature=0.1,
    max_tokens=2048
)

print("Status: 200 OK")
print(completion.choices[0].message.content)
```

---

### 3. RAW HIGH-PERFORMANCE RUST / HTTP EXECUTION
Direct low-latency route discovery and workload dispatch via raw HTTP socket:

```bash
curl -X POST "https://api.apexsovereign.ai/api/v1/mesh/route" \
  -H "Authorization: Bearer ${APEX_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "gpu_model": "H100_SXM5",
    "required_vram_gb": 80,
    "max_cost_per_hr": 1.85,
    "max_latency_ms": 18.0
  }'
```

#### Expected Sub-18ms JSON Response:
```json
{
  "selected_node_id": "cluster-iceland-geo-01",
  "location_region": "EU-NORTH-IS",
  "power_source": "GEOTHERMAL_CLEAN",
  "spot_price_usd_hr": 1.42,
  "estimated_latency_ms": 11.8,
  "savings_percentage": 63.12,
  "action": "LOCK_AND_DISPATCH"
}
```

---

### 4. MONITORING BALANCE & ARBITRAGE MARGINS
Query your current live Compute Unit balance programmatically:

```bash
curl -X GET "https://pay.apexsovereign.ai/api/v1/tenant/balance" \
  -H "Authorization: Bearer ${APEX_API_KEY}"
```

```json
{
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "cu_balance": 50000.0000,
  "usd_equivalent": 500.00,
  "rate_multiplier": 1.0,
  "status": "ACTIVE_UNLOCKED"
}
```
