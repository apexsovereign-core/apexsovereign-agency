import React from 'react';
import { 
  Cpu, 
  Zap, 
  ShieldCheck, 
  ArrowRight, 
  Terminal, 
  Activity, 
  Sparkles, 
  Layers, 
  CheckCircle2, 
  Database, 
  Server, 
  Lock 
} from 'lucide-react';

interface EnterpriseHeroProps {
  onOpenControlPlane: () => void;
  onExploreArchitecture: () => void;
  onNavigateDevelopers?: () => void;
  onNavigateSecurity?: () => void;
}

export const EnterpriseHero: React.FC<EnterpriseHeroProps> = ({
  onOpenControlPlane,
  onExploreArchitecture,
  onNavigateDevelopers,
  onNavigateSecurity,
}) => {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/90 via-[#070d1a]/95 to-[#050912] p-8 sm:p-12 mb-10 shadow-2xl">
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-1/4 -z-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 -z-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Protocol Status Pill */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-semibold tracking-wide">V21 COMPUTATIONAL MESH</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300">RUST TOKIO CORE ACTIVE</span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="text-emerald-400 font-bold">99.999% SLA</span>
          <span className="text-slate-600">•</span>
          <span>90s Hot-Swap Failover</span>
          <span className="text-slate-600">•</span>
          <span className="text-cyan-400">0% Weight Retention</span>
        </div>
      </div>

      {/* Primary Headline & Subheadline */}
      <div className="max-w-4xl space-y-5">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12]">
          Autonomous Infrastructure &amp;{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">
            Real-Time GPU Arbitrage
          </span>{' '}
          for the AI Economy.
        </h1>

        <p className="text-base sm:text-lg text-slate-300 max-w-3xl leading-relaxed">
          Dynamically discover, route, execute, and govern AI workloads across distributed bare-metal infrastructure through an asynchronous Rust execution layer—slashing fine-tuning and inference overhead by up to 40%.
        </p>

        {/* V21 Computational Mesh Clarification Banner */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 leading-relaxed max-w-3xl flex items-start gap-3">
          <Layers className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-cyan-300">V21 Computational Mesh:</span> ApexSovereign&apos;s distributed orchestration layer for dynamically allocating AI workloads across heterogeneous compute infrastructure with sub-millisecond zero-copy pointer routing and cryptographic isolation.
          </div>
        </div>

        {/* Call to Action Buttons */}
        <div className="pt-2 flex flex-wrap items-center gap-4">
          <button
            onClick={onOpenControlPlane}
            className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 font-black text-sm tracking-tight transition-all shadow-[0_0_30px_rgba(67,228,255,0.35)] flex items-center gap-2 cursor-pointer"
          >
            <Activity className="w-4 h-4 text-slate-950" />
            <span>Open Control Plane</span>
            <ArrowRight className="w-4 h-4 text-slate-950" />
          </button>

          <button
            onClick={onExploreArchitecture}
            className="px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 font-semibold text-sm border border-slate-700 hover:border-cyan-500/50 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>Explore Architecture Specs</span>
          </button>

          {onNavigateDevelopers && (
            <button
              onClick={onNavigateDevelopers}
              className="px-5 py-3.5 rounded-xl bg-slate-950 hover:bg-slate-900 text-slate-300 font-medium text-xs border border-slate-800 hover:border-slate-600 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Developer API &amp; SDK</span>
            </button>
          )}

          {onNavigateSecurity && (
            <button
              onClick={onNavigateSecurity}
              className="px-5 py-3.5 rounded-xl bg-slate-950 hover:bg-slate-900 text-slate-300 font-medium text-xs border border-slate-800 hover:border-slate-600 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Trust &amp; SOC2 Audit</span>
            </button>
          )}
        </div>
      </div>

      {/* Real-Time Live Architecture Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10 pt-8 border-t border-slate-800/80">
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Rust Tokio Core</div>
          <div className="text-lg font-bold text-white mt-1 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>&lt; 2ms Routing</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Asynchronous zero-copy memory</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Market Discovery</div>
          <div className="text-lg font-bold text-white mt-1 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>1,500ms Cycle</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Global spot-rate synchronization</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Automated Failover</div>
          <div className="text-lg font-bold text-white mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>90s Hot-Swap</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Deterministic lane switching</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Data Retention</div>
          <div className="text-lg font-bold text-white mt-1 flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-cyan-300" />
            <span>0% Stateless</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Weights never stored on disk</div>
        </div>
      </div>
    </div>
  );
};
