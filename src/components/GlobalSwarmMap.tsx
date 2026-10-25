import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Server, 
  Activity, 
  Zap, 
  Cpu, 
  Layers, 
  CheckCircle2, 
  RefreshCw, 
  MapPin, 
  Sliders 
} from 'lucide-react';

interface SwarmRegion {
  id: string;
  name: string;
  city: string;
  gpusOnline: number;
  utilizationPct: number;
  avgLatencyMs: number;
  activeWorkloads: number;
  spotPriceUsd: number;
  status: 'OPTIMAL' | 'LOAD_BALANCING' | 'FAILOVER_READY';
  coordinates: { x: number; y: number }; // percentage on map
}

export const GlobalSwarmMap: React.FC = () => {
  const [selectedRegionId, setSelectedRegionId] = useState<string>('us-east');
  const [isBalancing, setIsBalancing] = useState<boolean>(false);
  const [balanceTimestamp, setBalanceTimestamp] = useState<string>(new Date().toISOString());

  const regions: SwarmRegion[] = [
    {
      id: 'us-east',
      name: 'US-East',
      city: 'Ashburn, VA',
      gpusOnline: 48,
      utilizationPct: 76.4,
      avgLatencyMs: 1.8,
      activeWorkloads: 34,
      spotPriceUsd: 1.94,
      status: 'OPTIMAL',
      coordinates: { x: 26, y: 38 }
    },
    {
      id: 'eu-central',
      name: 'EU-Central',
      city: 'Frankfurt, DE',
      gpusOnline: 36,
      utilizationPct: 69.2,
      avgLatencyMs: 2.1,
      activeWorkloads: 22,
      spotPriceUsd: 1.98,
      status: 'OPTIMAL',
      coordinates: { x: 52, y: 32 }
    },
    {
      id: 'ap-south',
      name: 'AP-South',
      city: 'Mumbai, IN',
      gpusOnline: 24,
      utilizationPct: 62.8,
      avgLatencyMs: 3.4,
      activeWorkloads: 14,
      spotPriceUsd: 1.88,
      status: 'OPTIMAL',
      coordinates: { x: 70, y: 52 }
    },
    {
      id: 'eu-north',
      name: 'EU-North',
      city: 'Stockholm, SE',
      gpusOnline: 16,
      utilizationPct: 54.1,
      avgLatencyMs: 2.6,
      activeWorkloads: 9,
      spotPriceUsd: 1.90,
      status: 'FAILOVER_READY',
      coordinates: { x: 56, y: 24 }
    },
    {
      id: 'us-west',
      name: 'US-West',
      city: 'Oregon, US',
      gpusOnline: 32,
      utilizationPct: 71.5,
      avgLatencyMs: 2.2,
      activeWorkloads: 20,
      spotPriceUsd: 1.96,
      status: 'OPTIMAL',
      coordinates: { x: 18, y: 36 }
    }
  ];

  const activeRegion = regions.find(r => r.id === selectedRegionId) || regions[0];

  const handleTriggerRebalance = () => {
    setIsBalancing(true);
    setTimeout(() => {
      setIsBalancing(false);
      setBalanceTimestamp(new Date().toISOString());
    }, 1200);
  };

  const totalGpus = regions.reduce((acc, r) => acc + r.gpusOnline, 0);
  const totalWorkloads = regions.reduce((acc, r) => acc + r.activeWorkloads, 0);
  const avgClusterUtil = Math.round(regions.reduce((acc, r) => acc + r.utilizationPct, 0) / regions.length);

  return (
    <div className="space-y-6 py-6">
      {/* Header & Rebalance Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono mb-2">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>FEDERATED HYPER-MESH TELEMETRY</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Global Compute Swarm &amp; Multi-AZ Node Balancing
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Continuous load balancing across US-East, EU-Central, and AP-South with sub-90s failover quorum.
          </p>
        </div>

        <button
          onClick={handleTriggerRebalance}
          disabled={isBalancing}
          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 font-mono text-xs border border-cyan-500/30 flex items-center gap-2 transition-all cursor-pointer shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isBalancing ? 'animate-spin text-cyan-400' : ''}`} />
          <span>{isBalancing ? 'Rebalancing Swarm...' : 'Trigger Swarm Sync'}</span>
        </button>
      </div>

      {/* High-Level Fleet KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400">TOTAL GPUS ACTIVE</div>
          <div className="text-2xl font-black text-white mt-1 font-mono">{totalGpus}</div>
          <div className="text-[10px] text-emerald-400 mt-0.5">Bare-metal H100 / B200 / L40S</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400">GLOBAL UTILIZATION</div>
          <div className="text-2xl font-black text-cyan-400 mt-1 font-mono">{avgClusterUtil}%</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Multi-AZ load balanced</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400">ACTIVE WORKLOADS</div>
          <div className="text-2xl font-black text-emerald-400 mt-1 font-mono">{totalWorkloads}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Zero-copy asynchronous execution</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400">FAILOVER SLA</div>
          <div className="text-2xl font-black text-amber-400 mt-1 font-mono">&lt; 90s</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Automatic quorum lane switch</div>
        </div>
      </div>

      {/* Map & Region Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive Stylized World Vector Canvas */}
        <div className="lg:col-span-8 p-6 rounded-3xl bg-slate-950 border border-slate-800 relative overflow-hidden min-h-[380px] flex flex-col justify-between">
          {/* Subtle Grid Background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

          {/* Region Markers positioned across the relative container */}
          <div className="relative w-full h-[280px] my-auto">
            {regions.map((region) => {
              const isSelected = region.id === selectedRegionId;
              return (
                <div
                  key={region.id}
                  onClick={() => setSelectedRegionId(region.id)}
                  style={{ left: `${region.coordinates.x}%`, top: `${region.coordinates.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
                >
                  <div className="relative flex items-center justify-center">
                    <span className={`absolute w-8 h-8 rounded-full ${isSelected ? 'bg-cyan-500/30 animate-ping' : 'group-hover:bg-cyan-500/20'}`} />
                    <div className={`w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center ${
                      isSelected
                        ? 'bg-cyan-400 border-white shadow-[0_0_12px_#38bdf8]'
                        : 'bg-slate-900 border-cyan-500/60 group-hover:border-cyan-400'
                    }`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                    </div>
                  </div>

                  {/* Marker Tooltip Badge */}
                  <div className={`mt-2 px-2.5 py-1 rounded-lg text-[10px] font-mono whitespace-nowrap transition-all shadow-lg ${
                    isSelected
                      ? 'bg-cyan-500 text-slate-950 font-bold border border-cyan-300'
                      : 'bg-slate-900/90 text-slate-300 border border-slate-800 group-hover:text-white'
                  }`}>
                    {region.name} ({region.gpusOnline} GPUs)
                  </div>
                </div>
              );
            })}
          </div>

          {/* Map Footer Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-900 text-[11px] font-mono text-slate-500 z-10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Multi-Region Quorum: Synchronized</span>
            </div>
            <div>Last Mesh Rebalance: {balanceTimestamp.split('T')[1].substring(0, 8)} UTC</div>
          </div>
        </div>

        {/* Selected Region Telemetry Card */}
        <div className="lg:col-span-4 p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className="text-[11px] font-mono text-cyan-400 uppercase font-semibold">Active Region Node</span>
              <h3 className="text-xl font-bold text-white mt-0.5">{activeRegion.name}</h3>
              <p className="text-xs text-slate-400">{activeRegion.city}</p>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {activeRegion.status}
            </span>
          </div>

          <div className="space-y-3.5">
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-slate-400">Node Utilization:</span>
                <span className="text-white font-bold">{activeRegion.utilizationPct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                  style={{ width: `${activeRegion.utilizationPct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="text-[10px] text-slate-500 uppercase">Avg Latency</div>
                <div className="text-base font-bold text-cyan-300 mt-0.5">{activeRegion.avgLatencyMs} ms</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="text-[10px] text-slate-500 uppercase">Spot Price</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">${activeRegion.spotPriceUsd}/hr</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5 text-xs">
              <div className="text-slate-400 font-mono text-[11px]">Failover Lane Readiness:</div>
              <div className="text-white font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>90s Hot-Swap Standby Lane Active</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Peer Standby: {regions.find(r => r.id !== activeRegion.id)?.name} (Latency: 12ms)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
