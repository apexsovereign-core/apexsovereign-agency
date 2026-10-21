import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Database, 
  CreditCard, 
  Cpu, 
  Lock, 
  Server, 
  ArrowRight, 
  CheckCircle2, 
  FileText,
  Key,
  RefreshCw,
  GitBranch,
  Terminal,
  Activity
} from 'lucide-react';

interface ArchitectureViewProps {
  onExploreCode: (fileId: string) => void;
  onOpenSandbox: (mode: string) => void;
}

export const ArchitectureView: React.FC<ArchitectureViewProps> = ({ onExploreCode, onOpenSandbox }) => {
  const [selectedPillar, setSelectedPillar] = useState<number>(1);

  const pillars = [
    {
      id: 1,
      title: 'Secure Environment & Config',
      icon: Lock,
      color: 'emerald',
      badge: 'Zero-Trust Secrets',
      subtitle: 'Strict require_env runtime enforcement with zero hardcoded credentials',
      fileLink: 'config_py',
      details: [
        {
          heading: 'Mandatory require_env() Runtime Validation',
          text: 'Eliminates fallback strings or silent empty defaults. Throws MissingEnvironmentVariableError with contextual hints if any key is missing.',
        },
        {
          heading: 'Zero Hardcoded Secrets in Repo',
          text: 'No database URLs, PayPal client secrets, or HMAC keys are instantiated in source code. All values resolve strictly from os.environ at runtime.',
        },
        {
          heading: 'Immutable Typed Settings via Pydantic',
          text: 'Cached via @lru_cache(maxsize=1) to prevent repetitive OS syscalls while preserving immutability.',
        },
      ],
    },
    {
      id: 2,
      title: 'Async Pool & Idempotent Ledgers',
      icon: Database,
      color: 'amber',
      badge: 'asyncpg + Supabase',
      subtitle: 'PostgreSQL connection pooling with SSL enforcement and double-entry accounting',
      fileLink: 'ledger_service_py',
      details: [
        {
          heading: 'asyncpg Connection Pool with SSL',
          text: 'Configured with min_size=5, max_size=20, and 60s statement timeout. Native SSLContext handling for Supabase transaction poolers (port 6543).',
        },
        {
          heading: 'Strict Row-Level Locks (SELECT ... FOR UPDATE)',
          text: 'Serializes concurrent credit balance mutations across distributed workers, eliminating race conditions and negative balance anomalies.',
        },
        {
          heading: 'Distributed Idempotency State Machine',
          text: 'Atomic reservation in idempotency_keys (PENDING -> COMMITTED -> REVERTED) guarantees zero double-crediting or duplicate compute dispatch.',
        },
      ],
    },
    {
      id: 3,
      title: 'Enterprise Payment & Webhook Gateway',
      icon: CreditCard,
      color: 'blue',
      badge: 'PayPal v2 + HMAC Verification',
      subtitle: 'Cryptographic signature verification before database state commits',
      fileLink: 'paypal_service_py',
      details: [
        {
          heading: 'Cryptographic Webhook Verification',
          text: 'Ingested events are verified against PayPal verify-webhook-signature API using configured PAYPAL_WEBHOOK_ID and transmission headers.',
        },
        {
          heading: 'SSRF Protection on Certificate URLs',
          text: 'Validates that incoming PAYPAL-CERT-URL strictly matches https://*.paypal.com before any external HTTP requests are made.',
        },
        {
          heading: 'Thread-Safe Async OAuth2 Token Cache',
          text: 'Caches bearer tokens with an asynchronous mutex lock and refreshes 300 seconds prior to expiration to minimize latency.',
        },
      ],
    },
    {
      id: 4,
      title: 'Compute Broker & Work OS Engine',
      icon: Cpu,
      color: 'purple',
      badge: 'Autonomous Dispatch',
      subtitle: 'Modular FastAPI routers with constant-time X-API-Key and HMAC leases',
      fileLink: 'compute_broker_py',
      details: [
        {
          heading: 'Modular FastAPI Router Architecture',
          text: 'Dedicated routers for /health, /compute/dispatch, /billing/webhook, and /workflow/tasks mounted on a high-throughput lifespan application.',
        },
        {
          heading: 'Timing-Resistant X-API-Key Validation',
          text: 'Administrative and compute dispatch endpoints validated using secrets.compare_digest to prevent side-channel timing attacks.',
        },
        {
          heading: 'Cryptographically Signed Execution Leases',
          text: 'Generates HMAC-SHA256 lease tokens for worker nodes with strict expiration timestamps (TTL) and tamper rejection.',
        },
      ],
    },
  ];

  const currentPillar = pillars.find((p) => p.id === selectedPillar) || pillars[0];

  return (
    <div id="architecture-view" className="space-y-8 py-6">
      {/* Hero Architectural Overview Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Principal Systems Architecture Specification</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-tight">
            ApexSovereign.ai High-Throughput Work OS & Compute Broker
          </h1>
          <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
            Engineered for zero-vulnerability enterprise operation on Render, backed by asynchronous Supabase PostgreSQL pooling, 
            mathematically verified double-entry ledgers, and cryptographic PayPal webhook gateways.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => onOpenSandbox('webhook')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Launch Live Simulator</span>
            </button>
            <button
              onClick={() => onExploreCode('config_py')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Browse Python Backend Code</span>
            </button>
          </div>
        </div>
      </div>

      {/* Systems Dataflow Map */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white tracking-tight">End-to-End Enterprise Request & Ledger Topology</h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">FastAPI + asyncpg + Supabase + PayPal v2</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
          {/* Node 1 */}
          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider">Ingress Gate</span>
                <Server className="w-4 h-4 text-slate-400" />
              </div>
              <h3 className="text-xs font-semibold text-slate-200">Render Uvicorn Workers</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                4x ASGI workers, TLS reverse proxy, /health readiness probe.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>Port: 10000</span>
              <span className="text-emerald-400">SSL Active</span>
            </div>
          </div>

          {/* Node 2 */}
          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-blue-400 uppercase tracking-wider">Security Layer</span>
                <Key className="w-4 h-4 text-slate-400" />
              </div>
              <h3 className="text-xs font-semibold text-slate-200">Authentication & Webhooks</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                secrets.compare_digest on X-API-Key and PayPal signature validation.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>Timing-Safe</span>
              <span className="text-blue-400">SSRF Guarded</span>
            </div>
          </div>

          {/* Node 3 */}
          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider">Storage Pool</span>
                <Database className="w-4 h-4 text-slate-400" />
              </div>
              <h3 className="text-xs font-semibold text-slate-200">Supabase asyncpg Pool</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Port 6543 transaction pooler, row-level locks, double-entry audit.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>Pool: 5-20 conn</span>
              <span className="text-amber-400">FOR UPDATE</span>
            </div>
          </div>

          {/* Node 4 */}
          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-purple-400 uppercase tracking-wider">Compute Broker</span>
                <Cpu className="w-4 h-4 text-slate-400" />
              </div>
              <h3 className="text-xs font-semibold text-slate-200">Autonomous Worker Leases</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                HMAC-SHA256 signed execution leases with TTL expiry.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>A100/H100/CPU</span>
              <span className="text-purple-400">Idempotent</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Architectural Pillars Deep Dive */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white tracking-tight">The 4 Architectural Pillars</h2>
          <span className="text-xs text-slate-400">Click a pillar to inspect design implementation</span>
        </div>

        {/* Tab Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            const isSelected = selectedPillar === pillar.id;
            return (
              <button
                key={pillar.id}
                onClick={() => setSelectedPillar(pillar.id)}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800/90 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/20'
                    : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                    Pillar #{pillar.id}
                  </span>
                </div>
                <h3 className="text-xs font-semibold text-slate-200 mt-2">{pillar.title}</h3>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{pillar.subtitle}</p>
              </button>
            );
          })}
        </div>

        {/* Pillar Details Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
            <div>
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">{currentPillar.badge}</span>
              <h3 className="text-lg font-bold text-white mt-0.5">{currentPillar.title}</h3>
              <p className="text-xs text-slate-400 mt-1">{currentPillar.subtitle}</p>
            </div>
            <button
              onClick={() => onExploreCode(currentPillar.fileLink)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer self-start sm:self-auto"
              title="Protected IP: Requires Administrative Clearance"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Inspect Source File</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                Staff IP
              </span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            {currentPillar.details.map((item, idx) => (
              <div key={idx} className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <h4 className="text-xs font-semibold text-slate-200">{item.heading}</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed pl-6">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
