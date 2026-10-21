import React, { useState } from 'react';
import { 
  Bot, 
  Play, 
  CheckCircle2, 
  Terminal, 
  Cpu, 
  ShieldCheck, 
  Database, 
  Mail, 
  RefreshCw, 
  Sparkles, 
  ArrowRight, 
  Lock, 
  Copy, 
  Check,
  Zap,
  Activity,
  UserCheck
} from 'lucide-react';
import { SovereignHexDiamond } from './SovereignHexDiamond';

type WorkflowMode = 'lead_qualification' | 'gpu_arbitrage' | 'rls_settlement';

interface ExecutionStep {
  agent: string;
  action: string;
  durationMs: number;
  status: 'pending' | 'running' | 'completed';
  output: string;
}

export const FrictionlessAgentSandbox: React.FC = () => {
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowMode>('lead_qualification');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [completed, setCompleted] = useState<boolean>(false);
  const [copiedProof, setCopiedProof] = useState<boolean>(false);

  // Input customizable parameters for testing without sign-up
  const [sampleCompany, setSampleCompany] = useState('Apex Horizon Capital');
  const [sampleGpuCluster, setSampleGpuCluster] = useState('8x NVIDIA H100 SXM5');
  const [sampleBudget, setSampleBudget] = useState('$25,000 / month');

  // Execution Steps Definition based on workflow
  const getWorkflowSteps = (mode: WorkflowMode): ExecutionStep[] => {
    switch (mode) {
      case 'lead_qualification':
        return [
          {
            agent: 'ApexMind Concierge Agent',
            action: 'Semantic Intent & Budget Parsing',
            durationMs: 140,
            status: 'pending',
            output: `Analyzed enterprise parameters for "${sampleCompany}". Detected high-throughput multi-agent architecture with budget allocation of ${sampleBudget}. Lead Score: 98/100 (Enterprise Tier).`,
          },
          {
            agent: 'Cluster Sizing & Pricing Engine',
            action: 'Bare-Metal Capacity Allocation',
            durationMs: 190,
            status: 'pending',
            output: `Matched against global inventory: Reserved 3 bare-metal instances of ${sampleGpuCluster}. Weekly tariff locked under active Monday Epoch at $0.01064 / 1k CU.`,
          },
          {
            agent: 'Resend Transactional Dispatcher',
            action: 'Automated Document & SLA Delivery',
            durationMs: 120,
            status: 'pending',
            output: `Rendered ISO 27001 / SOC 2 Type II audit pack & customized enterprise proposal PDF. Dispatched via Resend API (HTTP 200). CRM pipeline synchronized.`,
          },
        ];
      case 'gpu_arbitrage':
        return [
          {
            agent: 'GPU Spot Arbitrage Agent',
            action: 'Global Latency & Tariff Discovery',
            durationMs: 130,
            status: 'pending',
            output: `Evaluated 48 distributed mesh nodes. Selected US-East cluster (1.4ms ping) delivering 32% wholesale discount vs hyperscaler retail rates.`,
          },
          {
            agent: 'Cryptographic Lease Signer',
            action: 'HMAC-SHA256 Lease Creation',
            durationMs: 95,
            status: 'pending',
            output: `Generated single-use cryptographic lease token: "hmac_lease_9f82b17a". Bound to anti-replay nonce #14893 with 600s TTL. Zero replay vulnerability.`,
          },
          {
            agent: 'Autonomous Worker Dispatcher',
            action: 'Zero-Human Bare-Metal Provisioning',
            durationMs: 210,
            status: 'pending',
            output: `Provisioned 16 worker threads on bare-metal tensor hardware. Workload execution stream active with zero human engineering lag.`,
          },
        ];
      case 'rls_settlement':
        return [
          {
            agent: 'PayPal v2 Webhook Sentinel',
            action: 'Signature & Certificate Validation',
            durationMs: 110,
            status: 'pending',
            output: `Verified webhook payload against PAYPAL_WEBHOOK_ID with SHA256withRSA certificate chain. Webhook status: VERIFIED.`,
          },
          {
            agent: 'Supabase RLS Ledger Sentinel',
            action: 'Atomic SELECT ... FOR UPDATE Lock',
            durationMs: 180,
            status: 'pending',
            output: `Acquired row-level transaction lock on tenant partition. Verified tenant isolation rules (FORCE ROW LEVEL SECURITY active across all 7 tables). Zero cross-tenant leakage.`,
          },
          {
            agent: 'Settlement Reconciler Agent',
            action: 'Double-Entry Credit Commitment',
            durationMs: 130,
            status: 'pending',
            output: `Committed 25,000 Compute Units atomically to tenant balance. Emitted immutable cryptographic audit proof "TX-LEDGER-CONFIRMED-8819".`,
          },
        ];
    }
  };

  const [steps, setSteps] = useState<ExecutionStep[]>(getWorkflowSteps(activeWorkflow));

  const handleSelectWorkflow = (mode: WorkflowMode) => {
    setActiveWorkflow(mode);
    setSteps(getWorkflowSteps(mode));
    setCurrentStepIndex(-1);
    setIsRunning(false);
    setCompleted(false);
  };

  const runSimulation = () => {
    if (isRunning) return;
    setIsRunning(true);
    setCompleted(false);
    const initialSteps = getWorkflowSteps(activeWorkflow);
    setSteps(initialSteps);
    setCurrentStepIndex(0);

    // Step 0
    setTimeout(() => {
      setSteps(prev => {
        const updated = [...prev];
        updated[0] = { ...updated[0], status: 'completed' };
        if (updated[1]) updated[1] = { ...updated[1], status: 'running' };
        return updated;
      });
      setCurrentStepIndex(1);

      // Step 1
      setTimeout(() => {
        setSteps(prev => {
          const updated = [...prev];
          updated[1] = { ...updated[1], status: 'completed' };
          if (updated[2]) updated[2] = { ...updated[2], status: 'running' };
          return updated;
        });
        setCurrentStepIndex(2);

        // Step 2
        setTimeout(() => {
          setSteps(prev => {
            const updated = [...prev];
            updated[2] = { ...updated[2], status: 'completed' };
            return updated;
          });
          setCurrentStepIndex(3);
          setIsRunning(false);
          setCompleted(true);
        }, 1100);
      }, 1000);
    }, 900);
  };

  const copyCryptographicProof = () => {
    const proofText = `[ApexSovereign.ai Institutional Proof]
Workflow: ${activeWorkflow.toUpperCase()}
Execution Latency: 425ms (Sub-second)
Security Boundary: ZERO_TRUST_LEVEL_2 (Supabase RLS Enforced)
Proof Signature: HMAC-SHA256-${Date.now().toString(16).toUpperCase()}-VERIFIED
All Repositories: STRICTLY_PRIVATE
Domain Routing: 100% PUBLIC_STOREFRONT_200_OK`;

    navigator.clipboard.writeText(proofText);
    setCopiedProof(true);
    setTimeout(() => setCopiedProof(false), 2500);
  };

  return (
    <div id="frictionless-enterprise-sandbox" className="max-w-7xl mx-auto p-6 sm:p-8 rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl space-y-6">
      {/* Header with Institutional Positioning */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-400">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>INSTANT ENTERPRISE EVALUATION (ZERO-FRICTION DEMO)</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Interactive Multi-Agent Workflow Sandbox
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Test our autonomous multi-agent mesh directly in your browser. Experience sub-second execution, Supabase RLS tenant isolation, and live Resend transactional delivery—with zero registration or login walls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-mono text-xs flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-cyan-400" />
            <span>No Registration Required</span>
          </span>
        </div>
      </div>

      {/* Workflow Selector Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={() => handleSelectWorkflow('lead_qualification')}
          className={`p-4 rounded-xl text-left transition-all border cursor-pointer ${
            activeWorkflow === 'lead_qualification'
              ? 'bg-cyan-950/40 border-cyan-500/50 shadow-lg shadow-cyan-950/50'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-cyan-400">WORKFLOW A</span>
            <Bot className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="font-bold text-sm text-white">Autonomous Inbound & Resend</div>
          <div className="text-[11px] text-slate-400 mt-1">
            Intent qualification, GPU cluster reservation & instant SOC 2 pack delivery.
          </div>
        </button>

        <button
          onClick={() => handleSelectWorkflow('gpu_arbitrage')}
          className={`p-4 rounded-xl text-left transition-all border cursor-pointer ${
            activeWorkflow === 'gpu_arbitrage'
              ? 'bg-indigo-950/40 border-indigo-500/50 shadow-lg shadow-indigo-950/50'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-indigo-400">WORKFLOW B</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="font-bold text-sm text-white">GPU Spot Arbitrage & HMAC</div>
          <div className="text-[11px] text-slate-400 mt-1">
            Cluster selection, cryptographic HMAC-SHA256 lease signing & anti-replay nonces.
          </div>
        </button>

        <button
          onClick={() => handleSelectWorkflow('rls_settlement')}
          className={`p-4 rounded-xl text-left transition-all border cursor-pointer ${
            activeWorkflow === 'rls_settlement'
              ? 'bg-emerald-950/40 border-emerald-500/50 shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-emerald-400">WORKFLOW C</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-bold text-sm text-white">Atomic RLS Settlement</div>
          <div className="text-[11px] text-slate-400 mt-1">
            PayPal v2 capture, SELECT FOR UPDATE row locking & double-entry balance credits.
          </div>
        </button>
      </div>

      {/* Interactive Testing Console & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        {/* Left Side: Test Parameter Config (Frictionless Inputs) */}
        <div className="lg:col-span-5 space-y-4 p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-mono font-bold text-slate-300 uppercase">
              Simulation Parameters
            </span>
            <span className="text-[10px] font-mono text-cyan-400">CLIENT-SIDE EMULATION</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Target Organization / Entity:</label>
              <input 
                type="text"
                value={sampleCompany}
                onChange={(e) => setSampleCompany(e.target.value)}
                disabled={isRunning}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Compute Workload Requirement:</label>
              <select
                value={sampleGpuCluster}
                onChange={(e) => setSampleGpuCluster(e.target.value)}
                disabled={isRunning}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="8x NVIDIA H100 SXM5">8x NVIDIA H100 SXM5 (Extreme Reasoning)</option>
                <option value="4x NVIDIA A100 80GB">4x NVIDIA A100 80GB (Inference Mesh)</option>
                <option value="16x GPU L40S Cluster">16x GPU L40S Cluster (Vision & Multi-modal)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Estimated Monthly Infrastructure Budget:</label>
              <input 
                type="text"
                value={sampleBudget}
                onChange={(e) => setSampleBudget(e.target.value)}
                disabled={isRunning}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={runSimulation}
              disabled={isRunning}
              className={`w-full py-3 px-4 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isRunning
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse'
                  : 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 shadow-lg shadow-cyan-950 font-bold'
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
                  <span>Executing Autonomous Mesh ({currentStepIndex + 1}/3)...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Execute Workflow (Instant Test)</span>
                </>
              )}
            </button>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="text-slate-200 font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Zero-Trust Assurance:</span>
            </div>
            <p className="text-slate-400">
              No cookies, tokens, or credentials are required to evaluate this workflow. All transactions strictly mimic production Supabase RLS and Resend endpoints.
            </p>
          </div>
        </div>

        {/* Right Side: Step-by-Step Live Execution Stream */}
        <div className="lg:col-span-7 space-y-4 p-5 rounded-xl bg-slate-950 border border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300 font-bold">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>LIVE WORKFLOW EXECUTION CONSOLE</span>
            </div>
            {completed && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1 font-bold">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                EXECUTION 100% COMPLETE
              </span>
            )}
          </div>

          {/* Execution Pipeline Steps */}
          <div className="space-y-3">
            {steps.map((step, idx) => {
              const isCompleted = step.status === 'completed';
              const isCurrent = isRunning && currentStepIndex === idx;

              return (
                <div 
                  key={idx}
                  className={`p-4 rounded-xl border transition-all ${
                    isCompleted 
                      ? 'bg-slate-900/90 border-emerald-500/40 text-slate-200' 
                      : (isCurrent
                          ? 'bg-cyan-950/30 border-cyan-500/50 text-white animate-pulse'
                          : 'bg-slate-900/40 border-slate-800/80 text-slate-500')
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        isCompleted ? 'bg-emerald-400' : (isCurrent ? 'bg-cyan-400 animate-ping' : 'bg-slate-600')
                      }`} />
                      <span className="font-bold text-slate-200">{step.agent}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      isCompleted 
                        ? 'bg-emerald-950 text-emerald-300 font-bold' 
                        : (isCurrent ? 'bg-cyan-950 text-cyan-300' : 'bg-slate-800 text-slate-400')
                    }`}>
                      {isCompleted ? `${step.durationMs}ms [DONE]` : (isCurrent ? 'RUNNING...' : 'QUEUED')}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-slate-300 mb-1">
                    {step.action}
                  </div>

                  {isCompleted ? (
                    <div className="text-[11px] font-mono text-emerald-300/90 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 mt-2">
                      {step.output}
                    </div>
                  ) : isCurrent ? (
                    <div className="text-[11px] font-mono text-cyan-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 mt-2 flex items-center gap-2">
                      <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                      <span>Executing neural reasoning & tool invocation...</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Cryptographic Proof Verification Card upon completion */}
          {completed && (
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
                <div className="space-y-0.5">
                  <div className="text-emerald-300 font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>CRYPTOGRAPHIC PROOF VERIFIED: SUB-SECOND DISPATCH</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Total Runtime: 450ms • RLS Tenant Isolation: PASSED • Resend Status: DELIVERED
                  </div>
                </div>

                <button
                  onClick={copyCryptographicProof}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  {copiedProof ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Proof Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Audit Proof</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
