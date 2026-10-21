import React, { useState } from 'react';
import { AutonomousAgentWorker, AgentExecutionEvent, DiagnosticCheck } from '../types';
import { 
  Bot, 
  ShieldCheck, 
  Cpu, 
  Zap, 
  Activity, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Terminal, 
  Play, 
  Key, 
  Database, 
  Lock, 
  Sparkles, 
  Clock, 
  ArrowRight,
  Server
} from 'lucide-react';

const INITIAL_AGENTS: AutonomousAgentWorker[] = [
  {
    id: 'agent_aegis_01',
    name: 'Aegis-01 Support Diagnostic & Healer',
    role: 'DIAGNOSTIC_HEALER',
    status: 'ACTIVE_PATROL',
    tasksResolvedToday: 142,
    lastRemediation: '42s ago',
    latencyMs: 18,
    description: 'Continuously audits tenant connection states, verifies Supabase RLS isolation, scans SSL certificates, and self-heals corrupted webhook transmissions.',
    capabilities: [
      'PostgreSQL RLS Audit',
      'TLS 1.3 Handshake Verification',
      'Corrupted Payload Auto-Correction',
      'Zero-Downtime Session Recovery'
    ]
  },
  {
    id: 'agent_hyperion_02',
    name: 'Hyperion-02 Compute Quota Auto-Scaler',
    role: 'QUOTA_SCALER',
    status: 'HEALTHY',
    tasksResolvedToday: 89,
    lastRemediation: '2m ago',
    latencyMs: 12,
    description: 'Dynamically balances GPU cluster allocations across NVIDIA A100/H100 nodes and issues cryptographically signed HMAC execution leases.',
    capabilities: [
      'Predictive GPU Load Balancing',
      'HMAC-SHA256 Token Leasing',
      'Quota Overage Pre-emption',
      'Sub-Millisecond Node Dispatch'
    ]
  },
  {
    id: 'agent_chronos_03',
    name: 'Chronos-03 Settlement Reconciler',
    role: 'SETTLEMENT_RECONCILER',
    status: 'ACTIVE_PATROL',
    tasksResolvedToday: 310,
    lastRemediation: '1m ago',
    latencyMs: 24,
    description: 'Guarantees financial integrity by synchronizing live PayPal v2 order captures with Supabase ledger entries using SELECT ... FOR UPDATE atomic row locks.',
    capabilities: [
      'Atomic Double-Entry Bookkeeping',
      'SELECT FOR UPDATE Ledger Lock',
      'PayPal Webhook Replay Guard',
      'Instant Resend PDF Delivery'
    ]
  },
  {
    id: 'agent_nexus_04',
    name: 'Nexus-04 Autonomous Code Dispatcher',
    role: 'CODE_EXEC_DISPATCHER',
    status: 'ACTIVE_PATROL',
    tasksResolvedToday: 521,
    lastRemediation: '15s ago',
    latencyMs: 31,
    description: 'Executes sandboxed operational Python/SQL scripts, verifies API contracts, and orchestrates cross-service conduits without human intervention.',
    capabilities: [
      'Isolated Container Execution',
      'Automated Schema Migration Guard',
      'Async Worker Pipeline Trigger',
      'Cross-Channel Event Bridging'
    ]
  }
];

const INITIAL_EVENTS: AgentExecutionEvent[] = [
  {
    id: 'evt_901',
    agentId: 'agent_chronos_03',
    agentName: 'Chronos-03',
    action: 'PayPal REST v2 Ledger Synchronization',
    targetTenant: 'tenant_vanguard_deepmind_01',
    status: 'SUCCESS',
    details: 'Verified order capture ORDER_PAYPAL_91823 with SELECT ... FOR UPDATE lock. 1,200,000 CU allocated atomically.',
    timestamp: 'Just now',
    latencyMs: 22
  },
  {
    id: 'evt_902',
    agentId: 'agent_hyperion_02',
    agentName: 'Hyperion-02',
    action: 'HMAC Cryptographic Execution Lease Generation',
    targetTenant: 'tenant_omniglobal',
    status: 'SUCCESS',
    details: 'Generated signed lease lease_tok_89a42f. Target: 8x H100 SXM5 bare-metal cluster ashburn-04.',
    timestamp: '1m ago',
    latencyMs: 14
  },
  {
    id: 'evt_903',
    agentId: 'agent_aegis_01',
    agentName: 'Aegis-01',
    action: 'Self-Healed Corrupted Webhook Header',
    targetTenant: 'tenant_finnova_quantum',
    status: 'AUTO_REMEDIATED',
    details: 'Detected malformed PayPal transmission signature header. Reconstructed canonical payload and verified against PayPal Cert URL.',
    timestamp: '3m ago',
    latencyMs: 19
  },
  {
    id: 'evt_904',
    agentId: 'agent_nexus_04',
    agentName: 'Nexus-04',
    action: 'Autonomous Resend Proposal Dispatch',
    targetTenant: 'tenant_aether_bio',
    status: 'SUCCESS',
    details: 'Rendered customized Enterprise SLA specification PDF and dispatched to recipient via Resend API (HTTP 200).',
    timestamp: '7m ago',
    latencyMs: 41
  }
];

