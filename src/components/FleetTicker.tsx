import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  ArrowUpRight, 
  CheckCircle2, 
  Cpu, 
  Globe2, 
  RefreshCw, 
  Server, 
  ShieldCheck, 
  TrendingDown, 
  Zap, 
  Wifi, 
  Sparkles 
} from 'lucide-react';

interface GpuArbitrageItem {
  model: string;
  vram: string;
  hyperscalerPrice: number;
  apexPrice: number;
  savingsPct: number;
  availableNodes: number;
  region: string;
  tier: string;
}

interface RegionPingResult {
  region: string;
  name: string;
  endpoint: string;
  p50Ms: number;
  p99Ms: number;
  jitterMs: number;
  ebpfBypass: boolean;
  status: 'optimal' | 'healthy' | 'probing';
}

const ARBITRAGE_DATA: GpuArbitrageItem[] = [
  {
    model: 'NVIDIA B200 SXM6',
    vram: '192GB HBM3e',
    hyperscalerPrice: 5.20,
    apexPrice: 3.10,
    savingsPct: 40.4,
    availableNodes: 48,
    region: 'us-east-1',
    tier: 'Tier 1 / Tier 2'
  },
  {
    model: 'NVIDIA H100 SXM5',
    vram: '80GB HBM3',
    hyperscalerPrice: 3.85,
    apexPrice: 2.15,
    savingsPct: 44.2,
    availableNodes: 124,
    region: 'eu-central-1',
    tier: 'Tier 1 / Tier 2'
  },
  {
    model: 'NVIDIA L40S PCIe',
    vram: '48GB GDDR6',
    hyperscalerPrice: 1.95,
    apexPrice: 0.98,
    savingsPct: 49.7,
    availableNodes: 210,
    region: 'ap-southeast-1',
    tier: 'Tier 3 / Tier 4'
  },
  {
    model: 'NVIDIA A10G Tensor',
    vram: '24GB GDDR6',
    hyperscalerPrice: 1.25,
    apexPrice: 0.58,
    savingsPct: 53.6,
    availableNodes: 340,
    region: 'us-west-2',
    tier: 'Tier 4 Retail'
  }
];

