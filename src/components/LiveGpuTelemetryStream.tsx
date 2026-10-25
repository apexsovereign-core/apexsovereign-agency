/**
 * ApexSovereign.ai - Enterprise GPU Arbitrage Core
 * Component: Live GPU Telemetry Stream
 * Engine: Real-Time WebSocket Hook with Sub-Second Metrics
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Cpu, 
  Activity, 
  Zap, 
  Thermometer, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Play, 
  Pause, 
  ShieldCheck, 
  Server, 
  HardDrive, 
  Network,
  Clock,
  TrendingDown,
  ChevronRight,
  Filter,
  AlertTriangle
} from 'lucide-react';
import { motion } from 'motion/react';
import { useGpuMetricsWebSocket } from '../hooks/useGpuMetricsWebSocket';
import { useGpuTelemetry, TelemetryMetric } from '../hooks/useGpuTelemetry';
import { GpuNodeMetric } from '../types';
import { GpuUtilizationLiveChart } from './GpuUtilizationLiveChart';

interface LiveGpuTelemetryStreamProps {
  compact?: boolean;
  onSelectNode?: (node: GpuNodeMetric) => void;
}

export const LiveGpuTelemetryStream: React.FC<LiveGpuTelemetryStreamProps> = ({
  compact = false,
  onSelectNode
}) => {
  const {
    nodes,
    clusterSummary,
    isConnected,
    isConnecting,
    isPaused,
    connectionState,
    latencyMs,
    lastUpdated,
    reconnectCount,
    telemetryHistory,
    reconnect,
    pauseStream,
    resumeStream,
    setTickRate,
  } = useGpuMetricsWebSocket({
    heartbeatIntervalMs: 4000,
  });

  // Dedicated Target 1 Hook: Real-time telemetry over /ws/gpu-metrics with 20-tick sliding buffer
  const {
    currentMetric,
    metrics: telemetryTicks,
    isConnected: isWsTelemetryConnected,
    isReconnecting: isWsTelemetryReconnecting,
    connectionStatus: wsTelemetryStatus,
    reconnect: reconnectWsTelemetry,
  } = useGpuTelemetry();

  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [activeTickRate, setActiveTickRate] = useState<number>(1000);

  // Track previous health status for each node to detect transitions from 'OPTIMAL' to 'DEGRADED'
  const prevHealthMapRef = useRef<Record<string, string>>({});
  const [transitioningNodes, setTransitioningNodes] = useState<Record<string, number>>({});

  useEffect(() => {
    const now = Date.now();
    const newTransitions: Record<string, number> = {};
    let hasNewTransition = false;

    nodes.forEach(node => {
      const prevHealth = prevHealthMapRef.current[node.nodeId];
      // Detect transition strictly from 'OPTIMAL' to 'DEGRADED'
      if (prevHealth === 'OPTIMAL' && node.healthStatus === 'DEGRADED') {
        newTransitions[node.nodeId] = now;
        hasNewTransition = true;
      }
      prevHealthMapRef.current[node.nodeId] = node.healthStatus;
    });

    if (hasNewTransition) {
      setTransitioningNodes(prev => ({
        ...prev,
        ...newTransitions
      }));

      // Automatically reset transition state after animation cycle completes (850ms)
      const timer = setTimeout(() => {
        setTransitioningNodes(prev => {
          const updated = { ...prev };
          Object.keys(newTransitions).forEach(id => {
            delete updated[id];
          });
          return updated;
        });
      }, 850);

      return () => clearTimeout(timer);
    }
  }, [nodes]);

  // Handler to simulate or manually test the OPTIMAL -> DEGRADED transition animation
  const handleSimulateDegraded = (nodeId?: string) => {
    const targetNode = nodeId 
      ? filteredNodes.find(n => n.nodeId === nodeId) 
      : (filteredNodes.find(n => n.healthStatus === 'OPTIMAL') || filteredNodes[0]);
    
    if (!targetNode) return;
    const targetId = targetNode.nodeId;

    setTransitioningNodes(prev => ({
      ...prev,
      [targetId]: Date.now()
    }));

    setTimeout(() => {
      setTransitioningNodes(prev => {
        const updated = { ...prev };
        delete updated[targetId];
        return updated;
      });
    }, 850);
  };

  const filteredNodes = nodes.filter(node => {
    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'H100') return node.gpuModel.includes('H100');
    if (selectedFilter === 'B200') return node.gpuModel.includes('B200');
    if (selectedFilter === 'L40S') return node.gpuModel.includes('L40S');
    if (selectedFilter === 'A100') return node.gpuModel.includes('A100');
    return true;
  });

  const handleRateChange = (ms: number) => {
    setActiveTickRate(ms);
    setTickRate(ms);
  };

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl p-5 space-y-6">
      {/* Header & Connection Status Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Cpu className="w-5 h-5" />
            {isConnected && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping opacity-75" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Bare-Metal GPU Telemetry Stream
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 border border-slate-700 text-slate-300">
                WSS PROTOCOL
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Direct sub-second telemetry socket connecting bare-metal cluster orchestrators.
            </p>
          </div>
        </div>

        {/* Live Status Controls */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Socket State Indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono border text-[11px] ${
            connectionState === 'CONNECTED' 
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
              : connectionState === 'RECONNECTING' || connectionState === 'CONNECTING'
              ? 'bg-amber-950/40 text-amber-400 border-amber-500/30 animate-pulse'
              : connectionState === 'FALLBACK_POLLING'
              ? 'bg-blue-950/40 text-blue-400 border-blue-500/30'
              : 'bg-rose-950/40 text-rose-400 border-rose-500/30'
          }`}>
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>LIVE ({latencyMs ? `${latencyMs}ms` : 'sub-10ms'})</span>
              </>
            ) : connectionState === 'FALLBACK_POLLING' ? (
              <>
                <Activity className="w-3.5 h-3.5" />
                <span>HTTP SNAPSHOT</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>{connectionState} {reconnectCount > 0 ? `(#${reconnectCount})` : ''}</span>
              </>
            )}
          </div>

          {/* Pause / Resume Button */}
          <button
            onClick={isPaused ? resumeStream : pauseStream}
            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
              isPaused 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20' 
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
            title={isPaused ? 'Resume stream' : 'Pause stream'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          {/* Tick Rate Presets */}
          <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 p-0.5 font-mono text-[11px]">
            {[
              { label: '500ms', ms: 500 },
              { label: '1s', ms: 1000 },
              { label: '2s', ms: 2000 },
            ].map(rate => (
              <button
                key={rate.ms}
                onClick={() => handleRateChange(rate.ms)}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  activeTickRate === rate.ms 
                    ? 'bg-slate-800 text-emerald-400 font-semibold shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {rate.label}
              </button>
            ))}
          </div>

          {/* Reconnect Manual Button */}
          <button
            onClick={reconnect}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Force reconnect WebSocket"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dedicated Target 3: Live Telemetry Stream Gauge & Visual Status Indicator */}
      {!currentMetric && telemetryTicks.length === 0 ? (
        /* Fallback Grace: Sleek preloader skeleton awaiting initial ticks */
        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/70 p-5 space-y-4 shadow-inner animate-pulse">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 shadow-[0_0_10px_#f59e0b]" />
              </span>
              <div className="h-4 w-56 bg-slate-800/80 rounded" />
            </div>
            <div className="h-4 w-28 bg-slate-800/80 rounded" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="h-24 bg-slate-900/60 rounded-xl border border-slate-800/60 p-3 space-y-2.5">
              <div className="h-3 w-28 bg-slate-800 rounded" />
              <div className="h-7 w-20 bg-slate-700/80 rounded" />
              <div className="h-2 w-full bg-slate-800 rounded" />
            </div>
            <div className="h-24 bg-slate-900/60 rounded-xl border border-slate-800/60 p-3 space-y-2.5">
              <div className="h-3 w-32 bg-slate-800 rounded" />
              <div className="h-7 w-24 bg-slate-700/80 rounded" />
              <div className="h-2 w-full bg-slate-800 rounded" />
            </div>
            <div className="h-24 bg-slate-900/60 rounded-xl border border-slate-800/60 p-3 space-y-2.5">
              <div className="h-3 w-24 bg-slate-800 rounded" />
              <div className="h-7 w-16 bg-slate-700/80 rounded" />
              <div className="h-2 w-full bg-slate-800 rounded" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1 text-xs font-mono text-slate-500">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span>Establishing zero-trust WebSocket channel on /ws/gpu-metrics...</span>
          </div>
        </div>
      ) : (
        /* Real-Time Gauge Display */
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-[#050912] via-[#0b1422] to-[#12314a]/60 p-5 shadow-[0_0_30px_rgba(67,228,255,0.07)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1e3852]">
            {/* Visual Status Indicator: Glowing green pulse dot when connected, or amber when reconnecting */}
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                {isWsTelemetryConnected ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 shadow-[0_0_14px_#10b981]" />
                  </>
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 shadow-[0_0_14px_#f59e0b]" />
                  </>
                )}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                    Live Stream: {currentMetric?.gpu_model || 'NVIDIA H100 SXM5'}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                    isWsTelemetryConnected 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                  }`}>
                    {isWsTelemetryConnected ? 'STREAMING ACTIVE' : 'RECONNECTING (3000ms)'}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Target Route: <code className="text-cyan-400">/ws/gpu-metrics</code> • Buffer: {telemetryTicks.length}/20 sliding ticks
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Tick: {currentMetric?.timestamp ? new Date(currentMetric.timestamp).toLocaleTimeString() : 'NOW'}</span>
              {!isWsTelemetryConnected && (
                <button
                  onClick={reconnectWsTelemetry}
                  className="ml-2 px-2 py-0.5 rounded bg-[#12314a] text-cyan-300 border border-cyan-500/30 hover:bg-[#1e3852] transition-colors cursor-pointer"
                >
                  Reconnect
                </button>
              )}
            </div>
          </div>

          {/* Real-Time Gauges: Utilization, VRAM Bar, Core Temperature */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Live Utilization Percentage Gauge */}
            <div className="p-4 rounded-xl bg-[#050912]/80 border border-[#1e3852] space-y-2 shadow-inner">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  LIVE COMPUTE LOAD
                </span>
                <span className="text-[10px] text-slate-500">REAL-TIME</span>
              </div>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {currentMetric?.utilization_pct.toFixed(1)}%
                </span>
                <span className="text-xs text-cyan-400 font-bold">
                  {currentMetric && currentMetric.utilization_pct > 85 ? 'HIGH COMPUTE' : 'NOMINAL'}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 transition-all duration-300 shadow-[0_0_10px_rgba(67,228,255,0.4)]"
                  style={{ width: `${Math.min(100, Math.max(5, currentMetric?.utilization_pct || 0))}%` }}
                />
              </div>
            </div>

            {/* 2. VRAM Allocation Bar (memory_used_gb / memory_total_gb) */}
            <div className="p-4 rounded-xl bg-[#050912]/80 border border-[#1e3852] space-y-2 shadow-inner">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5 text-purple-300 font-semibold">
                  <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                  VRAM ALLOCATION
                </span>
                <span className="text-[10px] text-slate-500">ZERO-COPY POOL</span>
              </div>
              <div className="flex items-baseline justify-between font-mono">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {Math.round(currentMetric?.memory_used_gb || 0)}
                  </span>
                  <span className="text-xs text-slate-400">
                    / {Math.round(currentMetric?.memory_total_gb || 640)} GB
                  </span>
                </div>
                <span className="text-xs text-purple-400 font-bold">
                  {currentMetric ? Math.round((currentMetric.memory_used_gb / Math.max(1, currentMetric.memory_total_gb)) * 100) : 0}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-300 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                  style={{ 
                    width: `${Math.min(100, Math.max(5, currentMetric ? (currentMetric.memory_used_gb / Math.max(1, currentMetric.memory_total_gb)) * 100 : 0))}%` 
                  }}
                />
              </div>
            </div>

            {/* 3. Core Temperature Gauge */}
            <div className="p-4 rounded-xl bg-[#050912]/80 border border-[#1e3852] space-y-2 shadow-inner">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5 text-amber-300 font-semibold">
                  <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                  CORE TEMPERATURE
                </span>
                <span className="text-[10px] text-slate-500">THERMAL ENVELOPE</span>
              </div>
              <div className="flex items-baseline justify-between font-mono">
                <span className={`text-2xl sm:text-3xl font-black tracking-tight ${
                  (currentMetric?.temperature_c || 0) > 75 ? 'text-rose-400' : 'text-white'
                }`}>
                  {currentMetric?.temperature_c.toFixed(1)}°C
                </span>
                <span className={`text-xs font-bold ${
                  (currentMetric?.temperature_c || 0) > 75 ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {(currentMetric?.temperature_c || 0) > 75 ? 'THERMAL ALERT' : 'OPTIMAL COOLING'}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    (currentMetric?.temperature_c || 0) > 75 
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]' 
                      : 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(10, ((currentMetric?.temperature_c || 40) / 95) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      {clusterSummary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Average Utilization */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>CLUSTER UTILIZATION</span>
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono flex items-baseline gap-1.5">
              <span>{clusterSummary.averageUtilizationPct}%</span>
              <span className="text-[10px] text-emerald-400 font-normal">Active</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                style={{ width: `${clusterSummary.averageUtilizationPct}%` }}
              />
            </div>
          </div>

          {/* Total GPUs Online */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>ONLINE ACCELERATORS</span>
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono flex items-baseline gap-1.5">
              <span>{clusterSummary.totalGpusOnline} GPUs</span>
              <span className="text-[10px] text-slate-400 font-normal">
                ({clusterSummary.totalGpusActive} leased)
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              5 global availability regions
            </div>
          </div>

          {/* Total VRAM Committed */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>VRAM COMMITTED</span>
              <HardDrive className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono flex items-baseline gap-1.5">
              <span>{Math.round(clusterSummary.totalMemoryUsedGb)} GB</span>
              <span className="text-[10px] text-slate-400 font-normal">
                / {Math.round(clusterSummary.totalMemoryCapacityGb)} GB
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-300"
                style={{ width: `${(clusterSummary.totalMemoryUsedGb / clusterSummary.totalMemoryCapacityGb) * 100}%` }}
              />
            </div>
          </div>

          {/* Cluster Power Draw */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>AGGREGATE POWER</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono flex items-baseline gap-1.5">
              <span>{(clusterSummary.totalPowerWatts / 1000).toFixed(1)} kW</span>
              <span className="text-[10px] text-amber-400 font-normal">Hydro / Solar</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Thermal envelope: Nominal
            </div>
          </div>

          {/* Arbitrage Savings */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1 col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>ARBITRAGE SPREAD</span>
              <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-emerald-400 font-mono flex items-baseline gap-1.5">
              <span>-46.8%</span>
              <span className="text-[10px] text-slate-300 font-normal">vs Hyperscalers</span>
            </div>
            <div className="text-[10px] font-mono text-emerald-500/90">
              ${(1.94).toFixed(2)}/hr spot ceiling
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Responsive Recharts Line Chart: 60-Second Rolling Window */}
      <GpuUtilizationLiveChart
        data={telemetryHistory}
        isConnected={isConnected}
        isPaused={isPaused}
        latencyMs={latencyMs}
        compact={compact}
      />

      {/* Cluster Hardware Filter & Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/60 font-mono text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <Server className="w-3.5 h-3.5 text-emerald-400" />
          <span>FILTER BARE-METAL HARDWARE PARTITIONS</span>
        </div>

        {/* Model Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-500 flex items-center gap-1 mr-1">
            <Filter className="w-3 h-3" />
            Partition:
          </span>
          {['ALL', 'H100', 'B200', 'L40S', 'A100'].map(filterKey => (
            <button
              key={filterKey}
              onClick={() => setSelectedFilter(filterKey)}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                selectedFilter === filterKey
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {filterKey}
            </button>
          ))}
        </div>
      </div>

      {/* Individual Node Telemetry Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono px-1">
          <span>BARE-METAL CLUSTERS ({filteredNodes.length} NODES)</span>
          <div className="flex items-center gap-3">
            <button
              id="btn-simulate-degraded-transition"
              onClick={() => handleSimulateDegraded()}
              className="text-[10px] text-amber-400/90 hover:text-amber-300 hover:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30 transition-colors flex items-center gap-1 cursor-pointer"
              title="Trigger OPTIMAL -> DEGRADED health status transition animation on a node"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Simulate Degraded Transition</span>
            </button>
            {lastUpdated && <span>Last heartbeat: {lastUpdated}</span>}
          </div>
        </div>

        <div 
          id="compute-tiers-grid" 
          data-testid="compute-tiers-grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 compute-tiers-grid"
        >
          {filteredNodes.map(node => {
            const isTransitioningDegraded = Boolean(transitioningNodes[node.nodeId]);

            return (
              <motion.div
                key={node.nodeId}
                id={`gpu-node-${node.nodeId}`}
                data-node-id={node.nodeId}
                data-health-status={node.healthStatus}
                onClick={() => onSelectNode && onSelectNode(node)}
                animate={
                  isTransitioningDegraded
                    ? {
                        scale: [1, 1.035, 0.985, 1.015, 1],
                        borderColor: [
                          'rgba(51, 65, 85, 0.8)',
                          'rgba(245, 158, 11, 0.9)',
                          'rgba(217, 119, 6, 0.7)',
                          'rgba(51, 65, 85, 0.8)',
                        ],
                        boxShadow: [
                          '0 0 0 0 rgba(245, 158, 11, 0)',
                          '0 0 24px 3px rgba(245, 158, 11, 0.35)',
                          '0 0 10px 1px rgba(245, 158, 11, 0.15)',
                          '0 0 0 0 rgba(245, 158, 11, 0)',
                        ],
                      }
                    : {
                        scale: 1,
                      }
                }
                transition={{
                  duration: 0.75,
                  ease: [0.25, 1, 0.5, 1],
                }}
                className={`p-4 rounded-xl bg-slate-950/80 border transition-colors space-y-3.5 group cursor-pointer hover:shadow-lg hover:shadow-emerald-950/20 gpu-node-card ${
                  isTransitioningDegraded
                    ? 'border-amber-500/80 ring-1 ring-amber-500/40 transition-health-degraded animate-subtle-scale'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Card Top: Node ID & Health Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                      {node.nodeId}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Server className="w-3 h-3 text-slate-500" />
                      <span>{node.datacenterRegion}</span>
                    </div>
                  </div>

                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (node.healthStatus === 'OPTIMAL') {
                        handleSimulateDegraded(node.nodeId);
                      }
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase transition-transform active:scale-95 ${
                      node.healthStatus === 'OPTIMAL'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:border-amber-500/40'
                        : node.healthStatus === 'DEGRADED'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}
                    title={node.healthStatus === 'OPTIMAL' ? 'Click to simulate OPTIMAL -> DEGRADED transition' : undefined}
                  >
                    {node.healthStatus}
                  </span>
                </div>

                {/* Hardware Spec Strip */}
                <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800/80 text-xs space-y-1 font-mono">
                  <div className="text-slate-200 font-medium truncate">
                    {node.gpuModel}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Network className="w-3 h-3 text-blue-400" />
                      {node.interconnectBandwidthGbps} Gbps Fabric
                    </span>
                    <span className="text-emerald-400 font-bold">
                      ${node.arbitrageSpotRatePerHour.toFixed(2)} / hr
                    </span>
                  </div>
                </div>

                {/* Dynamic Utilization Gauge */}
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-slate-400">GPU Compute Load</span>
                    <span className="text-white font-bold">{node.utilizationPct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        node.utilizationPct > 90 
                          ? 'bg-gradient-to-r from-amber-500 to-rose-500' 
                          : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      }`}
                      style={{ width: `${node.utilizationPct}%` }}
                    />
                  </div>
                </div>

                {/* Memory & Power & Thermals Footer */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-500 block text-[9px]">VRAM</span>
                    <span className="text-slate-200 font-semibold">{Math.round(node.memoryUsedGb)}G</span>
                    <span className="text-slate-500 text-[9px]">/{Math.round(node.memoryTotalGb)}G</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[9px]">THERMAL</span>
                    <span className={`font-semibold flex items-center gap-0.5 ${
                      node.temperatureC > 75 ? 'text-rose-400' : 'text-slate-200'
                    }`}>
                      <Thermometer className="w-2.5 h-2.5" />
                      {node.temperatureC}°C
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[9px]">POWER</span>
                    <span className="text-slate-200 font-semibold">{Math.round(node.powerDrawWatts)}W</span>
                    <span className="text-slate-500 text-[9px]">/{Math.round(node.powerLimitWatts)}W</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