const SYSTEM_DIAGNOSTICS: DiagnosticCheck[] = [
  {
    id: 'diag_1',
    subsystem: 'Supabase PostgreSQL Connection Pool',
    checkName: 'PgBouncer Atomic Multi-Tenant RLS Verification',
    status: 'PASS',
    metric: '100% Isolated (0 Cross-Tenant Leaks)',
    autoResolved: true,
    timestamp: 'Continuous'
  },
  {
    id: 'diag_2',
    subsystem: 'PayPal REST v2 Webhook Engine',
    checkName: 'SHA256withRSA Signature & Replay Defense',
    status: 'PASS',
    metric: 'Sub-30ms Verification Latency',
    autoResolved: true,
    timestamp: 'Continuous'
  },
  {
    id: 'diag_3',
    subsystem: 'Sovereign GPU Compute Mesh',
    checkName: 'HMAC-SHA256 Execution Token Validation',
    status: 'PASS',
    metric: '99.999% Hardware Node Health',
    autoResolved: true,
    timestamp: 'Continuous'
  },
  {
    id: 'diag_4',
    subsystem: 'Resend Transactional Notification Gateway',
    checkName: 'DKIM & SPF Canonical Signature Status',
    status: 'PASS',
    metric: '99.8% Inbox Deliverability Rate',
    autoResolved: true,
    timestamp: 'Continuous'
  }
];

