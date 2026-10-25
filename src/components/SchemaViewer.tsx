import React, { useState } from 'react';
import { 
  Database, 
  Copy, 
  Check, 
  Table, 
  Key, 
  ShieldCheck, 
  ArrowRight, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Info,
  Terminal,
  ExternalLink,
  Lock
} from 'lucide-react';
import { CODEBASE_FILES } from '../data/codebase';

export const SchemaViewer: React.FC = () => {
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedAdvisor, setCopiedAdvisor] = useState<boolean>(false);
  const [copiedHyperScale, setCopiedHyperScale] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'advisor' | 'tables' | 'hyper_scale_rls'>('advisor');
  const [selectedTable, setSelectedTable] = useState<string>('idempotency_keys');

  const schemaFile = CODEBASE_FILES.find((f) => f.id === 'schema_sql') || CODEBASE_FILES[2];
  const advisorFile = CODEBASE_FILES.find((f) => f.id === 'supabase_security_advisor_fix_sql');
  const hyperScaleFile = CODEBASE_FILES.find((f) => f.id === 'supabase_hyper_scale_rls_sql');

  const handleCopySchema = () => {
    navigator.clipboard.writeText(schemaFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAdvisor = () => {
    if (advisorFile) {
      navigator.clipboard.writeText(advisorFile.content);
      setCopiedAdvisor(true);
      setTimeout(() => setCopiedAdvisor(false), 2000);
    }
  };

  const handleCopyHyperScale = () => {
    if (hyperScaleFile) {
      navigator.clipboard.writeText(hyperScaleFile.content);
      setCopiedHyperScale(true);
      setTimeout(() => setCopiedHyperScale(false), 2000);
    }
  };

  const advisorWarnings = [
    {
      type: 'Function Search Path Mutable',
      entity: 'public.current_user_tenant_id()',
      severity: 'WARNING',
      rootCause: 'PostgreSQL functions without search_path pinned allow malicious callers to override search_path and trigger unintended schema lookups.',
      resolution: "ALTER FUNCTION public.current_user_tenant_id() SET search_path = public, pg_temp; eliminates mutable resolution."
    },
    {
      type: 'Public Can Execute SECURITY DEFINER Function',
      entity: 'public.current_user_tenant_id()',
      severity: 'WARNING',
      rootCause: 'Default public grants allow anonymous / anon roles to execute superuser-privileged SECURITY DEFINER routines.',
      resolution: 'Converted to SECURITY INVOKER and ran REVOKE EXECUTE ON FUNCTION ... FROM anon, public.'
    },
    {
      type: 'Public Can Execute SECURITY DEFINER Function',
      entity: 'public.is_admin_user() / is_admin()',
      severity: 'WARNING',
      rootCause: 'Role check helper was flagged as SECURITY DEFINER accessible by anon and unauthenticated callers.',
      resolution: 'Converted to SECURITY INVOKER with explicit privileges granted solely to authenticated & service_role.'
    },
    {
      type: 'Signed-in Users Can Execute SECURITY DEFINER Function',
      entity: 'public.current_user_tenant_id()',
      severity: 'WARNING',
      rootCause: 'Flagged because signed-in users shouldn\'t trigger elevated superuser context for client JWT claims.',
      resolution: 'Restricted execution context to SECURITY INVOKER, preventing privilege escalation.'
    },
    {
      type: 'Signed-in Users Can Execute SECURITY DEFINER Function',
      entity: 'public.is_admin_user() / is_admin()',
      severity: 'WARNING',
      rootCause: 'Admin verification function was exposed with SECURITY DEFINER to regular authenticated sessions.',
      resolution: 'Converted to SECURITY INVOKER; role claims verified via auth.jwt() securely.'
    }
  ];

  const advisorSuggestions = [
    {
      type: 'RLS Enabled No Policy',
      entity: 'public.compute_leases',
      description: 'RLS was enabled but zero policies existed, causing silent 0-row drops or locked queries.',
      remediation: 'Added unrestricted service_role access policy + authenticated tenant-scoped SELECT policy.'
    },
    {
      type: 'RLS Enabled No Policy',
      entity: 'public.credit_transactions',
      description: 'RLS enabled with no policies created, blocking client access to ledger history.',
      remediation: 'Added service_role full policy + authenticated tenant_id SELECT policy.'
    },
    {
      type: 'RLS Enabled No Policy',
      entity: 'public.subscriptions',
      description: 'RLS enabled with no policies created, preventing subscription reads.',
      remediation: 'Added service_role full policy + authenticated tenant_id / user_id SELECT policy.'
    },
    {
      type: 'RLS Enabled No Policy',
      entity: 'public.tenants',
      description: 'RLS enabled with no policies created, blocking organization profile lookups.',
      remediation: 'Added service_role full policy + authenticated tenant_id matching policy.'
    },
    {
      type: 'RLS Enabled No Policy',
      entity: 'public.transactions',
      description: 'RLS enabled with no policies created for billing audit logs.',
      remediation: 'Added service_role full policy + authenticated tenant-scoped SELECT policy.'
    }
  ];

  const tables = [
    {
      name: 'idempotency_keys',
      description: 'Distributed locking and replay prevention table. Stores request hashes, status, and cached responses.',
      columns: [
        { name: 'id', type: 'UUID PRIMARY KEY', desc: 'Cryptographic unique identifier' },
        { name: 'idempotency_key', type: 'VARCHAR(128)', desc: 'Client-provided unique transaction key' },
        { name: 'tenant_id', type: 'UUID REFERENCES tenants', desc: 'Multi-tenant isolation foreign key' },
        { name: 'endpoint', type: 'VARCHAR(255)', desc: 'Target route (e.g. /compute/dispatch)' },
        { name: 'request_hash', type: 'VARCHAR(64)', desc: 'Deterministic SHA-256 hash of payload' },
        { name: 'status', type: 'VARCHAR(32)', desc: 'PENDING | COMMITTED | REVERTED' },
        { name: 'response_code', type: 'INT', desc: 'HTTP response code (e.g. 200)' },
        { name: 'response_body', type: 'JSONB', desc: 'Cached serialized response payload' },
        { name: 'locked_until', type: 'TIMESTAMPTZ', desc: 'Lock expiration timestamp (2 min buffer)' },
      ],
      constraints: ['UNIQUE (tenant_id, idempotency_key)', 'INDEX on (tenant_id, idempotency_key)'],
    },
    {
      name: 'ledger_entries',
      description: 'Immutable double-entry financial ledger capturing every credit top-up and compute deduction.',
      columns: [
        { name: 'id', type: 'UUID PRIMARY KEY', desc: 'Immutable ledger entry UUID' },
        { name: 'tenant_id', type: 'UUID REFERENCES tenants', desc: 'Organization owner' },
        { name: 'transaction_type', type: 'VARCHAR(64)', desc: 'CREDIT_PURCHASE | COMPUTE_USAGE | REFUND' },
        { name: 'amount', type: 'NUMERIC(18, 4)', desc: 'Positive for top-ups, negative for debits' },
        { name: 'balance_before', type: 'NUMERIC(18, 4)', desc: 'Pre-transaction balance snapshot' },
        { name: 'balance_after', type: 'NUMERIC(18, 4)', desc: 'Post-transaction balance snapshot' },
        { name: 'idempotency_key', type: 'VARCHAR(128)', desc: 'Replay prevention link' },
        { name: 'reference_id', type: 'VARCHAR(255)', desc: 'PayPal Order ID or Compute Job ID' },
        { name: 'metadata', type: 'JSONB', desc: 'Audit details, currency, hardware tier' },
      ],
      constraints: ['UNIQUE (tenant_id, idempotency_key)', 'INDEX on (tenant_id, created_at DESC)'],
    },
    {
      name: 'payment_transactions',
      description: 'PayPal gateway audit records capturing order creation, approvals, captures, and webhook IDs.',
      columns: [
        { name: 'id', type: 'UUID PRIMARY KEY', desc: 'Transaction record UUID' },
        { name: 'tenant_id', type: 'UUID REFERENCES tenants', desc: 'Associated tenant' },
        { name: 'provider', type: 'VARCHAR(32)', desc: 'PAYPAL default' },
        { name: 'provider_order_id', type: 'VARCHAR(128) UNIQUE', desc: 'PayPal v2 Order ID' },
        { name: 'provider_capture_id', type: 'VARCHAR(128) UNIQUE', desc: 'PayPal Capture ID' },
        { name: 'amount', type: 'NUMERIC(12, 2)', desc: 'Fiat amount charged in currency' },
        { name: 'currency', type: 'VARCHAR(8)', desc: 'USD, EUR, GBP, etc.' },
        { name: 'credits_allocated', type: 'NUMERIC(18, 4)', desc: 'Platform compute credits awarded' },
        { name: 'status', type: 'VARCHAR(32)', desc: 'CREATED | APPROVED | COMPLETED | FAILED' },
        { name: 'webhook_event_id', type: 'VARCHAR(128) UNIQUE', desc: 'Idempotent webhook reference' },
      ],
      constraints: ['UNIQUE (provider_order_id)', 'UNIQUE (webhook_event_id)'],
    },
    {
      name: 'compute_jobs',
      description: 'Distributed compute execution records with hardware tier specs and HMAC worker leases.',
      columns: [
        { name: 'id', type: 'UUID PRIMARY KEY', desc: 'Unique compute job UUID' },
        { name: 'tenant_id', type: 'UUID REFERENCES tenants', desc: 'Tenant funding execution' },
        { name: 'job_type', type: 'VARCHAR(64)', desc: 'LLM_FINE_TUNE, PIPELINE, etc.' },
        { name: 'resource_tier', type: 'VARCHAR(32)', desc: 'STANDARD_CPU, GPU_A100, etc.' },
        { name: 'cpu_cores', type: 'INT', desc: 'Allocated CPU cores' },
        { name: 'memory_mb', type: 'INT', desc: 'RAM in Megabytes' },
        { name: 'estimated_cost', type: 'NUMERIC(18, 4)', desc: 'Upfront credit hold amount' },
        { name: 'status', type: 'VARCHAR(32)', desc: 'QUEUED | LEASED | RUNNING | COMPLETED' },
        { name: 'lease_token', type: 'VARCHAR(255)', desc: 'Signed HMAC execution lease token' },
      ],
      constraints: ['UNIQUE (tenant_id, idempotency_key)', 'INDEX on (status, created_at)'],
    },
    {
      name: 'tenants',
      description: 'Enterprise organization workspaces holding balance and tier specifications.',
      columns: [
        { name: 'id', type: 'UUID PRIMARY KEY', desc: 'Tenant UUID' },
        { name: 'slug', type: 'VARCHAR(64) UNIQUE', desc: 'URL safe identifier' },
        { name: 'name', type: 'VARCHAR(255)', desc: 'Display name' },
        { name: 'credit_balance', type: 'NUMERIC(18, 4)', desc: 'Current balance with non-negative check' },
        { name: 'tier', type: 'VARCHAR(32)', desc: 'ENTERPRISE, PRO, etc.' },
        { name: 'is_active', type: 'BOOLEAN', desc: 'Operational status' },
      ],
      constraints: ['CHECK (credit_balance >= 0.0000)', 'UNIQUE (slug)'],
    },
  ];

  const currentTable = tables.find((t) => t.name === selectedTable) || tables[0];

  return (
    <div id="schema-viewer" className="space-y-6 py-6">
      {/* Subtab Navigation Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-2 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveSubTab('advisor')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'advisor'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Supabase Security Advisor Remediation</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/30 text-amber-300 border border-amber-500/40">
              5 Warnings + 5 Info Fixed
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('hyper_scale_rls')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'hyper_scale_rls'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Lock className="w-4 h-4 text-purple-400" />
            <span>Hyper-Scale Multi-Tenant RLS & Nonces</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/30 text-purple-300 border border-purple-500/40">
              Production Hardened
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('tables')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'tables'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-4 h-4 text-emerald-400" />
            <span>PostgreSQL Schema Tables</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === 'advisor' ? (
            <button
              onClick={handleCopyAdvisor}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              {copiedAdvisor ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedAdvisor ? 'Copied Advisor Fix SQL!' : 'Copy Advisor Remediation SQL'}</span>
            </button>
          ) : activeSubTab === 'hyper_scale_rls' ? (
            <button
              onClick={handleCopyHyperScale}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              {copiedHyperScale ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedHyperScale ? 'Copied Hyper-Scale SQL!' : 'Copy Hyper-Scale RLS SQL'}</span>
            </button>
          ) : (
            <button
              onClick={handleCopySchema}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Full SQL!' : 'Copy schema.sql DDL'}</span>
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'advisor' ? (
        <div className="space-y-6">
          {/* Remediation Overview Banner */}
          <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>apexsovereign-core's Project Security Remediation</span>
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Supabase Security Advisor Remediation Playbook
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
                  Direct automated fix resolving all <strong className="text-amber-300">5 Warnings</strong> (Mutable search_path & SECURITY DEFINER execution grants) and all <strong className="text-emerald-300">5 Info suggestions</strong> (RLS enabled tables without explicit access policies).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleCopyAdvisor}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg flex items-center gap-2 transition-all cursor-pointer"
                >
                  {copiedAdvisor ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedAdvisor ? 'SQL Copied to Clipboard!' : 'Copy Supabase SQL Fix'}</span>
                </button>
              </div>
            </div>

            {/* Quick 3-step Instructions */}
            <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="flex items-start gap-2.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0">1</div>
                <div>
                  <span className="font-semibold text-white block">Open Supabase Dashboard</span>
                  <span className="text-slate-400 text-[11px]">Navigate to your project &gt; SQL Editor.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0">2</div>
                <div>
                  <span className="font-semibold text-white block">Paste Remediation Script</span>
                  <span className="text-slate-400 text-[11px]">Click "New query", paste the script and click "Run".</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0">3</div>
                <div>
                  <span className="font-semibold text-white block">Refresh Security Advisor</span>
                  <span className="text-slate-400 text-[11px]">All 5 warnings and 5 suggestions clear instantly to 0 errors.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: The 5 Warnings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>The 5 Warnings: Function Search Path & SECURITY DEFINER</span>
              </h3>
              <span className="text-xs font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                5 Warnings Resolved
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {advisorWarnings.map((w, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-semibold">
                        {w.type}
                      </span>
                      <code className="font-mono text-white font-bold">{w.entity}</code>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Remediated
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]"><strong className="text-slate-300">Cause:</strong> {w.rootCause}</p>
                  <p className="text-emerald-400 text-[11px] font-mono bg-slate-950/80 p-2 rounded border border-slate-800">
                    <strong className="text-slate-300 font-sans">Fix: </strong> {w.resolution}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: The 5 Info Suggestions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-400" />
                <span>The 5 Suggestions: RLS Enabled No Policy</span>
              </h3>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                5 Policies Configured
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {advisorSuggestions.map((s, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <code className="font-mono text-emerald-300 font-bold">{s.entity}</code>
                      <span className="text-[10px] font-mono text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                        RLS Active
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-1.5">{s.description}</p>
                  </div>
                  <div className="text-emerald-400 text-[11px] bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="font-semibold text-slate-300">Policy: </span>
                    {s.remediation}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Remediation SQL Code View */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono font-bold text-slate-200">
                  backend/supabase_security_advisor_fix.sql
                </span>
              </div>
              <button
                onClick={handleCopyAdvisor}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono transition-colors cursor-pointer"
              >
                {copiedAdvisor ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAdvisor ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[480px] bg-slate-950/90 leading-relaxed">
              {advisorFile?.content}
            </pre>
          </div>
        </div>
      ) : activeSubTab === 'hyper_scale_rls' ? (
        <div className="space-y-6">
          {/* Hyper-Scale Multi-Tenant RLS Hardening Banner */}
          <div className="bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/30 rounded-2xl p-5 sm:p-6 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                  <span>Institutional Hyper-Scale RLS Hardening</span>
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Cryptographic Multi-Tenant Tier Isolation & Ephemeral Nonces
                </h2>
                <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                  Enforces strict tenant tier boundaries (SANDBOX, PRO, ENTERPRISE), single-use HMAC-SHA256 execution lease nonces to neutralize replay attacks, and a blockchain-style chained audit ledger with SHA-256 tamper-evident integrity proofs.
                </p>
              </div>

              <button
                onClick={handleCopyHyperScale}
                className="self-start lg:self-center inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-950 cursor-pointer"
              >
                {copiedHyperScale ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedHyperScale ? 'Copied Hyper-Scale SQL!' : 'Copy Hyper-Scale RLS SQL'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-purple-500/20 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                <span>FORCE RLS Across 7 Tables</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Ephemeral Lease Nonces (Anti-Replay)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Chained SHA-256 Audit Ledger</span>
              </div>
            </div>
          </div>

          {/* Hyper-Scale SQL Script Display */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 text-xs font-mono">
              <div className="flex items-center gap-2 text-purple-300">
                <Terminal className="w-4 h-4 text-purple-400" />
                <span>backend/supabase_hyper_scale_rls_hardening.sql</span>
              </div>
              <span className="text-[11px] text-slate-500">PostgreSQL DDL & RLS Policies</span>
            </div>
            <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[520px] leading-relaxed bg-slate-950/60">
              {hyperScaleFile ? hyperScaleFile.content : '-- Script ready in backend/supabase_hyper_scale_rls_hardening.sql'}
            </pre>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-400" />
                <span>Supabase / PostgreSQL Schema DDL & Row-Level Locks</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Designed for Supabase transaction poolers (port 6543) with double-entry ledgers and FOR UPDATE locks.
              </p>
            </div>
          </div>

          {/* Table Selector */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {tables.map((t) => (
              <button
                key={t.name}
                onClick={() => setSelectedTable(t.name)}
                className={`p-3 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                  selectedTable === t.name
                    ? 'bg-amber-950/50 border-amber-500/50 text-amber-200 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="font-mono font-semibold text-slate-200 truncate">{t.name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{t.columns.length} columns</div>
              </button>
            ))}
          </div>

          {/* Table Schema Details */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">Table Definition</span>
                <h3 className="text-sm font-bold text-white font-mono mt-0.5">{currentTable.name}</h3>
                <p className="text-xs text-slate-400 mt-1">{currentTable.description}</p>
              </div>
              <div className="text-xs font-mono text-slate-400">
                Constraints: <span className="text-emerald-400">{currentTable.constraints.join(', ')}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Column Name</th>
                    <th className="py-2.5 px-3">Data Type</th>
                    <th className="py-2.5 px-3">Architectural Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {currentTable.columns.map((col, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-white">{col.name}</td>
                      <td className="py-2.5 px-3 text-amber-300">{col.type}</td>
                      <td className="py-2.5 px-3 text-slate-400">{col.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
