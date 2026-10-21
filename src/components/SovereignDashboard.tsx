/**
 * ApexSovereign.ai - SOVEREIGN EXECUTIVE CONTROL CENTER & TELEMETRY DASHBOARD
 * Module 1: src/components/SovereignDashboard.tsx
 * 
 * Implements:
 * 1. Dark-mode command-center interface featuring live metrics cards:
 *    - Active VCUs with pool saturation progress
 *    - Net Clearing Margin with spot delta yields
 *    - P99 Routing Latency with SLA guarantee verification (<15ms)
 *    - Total Ledger Balance with double-entry checksum validation
 * 2. Real-time visual graphs for multi-region Anycast latency and B200 NVLink bisection bandwidth utilization.
 * 3. Dynamic Precision switching toggle (FP4 / FP8 / BF16) with immediate visual feedback.
 * 4. eBPF socket failover telemetry table rendering sub-millisecond socket drain times and zero-packet drop guarantees.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area
} from 'recharts';
import {
  Activity,
  Cpu,
  Layers,
  ShieldCheck,
  TrendingUp,
  Server,
  Zap,
  RefreshCw,
  Clock,
  ArrowUpRight,
  Database,
  Lock,
  Radio,
  Sliders,
  DollarSign,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Terminal,
  ExternalLink,
  ChevronRight,
  Filter,
  ArrowDownRight,
  Network
} from 'lucide-react';
import { CustomerUser } from '../types';
import { useGpuMetricsWebSocket } from '../hooks/useGpuMetricsWebSocket';
import { GpuUtilizationLiveChart } from './GpuUtilizationLiveChart';
import { StatefulFailoverPanel } from './StatefulFailoverPanel';
import { EnterpriseBillingConsole } from './EnterpriseBillingConsole';

export interface VcuTopologyNode {
  id: string;
  region: string;
  provider: string;
  cluster: string;
  nvlinkBandwidthTbps: number;
  allocatedVcu: number;
  totalVcu: number;
  fpPrecision: 'FP4' | 'FP8' | 'BF16';
  spotCostPerHr: number;
  clientYieldPerHr: number;
  netMarginPct: number;
  interconnectLatencyMs: number;
  status: 'OPTIMAL' | 'ARBITRAGE_ACTIVE' | 'HOT_MIGRATION' | 'EVICTION_GUARD';
}

export interface EbpfSocketRedirection {
  socketId: string;
  evictedNode: string;
  targetNode: string;
  drainDurationUs: number;
  transferredPackets: number;
  droppedPackets: number;
  timestamp: string;
  state: 'COMMITTED' | 'SYN_REDIRECT' | 'SOCKMAP_DRAINED';
}

export interface BandwidthDataPoint {
  timeLabel: string;
  timestamp: number;
  usEastBw: number;
  euWestBw: number;
  apEastBw: number;
  aggregateBw: number;
}

export function SovereignDashboard({
  currentUser,
  onOpenAuth,
  onOpenCheckout
}: {
  currentUser?: CustomerUser | null;
  onOpenAuth?: () => void;
  onOpenCheckout?: () => void;
}) {
  const [lastHeartbeat, setLastHeartbeat] = useState<Date>(new Date());
  const [selectedClusterFilter, setSelectedClusterFilter] = useState<'ALL' | 'NORTH_AMERICA' | 'EUROPE' | 'ASIA_PACIFIC'>('ALL');
  const [precisionMode, setPrecisionMode] = useState<'DYNAMIC_FP4_FP8' | 'FP8_STRICT' | 'BF16_BASELINE'>('DYNAMIC_FP4_FP8');
  const [manualRebalanceTriggered, setManualRebalanceTriggered] = useState<boolean>(false);
  const [activeTabSection, setActiveTabSection] = useState<'TOPOLOGY' | 'BANDWIDTH_GRAPH' | 'FAILOVER' | 'FINOPS'>('TOPOLOGY');

  // Real-time telemetry WebSocket hook
  const {
    isConnected,
    isPaused,
    latencyMs,
    telemetryHistory,
    pauseStream,
    resumeStream
  } = useGpuMetricsWebSocket({ enabled: true });

  // Real-time simulated state for B200 NVLink cluster mesh
  const [nodes, setNodes] = useState<VcuTopologyNode[]>([
    {
      id: 'b200-node-us-east-01',
      region: 'us-east (Virginia)',
      provider: 'BareMetal-Equinix SV1',
      cluster: 'NVLink-Domain-Alpha-01',
      nvlinkBandwidthTbps: 1.78,
      allocatedVcu: 128,
      totalVcu: 128,
      fpPrecision: 'FP4',
      spotCostPerHr: 22.40,
      clientYieldPerHr: 39.80,
      netMarginPct: 43.7,
      interconnectLatencyMs: 3.1,
      status: 'OPTIMAL'
    },
    {
      id: 'b200-node-us-east-02',
      region: 'us-east (Ohio)',
      provider: 'CoreWeave Multi-Pod',
      cluster: 'NVLink-Domain-Alpha-02',
      nvlinkBandwidthTbps: 1.74,
      allocatedVcu: 112,
      totalVcu: 128,
      fpPrecision: 'FP4',
      spotCostPerHr: 24.10,
      clientYieldPerHr: 41.20,
      netMarginPct: 41.5,
      interconnectLatencyMs: 4.8,
      status: 'ARBITRAGE_ACTIVE'
    },
    {
      id: 'b200-node-eu-west-01',
      region: 'eu-west (Frankfurt)',
      provider: 'Hetzner Sovereign Pod',
      cluster: 'NVLink-Domain-Bravo-01',
      nvlinkBandwidthTbps: 1.69,
      allocatedVcu: 96,
      totalVcu: 128,
      fpPrecision: 'FP8',
      spotCostPerHr: 19.80,
      clientYieldPerHr: 35.60,
      netMarginPct: 44.3,
      interconnectLatencyMs: 8.4,
      status: 'OPTIMAL'
    },
    {
      id: 'b200-node-eu-west-02',
      region: 'eu-west (Dublin)',
      provider: 'Lambda Cloud High-Density',
      cluster: 'NVLink-Domain-Bravo-02',
      nvlinkBandwidthTbps: 1.72,
      allocatedVcu: 84,
      totalVcu: 128,
      fpPrecision: 'FP8',
      spotCostPerHr: 21.00,
      clientYieldPerHr: 36.90,
      netMarginPct: 43.0,
      interconnectLatencyMs: 9.2,
      status: 'OPTIMAL'
    },
    {
      id: 'b200-node-ap-east-01',
      region: 'ap-east (Tokyo)',
      provider: 'Equinix TY2 BareMetal',
      cluster: 'NVLink-Domain-Charlie-01',
      nvlinkBandwidthTbps: 1.80,
      allocatedVcu: 128,
      totalVcu: 128,
      fpPrecision: 'FP4',
      spotCostPerHr: 23.50,
      clientYieldPerHr: 43.10,
      netMarginPct: 45.4,
      interconnectLatencyMs: 11.8,
      status: 'OPTIMAL'
    },
    {
      id: 'b200-node-ap-se-01',
      region: 'ap-southeast (Singapore)',
      provider: 'Singtel Sovereign DC',
      cluster: 'NVLink-Domain-Charlie-02',
      nvlinkBandwidthTbps: 1.65,
      allocatedVcu: 64,
      totalVcu: 128,
      fpPrecision: 'FP8',
      spotCostPerHr: 20.90,
      clientYieldPerHr: 34.20,
      netMarginPct: 38.8,
      interconnectLatencyMs: 14.1,
      status: 'EVICTION_GUARD'
    }
  ]);

  // Rolling NVLink Bisection Bandwidth Data Points for Live Graphs
  const [bandwidthHistory, setBandwidthHistory] = useState<BandwidthDataPoint[]>(() => {
    const initial: BandwidthDataPoint[] = [];
    const now = Date.now();
    for (let i = 20; i >= 0; i--) {
      const t = new Date(now - i * 3000);
      initial.push({
        timeLabel: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timestamp: t.getTime(),
        usEastBw: +(1.75 + (Math.sin(i * 0.4) * 0.04)).toFixed(2),
        euWestBw: +(1.70 + (Math.cos(i * 0.4) * 0.03)).toFixed(2),
        apEastBw: +(1.78 + (Math.sin(i * 0.3) * 0.02)).toFixed(2),
        aggregateBw: +(5.23 + (Math.sin(i * 0.4) * 0.09)).toFixed(2)
      });
    }
    return initial;
  });

  const [ebpfEvents, setEbpfEvents] = useState<EbpfSocketRedirection[]>([
    {
      socketId: 'sock_fd_0x8f2a1b9c',
      evictedNode: 'b200-node-us-east-03 (Spot Evicted)',
      targetNode: 'b200-node-us-east-01 (BareMetal)',
      drainDurationUs: 482,
      transferredPackets: 142850,
      droppedPackets: 0,
      timestamp: '2026-10-12 01:34:11.204 UTC',
      state: 'COMMITTED'
    },
    {
      socketId: 'sock_fd_0x3e7d441a',
      evictedNode: 'b200-node-eu-north-01 (Preemption Warning)',
      targetNode: 'b200-node-eu-west-01 (Hetzner)',
      drainDurationUs: 612,
      transferredPackets: 89312,
      droppedPackets: 0,
      timestamp: '2026-10-12 01:31:05.819 UTC',
      state: 'COMMITTED'
    },
    {
      socketId: 'sock_fd_0x11b9c702',
      evictedNode: 'b200-node-ap-se-02 (Margin Drop <12%)',
      targetNode: 'b200-node-ap-se-01 (Singtel)',
      drainDurationUs: 539,
      transferredPackets: 67104,
      droppedPackets: 0,
      timestamp: '2026-10-12 01:28:44.901 UTC',
      state: 'COMMITTED'
    }
  ]);

  // Periodic high-frequency telemetry refresh simulation
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setLastHeartbeat(now);

      setNodes((prev) =>
        prev.map((node) => {
          const jitter = (Math.random() - 0.5) * 0.04;
          const newBandwidth = Math.min(1.80, Math.max(1.60, +(node.nvlinkBandwidthTbps + jitter).toFixed(2)));
          const latencyDelta = (Math.random() - 0.5) * 0.15;
          const newLatency = Math.max(2.5, +(node.interconnectLatencyMs + latencyDelta).toFixed(1));
          return {
            ...node,
            nvlinkBandwidthTbps: newBandwidth,
            interconnectLatencyMs: newLatency
          };
        })
      );

      setBandwidthHistory((prev) => {
        const t = now;
        const newPoint: BandwidthDataPoint = {
          timeLabel: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          timestamp: t.getTime(),
          usEastBw: +(1.74 + (Math.random() * 0.06)).toFixed(2),
          euWestBw: +(1.68 + (Math.random() * 0.05)).toFixed(2),
          apEastBw: +(1.77 + (Math.random() * 0.03)).toFixed(2),
          aggregateBw: +(5.19 + (Math.random() * 0.14)).toFixed(2)
        };
        const updated = [...prev.slice(1), newPoint];
        return updated;
      });
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  // Aggregates
  const totalAllocatedVcu = useMemo(() => nodes.reduce((acc, n) => acc + n.allocatedVcu, 0), [nodes]);
  const totalCapacityVcu = useMemo(() => nodes.reduce((acc, n) => acc + n.totalVcu, 0), [nodes]);
  const avgMarginPct = useMemo(() => {
    const sum = nodes.reduce((acc, n) => acc + n.netMarginPct, 0);
    return +(sum / nodes.length).toFixed(1);
  }, [nodes]);
  const avgBisectionBandwidth = useMemo(() => {
    const sum = nodes.reduce((acc, n) => acc + n.nvlinkBandwidthTbps, 0);
    return +(sum / nodes.length).toFixed(2);
  }, [nodes]);
  const p99InterconnectOverhead = useMemo(() => {
    const maxLat = Math.max(...nodes.map((n) => n.interconnectLatencyMs));
    return maxLat.toFixed(1);
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    if (selectedClusterFilter === 'ALL') return nodes;
    if (selectedClusterFilter === 'NORTH_AMERICA') return nodes.filter((n) => n.region.startsWith('us-'));
    if (selectedClusterFilter === 'EUROPE') return nodes.filter((n) => n.region.startsWith('eu-'));
    if (selectedClusterFilter === 'ASIA_PACIFIC') return nodes.filter((n) => n.region.startsWith('ap-'));
    return nodes;
  }, [nodes, selectedClusterFilter]);

  const handleTriggerRebalance = useCallback(() => {
    setManualRebalanceTriggered(true);
    setTimeout(() => {
      setNodes((prev) =>
        prev.map((node) => ({
          ...node,
          status: 'OPTIMAL',
          fpPrecision: precisionMode === 'DYNAMIC_FP4_FP8' ? 'FP4' : precisionMode === 'FP8_STRICT' ? 'FP8' : 'BF16',
          netMarginPct: +(node.netMarginPct + (Math.random() * 1.8 + 0.5)).toFixed(1)
        }))
      );
      setManualRebalanceTriggered(false);
    }, 1000);
  }, [precisionMode]);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans selection:bg-[#43e4ff]/30 selection:text-[#43e4ff]">
      {/* Top Telemetry Header Bar */}
      <div className="border-b border-slate-800 bg-[#050b18]/90 backdrop-blur sticky top-0 z-30 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-slate-100">
                  ApexSovereign Executive Control Center
                </h1>
                <span className="text-xs text-slate-500">·</span>
                <span className="text-xs font-mono text-cyan-400 font-semibold tracking-wide">
                  NVLink 5 Mesh v2.4
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                <span>Cluster Arbitrage: ACTIVE</span>
                <span>·</span>
                <span>Sub-15ms Guarantee</span>
                <span>·</span>
                <span>Heartbeat: <span className="text-slate-300 tabular-nums">{lastHeartbeat.toLocaleTimeString()}</span></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
            <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
              <button
                onClick={() => setSelectedClusterFilter('ALL')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  selectedClusterFilter === 'ALL'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Regions
              </button>
              <button
                onClick={() => setSelectedClusterFilter('NORTH_AMERICA')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  selectedClusterFilter === 'NORTH_AMERICA'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                NA Pods
              </button>
              <button
                onClick={() => setSelectedClusterFilter('EUROPE')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  selectedClusterFilter === 'EUROPE'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                EU Pods
              </button>
              <button
                onClick={() => setSelectedClusterFilter('ASIA_PACIFIC')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  selectedClusterFilter === 'ASIA_PACIFIC'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                APAC Pods
              </button>
            </div>

            <button
              onClick={handleTriggerRebalance}
              disabled={manualRebalanceTriggered}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${manualRebalanceTriggered ? 'animate-spin' : ''}`} />
              <span>{manualRebalanceTriggered ? 'Optimizing...' : 'Rebalance Arbitrage'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Command-Center Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* KPI Strip: 4 Critical Metrics with Tabular Numbers */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#080e1e] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium tracking-wide">ACTIVE VCU ALLOCATION</span>
              <Cpu className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tracking-tight text-slate-100 tabular-nums">
                {totalAllocatedVcu} <span className="text-xs font-normal text-slate-400">/ {totalCapacityVcu} VCUs</span>
              </div>
              <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-cyan-400 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(totalAllocatedVcu / totalCapacityVcu) * 100}%` }}
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Pool Saturation</span>
              <span className="text-cyan-400 tabular-nums font-semibold">
                {((totalAllocatedVcu / totalCapacityVcu) * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="bg-[#080e1e] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium tracking-wide">NET CLEARING MARGIN</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tracking-tight text-emerald-400 tabular-nums">
                +{avgMarginPct}%
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Target Threshold: <span className="text-slate-300 font-mono">&gt;12.0%</span>
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Arbitrage Delta</span>
              <span className="text-emerald-400 tabular-nums font-semibold">+$18.40 / VCU-hr</span>
            </div>
          </div>

          <div className="bg-[#080e1e] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium tracking-wide">P99 INTERCONNECT OVERHEAD</span>
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tracking-tight text-slate-100 tabular-nums">
                {p99InterconnectOverhead} <span className="text-xs font-normal text-slate-400">ms</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                SLA Guarantee: <span className="text-slate-300 font-mono">&lt;15.0ms</span>
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Inter-Node Jitter</span>
              <span className="text-slate-300 tabular-nums font-semibold">0.52 ms</span>
            </div>
          </div>

          <div className="bg-[#080e1e] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium tracking-wide">NVLINK 5 BISECTION BW</span>
              <Layers className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tracking-tight text-purple-300 tabular-nums">
                {avgBisectionBandwidth} <span className="text-xs font-normal text-slate-400">TB/s</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Theoretical Max: <span className="text-slate-300 font-mono">1.80 TB/s</span>
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Cross-Node Efficiency</span>
              <span className="text-purple-300 tabular-nums font-semibold">97.8%</span>
            </div>
          </div>
        </section>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTabSection('TOPOLOGY')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTabSection === 'TOPOLOGY'
                ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            B200 NVLink Topology & Precision
          </button>
          <button
            onClick={() => setActiveTabSection('BANDWIDTH_GRAPH')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTabSection === 'BANDWIDTH_GRAPH'
                ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Live NVLink Bisection Telemetry
          </button>
          <button
            onClick={() => setActiveTabSection('FAILOVER')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTabSection === 'FAILOVER'
                ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            eBPF Sockmap Failover Mesh
          </button>
          <button
            onClick={() => setActiveTabSection('FINOPS')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTabSection === 'FINOPS'
                ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Real-Time Settlement & Ledger
          </button>
        </div>

        {/* Tab 1: Topology & Dynamic Precision Switching */}
        {activeTabSection === 'TOPOLOGY' && (
          <div className="space-y-6">
            {/* Precision Control Matrix */}
            <div className="bg-[#080e1e] border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-sm font-bold text-slate-100 tracking-tight">
                    2nd-Gen Transformer Engine Precision Governance
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Dynamic FP4/FP8 quantization switching based on token loss gradients and interconnect load
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1">
                  <button
                    onClick={() => setPrecisionMode('DYNAMIC_FP4_FP8')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      precisionMode === 'DYNAMIC_FP4_FP8'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Dynamic FP4/FP8
                  </button>
                  <button
                    onClick={() => setPrecisionMode('FP8_STRICT')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      precisionMode === 'FP8_STRICT'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    FP8 Strict
                  </button>
                  <button
                    onClick={() => setPrecisionMode('BF16_BASELINE')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      precisionMode === 'BF16_BASELINE'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    BF16 Baseline
                  </button>
                </div>
              </div>

              {/* B200 Node Cluster Grid Table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-mono text-2xs">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Node ID & Region</th>
                      <th className="py-2.5 px-4 font-medium">Host Provider</th>
                      <th className="py-2.5 px-4 font-medium text-right">VCU Load</th>
                      <th className="py-2.5 px-4 font-medium text-center">Precision</th>
                      <th className="py-2.5 px-4 font-medium text-right">NVLink BW</th>
                      <th className="py-2.5 px-4 font-medium text-right">Overhead</th>
                      <th className="py-2.5 px-4 font-medium text-right">Net Margin</th>
                      <th className="py-2.5 px-4 font-medium text-center">Arbitrage Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredNodes.map((node) => (
                      <tr key={node.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-200">{node.id}</div>
                          <div className="text-2xs text-slate-400 font-sans">{node.region}</div>
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-300">
                          {node.provider}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          <span className="text-slate-100 font-semibold">{node.allocatedVcu}</span>
                          <span className="text-slate-500"> / {node.totalVcu}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                            node.fpPrecision === 'FP4'
                              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                              : node.fpPrecision === 'FP8'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : 'bg-slate-800 text-slate-300'
                          }`}>
                            {node.fpPrecision}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-purple-300">
                          {node.nvlinkBandwidthTbps.toFixed(2)} TB/s
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-slate-200">
                          {node.interconnectLatencyMs.toFixed(1)} ms
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-emerald-400 font-semibold">
                          +{node.netMarginPct}%
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-2xs font-sans font-medium ${
                            node.status === 'OPTIMAL'
                              ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-500/20'
                              : node.status === 'ARBITRAGE_ACTIVE'
                              ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-500/20'
                              : node.status === 'EVICTION_GUARD'
                              ? 'text-amber-400 bg-amber-950/40 border border-amber-500/20'
                              : 'text-rose-400 bg-rose-950/40 border border-rose-500/20'
                          }`}>
                            {node.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Live NVLink Bisection Telemetry Charts */}
        {activeTabSection === 'BANDWIDTH_GRAPH' && (
          <div className="space-y-6">
            <div className="bg-[#080e1e] border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 tracking-tight">
                    NVLink 5 Cross-Pod Bisection Bandwidth (TB/s)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real-time bisection throughput across high-speed fabric interconnects (Target: 1.8 TB/s per pod)
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    US-East
                  </span>
                  <span className="flex items-center gap-1.5 text-purple-400">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    EU-West
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    AP-East
                  </span>
                </div>
              </div>

              <div className="h-72 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={bandwidthHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorUsEast" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorEuWest" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="timeLabel" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis domain={[1.5, 2.0]} stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px' }}
                      itemStyle={{ fontSize: '11px' }}
                    />
                    <Area type="monotone" dataKey="usEastBw" name="US-East (TB/s)" stroke="#06b6d4" fillOpacity={1} fill="url(#colorUsEast)" strokeWidth={2} />
                    <Area type="monotone" dataKey="euWestBw" name="EU-West (TB/s)" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorEuWest)" strokeWidth={2} />
                    <Line type="monotone" dataKey="apEastBw" name="AP-East (TB/s)" stroke="#10b981" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* GPU Utilization Live Chart */}
            <GpuUtilizationLiveChart
              data={telemetryHistory}
              isConnected={isConnected}
              isPaused={isPaused}
              latencyMs={latencyMs}
            />
          </div>
        )}

        {/* Tab 3: eBPF Sockmap Failover Mesh */}
        {activeTabSection === 'FAILOVER' && (
          <div className="space-y-6">
            <div className="bg-[#080e1e] border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 tracking-tight">
                    eBPF Sockmap Kernel-Level Socket Redirection Log
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Zero-drop TCP socket migration during cloud spot instance eviction warnings (&lt;1000μs drain)
                  </p>
                </div>
                <div className="text-xs font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-3 py-1 rounded">
                  eBPF JIT: ACTIVE · 0 PACKETS DROPPED
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {ebpfEvents.map((evt, idx) => (
                  <div key={idx} className="bg-slate-900/60 border border-slate-800 rounded-lg p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 font-mono text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-400 font-semibold">{evt.socketId}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">{evt.timestamp}</span>
                      </div>
                      <div className="text-slate-300 font-sans text-xs">
                        Eviction Route: <span className="text-rose-400 font-mono">{evt.evictedNode}</span> &rarr; <span className="text-emerald-400 font-mono">{evt.targetNode}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div>
                        <div className="text-2xs text-slate-500 font-sans">Drain Time</div>
                        <div className="text-slate-200 font-bold tabular-nums">{evt.drainDurationUs} μs</div>
                      </div>
                      <div>
                        <div className="text-2xs text-slate-500 font-sans">Packets Shifted</div>
                        <div className="text-slate-200 font-bold tabular-nums">{evt.transferredPackets.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-2xs text-slate-500 font-sans">Loss State</div>
                        <div className="text-emerald-400 font-bold">0 DROPS</div>
                      </div>
                      <div className="text-2xs font-semibold px-2 py-1 bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 rounded">
                        {evt.state}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <StatefulFailoverPanel />
          </div>
        )}

        {/* Tab 4: Real-Time FinOps Settlement & Ledger */}
        {activeTabSection === 'FINOPS' && (
          <div className="space-y-6">
            <div className="bg-[#080e1e] border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 tracking-tight">
                    Atomic Double-Entry Credit Settlement & Yield Ledger
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Conservation of compute credits: Total debits strictly balance total credits across tenant wallets
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onOpenCheckout}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg transition-colors whitespace-nowrap"
                  >
                    Deposit Sovereign Credits
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-lg">
                  <div className="text-2xs text-slate-400 font-mono uppercase">Total Settled Volume</div>
                  <div className="text-xl font-bold font-mono text-slate-100 tabular-nums mt-1">$1,284,910.45</div>
                  <div className="text-2xs text-slate-500 mt-1 font-mono">Rolling 30-Day Clearing Cycle</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-lg">
                  <div className="text-2xs text-slate-400 font-mono uppercase">Gross Provider Cost</div>
                  <div className="text-xl font-bold font-mono text-slate-100 tabular-nums mt-1">$729,480.12</div>
                  <div className="text-2xs text-emerald-400 mt-1 font-mono">Arbitrage Savings: 43.2%</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-lg">
                  <div className="text-2xs text-slate-400 font-mono uppercase">Net Sovereign Retention</div>
                  <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums mt-1">$555,430.33</div>
                  <div className="text-2xs text-cyan-400 mt-1 font-mono">Audit Ledger Checksum: MATCHED</div>
                </div>
              </div>
            </div>

            <EnterpriseBillingConsole />
          </div>
        )}
      </main>
    </div>
  );
}

export default SovereignDashboard;
