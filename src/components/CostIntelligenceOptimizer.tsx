import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Cpu, 
  Sparkles, 
  ArrowRight, 
  Zap, 
  Layers, 
  CheckCircle2, 
  CreditCard 
} from 'lucide-react';

interface CostOptimizerProps {
  onDeployWorkload?: () => void;
}

export const CostIntelligenceOptimizer: React.FC<CostOptimizerProps> = ({ onDeployWorkload }) => {
  const [gpuModel, setGpuModel] = useState<'H100' | 'B200' | 'A100' | 'L40S'>('H100');
  const [gpuCount, setGpuCount] = useState<number>(8);
  const [hoursPerMonth, setHoursPerMonth] = useState<number>(500);

  const pricingTable = {
    H100: { name: 'NVIDIA H100 80GB SXM5', hyperscalerRate: 3.85, apexSpotRate: 1.94 },
    B200: { name: 'NVIDIA B200 NVL72 192GB', hyperscalerRate: 5.20, apexSpotRate: 2.85 },
    A100: { name: 'NVIDIA A100 80GB SXM4', hyperscalerRate: 2.65, apexSpotRate: 1.42 },
    L40S: { name: 'NVIDIA L40S 48GB PCIe', hyperscalerRate: 1.65, apexSpotRate: 0.89 },
  };

  const selectedPricing = pricingTable[gpuModel];
  const hyperscalerMonthlyCost = gpuCount * hoursPerMonth * selectedPricing.hyperscalerRate;
  const apexMonthlyCost = gpuCount * hoursPerMonth * selectedPricing.apexSpotRate;
  const monthlySavings = hyperscalerMonthlyCost - apexMonthlyCost;
  const annualSavings = monthlySavings * 12;
  const savingsPct = Math.round(((hyperscalerMonthlyCost - apexMonthlyCost) / hyperscalerMonthlyCost) * 100);

  return (
    <div className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-[#050912] p-6 sm:p-8 space-y-8 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono mb-2">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>REAL-TIME ARBITRAGE FINANCIAL INTELLIGENCE</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Automated Cost-Intelligence &amp; Savings Optimizer
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Simulate your infrastructure savings versus legacy cloud hyperscalers on pure bare-metal spot routing.
          </p>
        </div>

        <div className="text-right">
          <span className="text-[11px] font-mono text-slate-400">Projected Margin Advantage</span>
          <div className="text-2xl font-black text-emerald-400 font-mono">+{savingsPct}% NET ROI</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Input Sliders & Selectors */}
        <div className="lg:col-span-6 space-y-6">
          {/* Accelerator Selector */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-400 uppercase tracking-wide">Target Accelerator Tier:</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['H100', 'B200', 'A100', 'L40S'] as const).map((model) => (
                <button
                  key={model}
                  onClick={() => setGpuModel(model)}
                  className={`p-2.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                    gpuModel === model
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  {model}
                </button>
              ))}
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              Selected: {selectedPricing.name}
            </div>
          </div>

          {/* Cluster GPU Count Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Cluster Size (Active GPUs):</span>
              <span className="text-cyan-400 font-bold">{gpuCount} GPUs</span>
            </div>
            <input
              type="range"
              min={1}
              max={64}
              step={1}
              value={gpuCount}
              onChange={(e) => setGpuCount(Number(e.target.value))}
              className="w-full accent-cyan-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>1 Node</span>
              <span>16 Nodes</span>
              <span>32 Nodes</span>
              <span>64 Nodes</span>
            </div>
          </div>

          {/* Monthly Run Hours Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Monthly Runtime Volume:</span>
              <span className="text-cyan-400 font-bold">{hoursPerMonth} Hours / Month</span>
            </div>
            <input
              type="range"
              min={50}
              max={730}
              step={10}
              value={hoursPerMonth}
              onChange={(e) => setHoursPerMonth(Number(e.target.value))}
              className="w-full accent-cyan-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>50 hrs (Batch)</span>
              <span>350 hrs (Intermittent)</span>
              <span>730 hrs (24/7 Production)</span>
            </div>
          </div>
        </div>

        {/* Right: Real-Time Financial Ledger Simulation */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="text-xs font-mono text-slate-400 uppercase tracking-wide">
              Financial Settlement Breakdown (Monthly)
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Hyperscaler Retail Quote:</span>
                <span className="font-mono text-rose-400 line-through">
                  ${Math.round(hyperscalerMonthlyCost).toLocaleString()} / mo
                </span>
              </div>

              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-slate-300">ApexSovereign Spot Arbitrage:</span>
                <span className="font-mono text-cyan-300 font-bold text-sm">
                  ${Math.round(apexMonthlyCost).toLocaleString()} / mo
                </span>
              </div>

              <div className="h-px bg-slate-800 my-2" />

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-emerald-400 font-bold">Total Monthly Savings:</div>
                  <div className="text-[10px] text-slate-500">Net unallocated capital preserved</div>
                </div>
                <div className="text-xl font-black font-mono text-emerald-400">
                  +${Math.round(monthlySavings).toLocaleString()}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="text-xs font-mono text-white font-bold">Annualized Cumulative Savings:</div>
                  <div className="text-[10px] text-slate-500">12-Month recurring run-rate reduction</div>
                </div>
                <div className="text-xl font-black font-mono text-cyan-400">
                  +${Math.round(annualSavings).toLocaleString()} / yr
                </div>
              </div>
            </div>
          </div>

          {onDeployWorkload && (
            <button
              onClick={onDeployWorkload}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs font-mono flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
            >
              <CreditCard className="w-4 h-4 text-slate-950" />
              <span>Lock Arbitrage Rates &amp; Provision Cluster</span>
              <ArrowRight className="w-4 h-4 text-slate-950" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
