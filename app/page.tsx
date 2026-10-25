'use client';

import React from 'react';
import Link from 'next/link';
import HardwareDeconstructionStage from '../components/hardware-deconstruction-stage';
import MultiAcceleratorCalculator from '../components/multi-accelerator-calculator';
import ServiceSuiteMatrix from '../components/service-suite-matrix';
import { GlobalMeshCanvas } from '../src/components/GlobalMeshCanvas';
import { EnterpriseBentoGrid } from '../src/components/EnterpriseBentoGrid';
import { Zap, Terminal, CreditCard, Shield, TrendingDown } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full space-y-16">
      {/* 1. Elevated Hero Header */}
      <section className="text-center max-w-4xl mx-auto space-y-6 pt-4 sm:pt-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[#00F0FF] text-xs font-mono tracking-widest uppercase">
          <Zap className="w-3.5 h-3.5" />
          <span>DISAGGREGATED COMPUTE ARBITRAGE & INSTITUTIONAL MESH</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.08] uppercase">
          THE AUTONOMOUS GLOBAL <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00F0FF] via-[#38BDF8] to-[#10B981] drop-shadow-[0_0_35px_rgba(0,240,255,0.4)]">
            SOVEREIGN COMPUTE EXCHANGE
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed">
          Sub-18ms routing to lowest-cost global bare-metal compute. Retain{' '}
          <strong className="text-[#10B981]">32% to 52% margin savings</strong> over AWS, Azure, and Google Cloud with atomic Supabase double-entry settlement and AMD SEV-SNP confidential enclaves.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/terminal"
            className="px-6 py-3.5 rounded-xl bg-[#00F0FF] hover:bg-[#38BDF8] text-[#020305] font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_30px_rgba(0,240,255,0.45)] transition"
          >
            <Terminal className="w-4 h-4" />
            <span>OPEN EXCHANGE TERMINAL</span>
          </Link>
          <Link
            href="/billing"
            className="px-6 py-3.5 rounded-xl bg-[#080D16] border border-slate-700 hover:border-[#00F0FF] text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition hover:bg-[#0c1322]"
          >
            <CreditCard className="w-4 h-4 text-[#00F0FF]" />
            <span>TOP UP COMPUTE UNITS</span>
          </Link>
        </div>
      </section>

      {/* 2. Elevated 3D Hardware Deconstruction Stage (Sticky 3-Layer Viewport) */}
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
            PROCEDURAL RUBIN · B200 · H100 · A100 · L40S
          </span>
        </div>
        <HardwareDeconstructionStage />
      </section>

      {/* 3. Real-Time Arbitrage Stepper Calculator */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-mono text-[#00F0FF] uppercase tracking-wider">
              MODULE 02 // REAL-TIME SPOT ARBITRAGE
            </span>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Spot Arbitrage Stepper Calculator
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-500 hidden sm:inline">
            PRESETS: [8 GPUs] · [32 GPUs] · [128 GPUs] · [NVL72 Rack]
          </span>
        </div>
        <MultiAcceleratorCalculator />
      </section>

      {/* 4. Complete 6-Service Institutional Suite Matrix */}
      <section className="space-y-4">
        <ServiceSuiteMatrix />
      </section>

      {/* 5. Animated Global Vector Mesh Topology Canvas */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-mono text-[#00F0FF] uppercase tracking-wider">
              MODULE 04 // VECTOR ROUTING MESH
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

      {/* 6. 6-Card Enterprise Bento Grid */}
      <section className="space-y-4">
        <EnterpriseBentoGrid />
      </section>
    </div>
  );
}
