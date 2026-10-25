import React, { useState } from 'react';
import { 
  Cpu, 
  Zap, 
  ShieldCheck, 
  Bot, 
  ArrowRight, 
  Sparkles, 
  BarChart3, 
  Database, 
  CheckCircle2, 
  CreditCard, 
  Building2, 
  Workflow,
  MessageSquare,
  Activity,
  Server,
  RefreshCw,
  Globe,
  Radio,
  Lock,
  Flame,
  AlertTriangle
} from 'lucide-react';
import { SUBSCRIPTION_TIERS } from './PricingPlans';
import { SubscriptionTier } from '../types';
import { AutonomousNeuralAnalytics } from './AutonomousNeuralAnalytics';
import { FrictionlessAgentSandbox } from './FrictionlessAgentSandbox';
import { EnterpriseHero } from './EnterpriseHero';
import { TechnicalEvidencePanel } from './TechnicalEvidencePanel';
import { GlobalSwarmMap } from './GlobalSwarmMap';
import { CostIntelligenceOptimizer } from './CostIntelligenceOptimizer';

interface SolutionsViewProps {
  onSelectPlan: (tier: SubscriptionTier) => void;
  onOpenConcierge: () => void;
  onNavigatePricing: () => void;
  onNavigateCrm?: () => void;
  onNavigateSwarm?: () => void;
  onOpenControlPlane?: () => void;
  onExploreArchitecture?: () => void;
  onNavigateDevelopers?: () => void;
  onNavigateSecurity?: () => void;
}