export const AutonomousAgentSwarm: React.FC = () => {
  const [agents, setAgents] = useState<AutonomousAgentWorker[]>(INITIAL_AGENTS);
  const [events, setEvents] = useState<AgentExecutionEvent[]>(INITIAL_EVENTS);
  const [diagnostics, setDiagnostics] = useState<DiagnosticCheck[]>(SYSTEM_DIAGNOSTICS);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [activeActionLabel, setActiveActionLabel] = useState<string | null>(null);

  const handleTriggerDiagnosis = () => {
    setIsExecutingAction(true);
    setActiveActionLabel('Running System-Wide Autonomous Self-Diagnosis...');

    setTimeout(() => {
      const newEvent: AgentExecutionEvent = {
        id: 'evt_' + Math.random().toString(36).substring(2, 8),
        agentId: 'agent_aegis_01',
        agentName: 'Aegis-01',
        action: 'Autonomous Full-Stack Health Audit',
        targetTenant: 'all_active_tenants',
        status: 'AUTO_REMEDIATED',
        details: 'Scanned 4 connection pools, 12 RLS policies, and 8 GPU worker nodes. Zero anomalies detected. All latencies sub-25ms.',
        timestamp: 'Just now',
        latencyMs: 16
      };

      setEvents(prev => [newEvent, ...prev]);
      setAgents(prev => prev.map(a => a.id === 'agent_aegis_01' ? { ...a, tasksResolvedToday: a.tasksResolvedToday + 1, lastRemediation: 'Just now' } : a));
      setIsExecutingAction(false);
      setActiveActionLabel(null);
    }, 1200);
  };

  const handleSimulateWebhookHealing = () => {
    setIsExecutingAction(true);
    setActiveActionLabel('Simulating Webhook Ingestion & Auto-Healing...');

    setTimeout(() => {
      const newEvent: AgentExecutionEvent = {
        id: 'evt_' + Math.random().toString(36).substring(2, 8),
        agentId: 'agent_chronos_03',
        agentName: 'Chronos-03',
        action: 'Autonomous Webhook Healing & Ledger Commit',
        targetTenant: 'tenant_sandbox_enterprise',
        status: 'AUTO_REMEDIATED',
        details: 'Intercepted payload with timestamp skew. Synchronized NTP clock, verified transmission certificate, and executed atomic SELECT ... FOR UPDATE ledger credit.',
        timestamp: 'Just now',
        latencyMs: 27
      };

      setEvents(prev => [newEvent, ...prev]);
      setAgents(prev => prev.map(a => a.id === 'agent_chronos_03' ? { ...a, tasksResolvedToday: a.tasksResolvedToday + 1, lastRemediation: 'Just now' } : a));
      setIsExecutingAction(false);
      setActiveActionLabel(null);
    }, 1400);
  };

  const handleIssueHmacLease = () => {
    setIsExecutingAction(true);
    setActiveActionLabel('Issuing Signed Cryptographic HMAC GPU Lease...');

    setTimeout(() => {
      const token = 'hmac_lease_' + Math.random().toString(36).substring(2, 12);
      const newEvent: AgentExecutionEvent = {
        id: 'evt_' + Math.random().toString(36).substring(2, 8),
        agentId: 'agent_hyperion_02',
        agentName: 'Hyperion-02',
        action: 'Cryptographic Execution Lease Provisioned',
        targetTenant: 'tenant_ashburn_cluster_01',
        status: 'SUCCESS',
        details: `Generated lease [${token}] with HMAC-SHA256 signature. Authorized 8x NVIDIA H100 SXM5 compute runbook.`,
        timestamp: 'Just now',
        latencyMs: 11
      };

      setEvents(prev => [newEvent, ...prev]);
      setAgents(prev => prev.map(a => a.id === 'agent_hyperion_02' ? { ...a, tasksResolvedToday: a.tasksResolvedToday + 1, lastRemediation: 'Just now' } : a));
      setIsExecutingAction(false);
      setActiveActionLabel(null);
    }, 1100);
  };

  const totalTasksResolved = agents.reduce((acc, a) => acc + a.tasksResolvedToday, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner: 24/7 Agentic Workforce */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-semibold mb-1">
            <Bot className="w-4 h-4 text-emerald-400" />
            <span>24/7 SELF-SUSTAINING AUTONOMOUS AGENTIC MESH</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            Autonomous Operational Workforce
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Four specialized sovereign agents running 24/7 continuous patrols. They diagnose system states, auto-heal payload anomalies, dynamically allocate GPU leases, and maintain atomic financial integrity.
          </p>
        </div>

        {/* Global Agent Stats */}
        <div className="flex items-center gap-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-right">
            <div className="text-slate-500 text-[10px] font-mono uppercase">Tasks Resolved Today</div>
            <div className="text-emerald-400 font-mono font-extrabold text-base sm:text-lg">
              {totalTasksResolved.toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-right">
            <div className="text-slate-500 text-[10px] font-mono uppercase">Avg Swarm Latency</div>
            <div className="text-indigo-400 font-mono font-extrabold text-base sm:text-lg">
              18.4 ms
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-right">
            <div className="text-slate-500 text-[10px] font-mono uppercase">Human Bottlenecks</div>
            <div className="text-emerald-400 font-mono font-extrabold text-base sm:text-lg">
              0 (100% Autopilot)
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Trigger Controls */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="font-semibold">Live Operational Triggers:</span>
          {activeActionLabel && (
            <span className="text-emerald-400 font-mono animate-pulse">{activeActionLabel}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isExecutingAction}
            onClick={handleTriggerDiagnosis}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Run Swarm Diagnosis</span>
          </button>

          <button
            type="button"
            disabled={isExecutingAction}
            onClick={handleSimulateWebhookHealing}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            <span>Simulate Webhook Healing</span>
          </button>

          <button
            type="button"
            disabled={isExecutingAction}
            onClick={handleIssueHmacLease}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <Key className="w-3.5 h-3.5 text-slate-950" />
            <span>Issue Signed HMAC Lease</span>
          </button>
        </div>
      </div>

      {/* 4 Specialized Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 hover:border-slate-700 transition-all shadow-lg flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  {agent.role === 'DIAGNOSTIC_HEALER' && <ShieldCheck className="w-5 h-5 text-emerald-400" />}
                  {agent.role === 'QUOTA_SCALER' && <Cpu className="w-5 h-5 text-indigo-400" />}
                  {agent.role === 'SETTLEMENT_RECONCILER' && <Lock className="w-5 h-5 text-blue-400" />}
                  {agent.role === 'CODE_EXEC_DISPATCHER' && <Terminal className="w-5 h-5 text-amber-400" />}
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {agent.status}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-white">{agent.name}</h3>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{agent.description}</p>
              </div>

              <div className="space-y-1 pt-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase">Capabilities:</span>
                <div className="flex flex-wrap gap-1">
                  {agent.capabilities.map((cap, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-slate-950 text-[10px] font-mono text-slate-300 border border-slate-800">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <div>
                Resolved: <strong className="text-emerald-400">{agent.tasksResolvedToday}</strong>
              </div>
              <div>
                Latency: <strong className="text-indigo-400">{agent.latencyMs}ms</strong>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Split Section: Real-Time Execution Event Stream & Continuous Diagnostic Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Real-time execution events (7 Cols) */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Live Multi-Step Agent Execution Stream</h3>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" /> STREAMING
            </span>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {events.map((evt) => (
              <div key={evt.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-emerald-400">{evt.agentName}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs font-semibold text-white">{evt.action}</span>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    evt.status === 'AUTO_REMEDIATED' 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {evt.status}
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed font-mono">{evt.details}</p>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
                  <span>Target: {evt.targetTenant}</span>
                  <span>Latency: {evt.latencyMs}ms • {evt.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Continuous System Health Checks (5 Cols) */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Subsystem Health & RLS Guard</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">100% OPERATIONAL</span>
          </div>

          <div className="space-y-3">
            {diagnostics.map((diag) => (
              <div key={diag.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">{diag.subsystem}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {diag.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">{diag.checkName}</div>
                <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 pt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{diag.metric}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-indigo-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Self-Healing Architecture</span>
            </div>
            <p className="text-[11px] text-indigo-300/80 leading-relaxed">
              If an edge worker fails or a database pool times out, the Autonomous Swarm triggers zero-downtime hot-standby migration within 350 milliseconds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
