import React, { useState, useEffect } from 'react';
import { CyanFacetedJewelEmblem } from './components/CyanFacetedJewelEmblem';
import { ThreeServerBladeStage } from './components/ThreeServerBladeStage';
import { MultiAcceleratorCalculator } from './components/MultiAcceleratorCalculator';
import { GlobalMeshCanvas } from './components/GlobalMeshCanvas';
import { EnterpriseBentoGrid } from './components/EnterpriseBentoGrid';
import { TerminalCLIView } from './components/TerminalCLIView';
import { FuturesView } from './components/FuturesView';
import { BillingView } from './components/BillingView';
import {
  Terminal,
  TrendingUp,
  CreditCard,
  Shield,
  Layers,
  Zap,
  Globe,
  Key,
  ExternalLink,
  ChevronRight,
  Activity,
  ArrowRight
} from 'lucide-react';

export type ActivePage = 'landing' | 'terminal' | 'futures' | 'billing';

export function App() {
  const [activePage, setActivePage] = useState<ActivePage>('landing');

  // Sync route with window pathname on initial load and navigation
  useEffect(() => {
    const handleLocation = () => {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('/terminal')) {
        setActivePage('terminal');
      } else if (path.includes('/futures')) {
        setActivePage('futures');
      } else if (path.includes('/billing')) {
        setActivePage('billing');
      } else {
        setActivePage('landing');
      }
    };

    handleLocation();
    window.addEventListener('popstate', handleLocation);
    return () => window.removeEventListener('popstate', handleLocation);
  }, []);

  const navigateTo = (page: ActivePage) => {
    setActivePage(page);
    const targetPath = page === 'landing' ? '/' : `/${page}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#020305] text-slate-100 font-sans selection:bg-[#00F0FF]/30 selection:text-white flex flex-col justify-between">
      {/* 1. Global Permanent Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b border-[#00F0FF]/20 bg-[#080D16]/85 backdrop-blur-2xl transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
          {/* Brand Logo & Delta Emblem */}
          <div
            onClick={() => navigateTo('landing')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <CyanFacetedJewelEmblem className="w-8 h-8" />
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-extrabold tracking-wider font-mono text-white group-hover:text-[#00F0FF] transition">
                APEXSOVEREIGN<span className="text-[#00F0FF]">.AI</span>
              </span>
              <span className="text-[9px] font-mono text-slate-400 tracking-widest uppercase">
                TIER-6 SOVEREIGN INSTITUTIONAL NETWORK
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {[
              { id: 'landing', label: 'EXCHANGES' },
              { id: 'terminal', label: 'TERMINAL' },
              { id: 'futures', label: 'FUTURES' },
              { id: 'billing', label: 'BILLING & LEDGER' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id as ActivePage)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono tracking-wider transition ${
                  activePage === item.id
                    ? 'bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40 font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right Header Controls / SLA Badge & CTA */}
          <div className="flex items-center gap-3">
            <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-full bg-[#030508] border border-slate-800 text-[10px] font-mono">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              <span className="text-slate-300">10.4ms SLA</span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400 font-bold">AMD SEV-SNP & CC</span>
              <span className="text-slate-600">|</span>
              <span className="text-[#00F0FF]">$1.00 = 100 CU</span>
            </div>

            <button
              onClick={() => navigateTo('terminal')}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00F0FF] hover:bg-[#38BDF8] text-[#020305] font-mono font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(0,240,255,0.4)] transition active:scale-95"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>LAUNCH TERMINAL</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Global Live Telemetry Banner */}
      <div className="w-full bg-[#030508] border-b border-[#00F0FF]/15 px-4 py-2 text-center overflow-x-auto whitespace-nowrap">
        <div className="inline-flex items-center gap-4 text-[10px] sm:text-[11px] font-mono tracking-wider text-slate-300">
          <span className="flex items-center gap-1.5 text-[#00F0FF] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] animate-ping" />
            10.4ms SLA LATENCY
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-[#10B981] font-bold">99.999% MESH UPTIME</span>
          <span className="text-slate-600">•</span>
          <span className="text-white">$1.00 USD = 100 CU ATOMIC LEDGER</span>
          <span className="text-slate-600">•</span>
          <span className="text-[#38BDF8] font-bold">1.44 EXAFLOPS AGGREGATE POOL</span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400">RUBIN · B200 · H100 · A100 · L40S</span>
        </div>
      </div>

      {/* 3. Main Route Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex-1 w-full space-y-16">
        {activePage === 'landing' && (
          <div className="space-y-16">
            {/* Hero Section */}
            <section className="text-center max-w-4xl mx-auto space-y-6 pt-4 sm:pt-8">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[#00F0FF] text-xs font-mono tracking-widest uppercase">
                <Zap className="w-3.5 h-3.5" />
                <span>DISAGGREGATED COMPUTE ARBITRAGE</span>
              </div>

              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.08] uppercase">
                THE AUTONOMOUS GLOBAL <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00F0FF] via-[#38BDF8] to-[#10B981] drop-shadow-[0_0_35px_rgba(0,240,255,0.4)]">
                  SOVEREIGN COMPUTE EXCHANGE
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed">
                Spot compute arbitrage, line-rate eBPF routing, and disaggregated inference memory.
                Retain <strong className="text-[#10B981]">32% to 52% margin savings</strong> over AWS, Azure, and Google Cloud with atomic Supabase settlement.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <button
                  onClick={() => navigateTo('terminal')}
                  className="px-6 py-3.5 rounded-xl bg-[#00F0FF] hover:bg-[#38BDF8] text-[#020305] font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_30px_rgba(0,240,255,0.45)] transition active:scale-95"
                >
                  <Terminal className="w-4 h-4" />
                  <span>OPEN EXCHANGE TERMINAL</span>
                </button>
                <button
                  onClick={() => navigateTo('billing')}
                  className="px-6 py-3.5 rounded-xl bg-[#080D16] border border-slate-700 hover:border-[#00F0FF] text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition active:scale-95 hover:bg-[#0c1322]"
                >
                  <CreditCard className="w-4 h-4 text-[#00F0FF]" />
                  <span>TOP UP COMPUTE UNITS</span>
                </button>
              </div>
            </section>

            {/* STAGE 1: Sticky 3D Server Blade Deconstruction */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono text-[#00F0FF] uppercase tracking-wider">
                    MODULE 01 // 3D HARDWARE ARCHITECTURE
                  </span>
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    Deconstructed High-Density Server Blades
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-500 hidden sm:inline">
                  SCRUB LAYERS (L1 / L2 / L3)
                </span>
              </div>
              <ThreeServerBladeStage />
            </section>

            {/* STAGE 2: Multi-Accelerator Switcher & Fleet Calculator */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono text-[#00F0FF] uppercase tracking-wider">
                    MODULE 02 // REAL-TIME SPOT ARBITRAGE
                  </span>
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    Multi-Accelerator Switcher & Fleet Calculator
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-500 hidden sm:inline">
                  OBSIDIAN GLASS STEPPERS
                </span>
              </div>
              <MultiAcceleratorCalculator />
            </section>

            {/* STAGE 3: Animated Global Vector Mesh Canvas */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono text-[#00F0FF] uppercase tracking-wider">
                    MODULE 03 // VECTOR ROUTING MESH
                  </span>
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    Global Ingress Mesh & Real-Time Pulses
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-500 hidden sm:inline">
                  VIRGINIA · FRANKFURT · SINGAPORE
                </span>
              </div>
              <GlobalMeshCanvas />
            </section>

            {/* STAGE 4: Enterprise Services 6-Card Bento Grid */}
            <section className="space-y-4">
              <EnterpriseBentoGrid
                onSelectAction={(actionId) => {
                  if (actionId === 'capacity-futures' || actionId === 'token-futures') {
                    navigateTo('futures');
                  } else {
                    navigateTo('terminal');
                  }
                }}
              />
            </section>
          </div>
        )}

        {/* Tab 2: Live Exchange CLI Terminal */}
        {activePage === 'terminal' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-[#00F0FF] uppercase tracking-wider">
                  EXCHANGE CONTROL PLANE
                </span>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Autonomous CLI Terminal & JSON Inspector
                </h2>
              </div>
              <button
                onClick={() => navigateTo('landing')}
                className="text-xs font-mono text-slate-400 hover:text-white"
              >
                ← BACK TO OVERVIEW
              </button>
            </div>
            <TerminalCLIView />
          </div>
        )}

        {/* Tab 3: Institutional Futures Exchange */}
        {activePage === 'futures' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-[#00F0FF] uppercase tracking-wider">
                  INSTITUTIONAL COMMODITY CLEARING
                </span>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Capacity Futures & Token Production
                </h2>
              </div>
              <button
                onClick={() => navigateTo('landing')}
                className="text-xs font-mono text-slate-400 hover:text-white"
              >
                ← BACK TO OVERVIEW
              </button>
            </div>
            <FuturesView />
          </div>
        )}

        {/* Tab 4: Atomic Billing, Ledger & API Keys */}
        {activePage === 'billing' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-[#00F0FF] uppercase tracking-wider">
                  CRYPTOGRAPHIC TREASURY & ONBOARDING
                </span>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Atomic Ledger, PayPal Settlement & Bearer Keys
                </h2>
              </div>
              <button
                onClick={() => navigateTo('landing')}
                className="text-xs font-mono text-slate-400 hover:text-white"
              >
                ← BACK TO OVERVIEW
              </button>
            </div>
            <BillingView />
          </div>
        )}
      </main>

      {/* 4. Sovereign Production Footer */}
      <footer className="w-full border-t border-slate-900 bg-[#020305] py-8 text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CyanFacetedJewelEmblem size={24} glow={false} />
            <span>APEXSOVEREIGN.AI // CRYPTOGRAPHIC CONTROL PLANE · V3.2.0</span>
          </div>

          <div className="flex items-center gap-6 text-[11px]">
            <button onClick={() => navigateTo('landing')} className="hover:text-white">
              EXCHANGES
            </button>
            <button onClick={() => navigateTo('terminal')} className="hover:text-white">
              TERMINAL
            </button>
            <button onClick={() => navigateTo('futures')} className="hover:text-white">
              FUTURES
            </button>
            <button onClick={() => navigateTo('billing')} className="hover:text-white">
              BILLING
            </button>
          </div>

          <div className="text-[10px] text-slate-600">
            ALL SYSTEMS NOMINAL · 10.4ms P99 SLA
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
