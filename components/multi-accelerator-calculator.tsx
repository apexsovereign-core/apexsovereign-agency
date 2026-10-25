'use client';

import React, { useState, useEffect } from 'react';
import { Cpu, DollarSign, TrendingDown, Zap, Server, Shield, Lock, Activity, Sparkles, RefreshCw } from 'lucide-react';

export interface AcceleratorSpec {
  id: string;
  name: string;
  model: string;
  vram: string;
  interconnect: string;
  spotPriceHr: number;
  baselinePriceHr: number;
  savingsPct: number;
  badge?: string;
  architecture: string;
  enclaveType: 'AMD SEV-SNP' | 'NVIDIA CC' | 'DUAL_HARDWARE_ENCLAVE';
  memoryEncryption: string;
  gRpcProbeRate: string;
  activeCapacityNodes: number;
}

export const ACCELERATORS: AcceleratorSpec[] = [
  {
    id: 'rubin',
    name: 'NVIDIA Rubin',
    model: 'Rubin HBM4 Enterprise Node',
    vram: '288GB HBM4 (22 TB/s)',
    interconnect: '3.6 TB/s NVLink 6 Optical',
    spotPriceHr: 2.40,
    baselinePriceHr: 5.10,
    savingsPct: 52.9,
    badge: 'TIER-6 FLAGSHIP',
    architecture: 'Vera Rubin Next-Gen Architecture',
    enclaveType: 'DUAL_HARDWARE_ENCLAVE',
    memoryEncryption: 'Hardware-Enforced AES-256-XTS & Full SEV-SNP',
    gRpcProbeRate: '1,500ms Live Telemetry',
    activeCapacityNodes: 148,
  },
  {
    id: 'b200',
    name: 'NVIDIA B200',
    model: 'Blackwell B200 NVL72 Rack',
    vram: '192GB HBM3e (8 TB/s)',
    interconnect: '1.8 TB/s NVLink 5 Fabric',
    spotPriceHr: 2.85,
    baselinePriceHr: 4.60,
    savingsPct: 38.0,
    badge: 'NVL72 FABRIC',
    architecture: 'Blackwell Dual-Die Fabric',
    enclaveType: 'NVIDIA CC',
    memoryEncryption: 'NVIDIA Confidential Computing On-Die RoT',
    gRpcProbeRate: '1,500ms Live Telemetry',
    activeCapacityNodes: 216,
  },
  {
    id: 'h100',
    name: 'NVIDIA H100',
    model: 'Hopper H100 SXM5 80GB',
    vram: '80GB HBM3 (3.35 TB/s)',
    interconnect: '900 GB/s NVLink 4',
    spotPriceHr: 1.94,
    baselinePriceHr: 3.29,
    savingsPct: 41.0,
    badge: 'CONFIDENTIAL READY',
    architecture: 'Hopper 4nm Tensor Core',
    enclaveType: 'AMD SEV-SNP',
    memoryEncryption: 'AMD SEV-SNP Encrypted State & Remote Attestation',
    gRpcProbeRate: '1,500ms Live Telemetry',
    activeCapacityNodes: 340,
  },
  {
    id: 'a100',
    name: 'NVIDIA A100',
    model: 'Ampere A100 SXM4 80GB (MIG-Slicing)',
    vram: '80GB HBM2e (2 TB/s)',
    interconnect: '600 GB/s NVLink 3',
    spotPriceHr: 1.42,
    baselinePriceHr: 2.20,
    savingsPct: 35.5,
    badge: 'MIG ISOLATION',
    architecture: 'Ampere Multi-Instance GPU',
    enclaveType: 'AMD SEV-SNP',
    memoryEncryption: 'Hardware MIG Memory Partitioning & SEV Attested',
    gRpcProbeRate: '1,500ms Live Telemetry',
    activeCapacityNodes: 480,
  },
  {
    id: 'l40s',
    name: 'NVIDIA L40S',
    model: 'Ada Lovelace L40S PCIe 48GB',
    vram: '48GB GDDR6 (864 GB/s)',
    interconnect: '64 GB/s PCIe Gen4',
    spotPriceHr: 0.89,
    baselinePriceHr: 1.37,
    savingsPct: 35.0,
    badge: 'DECODE STREAMING',
    architecture: 'Ada Lovelace Enterprise',
    enclaveType: 'AMD SEV-SNP',
    memoryEncryption: 'Secure Encrypted Virtualization (SEV-ES)',
    gRpcProbeRate: '1,500ms Live Telemetry',
    activeCapacityNodes: 512,
  },
];

