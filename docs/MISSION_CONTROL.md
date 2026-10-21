# APEXSOVEREIGN.AI — EXECUTIVE MISSION CONTROL & OPERATIONS MANUAL

**Authority Level:** System Architecture Director / Acting CEO  
**Operational Status:** ACTIVE PRODUCTION RUNTIME  
**Document Revision:** `v1.0.0-sovereign`  
**Classification:** STRICT COMMERCIAL & SOVEREIGN GOVERNANCE  

---

## 1. LIVE MONITORING & GOVERNANCE INCIDENT RESPONSE PROTOCOLS

The sovereign infrastructure operates under a 4-state deterministic finite state machine defined in PostgreSQL (`public.governance_state`). Operators must execute the exact response protocols defined below upon state transition events:

```
[NOMINAL] <---> [GRID_STRESS] <---> [NETWORK_PARTITION] ---> [SOVEREIGN_LOCKDOWN]
```

### 1.1 State: `NOMINAL`
* **Trigger Conditions:** Database replication lag `< 500ms`, edge latency `< 15ms`, 0 uncollateralized debit attempts.
* **Operational Posture:** Full commercial AI compute arbitrage active. Spot market routing enabled across all 5 energy zones.
* **Operator Action:** Continuous Prometheus/Grafana dashboard observation. No intervention required.

### 1.2 State: `GRID_STRESS`
* **Trigger Conditions:** Regional grid frequency deviation `|Δf| > 0.05 Hz` (e.g. Nordic hydro droop or PJM peak load spike).
* **Automatic Subsystem Behavior:**
  1. `aethelgrid` shifts up to 50% of industrial spot workloads off the affected regional bus.
  2. Idle capacity immediately transitions into AuraPharm AlphaFold3 batch simulations (`DIVERTED_TO_AURAPHARM`).
* **Operator Action:**
  1. Inspect `/api/v1/grid/planetary-overview` for active curtailed megawatts.
  2. If frequency stabilizes within 10 minutes, verify auto-recovery to `NOMINAL`.
  3. If duration exceeds 60 minutes, issue manual zone override via `POST /api/v1/grid/zone/override`.

### 1.3 State: `NETWORK_PARTITION`
* **Trigger Conditions:** Database cross-region replication lag exceeds `500.0ms` or edge transit packet loss `> 5%`.
* **Automatic Subsystem Behavior:**
  1. Database enters read-only replication protection.
  2. High-frequency routing shifts to local cached node registries in `aethelmesh-core`.
  3. New enterprise USD top-up minting holds in queue; existing pre-funded balances continue running locally.
* **Operator Action:**
  1. Inspect PgBouncer pool health (`SHOW POOLS; SHOW STATS;` via admin port `6432`).
  2. Verify WireGuard eBPF tunnel integrity across multi-cloud Kubernetes clusters.
  3. Once lag drops below `50ms`, trigger automatic recovery or execute `rpc_evaluate_circuit_breaker(12.5, FALSE)`.

### 1.4 State: `SOVEREIGN_LOCKDOWN`
* **Trigger Conditions:** Critical breach event: Uncollateralized debit attempt detected, tampered webhook signature, or 3-of-5 multi-sig emergency order.
* **Automatic Subsystem Behavior:**
  1. **Immediate Total Ledger Freeze:** `UPDATE public.credit_balances SET is_frozen = TRUE` executed across all tenant operational accounts.
  2. All external API endpoints short-circuit with `HTTP 503 SERVICE_UNAVAILABLE` or `HTTP 402 PAYMENT_REQUIRED`.
  3. Hot-swap watchdog logs cryptographic incident attestations signed by master ED25519 keys.
* **Operator Action:**
  1. Convene Emergency Multi-Sig Council (3-of-5 authorized signers).
  2. Audit `public.circuit_breaker_events` table for breach details.
  3. Execute multi-sig recovery procedure documented in Section 3.

---

## 2. REVENUE, BILLING & TOKEN VELOCITY AUDIT PROTOCOLS

### 2.1 Fixed Peg Reconciliation ($1.00 USD = 100.000000 CU)
All platform transactions strictly adhere to the invariant:
$$\text{Compute Units (CU)} = \text{Settled USD Amount} \times 100.000000$$

### 2.2 PayPal Webhook Settlement Audit Checklist
1. **Signature & CRC32 Validation:** Verify incoming webhooks contain valid `paypal-transmission-sig` and `paypal-cert-url`.
2. **Double-Entry Ledger Integrity:** Inspect `public.ledger_entries` ensuring:
   - Debit Account: `SOVEREIGN_RESERVE`
   - Credit Account: `TENANT_OPERATIONAL`
   - Entry Type: `DEPOSIT_TOPUP`
3. **Outbound Receipt Dispatch:** Confirm `X-Apex-Signature` HMAC-SHA256 headers received by the n8n receipt generation pipeline.
4. **Contract Verification:** For enterprise deposits $\ge \$5,000\text{ USD}$, confirm SHA-256 hash of the generated Master Services Agreement PDF is stored in `ledger_entries.metadata.contract_sha256`.

---

## 3. SYSTEM ESCALATION MATRIX & MULTI-SIG OVERRIDE PROCEDURES

Administrative state changes, sovereign unlocks, and reserve transfers require **3-of-5 ED25519 Cryptographic Multi-Sig Authorization**.

### Step 1: Create Multi-Sig Proposal
Execute in Supabase SQL console or via `apexctl`:
```sql
INSERT INTO public.multisig_proposals (action_type, target_state, signatures_required)
VALUES ('STATE_TRANSITION', 'NOMINAL', 3)
RETURNING proposal_id;
```

### Step 2: Sign Proposal with Authorized ED25519 Key
Each council member signs the `proposal_id` with their private key and submits the attestation:
```sql
SELECT public.rpc_submit_multisig_signature(
    '<proposal_id>',
    '<signer_public_key_b64>',
    '<ed25519_signature_b64>'
);
```

### Step 3: Automated Execution
Upon collection of the 3rd valid signature:
* `governance_state` transitions immediately back to `NOMINAL`.
* `credit_balances.is_frozen` resets to `FALSE`.
* All live edge routing and settlement gateways resume normal operations.

---

## 4. EMERGENCY CONTACTS & ESCALATION TREE

| Role | Authority | Contact / Signal | Key ID |
| :--- | :--- | :--- | :--- |
| **System Architecture Director** | Full Sovereign Authority | `exec@apexsovereign.ai` | `ED25519_KEY_01` |
| **Lead DevOps & Infrastructure** | Cluster & SMR Operations | `devops@apexsovereign.ai` | `ED25519_KEY_02` |
| **Chief Commercial Officer** | Financial Settlement & MSA | `commercial@apexsovereign.ai` | `ED25519_KEY_03` |
| **Biopharma IP Lead** | AuraPharm Discovery Pipeline | `ip@apexsovereign.ai` | `ED25519_KEY_04` |
| **Security Council Chair** | Emergency Multi-Sig Key 5 | `security@apexsovereign.ai` | `ED25519_KEY_05` |

**MISSION CONTROL CERTIFIED. OPERATIONAL DIRECTIVES IN EFFECT.**
