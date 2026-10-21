import React, { useState, useEffect } from 'react';
import {
  Zap,
  TrendingDown,
  TrendingUp,
  Activity,
  Server,
  Cpu,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Globe,
  Sliders,
  DollarSign,
  Layers,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { ApexLogo } from './ApexLogo';

interface SpotArbitrageItem {
  gpuModel: string;
  vram: string;
  interconnect: string;
  apexRateUSD: number;
  awsRateUSD: number;
  gcpRateUSD: number;
  savingsPercent: number;
  availableNodes: number;
  totalCapacity: number;
  tier: string;
  regionSpread: {
    'us-east-1': number;
    'eu-central-1': number;
    'ap-southeast-1': number;
  };
}

const SPOT_ARBITRAGE_DATA: SpotArbitrageItem[] = [
  {
    gpuModel: 'NVIDIA B200 SXM6',
    vram: '192GB HBM3e',
    interconnect: '1,800 GB/s NVLink 5',
    apexRateUSD: 2.85,
    awsRateUSD: 4.80,
    gcpRateUSD: 4.95,
    savingsPercent: 38,
    availableNodes: 48,
    totalCapacity: 64,
    tier: 'Tier 1 Institutional',
    regionSpread: { 'us-east-1': 2.85, 'eu-central-1': 2.92, 'ap-southeast-1': 3.04 },
  },
  {
    gpuModel: 'NVIDIA H100 SXM5',
    vram: '80GB HBM3',
    interconnect: '900 GB/s NVLink 4',
    apexRateUSD: 1.94,
    awsRateUSD: 3.20,
    gcpRateUSD: 3.35,
    savingsPercent: 40,
    availableNodes: 112,
    totalCapacity: 128,
    tier: 'Tier 1 Institutional',
    regionSpread: { 'us-east-1': 1.94, 'eu-central-1': 2.01, 'ap-southeast-1': 2.08 },
  },
  {
    gpuModel: 'NVIDIA L40S PCIe',
    vram: '48GB GDDR6',
    interconnect: 'PCIe 4.0 x16 / eBPF',
    apexRateUSD: 0.89,
    awsRateUSD: 1.45,
    gcpRateUSD: 1.50,
    savingsPercent: 32,
    availableNodes: 240,
    totalCapacity: 256,
    tier: 'Tier 2 Enterprise',
    regionSpread: { 'us-east-1': 0.89, 'eu-central-1': 0.94, 'ap-southeast-1': 0.99 },
  },
  {
    gpuModel: 'NVIDIA A100 SXM4',
    vram: '80GB HBM2e',
    interconnect: 'NVLink 3 / PCIe 4.0',
    apexRateUSD: 1.42,
    awsRateUSD: 2.10,
    gcpRateUSD: 2.20,
    savingsPercent: 35,
    availableNodes: 480,
    totalCapacity: 512,
    tier: 'Tier 2 Enterprise',
    regionSpread: { 'us-east-1': 1.42, 'eu-central-1': 1.48, 'ap-southeast-1': 1.55 },
  },
];

interface PingResult {
  region: string;
  ip: string;
  latencyMs: number;
  jitterMs: number;
  packetLoss: number;
  status: 'OPTIMAL' | 'DEGRADED';
}

export const FleetTerminal: React.FC = () => {
  const [selectedGpu, setSelectedGpu] = useState<SpotArbitrageItem>(SPOT_ARBITRAGE_DATA[0]);
  const [instanceCount, setInstanceCount] = useState<number>(4);
  const [targetRegion, setTargetRegion] = useState<'us-east-1' | 'eu-central-1' | 'ap-southeast-1'>('us-east-1');
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [lastProbedAt, setLastProbedAt] = useState<string>('Just now');
  const [activeReservationToast, setActiveReservationToast] = useState<string | null>(null);

  // Region pings
  const [pings, setPings] = useState<PingResult[]>([
    { region: 'us-east-1 (Ashburn Edge)', ip: '198.51.100.1', latencyMs: 0.84, jitterMs: 0.08, packetLoss: 0.0, status: 'OPTIMAL' },
    { region: 'eu-central-1 (Frankfurt Equinix)', ip: '198.51.100.2', latencyMs: 1.12, jitterMs: 0.11, packetLoss: 0.0, status: 'OPTIMAL' },
    { region: 'ap-southeast-1 (Singapore PoP)', ip: '198.51.100.3', latencyMs: 1.48, jitterMs: 0.14, packetLoss: 0.0, status: 'OPTIMAL' },
  ]);

  const runLatencyProbe = () => {
    setIsProbing(true);
    setTimeout(() => {
      setPings([
        { region: 'us-east-1 (Ashburn Edge)', ip: '198.51.100.1', latencyMs: 0.82 + Math.random() * 0.08, jitterMs: 0.05 + Math.random() * 0.04, packetLoss: 0.0, status: 'OPTIMAL' },
        { region: 'eu-central-1 (Frankfurt Equinix)', ip: '198.51.100.2', latencyMs: 1.08 + Math.random() * 0.09, jitterMs: 0.08 + Math.random() * 0.05, packetLoss: 0.0, status: 'OPTIMAL' },
        { region: 'ap-southeast-1 (Singapore PoP)', ip: '198.51.100.3', latencyMs: 1.42 + Math.random() * 0.12, jitterMs: 0.10 + Math.random() * 0.06, packetLoss: 0.0, status: 'OPTIMAL' },
      ]);
      setIsProbing(false);
      setLastProbedAt(new Date().toLocaleTimeString());
    }, 600);
  };

  const hourlyUSD = selectedGpu.regionSpread[targetRegion] * instanceCount;
  const hourlyCU = hourlyUSD * 100; // $1.00 USD = 100 CU
  const monthlyUSD = hourlyUSD * 730;
  const monthlySavingsUSD = ((selectedGpu.awsRateUSD - selectedGpu.regionSpread[targetRegion]) * instanceCount) * 730;

  const handleReserve = () => {
    const reservationId = `APX-SPOT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    setActiveReservationToast(`Spot Node Reservation Locked: ${reservationId} (${instanceCount}x ${selectedGpu.gpuModel} in ${targetRegion})`);
    setTimeout(() => setActiveReservationToast(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {activeReservationToast && (
        <div className="p-4 rounded-xl bg-cyan-950/90 border border-cyan-500 text-cyan-200 text-xs font-mono flex items-center justify-between shadow-[0_0_20px_rgba(0,240,255,0.3)] animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            <span>{activeReservationToast}</span>
          </div>
          <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
            ATOMIC LEDGER SEALED
          </span>
        </div>
      )}

      {/* Main Terminal Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Global Spot Arbitrage Matrix */}
        <div className="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-2">
              <div className="flex items-center gap-3">
                <ApexLogo size="sm" />
                <div>
                  <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                    GLOBAL SPOT ARBITRAGE DESK
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950/60 text-amber-300 border border-amber-700/60">
                      REFERENCE CATALOG
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Indicative catalog rates. Connect a verified provider feed before placing a live reservation.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <span>Region Target:</span>
                <select
                  value={targetRegion}
                  onChange={(e) => setTargetRegion(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-cyan-400 font-bold focus:outline-none focus:border-cyan-500"
                >
                  <option value="us-east-1">us-east-1 (N. Virginia)</option>
                  <option value="eu-central-1">eu-central-1 (Frankfurt)</option>
                  <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
                </select>
              </div>
            </div>

            {/* Hardware Rows */}
            <div className="mt-4 space-y-3">
              {SPOT_ARBITRAGE_DATA.map((item) => {
                const isSelected = selectedGpu.gpuModel === item.gpuModel;
                const spotRate = item.regionSpread[targetRegion];
                return (
                  <div
                    key={item.gpuModel}
                    onClick={() => setSelectedGpu(item)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isSelected
                        ? 'bg-cyan-950/30 border-cyan-500/80 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                        : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{item.gpuModel}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {item.vram}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                          <span>{item.interconnect}</span>
                          <span>&bull;</span>
                          <span className="text-emerald-400">{item.availableNodes}/{item.totalCapacity} nodes free</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 text-right">
                      <div>
                        <div className="text-[10px] font-mono text-slate-500 uppercase">Apex Spot</div>
                        <div className="text-base font-bold font-mono text-cyan-400">
                          ${spotRate.toFixed(2)}
                          <span className="text-[10px] text-slate-400 font-normal">/hr</span>
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-mono text-slate-500 uppercase">AWS Spot</div>
                        <div className="text-xs font-mono text-slate-400 line-through">
                          ${item.awsRateUSD.toFixed(2)}/hr
                        </div>
                      </div>

                      <div className="bg-emerald-950/60 border border-emerald-800 px-3 py-1.5 rounded-lg text-emerald-400 font-mono font-bold text-xs flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" />
                        -{item.savingsPercent}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Under-Table Hardware Telemetry */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div>
              <div className="text-slate-500 text-[10px] uppercase">Catalog source</div>
              <div className="text-white font-bold flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Reference rate card
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px] uppercase">Provider feed</div>
              <div className="text-amber-300 font-bold mt-0.5">NOT CONNECTED</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px] uppercase">Reservation mode</div>
              <div className="text-amber-300 font-bold mt-0.5">PREVIEW ONLY</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px] uppercase">Settlement state</div>
              <div className="text-slate-300 font-bold mt-0.5">Requires live account</div>
            </div>
          </div>
        </div>

        {/* Right: Interactive Spot Bidding & Cost Simulator */}
        <div className="lg:col-span-4 bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                SPOT BIDDING & CAPACITY SIMULATOR
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Instantly allocate dedicated or fractional slices
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs font-mono space-y-1.5">
              <div className="text-slate-400 text-[10px] uppercase">Selected Engine:</div>
              <div className="text-white font-bold text-sm">{selectedGpu.gpuModel}</div>
              <div className="text-cyan-400 text-xs">{selectedGpu.vram} &bull; {selectedGpu.tier}</div>
            </div>

            {/* Instance Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300">GPU Cluster Quantity:</span>
                <span className="text-cyan-400 font-bold text-sm">{instanceCount} GPUs</span>
              </div>
              <input
                type="range"
                min="1"
                max="32"
                value={instanceCount}
                onChange={(e) => setInstanceCount(parseInt(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>1 Node</span>
                <span>8 (Pod)</span>
                <span>16</span>
                <span>32 (Cluster)</span>
              </div>
            </div>

            {/* Pricing Breakdown */}
            <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2.5 font-mono text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Rate per GPU / Hour:</span>
                <span className="text-white font-bold">${selectedGpu.regionSpread[targetRegion].toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Hourly Total (USD):</span>
                <span className="text-cyan-400 font-bold">${hourlyUSD.toFixed(2)} / hr</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Atomic CU Consumption:</span>
                <span className="text-emerald-400 font-bold">{hourlyCU.toFixed(0)} CU / hr</span>
              </div>
              <div className="h-px bg-slate-800 my-1" />
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Est. Monthly Savings vs AWS:</span>
                <span className="text-emerald-400 font-bold">+${monthlySavingsUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} / mo</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-800 space-y-2">
            <button
              onClick={handleReserve}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 font-bold text-xs tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.35)] transition-all cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              PROVISION INSTANT CLUSTER
            </button>
            <div className="text-[10px] font-mono text-center text-slate-500">
              Sub-5ms Preemption Protection &bull; SLA: 99.999%
            </div>
          </div>
        </div>
      </div>

      {/* Lower Row: Edge Ping Latency Matrix */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">
              GLOBAL ANYCAST EDGE LATENCY MATRIX (eBPF XDP INGRESS)
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-500">Last probe: {lastProbedAt}</span>
            <button
              onClick={runLatencyProbe}
              disabled={isProbing}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-mono text-cyan-400 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
              PROBE PING
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {pings.map((ping) => (
            <div
              key={ping.region}
              className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-2 font-mono text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs">{ping.region}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                  {ping.status}
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-slate-500 text-[11px]">Round-Trip Ingress:</span>
                <span className="text-cyan-400 font-bold text-base">{ping.latencyMs.toFixed(2)} ms</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
                <span>Jitter: &plusmn;{ping.jitterMs.toFixed(2)}ms</span>
                <span>Loss: {ping.packetLoss}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
