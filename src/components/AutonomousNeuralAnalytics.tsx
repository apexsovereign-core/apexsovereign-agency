import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Cpu, 
  Database, 
  DollarSign, 
  Zap, 
  ShieldCheck, 
  Radio, 
  RefreshCw, 
  CheckCircle2, 
  Sparkles, 
  Layers, 
  Lock, 
  Server,
  ArrowUpRight,
  Clock,
  TrendingDown
} from 'lucide-react';
import { SovereignHexDiamond } from './SovereignHexDiamond';

interface TelemetryEvent {
  id: string;
  timestamp: string;
  agent: string;
  action: string;
  latencyMs: number;
  rlsPartition: string;
  status: 'OPTIMAL' | 'VERIFIED' | 'COMMITTED';
  savingsUsd: number;
}

export const AutonomousNeuralAnalytics: React.FC = () => {
  // Live fluctuating telemetry states
  const [meanLatency, setMeanLatency] = useState<number>(284);
  const [rlsQueriesHandled, setRlsQueriesHandled] = useState<number>(1489240);
  const [computeArbitrageSavings, setComputeArbitrageSavings] = useState<number>(184920);
  const [activeMeshNodes] = useState<number>(48);
  const [activeLeasesSigned, setActiveLeasesSigned] = useState<number>(38912);
  const [isStreaming, setIsStreaming] = useState<boolean>(true);

  // Live telemetry event log
  const [telemetryEvents, setTelemetryEvents] = useState<TelemetryEvent[]>([
    {
      id: 'te-101',
      timestamp: 'Just now',
      agent: 'ApexMind Concierge',
      action: 'Sub-second Intent Categorization & Lead Scoring (Score: 98)',
      latencyMs: 142,
      rlsPartition: 'tenant-enterprise-4401',
      status: 'VERIFIED',
      savingsUsd: 4.80,
    },
    {
      id: 'te-102',
      timestamp: '1.2s ago',
      agent: 'GPU Spot Arbitrage Broker',
      action: 'HMAC-SHA256 Lease Issuance on 8x NVIDIA H100 SXM5',
      latencyMs: 298,
      rlsPartition: 'tenant-fintech-09',
      status: 'COMMITTED',
      savingsUsd: 142.50,
    },
    {
      id: 'te-103',
      timestamp: '2.8s ago',
      agent: 'Settlement Reconciler',
      action: 'PayPal v2 Atomic Capture (SELECT ... FOR UPDATE) & Resend Dispatch',
      latencyMs: 210,
      rlsPartition: 'tenant-enterprise-8821',
      status: 'OPTIMAL',
      savingsUsd: 22.00,
    },
    {
      id: 'te-104',
      timestamp: '4.5s ago',
      agent: 'Diagnostic Doctor',
      action: 'PgBouncer Connection Pool Auto-Heal & Circuit Closure',
      latencyMs: 94,
      rlsPartition: 'tenant-health-310',
      status: 'VERIFIED',
      savingsUsd: 65.00,
    },
  ]);

  // Real-time ticking telemetry simulation
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      // Fluctuate mean latency between 260ms and 305ms
      const jitter = Math.floor(Math.random() * 15) - 7;
      setMeanLatency(prev => Math.max(240, Math.min(315, prev + jitter)));

      // Increment queries and savings
      const queryDelta = Math.floor(Math.random() * 5) + 2;
      setRlsQueriesHandled(prev => prev + queryDelta);

      const savingsDelta = Number((Math.random() * 0.8 + 0.2).toFixed(2));
      setComputeArbitrageSavings(prev => prev + savingsDelta);

      setActiveLeasesSigned(prev => (Math.random() > 0.6 ? prev + 1 : prev));

      // Append new live telemetry event periodically
      if (Math.random() > 0.45) {
        const sampleAgents = [
          'ApexMind Concierge',
          'GPU Spot Arbitrage Broker',
          'Settlement Reconciler',
          'Diagnostic Doctor',
          'RLS Enforcement Sentinel',
        ];
        const sampleActions = [
          'Atomic Supabase RLS Row Verification & Tenant Fence Isolation',
          'Sub-second Inbound Route & Resend Proposal Generation',
          'Cryptographic HMAC Execution Lease Issued with Anti-Replay Nonce',
          'Predictive Scaling Worker Dispatch across US-East Bare-Metal',
          'Double-Entry Financial Ledger Commitment with Zero Idempotency Drift',
        ];
        const randomAgent = sampleAgents[Math.floor(Math.random() * sampleAgents.length)];
        const randomAction = sampleActions[Math.floor(Math.random() * sampleActions.length)];
        const eventLatency = Math.floor(Math.random() * 190) + 120;
        const tenantNum = Math.floor(Math.random() * 8000) + 1000;
        const eventSavings = Number((Math.random() * 45 + 5).toFixed(2));

        const newEvent: TelemetryEvent = {
          id: `te-${Date.now()}`,
          timestamp: 'Just now',
          agent: randomAgent,
          action: randomAction,
          latencyMs: eventLatency,
          rlsPartition: `tenant-corp-${tenantNum}`,
          status: Math.random() > 0.3 ? 'VERIFIED' : 'OPTIMAL',
          savingsUsd: eventSavings,
        };

        setTelemetryEvents(prev => [newEvent, ...prev.slice(0, 5)]);
      }
    }, 2400);

    return () => clearInterval(interval);
  }, [isStreaming]);

  return (
    <div id="autonomous-neural-analytics-panel" className="max-w-7xl mx-auto p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-slate-900/95 via-slate-950/95 to-slate-950 border border-slate-800 shadow-2xl relative overflow-hidden">
      {/* Radiant Cyan Ambient Glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800 relative z-10">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <SovereignHexDiamond size={28} glow={false} />
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                APEXMIND SOVEREIGN™ NEURAL TELEMETRY
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full bg-cyan-400 ${isStreaming ? 'animate-ping' : ''}`} />
                <span>{isStreaming ? 'LIVE INFERENCE' : 'PAUSED'}</span>
              </span>
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Autonomous Neural Mesh & Telemetry Engine
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Real-time telemetry measuring sub-second agentic inference, multi-tenant Supabase PostgreSQL Row Level Security (RLS) isolation, and institutional compute arbitrage.
          </p>
        </div>

        {/* Live Stream Controller */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isStreaming ? 'animate-spin' : ''}`} />
            <span>{isStreaming ? 'Pause Stream' : 'Resume Telemetry'}</span>
          </button>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 font-mono text-xs">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>48 Mesh Nodes Synced</span>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid: 4 Core Institutional Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6 relative z-10">
        {/* Metric 1: Sub-Second Agentic Execution Latency */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-cyan-500/40 transition-all space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>MEAN AGENTIC LATENCY</span>
            </span>
            <span className="text-cyan-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              SUB-SECOND
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white flex items-baseline gap-2">
            <span>{meanLatency} ms</span>
            <span className="text-xs text-emerald-400 font-medium">99.98% SLA</span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 flex justify-between">
            <span>Peak Worker Dispatch:</span>
            <span className="font-mono text-cyan-300 font-semibold">&lt; 350 ms</span>
          </div>
        </div>

        {/* Metric 2: Secure Supabase RLS Queries Handled */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-emerald-500/40 transition-all space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>SECURE RLS QUERIES</span>
            </span>
            <span className="text-emerald-400 font-bold">0 LEAKS</span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-300 flex items-baseline gap-2">
            <span>{rlsQueriesHandled.toLocaleString()}</span>
            <span className="text-xs text-slate-500 font-normal">isolated</span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 flex justify-between">
            <span>Tenant Partitions:</span>
            <span className="font-mono text-emerald-400 font-semibold">Row-Level Locked</span>
          </div>
        </div>

        {/* Metric 3: Compute Arbitrage Savings vs Legacy SaaS */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-indigo-500/40 transition-all space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
              <span>COMPUTE ARBITRAGE</span>
            </span>
            <span className="text-indigo-400 font-bold">-82% TAX</span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-300 flex items-baseline gap-2">
            <span>${Math.round(computeArbitrageSavings).toLocaleString()}</span>
            <span className="text-xs text-emerald-400 font-medium">+Recovered</span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 flex justify-between">
            <span>Vs Legacy Software Tax:</span>
            <span className="font-mono text-indigo-300 font-semibold">$165/seat bypassed</span>
          </div>
        </div>

        {/* Metric 4: Cryptographic HMAC Leases Verified */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-purple-500/40 transition-all space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-purple-400" />
              <span>HMAC LEASES VERIFIED</span>
            </span>
            <span className="text-purple-400 font-bold">ANTI-REPLAY</span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-purple-300 flex items-baseline gap-2">
            <span>{activeLeasesSigned.toLocaleString()}</span>
            <span className="text-xs text-slate-500 font-normal">signed</span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 flex justify-between">
            <span>Signature Mode:</span>
            <span className="font-mono text-purple-300 font-semibold">HMAC-SHA256</span>
          </div>
        </div>
      </div>

      {/* Live Event Stream Panel */}
      <div className="mt-6 pt-6 border-t border-slate-800/80 space-y-3 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-slate-200">LIVE AGENTIC TELEMETRY STREAM</span>
            <span className="text-[10px] text-slate-500 font-normal">(Auto-refreshing sub-second trace log)</span>
          </div>
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
            PROPRIETARY NEURAL MESH
          </span>
        </div>

        <div className="space-y-2">
          {telemetryEvents.map((evt) => (
            <div 
              key={evt.id}
              className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
            >
              <div className="flex items-center gap-2.5">
                <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 text-[10px] font-bold">
                  {evt.agent}
                </span>
                <span className="text-slate-300 text-[11px] sm:text-xs">
                  {evt.action}
                </span>
              </div>

              <div className="flex items-center gap-4 text-[11px] text-slate-400 shrink-0">
                <span className="text-slate-500 hidden md:inline">{evt.rlsPartition}</span>
                <span className="text-emerald-400 font-bold">{evt.latencyMs} ms</span>
                <span className="text-indigo-300 font-semibold">+${evt.savingsUsd.toFixed(2)}</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 text-[10px] font-bold">
                  {evt.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
