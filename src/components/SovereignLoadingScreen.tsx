import React, { useState, useEffect } from 'react';
import { ApexLogo } from './ApexLogo';
import { ShieldCheck, Cpu, Terminal, Activity, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';

interface DiagnosticStep {
  id: string;
  subsystem: string;
  label: string;
  detail: string;
  durationMs: number;
}

const BOOT_DIAGNOSTICS: DiagnosticStep[] = [
  {
    id: 'kernel',
    subsystem: 'CORE_KERNEL',
    label: 'Initializing Sovereign Work OS Kernel v4.2',
    detail: 'Zero-trust microkernel initialized in memory space',
    durationMs: 350,
  },
  {
    id: 'merkle',
    subsystem: 'CRYPTO_AUDIT',
    label: 'Verifying SHA-256 State Roots & Ledger Invariance',
    detail: 'Double-entry balance invariants validated: 100% verified',
    durationMs: 400,
  },
  {
    id: 'ebpf',
    subsystem: 'EBPF_MESH',
    label: 'Attaching Anycast eBPF Multi-Region Failover Mesh',
    detail: 'us-east-1, eu-central-1, ap-southeast-1 latency < 4.2ms',
    durationMs: 450,
  },
  {
    id: 'nvlink',
    subsystem: 'NVLINK_FABRIC',
    label: 'Mapping B200 / H100 3.2 Tbps Bisection Bandwidth',
    detail: 'Cluster topology synchronized across 2,500 active VCUs',
    durationMs: 380,
  },
  {
    id: 'arbitrage',
    subsystem: 'ARBITRAGE_ENGINE',
    label: 'Calibrating Real-Time Spot GPU Arbitrage Margins',
    detail: 'Spot savings delta verified: 38.5% below public hyperscalers',
    durationMs: 320,
  },
  {
    id: 'ready',
    subsystem: 'SOVEREIGN_AUTH',
    label: 'Sovereign Cryptographic Clearance Granted',
    detail: 'Operational perimeter sealed. All endpoints live.',
    durationMs: 200,
  },
];

export interface SovereignLoadingScreenProps {
  /** Callback fired once initialization sequence is completed or dismissed */
  onComplete?: () => void;
  /** Whether the loading screen should automatically dismiss once reaching 100% */
  autoDismiss?: boolean;
}

export const SovereignLoadingScreen: React.FC<SovereignLoadingScreenProps> = ({
  onComplete,
  autoDismiss = true,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (currentStepIndex < BOOT_DIAGNOSTICS.length) {
      const step = BOOT_DIAGNOSTICS[currentStepIndex];
      timer = setTimeout(() => {
        setCompletedSteps(prev => [...prev, step.id]);
        const nextIndex = currentStepIndex + 1;
        setCurrentStepIndex(nextIndex);
        const newProgress = Math.round((nextIndex / BOOT_DIAGNOSTICS.length) * 100);
        setProgress(newProgress);

        if (nextIndex >= BOOT_DIAGNOSTICS.length) {
          setIsDone(true);
          if (autoDismiss) {
            setTimeout(() => {
              if (onComplete) onComplete();
            }, 600);
          }
        }
      }, step.durationMs);
    }

    return () => clearTimeout(timer);
  }, [currentStepIndex, autoDismiss, onComplete]);

  const handleEnterWorkspace = () => {
    if (onComplete) onComplete();
  };

  return (
    <div
      id="sovereign-boot-splash"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#020617] text-slate-100 select-none overflow-hidden"
    >
      {/* Background Cybernetic Grid & Ambient Cyan Glow */}
      <div 
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0, 240, 255, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 240, 255, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="absolute w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[140px] pointer-events-none" />

      {/* Main Command Console Card */}
      <div className="relative z-10 w-full max-w-xl mx-4 p-6 sm:p-8 rounded-2xl bg-slate-950/90 border border-slate-800 shadow-[0_0_50px_rgba(0,240,255,0.15)] backdrop-blur-xl">
        
        {/* Central Emblem & Orbital Rings */}
        <div className="relative flex items-center justify-center py-6">
          {/* Orbital Outer Ring 1 */}
          <div className="absolute w-44 h-44 rounded-full border border-cyan-500/20 border-dashed animate-[spin_20s_linear_infinite] pointer-events-none" />
          {/* Orbital Middle Ring 2 */}
          <div className="absolute w-36 h-36 rounded-full border border-cyan-400/30 border-t-cyan-400 animate-[spin_10s_linear_infinite_reverse] pointer-events-none" />
          {/* Inner Cyan Radar Pulse */}
          <div className="absolute w-28 h-28 rounded-full bg-cyan-500/10 animate-ping pointer-events-none" />

          {/* Central Precision Diamond Cyan Logo */}
          <ApexLogo
            size={84}
            glow
            pulse={!isDone}
            variant="icon"
          />
        </div>

        {/* Brand Lockup Title */}
        <div className="text-center mt-2 mb-6">
          <div className="inline-flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-sans">
              ApexSovereign<span className="text-[#00f0ff] drop-shadow-[0_0_12px_rgba(0,240,255,0.7)]">.ai</span>
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider rounded bg-cyan-950 text-[#00f0ff] border border-cyan-500/40">
              CORE v4.2
            </span>
          </div>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Autonomous Enterprise Work OS & Sovereign Compute Broker
          </p>
        </div>

        {/* Progress Metric Bar */}
        <div className="mb-5">
          <div className="flex justify-between items-center text-xs font-mono mb-2">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#00f0ff] animate-pulse" />
              <span>CRYPTOGRAPHIC INITIALIZATION</span>
            </span>
            <span className="text-[#00f0ff] font-bold tabular-nums">
              {progress}%
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-[#00f0ff] to-cyan-300 transition-all duration-300 ease-out shadow-[0_0_12px_rgba(0,240,255,0.8)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Real-Time Diagnostic Feed */}
        <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800/80 font-mono text-[11px] space-y-2 mb-6 min-h-[140px] max-h-[160px] overflow-y-auto">
          {BOOT_DIAGNOSTICS.map((step, idx) => {
            const isCompleted = completedSteps.includes(step.id);
            const isCurrent = idx === currentStepIndex && !isDone;

            if (idx > currentStepIndex) return null;

            return (
              <div
                key={step.id}
                className={`flex items-start gap-2 transition-opacity duration-200 ${
                  isCompleted ? 'text-slate-300' : isCurrent ? 'text-[#00f0ff]' : 'text-slate-500'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-[#00f0ff] border-t-transparent animate-spin shrink-0 mt-0.5" />
                )}
                <div className="flex-1 leading-snug">
                  <span className="text-slate-500 mr-1.5">[{step.subsystem}]</span>
                  <span className="font-medium">{step.label}</span>
                  {isCompleted && (
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      → {step.detail}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>SHA-256 SEAL VALIDATED</span>
          </div>

          <button
            onClick={handleEnterWorkspace}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
              isDone
                ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 shadow-[0_0_20px_rgba(0,240,255,0.4)] scale-100'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <span>{isDone ? 'ENTER COMMAND WORKSPACE' : 'BYPASS DIAGNOSTICS'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
};