export const MultiAcceleratorCalculator: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('rubin');
  const [gpuCount, setGpuCount] = useState<number>(32);
  const [durationHours, setDurationHours] = useState<number>(720);
  const [lastTick, setLastTick] = useState<string>(new Date().toISOString());
  const [telemetryPulse, setTelemetryPulse] = useState<boolean>(false);

  const current = ACCELERATORS.find((a) => a.id === selectedId) || ACCELERATORS[0];

  // 1,500ms gRPC Telemetry Scanner Simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setLastTick(new Date().toISOString());
      setTelemetryPulse(true);
      setTimeout(() => setTelemetryPulse(false), 300);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const apexCost = current.spotPriceHr * gpuCount * durationHours;
  const legacyCost = current.baselinePriceHr * gpuCount * durationHours;
  const retainedCapital = legacyCost - apexCost;
  const computeUnits = Math.round(apexCost * 100);

  const adjustGpus = (delta: number) => {
    setGpuCount((prev) => Math.max(1, Math.min(512, prev + delta)));
  };

  const presetChips = [
    { label: '[8 GPUs]', count: 8 },
    { label: '[32 GPUs]', count: 32 },
    { label: '[128 GPUs]', count: 128 },
    { label: '[NVL72 Rack]', count: 72 },
  ];

  return (
    <div className="w-full space-y-6">
      {/* Telemetry Header Bar: 1,500ms gRPC Feed Status */}
      <div className="p-3.5 rounded-xl bg-[#080D16]/90 border border-[#00F0FF]/25 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 text-[#00F0FF] ${telemetryPulse ? 'scale-125' : ''} transition-transform`} />
          <span className="text-white font-bold">RUST/AXUM ASYNC gRPC FEED:</span>
          <span className="text-slate-400">SCANNING SPOT CAPACITY DELTAS EVERY 1,500ms</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500">
            LAST PROBE: <span className="text-[#00F0FF]">{lastTick.slice(11, 23)}Z</span>
          </span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 text-[10px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" />
            SYNCHRONIZED
          </div>
        </div>
      </div>

      {/* 1. Multi-Accelerator Switcher Tabs with Hardware Security Primitives */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {ACCELERATORS.map((acc) => {
          const isSelected = acc.id === selectedId;
          return (
            <button
              key={acc.id}
              onClick={() => setSelectedId(acc.id)}
              className={`text-left p-3.5 rounded-xl border transition relative overflow-hidden group ${
                isSelected
                  ? 'bg-[#080D16] border-[#00F0FF] shadow-[0_0_24px_rgba(0,240,255,0.2)]'
                  : 'bg-[#050811]/90 border-slate-800 hover:border-slate-700 hover:bg-[#070B14]'
              }`}
            >
              {isSelected && (
                <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-[#00F0FF]/30 to-transparent pointer-events-none" />
              )}
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-xs font-bold text-white font-mono tracking-tight">
                  {acc.name}
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                  -{acc.savingsPct}%
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono truncate mb-2">
                {acc.vram.split(' ')[0]}
              </div>
              <div className="flex items-baseline justify-between gap-1">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-sm font-bold text-[#00F0FF] font-mono">
                    ${acc.spotPriceHr.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">/hr</span>
                </div>
                <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/25">
                  {acc.enclaveType === 'DUAL_HARDWARE_ENCLAVE' ? 'SEV+CC' : acc.enclaveType}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. Interactive Fleet Calculator Card */}
      <div className="p-6 md:p-8 rounded-2xl bg-[#080D16]/90 border border-[#00F0FF]/25 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,240,255,0.05)]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Controls & Enclave Attributes */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00F0FF]">
                  CAPITAL RETAINED FLEET CALCULATOR
                </span>
                <h4 className="text-xl font-bold text-white tracking-tight mt-0.5">
                  {current.model}
                </h4>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-slate-400 block">HYPERSCALER BASELINE</span>
                <span className="text-xs font-mono text-slate-400 line-through">
                  ${current.baselinePriceHr.toFixed(2)} /hr
                </span>
              </div>
            </div>

            {/* Hardware Security Primitive Badge */}
            <div className="p-3 rounded-xl bg-[#050811] border border-[#00F0FF]/25 flex items-start gap-2.5 text-xs font-mono">
              <Lock className="w-4 h-4 text-[#00F0FF] shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold">CONFIDENTIAL ENCLAVE:</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/40 text-[#10B981] text-[10px] font-bold">
                    {current.enclaveType}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  {current.memoryEncryption}
                </div>
              </div>
            </div>

            {/* Stepper Control: GPU Count */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300">GPU FLEET ALLOCATION:</span>
                <span className="text-[#00F0FF] font-bold">{gpuCount} ACCELERATORS</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjustGpus(-8)}
                  className="w-11 h-11 rounded-lg bg-[#050811] border border-slate-700 text-[#00F0FF] hover:border-[#00F0FF] flex items-center justify-center font-mono font-bold text-lg active:scale-95 transition"
                  title="Decrease 8 GPUs"
                >
                  -
                </button>
                <div className="flex-1 px-4 py-2.5 rounded-lg bg-[#030508] border border-[#00F0FF]/30 font-mono text-center text-lg font-bold text-white">
                  {gpuCount} GPUs
                </div>
                <button
                  onClick={() => adjustGpus(8)}
                  className="w-11 h-11 rounded-lg bg-[#050811] border border-slate-700 text-[#00F0FF] hover:border-[#00F0FF] flex items-center justify-center font-mono font-bold text-lg active:scale-95 transition"
                  title="Increase 8 GPUs"
                >
                  +
                </button>
              </div>

              {/* Exact Preset Fleet Chips */}
              <div className="flex flex-wrap gap-2 pt-1">
                {presetChips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => setGpuCount(chip.count)}
                    className={`px-3 py-1 rounded-md text-xs font-mono transition font-bold ${
                      gpuCount === chip.count
                        ? 'bg-[#00F0FF] text-[#020305] shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                        : 'bg-[#050811] border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300">DURATION HOURS:</span>
                <span className="text-white font-bold">{durationHours} HOURS ({Math.round(durationHours / 24)} DAYS)</span>
              </div>
              <input
                type="range"
                min="24"
                max="2160"
                step="24"
                value={durationHours}
                onChange={(e) => setDurationHours(parseInt(e.target.value))}
                className="w-full accent-[#00F0FF] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>24 Hrs</span>
                <span>720 Hrs (30D)</span>
                <span>2160 Hrs (90D)</span>
              </div>
            </div>
          </div>

          {/* Right Metrics Display Card */}
          <div className="lg:col-span-5 p-6 rounded-xl bg-gradient-to-b from-[#050914] to-[#020409] border border-[#00F0FF]/30 shadow-inner space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-mono text-slate-400">SPOT SAVINGS MARGIN</span>
              <span className="text-base font-mono font-bold text-[#10B981] flex items-center gap-1">
                <TrendingDown className="w-4 h-4" />
                {current.savingsPct}% LESS THAN AWS/GCP
              </span>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                CAPITAL RETAINED (NET CLIENT SAVINGS)
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold text-[#00F0FF] font-mono tracking-tight mt-1 drop-shadow-[0_0_20px_rgba(0,240,255,0.35)]">
                ${retainedCapital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-lg bg-[#080D16] border border-slate-800">
                <div className="text-[10px] font-mono text-slate-400">APEX SPOT</div>
                <div className="text-sm font-mono font-bold text-white mt-0.5">
                  ${apexCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#080D16] border border-slate-800">
                <div className="text-[10px] font-mono text-slate-400">AWS / GCP</div>
                <div className="text-sm font-mono font-bold text-slate-500 line-through mt-0.5">
                  ${legacyCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#00F0FF]/10 border border-[#00F0FF]/25 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">COMPUTE UNITS (CU):</span>
              <span className="text-[#00F0FF] font-bold">{computeUnits.toLocaleString()} CU</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiAcceleratorCalculator;