export const SolutionsView: React.FC<SolutionsViewProps> = ({
  onSelectPlan,
  onOpenConcierge,
  onNavigatePricing,
  onNavigateCrm,
  onNavigateSwarm,
  onOpenControlPlane,
  onExploreArchitecture,
  onNavigateDevelopers,
  onNavigateSecurity
}) => {
  const [teamSize, setTeamSize] = useState<number>(25);
  const [manualHoursPerWeek, setManualHoursPerWeek] = useState<number>(40);

  // Self-Healing Chaos Simulation State
  const [chaosSimulating, setChaosSimulating] = useState<boolean>(false);
  const [chaosStage, setChaosStage] = useState<'IDLE' | 'SPIKE_DETECTED' | 'AUTO_FAILOVER_ENGAGED' | 'SELF_HEALED'>('IDLE');
  const [workerCount, setWorkerCount] = useState<number>(4);
  const [surgeVelocity, setSurgeVelocity] = useState<number>(38);
  const [activePoolLatency, setActivePoolLatency] = useState<number>(1.4);
  const [circuitState, setCircuitState] = useState<'CLOSED' | 'HALF_OPEN' | 'AUTO_FAILOVER'>('CLOSED');
  const [noncesProtectedCount, setNoncesProtectedCount] = useState<number>(14892);

  // Financial ROI calculations
  const avgHourlyCost = 65; // USD/hour blended rate
  const annualManualCost = teamSize * manualHoursPerWeek * 52 * avgHourlyCost;
  const autonomousEfficiency = 0.82; // 82% automation rate
  const annualSavings = Math.round(annualManualCost * autonomousEfficiency);
  const monthlySavings = Math.round(annualSavings / 12);

  const recommendedTier = 
    teamSize > 50 ? SUBSCRIPTION_TIERS[2] : (teamSize > 10 ? SUBSCRIPTION_TIERS[1] : SUBSCRIPTION_TIERS[0]);

  const triggerChaosSpikeSimulation = () => {
    if (chaosSimulating) return;
    setChaosSimulating(true);
    setChaosStage('SPIKE_DETECTED');
    setSurgeVelocity(480);
    setActivePoolLatency(14.8);
    setCircuitState('HALF_OPEN');

    setTimeout(() => {
      setChaosStage('AUTO_FAILOVER_ENGAGED');
      setWorkerCount(16);
      setCircuitState('AUTO_FAILOVER');
      setActivePoolLatency(2.1);
      setNoncesProtectedCount(prev => prev + 124);
    }, 1200);

    setTimeout(() => {
      setChaosStage('SELF_HEALED');
      setWorkerCount(6);
      setSurgeVelocity(44);
      setActivePoolLatency(1.3);
      setCircuitState('CLOSED');
    }, 3200);

    setTimeout(() => {
      setChaosSimulating(false);
      setChaosStage('IDLE');
      setWorkerCount(4);
    }, 5000);
  };

  return (
    <div className="space-y-16 py-4 animate-in fade-in duration-300">
      {/* Target 2: Authoritative Enterprise Infrastructure Hero */}
      <EnterpriseHero
        onOpenControlPlane={onOpenControlPlane || (() => onSelectPlan(recommendedTier))}
        onExploreArchitecture={onExploreArchitecture || onNavigatePricing}
        onNavigateDevelopers={onNavigateDevelopers}
        onNavigateSecurity={onNavigateSecurity}
      />

      {/* Target 3: Technical Architecture & Evidence Matrix Component */}
      <TechnicalEvidencePanel />

      {/* Module 3: Automated Cost-Intelligence Optimizer */}
      <CostIntelligenceOptimizer onDeployWorkload={() => onSelectPlan(recommendedTier)} />

      {/* Module 3: Advanced Global Compute Swarm Map */}
      <GlobalSwarmMap />

      {/* Secondary Strategic Solutions Header */}
      <div className="text-center max-w-4xl mx-auto space-y-5 pt-8 border-t border-slate-800">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AUTONOMOUS WORK OS & ENTERPRISE EXECUTION MESH</span>
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
          Enterprise Operations Orchestration.<br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400">
            Zero Human Bottlenecks.
          </span>
        </h2>

        <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          ApexSovereign.ai combines bare-metal GPU clusters, multi-tenant PostgreSQL data isolation, and event-driven AI agents to automate global enterprise operations on pure autopilot.
        </p>

        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => onSelectPlan(recommendedTier)}
            className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-[0_0_25px_rgba(16,185,129,0.3)] flex items-center gap-2 cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            <span>Launch Work OS (Instant Onboarding)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onNavigatePricing}
            className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>Dynamic Pricing & Comparison</span>
          </button>

          {onNavigateCrm && (
            <button
              onClick={onNavigateCrm}
              className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-300 font-semibold text-xs border border-indigo-500/30 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Workflow className="w-4 h-4 text-indigo-400" />
              <span>CRM & Collaborative Docs</span>
            </button>
          )}

          {onNavigateSwarm && (
            <button
              onClick={onNavigateSwarm}
              className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-300 font-semibold text-xs border border-emerald-500/30 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Bot className="w-4 h-4 text-emerald-400" />
              <span>24/7 Agentic Swarm</span>
            </button>
          )}

          <button
            onClick={onOpenConcierge}
            className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-medium text-xs border border-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <span>Consult AI Concierge</span>
          </button>
        </div>
      </div>

      {/* 3 Core Value Proposition Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
        <div className="p-7 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-emerald-500/40 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Workflow className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Autonomous Agency Work OS</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Eliminate operational drag with autonomous customer onboarding, real-time qualification scoring, CRM data synchronization, and automated transactional receipts via Resend.
          </p>
          <ul className="space-y-2 pt-2 text-xs text-slate-300">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>100% Autopilot customer lifecycle</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Real-time webhook events & callbacks</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Instant lead scoring & routing</span>
            </li>
          </ul>
        </div>

        <div className="p-7 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-indigo-500/40 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Cpu className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Sovereign GPU Compute Mesh</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Run intensive AI inference and algorithmic pipelines on dedicated A100 & H100 GPU nodes with cryptographically signed HMAC execution leases.
          </p>
          <ul className="space-y-2 pt-2 text-xs text-slate-300">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>NVIDIA A100 & H100 bare-metal instances</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Sub-minute worker dispatch latency</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Usage billed dynamically per compute second</span>
            </li>
          </ul>
        </div>

        <div className="p-7 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-blue-500/40 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Institutional Data Isolation</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Multi-tenant PostgreSQL architecture backed by active Supabase Row-Level Security (RLS), ensuring absolute privacy and zero unauthorized cross-tenant data leakage.
          </p>
          <ul className="space-y-2 pt-2 text-xs text-slate-300">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>PostgreSQL RLS on all tables</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>SHA256withRSA PayPal signature audits</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Double-entry idempotency guarantees</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Autonomous Neural Analytics Panel (ApexMind Sovereign Real-Time Telemetry) */}
      <AutonomousNeuralAnalytics />

      {/* Frictionless Enterprise Onboarding Interactive Sandbox (Zero Login Walls) */}
      <FrictionlessAgentSandbox />

      {/* Autonomous Self-Healing & Distributed Edge Resilience Command Station */}
      <div className="max-w-7xl mx-auto p-7 rounded-2xl bg-slate-950 border border-slate-800 space-y-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-400">
              <Radio className="w-4 h-4 animate-pulse" />
              <span>DISTRIBUTED EDGE RESILIENCE & PREDICTIVE SCALING MESH</span>
            </div>
            <h2 className="text-2xl font-bold text-white">Autonomous Self-Healing Operational Mesh</h2>
            <p className="text-xs text-slate-400 max-w-2xl">
              Zero-downtime automated fallback protocols across database connection pools (PgBouncer, edge replicas, local fallback) with dynamic HMAC-SHA256 lease rotation and single-use anti-replay nonces.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={triggerChaosSpikeSimulation}
              disabled={chaosSimulating}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                chaosSimulating 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/40'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${chaosSimulating ? 'animate-spin' : ''}`} />
              <span>{chaosSimulating ? 'Simulating Spike...' : 'Simulate 10k Webhook Burst (Chaos Test)'}</span>
            </button>
          </div>
        </div>

        {/* Live Simulation Alert Banner */}
        {chaosStage !== 'IDLE' && (
          <div className={`p-4 rounded-xl text-xs font-mono transition-all border flex items-center justify-between ${
            chaosStage === 'SPIKE_DETECTED' 
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              : (chaosStage === 'AUTO_FAILOVER_ENGAGED'
                  ? 'bg-purple-950/40 border-purple-500/40 text-purple-300'
                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300')
          }`}>
            <div className="flex items-center gap-3">
              {chaosStage === 'SPIKE_DETECTED' && <AlertTriangle className="w-4 h-4 text-amber-400 animate-bounce" />}
              {chaosStage === 'AUTO_FAILOVER_ENGAGED' && <Flame className="w-4 h-4 text-purple-400 animate-pulse" />}
              {chaosStage === 'SELF_HEALED' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              <div>
                <span className="font-bold">
                  {chaosStage === 'SPIKE_DETECTED' && 'STAGE 1: Traffic Surge (+450% velocity) detected by Predictive Scaler.'}
                  {chaosStage === 'AUTO_FAILOVER_ENGAGED' && 'STAGE 2: Circuit Breaker HALF_OPEN. Secondary cluster absorbed workload; concurrency boosted to 16 threads.'}
                  {chaosStage === 'SELF_HEALED' && 'STAGE 3: Auto-Healing completed. Zero request drops, 100% cryptographic integrity preserved.'}
                </span>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-black/40 border border-white/10 uppercase">
              {circuitState}
            </span>
          </div>
        )}

        {/* Distributed Mesh Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>PRIMARY POOL (PgBouncer)</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                ACTIVE
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-white flex items-baseline gap-2">
              <span>{activePoolLatency.toFixed(1)} ms</span>
              <span className="text-xs text-slate-500 font-normal">avg latency</span>
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between pt-1 border-t border-slate-800">
              <span>Circuit State:</span>
              <span className="font-mono text-emerald-400 font-semibold">{circuitState}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>PREDICTIVE SCALING</span>
              <span className="text-indigo-400">dC/dt GRADIENT</span>
            </div>
            <div className="text-xl font-bold font-mono text-indigo-300 flex items-baseline gap-2">
              <span>{surgeVelocity} CU/min</span>
              <span className="text-xs text-slate-500 font-normal">velocity</span>
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between pt-1 border-t border-slate-800">
              <span>Active Concurrency:</span>
              <span className="font-mono text-indigo-300 font-semibold">{workerCount} Worker Threads</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>HMAC KEY ROTATION</span>
              <span className="text-purple-400">VERSION v3.4</span>
            </div>
            <div className="text-xl font-bold font-mono text-purple-300 flex items-baseline gap-2">
              <span>{noncesProtectedCount.toLocaleString()}</span>
              <span className="text-xs text-slate-500 font-normal">nonces tracked</span>
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between pt-1 border-t border-slate-800">
              <span>Anti-Replay Security:</span>
              <span className="font-mono text-purple-400 font-semibold">100% Protected</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>TENANT ISOLATION</span>
              <span className="text-teal-400">TIER-GATED RLS</span>
            </div>
            <div className="text-xl font-bold font-mono text-teal-300 flex items-baseline gap-2">
              <span>FORCE RLS</span>
              <span className="text-xs text-slate-500 font-normal">7 tables</span>
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between pt-1 border-t border-slate-800">
              <span>Audit Hash Chain:</span>
              <span className="font-mono text-teal-300 font-semibold">SHA-256 Intact</span>
            </div>
          </div>
        </div>

        {/* Regional Edge Node Topology */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <Globe className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="font-bold text-white">US-East (Virginia)</div>
                <div className="text-[10px] text-slate-400 font-mono">Primary PgBouncer Cluster</div>
              </div>
            </div>
            <span className="font-mono text-[11px] text-emerald-400 font-semibold">1.4ms • 99.999%</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <Globe className="w-4 h-4 text-indigo-400" />
              <div>
                <div className="font-bold text-white">EU-Central (Frankfurt)</div>
                <div className="text-[10px] text-slate-400 font-mono">Real-Time Edge Replica</div>
              </div>
            </div>
            <span className="font-mono text-[11px] text-indigo-400 font-semibold">8.2ms • Synced</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <Globe className="w-4 h-4 text-purple-400" />
              <div>
                <div className="font-bold text-white">AP-Southeast (Singapore)</div>
                <div className="text-[10px] text-slate-400 font-mono">Autonomous Failover Mesh</div>
              </div>
            </div>
            <span className="font-mono text-[11px] text-purple-400 font-semibold">11.6ms • Standby</span>
          </div>
        </div>
      </div>

      {/* Interactive Autonomous ROI Calculator */}
      <div className="max-w-4xl mx-auto p-8 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-2xl space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-semibold">
              <BarChart3 className="w-4 h-4" />
              <span>ENTERPRISE AUTONOMOUS ROI MODEL</span>
            </div>
            <h3 className="text-2xl font-bold text-white mt-1">Estimate Your Operational Velocity Gain</h3>
          </div>
          <span className="text-xs font-mono text-slate-500">DYNAMIC PROJECTION</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Controls */}
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">Enterprise Team Size:</span>
                <span className="font-mono text-emerald-400 font-bold">{teamSize} Specialists</span>
              </div>
              <input
                type="range"
                min="5"
                max="250"
                step="5"
                value={teamSize}
                onChange={(e) => setTeamSize(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>5 (Seed Startup)</span>
                <span>250+ (Global Enterprise)</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">Weekly Repetitive Operational Hours / Person:</span>
                <span className="font-mono text-indigo-400 font-bold">{manualHoursPerWeek} hrs/week</span>
              </div>
              <input
                type="range"
                min="10"
                max="60"
                step="5"
                value={manualHoursPerWeek}
                onChange={(e) => setManualHoursPerWeek(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>10 hrs</span>
                <span>60 hrs</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs text-slate-400 space-y-1">
              <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Recommended Deployment Architecture:</span>
              </div>
              <div className="text-emerald-300 font-mono font-bold text-sm pt-1">
                {recommendedTier.name} ({recommendedTier.computeUnits.toLocaleString()} CU/mo)
              </div>
              <p className="text-[11px] text-slate-500 pt-0.5">
                Includes automated PayPal subscription, tenant isolation, and priority worker dispatch.
              </p>
            </div>
          </div>

          {/* Metric Projections */}
          <div className="p-6 rounded-xl bg-slate-950/90 border border-slate-800/90 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                PROJECTED VELOCITY & CAPITAL SAVINGS
              </span>

              <div className="space-y-1">
                <div className="text-xs text-slate-400">Projected Annual Capital Saved</div>
                <div className="text-3xl sm:text-4xl font-extrabold text-emerald-400 font-mono">
                  ${annualSavings.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  ~${monthlySavings.toLocaleString()} recovered / month
                </div>
              </div>

              <div className="pt-3 border-t border-slate-900 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">Operational Velocity</div>
                  <div className="text-white font-mono font-bold text-sm">+82% Autopilot</div>
                </div>
                <div>
                  <div className="text-slate-500">Billing Provider</div>
                  <div className="text-blue-400 font-mono font-bold text-sm">PayPal REST v2</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onSelectPlan(recommendedTier)}
                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950"
              >
                <span>Subscribe to {recommendedTier.name} via PayPal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onNavigatePricing}
                className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-indigo-300 hover:text-indigo-200 text-[11px] font-mono transition-colors flex items-center justify-center gap-1.5 border border-indigo-500/20 cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                <span>See Weekly-Locked Comparison vs Legacy Enterprise Monoliths</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
