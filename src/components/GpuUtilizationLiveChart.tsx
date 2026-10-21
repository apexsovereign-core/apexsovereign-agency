/**
 * ApexSovereign.ai - Enterprise GPU Arbitrage Core
 * Component: GpuUtilizationLiveChart
 * Framework: Recharts ResponsiveContainer + LineChart + ReferenceLine + Custom Tooltip
 * Data Source: useGpuMetricsWebSocket (60-second real-time ring buffer)
 */

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { 
  Activity, 
  Cpu, 
  TrendingUp, 
  TrendingDown, 
  Maximize2, 
  Layers, 
  Eye, 
  EyeOff,
  Radio,
  Zap,
  Clock
} from 'lucide-react';
import { TelemetryHistoryPoint } from '../hooks/useGpuMetricsWebSocket';

interface GpuUtilizationLiveChartProps {
  data: TelemetryHistoryPoint[];
  isConnected?: boolean;
  isPaused?: boolean;
  latencyMs?: number | null;
  className?: string;
  compact?: boolean;
}

interface NodeSeriesConfig {
  key: string;
  name: string;
  color: string;
  strokeDash?: string;
  strokeWidth: number;
  active: boolean;
}

export const GpuUtilizationLiveChart: React.FC<GpuUtilizationLiveChartProps> = ({
  data,
  isConnected = true,
  isPaused = false,
  latencyMs,
  className = '',
  compact = false,
}) => {
  // Configurable line visibility
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>({
    avgUtil: true,
    usEastH100: true,
    euCentralH100: false,
    nordicB200: false,
    usWestL40s: false,
    tokyoA100: false,
  });

  const [displayMode, setDisplayMode] = useState<'aggregate' | 'multi'>('aggregate');

  const toggleSeries = (key: string) => {
    setVisibleSeries(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const setViewMode = (mode: 'aggregate' | 'multi') => {
    setDisplayMode(mode);
    if (mode === 'multi') {
      setVisibleSeries({
        avgUtil: true,
        usEastH100: true,
        euCentralH100: true,
        nordicB200: true,
        usWestL40s: true,
        tokyoA100: true,
      });
    } else {
      setVisibleSeries({
        avgUtil: true,
        usEastH100: false,
        euCentralH100: false,
        nordicB200: false,
        usWestL40s: false,
        tokyoA100: false,
      });
    }
  };

  // Format data specifically for the 60s sliding window
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((pt, idx, arr) => {
      const secondsAgo = arr.length - 1 - idx;
      let relativeLabel = 'Now';
      if (secondsAgo > 0) {
        relativeLabel = `-${secondsAgo}s`;
      }
      return {
        ...pt,
        relativeLabel,
        secondsAgo,
      };
    });
  }, [data]);

  // Compute 60-second summary stats
  const stats = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return { current: 0, min: 0, max: 0, delta: 0, avg: 0 };
    }
    const current = chartData[chartData.length - 1]?.avgUtil || 0;
    const initial = chartData[0]?.avgUtil || current;
    const utils = chartData.map(d => d.avgUtil);
    const min = Math.min(...utils);
    const max = Math.max(...utils);
    const avg = Math.round((utils.reduce((a, b) => a + b, 0) / utils.length) * 10) / 10;
    const delta = Math.round((current - initial) * 10) / 10;

    return { current, min, max, delta, avg };
  }, [chartData]);

  // Series specifications
  const seriesList: NodeSeriesConfig[] = [
    {
      key: 'avgUtil',
      name: 'Cluster Average',
      color: '#10b981', // emerald
      strokeWidth: 3,
      active: visibleSeries.avgUtil,
    },
    {
      key: 'usEastH100',
      name: 'Ashburn (8x H100)',
      color: '#3b82f6', // blue
      strokeWidth: 1.8,
      active: visibleSeries.usEastH100,
    },
    {
      key: 'euCentralH100',
      name: 'Frankfurt (8x H100)',
      color: '#8b5cf6', // purple
      strokeWidth: 1.8,
      active: visibleSeries.euCentralH100,
    },
    {
      key: 'nordicB200',
      name: 'Nordic (4x B200)',
      color: '#06b6d4', // cyan
      strokeWidth: 1.8,
      active: visibleSeries.nordicB200,
    },
    {
      key: 'usWestL40s',
      name: 'Oregon (8x L40S)',
      color: '#f59e0b', // amber
      strokeWidth: 1.8,
      active: visibleSeries.usWestL40s,
    },
    {
      key: 'tokyoA100',
      name: 'Tokyo (8x A100)',
      color: '#ec4899', // pink
      strokeWidth: 1.8,
      active: visibleSeries.tokyoA100,
    },
  ];

  return (
    <div className={`rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl p-5 space-y-4 ${className}`}>
      {/* Top Header: Title, Real-Time Stats & Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Real-Time GPU Utilization (Last 60 Seconds)
                </h3>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                  {isPaused ? 'PAUSED' : '60S ROLLING STREAM'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Sub-second sampling of bare-metal cluster compute loads streamed over WebSocket.
              </p>
            </div>
          </div>
        </div>

        {/* Real-Time Quantitative Metrics */}
        <div className="flex items-center flex-wrap gap-3 text-xs font-mono">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 block">CURRENT LOAD</span>
            <span className="text-base font-bold text-emerald-400">
              {stats.current}%
            </span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 block">60S RANGE</span>
            <span className="text-slate-200 font-semibold">
              {stats.min}% - {stats.max}%
            </span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 block">60S NET DRIFT</span>
            <span className={`flex items-center gap-0.5 font-bold ${
              stats.delta >= 0 ? 'text-emerald-400' : 'text-blue-400'
            }`}>
              {stats.delta >= 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {stats.delta >= 0 ? `+${stats.delta}%` : `${stats.delta}%`}
            </span>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
            <button
              onClick={() => setViewMode('aggregate')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                displayMode === 'aggregate'
                  ? 'bg-slate-800 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Aggregate
            </button>
            <button
              onClick={() => setViewMode('multi')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                displayMode === 'multi'
                  ? 'bg-slate-800 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Multi-Node
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Series Toggle Pills */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-[11px] font-mono text-slate-500 mr-1 flex items-center gap-1">
          <Layers className="w-3 h-3" />
          Series:
        </span>
        {seriesList.map(series => (
          <button
            key={series.key}
            onClick={() => toggleSeries(series.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] transition-all cursor-pointer ${
              series.active
                ? 'bg-slate-800/90 text-white border-slate-700 shadow-sm'
                : 'bg-slate-950/60 text-slate-500 border-slate-800/80 hover:text-slate-300'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: series.active ? series.color : '#475569' }}
            />
            <span>{series.name}</span>
            {series.active ? (
              <Eye className="w-3 h-3 text-slate-400 ml-0.5" />
            ) : (
              <EyeOff className="w-3 h-3 text-slate-600 ml-0.5" />
            )}
          </button>
        ))}
      </div>

      {/* Main Recharts Live Line Chart Container */}
      <div className="w-full h-[280px] sm:h-[340px] pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 15, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="emeraldGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Dark Mode Background Grid */}
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#334155"
              opacity={0.35}
              vertical={false}
            />

            {/* X Axis: Time window (-60s to Now) */}
            <XAxis
              dataKey="relativeLabel"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              interval="preserveStartEnd"
              minTickGap={25}
            />

            {/* Y Axis: Percentage Scale (0 to 100%) */}
            <YAxis
              domain={[0, 100]}
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              ticks={[0, 25, 50, 75, 90, 100]}
              tickFormatter={(v) => `${v}%`}
            />

            {/* Reference Line: 90% Thermal/Throttling Caution Threshold */}
            <ReferenceLine
              y={90}
              stroke="#f43f5e"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: '90% Critical Threshold',
                fill: '#f43f5e',
                fontSize: 10,
                position: 'insideTopRight',
              }}
            />

            {/* Reference Line: 70% Target Nominal Utilization */}
            <ReferenceLine
              y={70}
              stroke="#0ea5e9"
              strokeDasharray="2 2"
              strokeOpacity={0.4}
            />

            {/* Custom High-Fidelity Tooltip */}
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const pointData = payload[0].payload as TelemetryHistoryPoint & { secondsAgo?: number };
                return (
                  <div className="rounded-xl bg-slate-950/95 border border-slate-800 p-3 shadow-2xl backdrop-blur-md space-y-2 min-w-[210px] text-xs font-mono">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                      <span className="text-slate-400 font-medium">
                        {pointData.timeLabel}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                        {label === 'Now' ? 'REAL-TIME' : `${label}`}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {payload.map((entry) => (
                        <div key={entry.dataKey} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                            {entry.name}:
                          </span>
                          <span className="font-bold text-white">
                            {entry.value}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {pointData.totalPowerWatts && (
                      <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400" />
                          Power Draw
                        </span>
                        <span className="text-slate-200 font-semibold">
                          {(pointData.totalPowerWatts / 1000).toFixed(1)} kW
                        </span>
                      </div>
                    )}
                  </div>
                );
              }}
            />

            {/* Render dynamically active lines */}
            {seriesList
              .filter(s => s.active)
              .map(series => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.name}
                  stroke={series.color}
                  strokeWidth={series.strokeWidth}
                  dot={false}
                  activeDot={{ r: 5, fill: series.color, stroke: '#0f172a', strokeWidth: 2 }}
                  isAnimationActive={false} // Disable CSS transition jitter on 1s streams
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart Footer: Telemetry Info Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-[11px] font-mono text-slate-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            Window: 60s sliding frame (1Hz resolution)
          </span>
          <span className="hidden sm:inline">•</span>
          <span>Smoothing: Monotone spline</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Engine: Recharts v2.x</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
            {chartData.length} samples
          </span>
        </div>
      </div>
    </div>
  );
};