export const FleetTicker: React.FC = () => {
  const [selectedGpu, setSelectedGpu] = useState<string>('NVIDIA B200 SXM6');
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingTimestamp, setPingTimestamp] = useState<string>('Just now');
  const [pings, setPings] = useState<RegionPingResult[]>([
    {
      region: 'us-east-1',
      name: 'N. Virginia (B200 NVLink)',
      endpoint: 'ingress.useast.apexsovereign.ai',
      p50Ms: 8.4,
      p99Ms: 11.2,
      jitterMs: 0.3,
      ebpfBypass: true,
      status: 'optimal'
    },
    {
      region: 'eu-central-1',
      name: 'Frankfurt (H100 SXM5)',
      endpoint: 'ingress.eucentral.apexsovereign.ai',
      p50Ms: 14.1,
      p99Ms: 17.8,
      jitterMs: 0.5,
      ebpfBypass: true,
      status: 'optimal'
    },
    {
      region: 'ap-southeast-1',
      name: 'Singapore (L40S / A10G)',
      endpoint: 'ingress.apsoutheast.apexsovereign.ai',
      p50Ms: 22.3,
      p99Ms: 27.6,
      jitterMs: 0.8,
      ebpfBypass: true,
      status: 'healthy'
    }
  ]);

  const runLatencyPing = () => {
    setIsPinging(true);
    setTimeout(() => {
      setPings(prev =>
        prev.map(p => ({
          ...p,
          p50Ms: +(p.p50Ms + (Math.random() * 0.8 - 0.4)).toFixed(1),
          p99Ms: +(p.p99Ms + (Math.random() * 1.0 - 0.5)).toFixed(1),
          jitterMs: +(0.2 + Math.random() * 0.3).toFixed(2)
        }))
      );
      setPingTimestamp(new Date().toLocaleTimeString());
      setIsPinging(false);
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* Institutional Top Ticker Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-mono text-emerald-400 font-semibold tracking-wider uppercase">
              FLEET STATUS: OPTIMAL
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 font-mono">
              TOTAL ACTIVE VCUs: <strong className="text-slate-200 tabular-nums">2,488 / 2,500</strong>
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 font-mono">
              NET CLEARING MARGIN: <strong className="text-emerald-400 tabular-nums">54.2%</strong>
            </span>
          </div>

          <div className="flex items-center gap-4 font-mono text-slate-400">
            <span>
              eBPF REDIRECT: <span className="text-cyan-400 font-semibold">SUB-10MS</span>
            </span>
            <span className="text-slate-600">|</span>
            <span>
              LEDGER INVARIANCE: <span className="text-emerald-400 font-semibold">SEALED (0 DELTA)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Live GPU Spot Arbitrage vs Hyperscalers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Arbitrage Matrix */}
        <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-semibold mb-1">
                COMPUTE ARBITRAGE DESK
              </div>
              <h2 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-400" />
                Live Spot Pricing vs. Hyperscalers
              </h2>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 font-mono">ESTIMATED ANNUAL SAVINGS</div>
              <div className="text-lg font-bold text-emerald-400 font-mono tabular-nums">
                $18,834 / NODE
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ARBITRAGE_DATA.map(item => {
              const isSelected = selectedGpu === item.model;
              return (
                <div
                  key={item.model}
                  onClick={() => setSelectedGpu(item.model)}
                  className={`p-4 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800/90 border-emerald-500/80 ring-1 ring-emerald-500/50 shadow-lg shadow-emerald-500/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-slate-100 text-sm">{item.model}</div>
                      <div className="text-xs text-slate-400 font-mono">{item.vram}</div>
                    </div>
                    <span className="inline-flex items-center text-xs font-mono font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                      <TrendingDown className="w-3 h-3 mr-1" />
                      -{item.savingsPct}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/60 text-xs font-mono">
                    <div>
                      <div className="text-slate-500">HYPERSCALER</div>
                      <div className="text-slate-400 line-through tabular-nums">
                        ${item.hyperscalerPrice.toFixed(2)} / hr
                      </div>
                    </div>
                    <div>
                      <div className="text-emerald-400 font-semibold">APEX SPOT</div>
                      <div className="text-emerald-300 font-bold text-sm tabular-nums">
                        ${item.apexPrice.toFixed(2)} / hr
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 font-mono pt-2 border-t border-slate-850">
                    <span>{item.tier}</span>
                    <span className="text-slate-300 font-semibold">{item.availableNodes} Nodes Ready</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-md p-4 text-xs text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>
                All instances feature zero-trust enclave protection, nvlink bisection, and atomic credit metering.
              </span>
            </div>
            <span className="text-slate-500 font-mono">SETTLEMENT IN MICRO-CREDITS</span>
          </div>
        </div>

        {/* Right Column: eBPF Ingress Latency Ping Widget */}
        <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-cyan-400 font-mono font-semibold mb-1">
                  EDGE NETWORK
                </div>
                <h3 className="text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-cyan-400" />
                  eBPF Latency Probe
                </h3>
              </div>
              <button
                onClick={runLatencyPing}
                disabled={isPinging}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-mono font-semibold text-xs rounded transition-all flex items-center gap-1.5 shadow-md shadow-cyan-600/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                {isPinging ? 'PROBING...' : 'RUN PING'}
              </button>
            </div>

            <div className="space-y-3">
              {pings.map(ping => (
                <div
                  key={ping.region}
                  className="bg-slate-950/70 border border-slate-800 rounded-md p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      {ping.name}
                    </div>
                    <span className="text-slate-500 font-mono text-[11px]">{ping.region}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/60 font-mono text-center">
                    <div className="bg-slate-900/80 rounded p-1.5">
                      <div className="text-[10px] text-slate-500">P50 RTT</div>
                      <div className="text-xs font-bold text-cyan-300 tabular-nums">
                        {ping.p50Ms} ms
                      </div>
                    </div>
                    <div className="bg-slate-900/80 rounded p-1.5">
                      <div className="text-[10px] text-slate-500">P99 SLA</div>
                      <div className="text-xs font-bold text-emerald-300 tabular-nums">
                        {ping.p99Ms} ms
                      </div>
                    </div>
                    <div className="bg-slate-900/80 rounded p-1.5">
                      <div className="text-[10px] text-slate-500">JITTER</div>
                      <div className="text-xs font-bold text-slate-300 tabular-nums">
                        ±{ping.jitterMs} ms
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
                    <span className="text-slate-500 truncate max-w-[170px]">{ping.endpoint}</span>
                    <span className="text-emerald-400 font-semibold">eBPF BYPASS ACTIVE</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 text-xs font-mono text-slate-500 flex items-center justify-between">
            <span>PROBE ENGINE: Linux XDP / TC</span>
            <span>LAST SAMPLE: {pingTimestamp}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
