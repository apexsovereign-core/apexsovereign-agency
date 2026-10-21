/**
 * ApexSovereign.ai - B200 NVLINK TOPOLOGY MESH CARD
 * Module 2: src/components/ClusterTopologyGrid.tsx
 * 
 * Implements:
 * 1. Responsive multi-region node grid showing B200 SXM6 / NVLink 5 interconnect status.
 * 2. Visual interconnect links, bandwidth metrics (TB/s), dynamic precision states (FP4/FP8/BF16).
 * 3. Health gauges, VCU allocation bars, and real-time spot price vs yield arbitrage indicators.
 * 4. Interactive node details modal with live telemetry stream.
 */

import React, { useState } from 'react';
import {
  Server,
  Cpu,
  Layers,
  Zap,
  TrendingUp,
  Activity,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Database,
  Lock,
  Flame,
  CheckCircle2,
  X
} from 'lucide-react';
import { VcuTopologyNode } from './SovereignDashboard';

interface ClusterTopologyGridProps {
  nodes: VcuTopologyNode[];
  onPrecisionChange?: (nodeId: string, precision: 'FP4' | 'FP8' | 'BF16') => void;
  onEvictionTest?: (nodeId: string) => void;
}

export function ClusterTopologyGrid({
  nodes,
  onPrecisionChange,
  onEvictionTest
}: ClusterTopologyGridProps) {
  const [selectedNode, setSelectedNode] = useState<VcuTopologyNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Topology Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#080e1e] border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-950/60 border border-purple-500/30 flex items-center justify-center">
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 tracking-tight">
              B200 NVLink 5 Multi-Pod Interconnect Mesh
            </h3>
            <p className="text-xs text-slate-400">
              Bi-directional 1.8 TB/s fabric domains with sub-15ms cross-region synchronization
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            FP4 Ultra-Quantized
          </span>
          <span className="text-slate-600">·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            FP8 Precision
          </span>
          <span className="text-slate-600">·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Optimal Arbitrage
          </span>
        </div>
      </div>

      {/* Grid of Topology Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {nodes.map((node) => {
          const saturationPct = Math.round((node.allocatedVcu / node.totalVcu) * 100);
          const isOptimal = node.status === 'OPTIMAL';
          const isArbitrage = node.status === 'ARBITRAGE_ACTIVE';
          const isWarning = node.status === 'EVICTION_GUARD' || node.status === 'HOT_MIGRATION';

          return (
            <div
              key={node.id}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
              className={`bg-[#080e1e] border rounded-xl p-4.5 transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                hoveredNodeId === node.id
                  ? 'border-cyan-500/50 shadow-lg shadow-cyan-950/30 bg-[#0a1226]'
                  : 'border-slate-800/80 hover:border-slate-700'
              }`}
              onClick={() => setSelectedNode(node)}
            >
              <div>
                {/* Node Top Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-100">{node.id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-3xs font-mono font-bold ${
                        node.fpPrecision === 'FP4'
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                          : node.fpPrecision === 'FP8'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {node.fpPrecision}
                      </span>
                    </div>
                    <div className="text-2xs text-slate-400 font-sans">{node.region}</div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-3xs font-sans font-medium whitespace-nowrap ${
                    isOptimal
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                      : isArbitrage
                      ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-500/30'
                      : 'bg-amber-950/60 text-amber-400 border border-amber-500/30'
                  }`}>
                    {node.status}
                  </span>
                </div>

                {/* Provider & Cluster Details */}
                <div className="mt-3 text-xs text-slate-400 flex items-center justify-between border-b border-slate-800/60 pb-2.5">
                  <span className="text-slate-300 font-medium truncate max-w-[170px]">{node.provider}</span>
                  <span className="font-mono text-2xs text-purple-400 shrink-0">{node.cluster}</span>
                </div>

                {/* VCU Allocation Bar */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400 text-2xs">VCU Allocation</span>
                    <span className="text-slate-200 tabular-nums font-bold">
                      {node.allocatedVcu} / {node.totalVcu} ({saturationPct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        saturationPct > 90 ? 'bg-amber-400' : 'bg-cyan-400'
                      }`}
                      style={{ width: `${saturationPct}%` }}
                    />
                  </div>
                </div>

                {/* Telemetry Metrics Grid */}
                <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-2">
                    <div className="text-3xs text-slate-500 uppercase">NVLink Bandwidth</div>
                    <div className="text-purple-300 font-bold tabular-nums text-sm mt-0.5">
                      {node.nvlinkBandwidthTbps.toFixed(2)} <span className="text-3xs text-slate-400">TB/s</span>
                    </div>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-2">
                    <div className="text-3xs text-slate-500 uppercase">Interconnect Latency</div>
                    <div className="text-slate-200 font-bold tabular-nums text-sm mt-0.5">
                      {node.interconnectLatencyMs.toFixed(1)} <span className="text-3xs text-slate-400">ms</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Arbitrage Strip */}
              <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="text-3xs text-slate-500 block">Spot Arbitrage</span>
                  <span className="text-emerald-400 font-bold tabular-nums">+{node.netMarginPct}% Net</span>
                </div>
                <div className="text-right">
                  <span className="text-3xs text-slate-500 block">Client Yield</span>
                  <span className="text-slate-300 tabular-nums font-semibold">${node.clientYieldPerHr}/hr</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Node Drilldown Modal */}
      {selectedNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#080e1e] border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-100 font-mono">{selectedNode.id}</h3>
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                    {selectedNode.fpPrecision}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedNode.region} · Hosted on {selectedNode.provider}
                </p>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                <span className="text-slate-500 text-3xs uppercase">Allocated Compute</span>
                <div className="text-base font-bold text-slate-100 mt-1 tabular-nums">
                  {selectedNode.allocatedVcu} / {selectedNode.totalVcu} VCUs
                </div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                <span className="text-slate-500 text-3xs uppercase">NVLink 5 Bandwidth</span>
                <div className="text-base font-bold text-purple-300 mt-1 tabular-nums">
                  {selectedNode.nvlinkBandwidthTbps} TB/s
                </div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                <span className="text-slate-500 text-3xs uppercase">Spot Provider Cost</span>
                <div className="text-base font-bold text-slate-200 mt-1 tabular-nums">
                  ${selectedNode.spotCostPerHr.toFixed(2)}/hr
                </div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                <span className="text-slate-500 text-3xs uppercase">Client Settlement Yield</span>
                <div className="text-base font-bold text-emerald-400 mt-1 tabular-nums">
                  ${selectedNode.clientYieldPerHr.toFixed(2)}/hr (+{selectedNode.netMarginPct}%)
                </div>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs">
              <div className="font-semibold text-slate-200">2nd-Gen Transformer Engine Precision Override</div>
              <p className="text-slate-400 text-2xs leading-relaxed">
                Manually toggle precision quantization for this node. FP4 maximizes throughput and reduces memory footprint; FP8 offers high numerical fidelity.
              </p>
              <div className="flex items-center gap-2 pt-1">
                {(['FP4', 'FP8', 'BF16'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      if (onPrecisionChange) onPrecisionChange(selectedNode.id, p);
                      setSelectedNode({ ...selectedNode, fpPrecision: p });
                    }}
                    className={`px-3 py-1.5 rounded text-xs font-mono font-medium transition-colors ${
                      selectedNode.fpPrecision === p
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {p} Precision
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedNode(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
              >
                Close View
              </button>
              <button
                onClick={() => {
                  if (onEvictionTest) onEvictionTest(selectedNode.id);
                  setSelectedNode(null);
                }}
                className="px-4 py-2 bg-rose-600/20 border border-rose-500/40 hover:bg-rose-600/30 text-rose-300 text-xs font-medium rounded-lg transition-colors"
              >
                Simulate Spot Eviction & eBPF Drain
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClusterTopologyGrid;
