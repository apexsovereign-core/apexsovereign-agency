# APEXSOVEREIGN.AI — PRODUCTION SITE RELIABILITY OPERATIONAL RUNBOOK
**Document ID:** RUNBOOK-SRE-2026-v1.0  
**Target Environment:** ApexSovereign Production Cluster (`apexsovereign-prod`)  
**SLA Baseline:** 99.999% Service Availability | $<1000\,\text{ms}$ Stateful Failover Cutover  

---

## 1. System Overview & Core Invariants
ApexSovereign.ai is a hybrid B2B SaaS compute orchestration utility providing sovereign AI infrastructure with institutional SLA guarantees. The production runtime is backed by:
- **Compute Layer:** Multi-tenant Kubernetes cluster with Horizontal Pod Autoscaling (3 to 15 replicas) and Pod Disruption Budgets (PDB minAvailable: 2).
- **Network Routing:** Cloudflare Anycast Global Load Balancing with sub-200ms latency failover triggers.
- **Failover & eBPF Engine:** eBPF `sockmap` TCP socket redirection with hot standby nodes running over 400Gbps InfiniBand RDMA.
- **Storage & Financial Ledger:** Supabase PostgreSQL with strict Row Level Security (RLS) and cryptographic SHA-256 Merkle chaining.

---

## 2. Emergency Incident Response Matrix

### Scenario A: API P99 Latency SLA Breach (>500ms for >30s)
1. **Alert Identifier:** `APILatencySLABreach`
2. **Immediate Action:**
   * Scale up backend pods immediately:
     ```bash
     kubectl scale deployment apexsovereign-backend --replicas=10 -n apexsovereign-prod
     ```
   * Query top latency routes via Prometheus:
     ```promql
     topk(5, histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[1m])) by (le, path)))
     ```
   * Check connection pool usage in Supabase.

### Scenario B: Spot Eviction Preemption & Hot-Swap Incident
1. **Alert Identifier:** `SpotFailoverCutoverExceeded`
2. **Immediate Action:**
   * Check eviction logs:
     ```bash
     curl -s "https://apexsovereign.ai/v1/orchestration/eviction-notice" | jq .
     ```
   * Verify eBPF socket redirection was completed under 1000ms. If cutover exceeded 1000ms, confirm that `$250` compensation credit was automatically issued to affected tenant ledgers via `sla_escrow_reserves`.
   * Verify pre-warmed standby node takeover via DaemonSet `apexsovereign-warm-standby-sentinel`.

### Scenario C: SLA Escrow Liquidity Depletion (<$400,000.00 USD)
1. **Alert Identifier:** `EscrowReservePoolDepletion`
2. **Immediate Action:**
   * Query liquid reserves standing:
     ```bash
     curl -s "https://apexsovereign.ai/v1/orchestration/escrow-reserves" | jq .
     ```
   * Execute treasury wire top-up:
     ```bash
     curl -X POST "https://apexsovereign.ai/v1/billing/wire-reconciliation" \
       -H "Content-Type: application/json" \
       -d '{
         "tenant_id": "sovereign-treasury-reserve",
         "invoice_id": "ESCROW-REPLENISH-2026-02",
         "bank_reference_id": "FEDWIRE-TOPUP-'$(date +%s)'",
         "wire_type": "FEDWIRE",
         "originating_bank": "Silicon Valley Bridge Bank",
         "sender_entity_name": "ApexSovereign Capital Reserves LLC",
         "amount_received": 100000.00
       }'
     ```

---

## 3. Disaster Recovery & Restoration Procedures

### Restoring from Point-in-Time Recovery (PITR) Backup:
1. Verify latest backup snapshot and cryptographic checksum:
   ```bash
   ls -la /tmp/apexsovereign_backups/
   sha256sum -c /tmp/apexsovereign_backups/apexsovereign_ledger_pitr_*.sql.gz.sha256
   ```
2. Decompress and restore into disaster recovery instance:
   ```bash
   gunzip -c /tmp/apexsovereign_backups/latest.sql.gz | psql "$DR_DATABASE_URL"
   ```
3. Run security audit script to verify RLS activation:
   ```bash
   psql "$DR_DATABASE_URL" -f scripts/audit_database_security.sql
   ```

---

## 4. Routine Maintenance Schedule

| Interval | Task | Command / Script | Owner |
| :--- | :--- | :--- | :--- |
| **Every 60s** | Autonomous Pod Disruption & Health Watchdog | `apexsovereign-self-healing-watchdog` CronJob | Kubernetes Controller |
| **Daily (02:00 UTC)** | Automated Ledger PITR Backup & Merkle Hash Sealing | `bash scripts/backup_disaster_recovery.sh` | SRE Automation |
| **Weekly** | Full Phase 1–4 End-to-End Smoke Test Verification | `python3 scripts/production_smoke_test.py` | SRE Team |
| **Monthly** | Simulated Spot Reclamation & eBPF Cutover Drill | `kubectl apply -f monitoring/chaos_spot_eviction.yaml` | Chaos Engineering Lead |
| **Quarterly** | SOC 2 Type II Cryptographic Ledger Audit | `psql "$DATABASE_URL" -f scripts/audit_database_security.sql` | CISO / Compliance Auditor |
