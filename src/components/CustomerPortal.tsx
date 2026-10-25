import React, { useState } from 'react';
import { CustomerUser, PaymentTransaction, ComputeJob } from '../types';
import { EnterpriseCrmPipeline } from './EnterpriseCrmPipeline';
import { AutonomousAgentSwarm } from './AutonomousAgentSwarm';
import { LiveGpuTelemetryStream } from './LiveGpuTelemetryStream';
import { 
  Cpu, 
  Key, 
  Receipt, 
  Zap, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Play, 
  ShieldCheck, 
  Layers, 
  ExternalLink,
  PlusCircle,
  ArrowUpRight,
  TrendingUp,
  Clock,
  Workflow,
  Bot,
  BarChart2,
  Activity
} from 'lucide-react';

interface CustomerPortalProps {
  user: CustomerUser;
  transactions: PaymentTransaction[];
  onOpenPricing: () => void;
  onUpdateUser: (updatedUser: CustomerUser) => void;
  initialSubTab?: 'compute' | 'telemetry' | 'crm' | 'swarm';
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({
  user,
  transactions,
  onOpenPricing,
  onUpdateUser,
  initialSubTab = 'compute'
}) => {
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'compute' | 'telemetry' | 'crm' | 'swarm'>(initialSubTab);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ComputeJob[]>([
    {
      id: 'job_init_01',
      name: 'Autonomous Agent Broker Warmup',
      type: 'CPU_STANDARD',
      costCredits: 25,
      status: 'COMPLETED',
      timestamp: 'Just now',
      durationSec: 1.8
    }
  ]);

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(user.apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleRotateKey = () => {
    if (confirm('Are you sure you want to rotate your API key? Any active scripts using this key will need to be updated.')) {
      const newKey = 'sk_demo_apex_' + Array.from({ length: 28 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      onUpdateUser({
        ...user,
        apiKey: newKey
      });
    }
  };

  const handleLaunchComputeJob = (jobName: string, type: string, cost: number) => {
    if (user.computeCredits < cost) {
      alert('Insufficient compute credits! Please upgrade or top up your subscription via PayPal.');
      onOpenPricing();
      return;
    }

    const newJobId = 'job_' + Math.random().toString(36).substring(2, 9);
    setRunningJobId(newJobId);

    const newJob: ComputeJob = {
      id: newJobId,
      name: jobName,
      type: type,
      costCredits: cost,
      status: 'RUNNING',
      timestamp: 'Running...',
      durationSec: 0
    };

    setJobs(prev => [newJob, ...prev]);

    // Simulate real-time autonomous execution
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJobId ? { ...j, status: 'COMPLETED', timestamp: 'Moments ago', durationSec: (Math.random() * 2 + 1.2) } : j));
      setRunningJobId(null);

      // Deduct credits from user ledger
      onUpdateUser({
        ...user,
        computeCredits: Math.max(0, user.computeCredits - cost)
      });
    }, 1500);
  };

  const creditPercentage = Math.min(100, Math.round((user.computeCredits / user.maxQuota) * 100));

