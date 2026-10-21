import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Cpu, 
  Zap, 
  Activity, 
  Lock, 
  CheckCircle2, 
  Server, 
  Layers, 
  TrendingUp, 
  BarChart2, 
  ArrowUpRight, 
  Radio, 
  FileCode,
  Sparkles
} from 'lucide-react';

export const TechnicalEvidencePanel: React.FC = () => {
  const [selectedBenchmarkGpu, setSelectedBenchmarkGpu] = useState<'h100' | 'b200' | 'a100' | 'l40s'>('h100');

  const benchmarkData = {
    h100: {
      model: 'NVIDIA H100 80GB SXM5',
      hyperscalerHourly: 3.85,
      apexHourly: 1.94,
      savingsPct: 49.6,
      tokensPerSecHyperscaler: 1840,
      tokensPerSecApex: 2310,
      throughputGainPct: 25.5,
      failoverSecHyperscaler: '600+ (Cold VM spin-up)',
      failoverSecApex: '90 (Hot-swap mesh lane)',
      privacyHyperscaler: 'Ephemeral disk storage (retention risk)',
      privacyApex: '100% Stateless RAM / Zero disk retention',
    },
    b200: {
      model: 'NVIDIA B200 NVL72 192GB',
      hyperscalerHourly: 5.20,
      apexHourly: 2.85,
      savingsPct: 45.2,
      tokensPerSecHyperscaler: 3200,
      tokensPerSecApex: 4180,
      throughputGainPct: 30.6,
      failoverSecHyperscaler: '900+ (Cluster re-provision)',
      failoverSecApex: '90 (Hot-swap mesh lane)',
      privacyHyperscaler: 'Shared tenant hypervisor slice',
      privacyApex: 'Isolated bare-metal RAM enclave',
    },
    a100: {
      model: 'NVIDIA A100 80GB SXM4',
      hyperscalerHourly: 2.65,
      apexHourly: 1.42,
      savingsPct: 46.4,
      tokensPerSecHyperscaler: 1120,
      tokensPerSecApex: 1420,
      throughputGainPct: 26.8,
      failoverSecHyperscaler: '450+ (Standard re-queue)',
      failoverSecApex: '90 (Hot-swap mesh lane)',
      privacyHyperscaler: 'Multi-tenant cloud region',
      privacyApex: 'Cryptographically signed tenant lease',
    },
    l40s: {
      model: 'NVIDIA L40S 48GB PCIe',
      hyperscalerHourly: 1.65,
      apexHourly: 0.89,
      savingsPct: 46.1,
      tokensPerSecHyperscaler: 890,
      tokensPerSecApex: 1180,
      throughputGainPct: 32.6,
      failoverSecHyperscaler: '300+ (Instance redeploy)',
      failoverSecApex: '90 (Hot-swap mesh lane)',
      privacyHyperscaler: 'Standard cloud storage attachment',
      privacyApex: 'Stateless execution / Zero file writes',
    },
  };

  const activeBenchmark = benchmarkData[selectedBenchmarkGpu];

  return (
    <div id="technical-evidence" className="space-y-10 py-8">
      {/* Header with Title and Evidence Badges */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono mb-2">
            <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
            <span>VERIFIABLE ARCHITECTURAL EVIDENCE MATRIX</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Institutional Infrastructure &amp; Comparative Benchmarks
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Mathematical latency bounds, verifiable execution mechanics, and head-to-head performance comparisons against legacy hyperscaler pricing.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-slate-400 bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>Audit Cycle: 1,500ms Active</span>
        </div>
      </div>

      {/* 1. Architecture Grid (5 System Pillars) */}
      <div className="space-y-4">
        <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>Core System Specifications</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Pillar 1 */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-colors space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-cyan-400 font-semibold uppercase">Execution Core</span>
              <FileCode className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-base font-bold text-white">Multi-Threaded Async Rust (Tokio + Axum)</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Sub-millisecond event loop dispatching asynchronous tasks across CPU pinning cores with zero-copy shared memory fabrics.
            </p>
            <div className="pt-2 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>P99 Dispatch: 0.42ms</span>
            </div>
          </div>

          {/* Pillar 2 */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-colors space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-cyan-400 font-semibold uppercase">Market Discovery</span>
              <Activity className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-base font-bold text-white">Global Spot-Market Mapping (1,500ms)</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Autonomous arbitrage engine continuously queries unallocated bare-metal GPU capacity across North America, Europe, and Asia.
            </p>
            <div className="pt-2 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Real-Time Cadence: Every 1.5s</span>
            </div>
          </div>

          {/* Pillar 3 */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-colors space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-cyan-400 font-semibold uppercase">Regional Failover</span>
              <Zap className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-base font-bold text-white">90-Second Automated Hot-Swap Recovery</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              If an edge node drops heartbeat, the consensus mesh hot-swaps routing lanes in under 90 seconds without restarting client sessions.
            </p>
            <div className="pt-2 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Zero Session Interruption</span>
            </div>
          </div>

          {/* Pillar 4 */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-colors space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-cyan-400 font-semibold uppercase">Data Privacy</span>
              <Lock className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-base font-bold text-white">100% Stateless Execution Mesh</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Strict memory isolation ensures model weights, activations, and client input tokens are volatile-only and wiped immediately upon execution completion.
            </p>
            <div className="pt-2 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Zero Model Weight Retention</span>
            </div>
          </div>

          {/* Pillar 5 */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-colors space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-cyan-400 font-semibold uppercase">Security Perimeter</span>
              <ShieldCheck className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-base font-bold text-white">Token-Shielded JWT &amp; NGINX Reverse Proxy</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Hardware-accelerated cryptographic authentication, strict tenant rate-limits (100 req/s), and real-time SQL injection defense.
            </p>
            <div className="pt-2 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Defense-in-Depth Gateway</span>
            </div>
          </div>

          {/* Pillar 6 */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-colors space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-cyan-400 font-semibold uppercase">Cryptographic Audit</span>
              <BarChart2 className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-base font-bold text-white">SHA-256 Ledger &amp; Strict Idempotency</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every compute unit lease and PayPal balance settlement is signed with tamper-proof HMAC hash-chains, preventing double-spending or replay attacks.
            </p>
            <div className="pt-2 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>SOC2 Type II Aligned</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Comparative Performance Benchmark Panel */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-slate-900 via-slate-950 to-[#050912] border border-slate-800 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>Head-to-Head Comparative Performance Matrix</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Retail Hyperscaler On-Demand vs. ApexSovereign Real-Time Spot Arbitrage Routing
            </p>
          </div>

          {/* GPU Model Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
            {(['h100', 'b200', 'a100', 'l40s'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setSelectedBenchmarkGpu(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  selectedBenchmarkGpu === key
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {key.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Selected GPU Details Header */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-slate-400">Target Accelerator Model:</div>
            <div className="text-base font-bold text-white">{activeBenchmark.model}</div>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <div className="text-[11px] font-mono text-slate-400">Net Cost Reduction</div>
              <div className="text-xl font-black text-emerald-400">-{activeBenchmark.savingsPct}%</div>
            </div>
            <div>
              <div className="text-[11px] font-mono text-slate-400">Throughput Acceleration</div>
              <div className="text-xl font-black text-cyan-400">+{activeBenchmark.throughputGainPct}%</div>
            </div>
          </div>
        </div>

        {/* Side-by-Side Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase">
                <th className="py-3 px-4">Evaluation Metric</th>
                <th className="py-3 px-4 text-rose-300 bg-rose-950/20 rounded-t-lg">Legacy Retail Hyperscaler</th>
                <th className="py-3 px-4 text-cyan-300 bg-cyan-950/20 rounded-t-lg">ApexSovereign Spot Arbitrage</th>
                <th className="py-3 px-4 text-emerald-400 text-right">Advantage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              <tr className="hover:bg-slate-900/30">
                <td className="py-3.5 px-4 font-medium text-white">Effective Hourly Price</td>
                <td className="py-3.5 px-4 font-mono text-rose-300 bg-rose-950/10">
                  ${activeBenchmark.hyperscalerHourly.toFixed(2)} / hr
                </td>
                <td className="py-3.5 px-4 font-mono text-cyan-300 font-bold bg-cyan-950/10">
                  ${activeBenchmark.apexHourly.toFixed(2)} / hr
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-right">
                  Save {activeBenchmark.savingsPct}%
                </td>
              </tr>

              <tr className="hover:bg-slate-900/30">
                <td className="py-3.5 px-4 font-medium text-white">Inference Throughput (Tok/s)</td>
                <td className="py-3.5 px-4 font-mono text-slate-400 bg-rose-950/10">
                  ~{activeBenchmark.tokensPerSecHyperscaler.toLocaleString()} tok/sec
                </td>
                <td className="py-3.5 px-4 font-mono text-cyan-300 font-bold bg-cyan-950/10">
                  ~{activeBenchmark.tokensPerSecApex.toLocaleString()} tok/sec
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-right">
                  +{activeBenchmark.throughputGainPct}% Faster
                </td>
              </tr>

              <tr className="hover:bg-slate-900/30">
                <td className="py-3.5 px-4 font-medium text-white">Regional Failover Recovery</td>
                <td className="py-3.5 px-4 text-slate-400 bg-rose-950/10">
                  {activeBenchmark.failoverSecHyperscaler}
                </td>
                <td className="py-3.5 px-4 text-emerald-400 font-bold bg-cyan-950/10 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{activeBenchmark.failoverSecApex}</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-right">
                  Sub-90s Bound
                </td>
              </tr>

              <tr className="hover:bg-slate-900/30">
                <td className="py-3.5 px-4 font-medium text-white">Stateless Memory &amp; Weights</td>
                <td className="py-3.5 px-4 text-slate-400 bg-rose-950/10">
                  {activeBenchmark.privacyHyperscaler}
                </td>
                <td className="py-3.5 px-4 text-cyan-300 font-bold bg-cyan-950/10 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{activeBenchmark.privacyApex}</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-right">
                  100% Cryptographic
                </td>
              </tr>

              <tr className="hover:bg-slate-900/30">
                <td className="py-3.5 px-4 font-medium text-white">Per-Seat Licensing Overhead</td>
                <td className="py-3.5 px-4 text-rose-400 bg-rose-950/10 font-mono">
                  $150 - $300 / user / mo
                </td>
                <td className="py-3.5 px-4 text-emerald-400 font-bold bg-cyan-950/10 font-mono">
                  $0 / Seat (Compute Unit Ledger)
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-right">
                  Infinite Users
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
