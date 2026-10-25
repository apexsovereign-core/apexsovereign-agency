import React, { useState } from 'react';
import { Cpu, DollarSign, TrendingDown, Zap, Server, Shield, Sparkles } from 'lucide-react';

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
  tdpWatts: string;
  fp8Tflops: string;
}

export const ACCELERATORS: AcceleratorSpec[] = [
  {
    id: 'rubin',
    name: 'NVIDIA Rubin',
    model: 'Rubin HBM4 Enterprise Node',
    vram: '288GB HBM4 (22 TB/s)',
    interconnect: '3.6 TB/s NVLink 6',
    spotPriceHr: 2.40,
    baselinePriceHr: 5.10,
    savingsPct: 52,
    badge: 'NEXT-GEN APEX',
    architecture: 'Vera Rubin Next-Gen Architecture',
    tdpWatts: '1200W Liquid',
    fp8Tflops: '36,000 TFLOPS',
  },
  {
    id: 'b200',
    name: 'NVIDIA B200',
    model: 'Blackwell B200 NVL72 Rack',
    vram: '192GB HBM3e (8 TB/s)',
    interconnect: '1.8 TB/s NVLink 5',
    spotPriceHr: 2.85,
    baselinePriceHr: 4.60,
    savingsPct: 38,
    badge: 'FLAGSHIP CLUSTER',
    architecture: 'Blackwell Dual-Die Fabric',
    tdpWatts: '1000W Direct-to-Chip',
    fp8Tflops: '20,000 TFLOPS',
  },
  {
    id: 'h100',
    name: 'NVIDIA H100',
    model: 'Hopper H100 SXM5 80GB',
    vram: '80GB HBM3 (3.35 TB/s)',
    interconnect: '900 GB/s NVLink 4',
    spotPriceHr: 1.94,
    baselinePriceHr: 3.29,
    savingsPct: 41,
    badge: 'HIGH DEMAND',
    architecture: 'Hopper 4nm Tensor Core',
    tdpWatts: '700W SXM5',
    fp8Tflops: '4,000 TFLOPS',
  },
  {
    id: 'a100',
    name: 'NVIDIA A100',
    model: 'Ampere A100 SXM4 80GB (MIG-Slicing)',
    vram: '80GB HBM2e (2 TB/s)',
    interconnect: '600 GB/s NVLink 3',
    spotPriceHr: 1.42,
    baselinePriceHr: 2.20,
    savingsPct: 35,
    badge: 'MIG PARTITIONED',
    architecture: 'Ampere Multi-Instance GPU',
    tdpWatts: '400W SXM4',
    fp8Tflops: '1,248 TFLOPS',
  },
  {
    id: 'l40s',
    name: 'NVIDIA L40S',
    model: 'Ada Lovelace L40S PCIe 48GB',
    vram: '48GB GDDR6 (864 GB/s)',
    interconnect: '64 GB/s PCIe Gen4',
    spotPriceHr: 0.89,
    baselinePriceHr: 1.37,
    savingsPct: 35,
    badge: 'DECODE STREAMING',
    architecture: 'Ada Lovelace Enterprise',
    tdpWatts: '350W Passive',
    fp8Tflops: '1,466 TFLOPS',
  },
];

export const MultiAcceleratorCalculator: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('rubin');
  const [gpuCount, setGpuCount] = useState<number>(32);
  const [durationHours, setDurationHours] = useState<number>(720); // 1 month

  const current = ACCELERATORS.find((a) => a.id === selectedId) || ACCELERATORS[0];

  // Pricing calculations
  const apexCost = current.spotPriceHr * gpuCount * durationHours;
  const legacyCost = current.baselinePriceHr * gpuCount * durationHours;
  const retainedCapital = legacyCost - apexCost;
  const computeUnits = Math.round(apexCost * 100);

  const adjustGpus = (delta: number) => {
    setGpuCount((prev) => Math.max(1, Math.min(512, prev + delta)));
  };

  return (
    <div className="w-full space-y-6">
      {/* 1. Multi-Accelerator Switcher Tabs */}
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
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-bold text-[#00F0FF] font-mono">
                  ${acc.spotPriceHr.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">/hr</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. Interactive Fleet Calculator Card */}
      <div className="p-6 md:p-8 rounded-2xl bg-[#080D16]/90 border border-[#00F0FF]/25 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,240,255,0.05)]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Stepper & Preset Controls */}
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
                <span className="text-[10px] font-mono text-slate-400 block">BASE HYPERSCALER</span>
                <span className="text-xs font-mono text-slate-400 line-through">
                  ${current.baselinePriceHr.toFixed(2)} /hr
                </span>
              </div>
            </div>

            {/* Stepper Control: GPU Count */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300">GPU FLEET SIZE:</span>
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

              {/* Quick Stepper Presets */}
              <div className="flex flex-wrap gap-2 pt-1">
                {[8, 32, 64, 128, 256].map((count) => (
                  <button
                    key={count}
                    onClick={() => setGpuCount(count)}
                    className={`px-3 py-1 rounded-md text-xs font-mono transition ${
                      gpuCount === count
                        ? 'bg-[#00F0FF] text-[#020305] font-bold shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                        : 'bg-[#050811] border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {count === 256 ? 'NVL72 Cluster' : `${count} GPUs`}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300">RESERVATION DURATION:</span>
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
                <span>24 Hrs (1 Day)</span>
                <span>720 Hrs (30 Days)</span>
                <span>2160 Hrs (90 Days)</span>
              </div>
            </div>
          </div>

          {/* Right Metrics Display Card */}
          <div className="lg:col-span-5 p-6 rounded-xl bg-gradient-to-b from-[#050914] to-[#020409] border border-[#00F0FF]/30 shadow-inner space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-mono text-slate-400">SPOT SAVINGS RATE</span>
              <span className="text-base font-mono font-bold text-[#10B981] flex items-center gap-1">
                <TrendingDown className="w-4 h-4" />
                {current.savingsPct}% LESS THAN AWS/GCP
              </span>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                CAPITAL RETAINED (NET SAVINGS)
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold text-[#00F0FF] font-mono tracking-tight mt-1 drop-shadow-[0_0_20px_rgba(0,240,255,0.35)]">
                ${retainedCapital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-lg bg-[#080D16] border border-slate-800">
                <div className="text-[10px] font-mono text-slate-400">APEX SOVEREIGN</div>
                <div className="text-sm font-mono font-bold text-white mt-0.5">
                  ${apexCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#080D16] border border-slate-800">
                <div className="text-[10px] font-mono text-slate-400">AWS / AZURE</div>
                <div className="text-sm font-mono font-bold text-slate-500 line-through mt-0.5">
                  ${legacyCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#00F0FF]/10 border border-[#00F0FF]/25 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">EQUIVALENT COMPUTE UNITS:</span>
              <span className="text-[#00F0FF] font-bold">{computeUnits.toLocaleString()} CU</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