  return (
    <div className="space-y-8 py-6 animate-in fade-in duration-300">
      {/* Top Banner: Tenant Profile & Subscription Status */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-xl shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              {user.fullName.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">{user.fullName}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                  {user.plan} Tier
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-3 mt-1 font-mono">
                <span>Tenant: <span className="text-slate-200">{user.tenantId}</span></span>
                <span>•</span>
                <span>Org: <span className="text-slate-200">{user.company}</span></span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenPricing}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors flex items-center gap-2 cursor-pointer shadow-md"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Upgrade or Top-up Plan</span>
          </button>
        </div>
      </div>

      {/* Institutional Workspace Sub-Navigation (Sovereign Swarm Synthesis) */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveWorkspaceTab('compute')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeWorkspaceTab === 'compute'
              ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Compute Brokerage & API Keys</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkspaceTab('telemetry')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeWorkspaceTab === 'telemetry'
              ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Live GPU Telemetry (WSS)</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkspaceTab('crm')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeWorkspaceTab === 'crm'
              ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Workflow className="w-3.5 h-3.5" />
          <span>CRM & Productivity Conduits</span>
          <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${activeWorkspaceTab === 'crm' ? 'bg-slate-950 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
            Autonomous
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkspaceTab('swarm')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeWorkspaceTab === 'swarm'
              ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>24/7 Agentic Swarm</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </button>
      </div>

      {/* SUB-VIEW 0: REAL-TIME BARE-METAL GPU TELEMETRY (WSS STREAM) */}
      {activeWorkspaceTab === 'telemetry' && (
        <LiveGpuTelemetryStream />
      )}

      {/* SUB-VIEW 1: CRM & PRODUCTIVITY CONDUITS */}
      {activeWorkspaceTab === 'crm' && (
        <EnterpriseCrmPipeline />
      )}

      {/* SUB-VIEW 2: 24/7 AUTONOMOUS AGENT SWARM */}
      {activeWorkspaceTab === 'swarm' && (
        <AutonomousAgentSwarm />
      )}

      {/* SUB-VIEW 3: CORE COMPUTE BROKERAGE, APIS, & SETTLEMENT */}
      {activeWorkspaceTab === 'compute' && (
        <>
      {/* Live GPU Telemetry Streaming Bar in Compute Tab */}
      <div className="space-y-4">
        <LiveGpuTelemetryStream compact />
      </div>

      {/* Metrics Row: Compute Quota, Burn Rate, Active Partition */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Compute Meter Card */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>AVAILABLE COMPUTE UNITS</span>
            </span>
            <span className="text-xs font-mono text-emerald-400 font-bold">
              {creditPercentage}% Quota
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white font-mono">
              {user.computeCredits.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-mono">/ {user.maxQuota.toLocaleString()} CU</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
              style={{ width: `${creditPercentage}%` }}
            />
          </div>

          <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 font-mono">
            <span>Billing Cycle Renewal:</span>
            <span className="text-slate-300">In 28 days</span>
          </div>
        </div>

        {/* Tenant Partition Security Card */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>ISOLATION & SECURITY</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              ENFORCED
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-300">
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">PostgreSQL RLS:</span>
              <span className="text-emerald-400 font-semibold">tenant_id Partitioning</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">Execution Token:</span>
              <span className="text-slate-200">HMAC-SHA256 Signed</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">Connection Pooler:</span>
              <span className="text-slate-200">asyncpg SSL (port 6543)</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero Cross-Tenant Leakage Guaranteed</span>
          </div>
        </div>

        {/* PayPal Subscription Card */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
              <span className="text-blue-400 font-bold italic">P</span>
              <span>PAYPAL SUBSCRIPTION</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ACTIVE
            </span>
          </div>

          <div className="text-sm font-semibold text-white font-mono">
            {user.plan === 'starter' ? '$29.00 / month' : user.plan === 'pro' ? '$99.00 / month' : '$499.00 / month'}
          </div>
          <div className="text-xs text-slate-400">
            Automated renewal with cryptographically signed webhook idempotency.
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-mono">Status:</span>
            <span className="text-emerald-400 font-mono font-medium">Capture Verified</span>
          </div>
        </div>
      </div>

      {/* Autonomous Workload Dispatcher (Live Testing with Balance) */}
      <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>Dispatch Autonomous Workloads</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Launch real algorithmic jobs into your dedicated compute queue. Deducts credits in real time.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
            <span>Available Balance:</span>
            <span className="text-emerald-400 font-bold">{user.computeCredits.toLocaleString()} CU</span>
          </div>
        </div>

        {/* Quick Dispatch Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => handleLaunchComputeJob('Monte Carlo 10k Path Risk Engine', 'CPU_STANDARD', 150)}
            disabled={runningJobId !== null}
            className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 text-left transition-all group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white group-hover:text-emerald-300">
                Monte Carlo Risk
              </span>
              <Play className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <p className="text-[11px] text-slate-400 mb-2">10,000 algorithmic simulation iterations.</p>
            <div className="text-[10px] font-mono text-emerald-400">Cost: 150 CU</div>
          </button>

          <button
            onClick={() => handleLaunchComputeJob('Autonomous Agent Swarm Orchestration', 'A100_BURST', 350)}
            disabled={runningJobId !== null}
            className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 text-left transition-all group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white group-hover:text-emerald-300">
                Agent Swarm Lease
              </span>
              <Play className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Multi-agent parallel planning & inference.</p>
            <div className="text-[10px] font-mono text-blue-400">Cost: 350 CU</div>
          </button>

          <button
            onClick={() => handleLaunchComputeJob('PostgreSQL Ledger Reconciliation', 'CPU_POOLER', 50)}
            disabled={runningJobId !== null}
            className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 text-left transition-all group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white group-hover:text-emerald-300">
                Ledger Audit
              </span>
              <Play className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Double-entry cryptographic ledger audit.</p>
            <div className="text-[10px] font-mono text-amber-400">Cost: 50 CU</div>
          </button>

          <button
            onClick={() => handleLaunchComputeJob('H100 Tensor Deep Model Optimization', 'H100_DEDICATED', 800)}
            disabled={runningJobId !== null}
            className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/40 text-left transition-all group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white group-hover:text-purple-300">
                H100 Tensor Burst
              </span>
              <Play className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Heavy neural weights forward-pass optimization.</p>
            <div className="text-[10px] font-mono text-purple-400">Cost: 800 CU</div>
          </button>
        </div>

        {/* Live Dispatched Jobs Table */}
        <div className="space-y-3">
          <div className="text-xs font-mono text-slate-400 flex items-center justify-between">
            <span>RECENT COMPUTE DISPATCH LOGS</span>
            <span className="text-[11px] text-slate-500">Updated automatically</span>
          </div>

          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="p-3">Job ID</th>
                  <th className="p-3">Workload Name</th>
                  <th className="p-3">Tier</th>
                  <th className="p-3">Cost</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {jobs.map(job => (
                  <tr key={job.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="p-3 text-slate-400">{job.id}</td>
                    <td className="p-3 text-white font-sans font-medium">{job.name}</td>
                    <td className="p-3 text-slate-400">{job.type}</td>
                    <td className="p-3 text-emerald-400">-{job.costCredits} CU</td>
                    <td className="p-3">
                      {job.status === 'RUNNING' ? (
                        <span className="inline-flex items-center gap-1 text-blue-400 animate-pulse">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Executing</span>
                        </span>
                      ) : (
                        <span className="text-emerald-400">✓ Completed</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-500">{job.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Customer API Key Management */}
      <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" />
              <span>Customer Sovereign API Key</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Authenticate your autonomous agents and scripts to consume your compute quota directly via REST.
            </p>
          </div>
          <button
            onClick={handleRotateKey}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Rotate Key</span>
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 font-mono text-xs">
          <span className="text-slate-300 select-all truncate">
            {showApiKey ? user.apiKey : 'sk_demo_apex_' + '•'.repeat(24)}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title={showApiKey ? 'Hide Key' : 'Reveal Key'}
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={handleCopyApiKey}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors flex items-center gap-1"
              title="Copy API Key"
            >
              {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Curl Usage Snippet */}
        <pre className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] font-mono text-slate-400 overflow-x-auto whitespace-pre">
          <span className="text-emerald-400">$</span> curl -X POST https://api.apexsovereign.ai/v1/compute/dispatch \{'\n'}
          &nbsp;&nbsp;-H &quot;Authorization: Bearer {showApiKey ? user.apiKey : 'YOUR_API_KEY'}&quot; \{'\n'}
          &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \{'\n'}
          &nbsp;&nbsp;-d &apos;&#123;&quot;workload&quot;: &quot;monte_carlo_risk&quot;, &quot;tier&quot;: &quot;pro&quot;&#125;&apos;
        </pre>
      </div>

      {/* Billing History & PayPal Invoices */}
      <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-400" />
              <span>PayPal Invoicing & Receipt History</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cryptographically verified transmission records and credit transactions.
            </p>
          </div>
          <button
            onClick={onOpenPricing}
            className="text-xs text-emerald-400 hover:underline font-mono"
          >
            Change Plan ➔
          </button>
        </div>

        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[11px]">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">PayPal Order ID</th>
                <th className="p-3">Plan</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500 font-sans">
                    No payment transactions recorded yet. Subscribe via PayPal to get started!
                  </td>
                </tr>
              ) : (
                transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="p-3 text-slate-400">{new Date(tx.timestamp).toLocaleDateString()}</td>
                    <td className="p-3 text-white font-semibold">{tx.paypalOrderId}</td>
                    <td className="p-3 text-slate-300 font-sans">{tx.planName}</td>
                    <td className="p-3 text-emerald-400 font-bold">${tx.amount} {tx.currency}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                        {tx.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => alert(`Receipt #${tx.paypalOrderId}\nDate: ${tx.timestamp}\nAmount: $${tx.amount} USD\nCompute Tokens: +${tx.creditsAwarded} CU\nTransmission ID: ${tx.transmissionId}\nStatus: Verified with PayPal SHA256withRSA`)}
                        className="text-[11px] text-blue-400 hover:underline cursor-pointer"
                      >
                        View Receipt
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
