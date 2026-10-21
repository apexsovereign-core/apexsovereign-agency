import React, { useState } from 'react';
import { 
  Terminal, 
  ShieldCheck, 
  ShieldAlert, 
  CreditCard, 
  Cpu, 
  Database, 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  ArrowRight,
  Copy,
  Check
} from 'lucide-react';
import { ResourceTier, SimulatedLedgerEntry, WebhookSimulationLog } from '../types';
import { LiveGpuTelemetryStream } from './LiveGpuTelemetryStream';

export const InteractiveSandbox: React.FC = () => {
  const [activeSimulator, setActiveSimulator] = useState<'webhook' | 'idempotency' | 'compute' | 'health' | 'telemetry'>('webhook');

  // Webhook Simulator State
  const [webhookMode, setWebhookMode] = useState<'valid' | 'tampered' | 'ssrf' | 'replay'>('valid');
  const [webhookLogs, setWebhookLogs] = useState<WebhookSimulationLog[]>([
    {
      id: 'log-1',
      timestamp: '2026-09-16T18:20:12Z',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      transmissionId: 'tx-8192-3849-0192',
      certUrl: 'https://api.paypal.com/v1/notifications/certs/CERT-360-1234.pem',
      signatureStatus: 'VERIFIED',
      tenantId: 'tenant-enterprise-4401',
      creditsAllocated: 500.0,
      details: 'Cryptographically verified against PAYPAL_WEBHOOK_ID. Balance credited atomically with SELECT ... FOR UPDATE.',
    },
  ]);
  const [isProcessingWebhook, setIsProcessingWebhook] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Idempotency & Ledger State
  const [tenantBalance, setTenantBalance] = useState<number>(1250.0);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('idemp-apex-91823746-1029');
  const [ledgerEntries, setLedgerEntries] = useState<SimulatedLedgerEntry[]>([
    {
      id: 'led-001',
      timestamp: '2026-09-16T18:15:00Z',
      tenantId: 'tenant-enterprise-4401',
      type: 'CREDIT_PURCHASE',
      amount: 500.0,
      balanceBefore: 750.0,
      balanceAfter: 1250.0,
      idempotencyKey: 'idemp-seed-initial-topup',
      referenceId: 'PAYPAL_ORDER_8472910',
      status: 'COMMITTED',
    },
  ]);
  const [idempotencyResult, setIdempotencyResult] = useState<any>(null);

  // Compute Broker State
  const [selectedTier, setSelectedTier] = useState<string>('GPU_A100');
  const [cpuCores, setCpuCores] = useState<number>(8);
  const [memoryMb, setMemoryMb] = useState<number>(32768);
  const [gpuCount, setGpuCount] = useState<number>(1);
  const [dispatchResult, setDispatchResult] = useState<any>(null);

  const tiers: Record<string, { base: number; category: string; description: string }> = {
    STANDARD_CPU: { base: 0.05, category: 'CPU', description: 'General compute for web workloads & ETL' },
    HIGH_CPU: { base: 0.15, category: 'CPU', description: 'Compute-optimized for compilation and parallel tasks' },
    GPU_T4: { base: 0.65, category: 'GPU', description: 'Cost-effective inference & video processing' },
    GPU_A100: { base: 3.20, category: 'GPU', description: '80GB VRAM high-throughput LLM training & fine-tuning' },
    GPU_H100: { base: 5.50, category: 'GPU', description: 'Extreme performance Tensor Core autonomous agent reasoning' },
  };

  const calculateCost = (tier: string, cpu: number, mem: number, gpus: number) => {
    const base = tiers[tier]?.base || 0.10;
    const cpuCost = cpu * 0.015;
    const memCost = (mem / 1024) * 0.008;
    const gpuCost = gpus * (tier.includes('H100') ? 2.80 : tier.includes('A100') ? 1.80 : 0.40);
    return Number((base + cpuCost + memCost + gpuCost).toFixed(4));
  };

  const currentCost = calculateCost(selectedTier, cpuCores, memoryMb, gpuCount);

  // Run Webhook Simulation
  const handleSimulateWebhook = () => {
    setIsProcessingWebhook(true);
    setTimeout(() => {
      const now = new Date().toISOString();
      const txId = `tx-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;

      if (webhookMode === 'valid') {
        const topupAmount = 250.0;
        setTenantBalance((prev) => prev + topupAmount);
        const newLog: WebhookSimulationLog = {
          id: `log-${Date.now()}`,
          timestamp: now,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          transmissionId: txId,
          certUrl: 'https://api.paypal.com/v1/notifications/certs/CERT-360-5678.pem',
          signatureStatus: 'VERIFIED',
          tenantId: 'tenant-enterprise-4401',
          creditsAllocated: topupAmount,
          details: 'Cryptographic HMAC/RSA verified against PAYPAL_WEBHOOK_ID. Balance updated atomically (+250 Credits).',
        };
        setWebhookLogs((prev) => [newLog, ...prev]);
        setLedgerEntries((prev) => [
          {
            id: `led-${Date.now()}`,
            timestamp: now,
            tenantId: 'tenant-enterprise-4401',
            type: 'CREDIT_PURCHASE',
            amount: topupAmount,
            balanceBefore: tenantBalance,
            balanceAfter: tenantBalance + topupAmount,
            idempotencyKey: `wh-${txId}`,
            referenceId: 'PAYPAL_WH_EVENT_CAP_1',
            status: 'COMMITTED',
          },
          ...prev,
        ]);
      } else if (webhookMode === 'tampered') {
        const newLog: WebhookSimulationLog = {
          id: `log-${Date.now()}`,
          timestamp: now,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          transmissionId: txId,
          certUrl: 'https://api.paypal.com/v1/notifications/certs/CERT-360-FAKE.pem',
          signatureStatus: 'FAILED_SIGNATURE',
          tenantId: 'tenant-enterprise-4401',
          creditsAllocated: 0,
          details: 'HTTP 401 UNAUTHORIZED: Cryptographic signature mismatch. Database state mutation rejected.',
        };
        setWebhookLogs((prev) => [newLog, ...prev]);
      } else if (webhookMode === 'ssrf') {
        const newLog: WebhookSimulationLog = {
          id: `log-${Date.now()}`,
          timestamp: now,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          transmissionId: txId,
          certUrl: 'http://169.254.169.254/latest/meta-data/',
          signatureStatus: 'BLOCKED_SSRF',
          tenantId: 'tenant-enterprise-4401',
          creditsAllocated: 0,
          details: 'SSRF DEFENSE TRIGGERED: Certificate domain not in whitelist (*.paypal.com). Execution aborted.',
        };
        setWebhookLogs((prev) => [newLog, ...prev]);
      } else if (webhookMode === 'replay') {
        const newLog: WebhookSimulationLog = {
          id: `log-${Date.now()}`,
          timestamp: now,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          transmissionId: 'tx-8192-3849-0192',
          certUrl: 'https://api.paypal.com/v1/notifications/certs/CERT-360-1234.pem',
          signatureStatus: 'REPLAY_DETECTED',
          tenantId: 'tenant-enterprise-4401',
          creditsAllocated: 0,
          details: 'IDEMPOTENCY REPLAY: Event already committed. Returned HTTP 200 without double-crediting.',
        };
        setWebhookLogs((prev) => [newLog, ...prev]);
      }
      setIsProcessingWebhook(false);
    }, 600);
  };

  // Run Idempotency Test
  const handleTestIdempotency = (isDuplicate: boolean) => {
    const keyToUse = isDuplicate ? idempotencyKey : `idemp-apex-${Date.now()}`;
    if (!isDuplicate) setIdempotencyKey(keyToUse);

    // Check if key already exists in ledger
    const existing = ledgerEntries.find((l) => l.idempotencyKey === keyToUse);
    if (existing) {
      setIdempotencyResult({
        status: 'IDEMPOTENT_REPLAY',
        code: 200,
        message: 'Request with identical idempotency key was previously committed. Replayed previous response payload.',
        isReplay: true,
        entry: existing,
        currentBalance: tenantBalance,
      });
      return;
    }

    const cost = 75.0;
    if (tenantBalance < cost) {
      setIdempotencyResult({
        status: 'INSUFFICIENT_CREDITS',
        code: 402,
        message: 'Tenant balance inadequate for transaction.',
        currentBalance: tenantBalance,
      });
      return;
    }

    const newBal = tenantBalance - cost;
    setTenantBalance(newBal);

    const newEntry: SimulatedLedgerEntry = {
      id: `led-${Date.now()}`,
      timestamp: new Date().toISOString(),
      tenantId: 'tenant-enterprise-4401',
      type: 'COMPUTE_USAGE',
      amount: -cost,
      balanceBefore: tenantBalance,
      balanceAfter: newBal,
      idempotencyKey: keyToUse,
      referenceId: `JOB_${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'COMMITTED',
    };

    setLedgerEntries((prev) => [newEntry, ...prev]);
    setIdempotencyResult({
      status: 'SUCCESS_COMMITTED',
      code: 200,
      message: 'Atomic row lock acquired. Balance debited (-75 Credits) and recorded to immutable ledger.',
      isReplay: false,
      entry: newEntry,
      currentBalance: newBal,
    });
  };

  // Run Compute Broker Dispatch
  const handleDispatchCompute = () => {
    const cost = currentCost;
    if (tenantBalance < cost) {
      setDispatchResult({
        success: false,
        error: 'INSUFFICIENT_CREDITS',
        message: `Tenant has ${tenantBalance.toFixed(4)} credits, but this workload requires ${cost.toFixed(4)} credits.`,
      });
      return;
    }

    const newBal = tenantBalance - cost;
    setTenantBalance(newBal);
    const jobId = `job-apex-${Math.floor(100000 + Math.random() * 900000)}`;
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const fakeHmac = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const leaseToken = `${jobId}:tenant-enterprise-4401:${expiresAt}:${fakeHmac}`;

    const newEntry: SimulatedLedgerEntry = {
      id: `led-${Date.now()}`,
      timestamp: new Date().toISOString(),
      tenantId: 'tenant-enterprise-4401',
      type: 'COMPUTE_USAGE',
      amount: -cost,
      balanceBefore: tenantBalance,
      balanceAfter: newBal,
      idempotencyKey: `dispatch-${jobId}`,
      referenceId: jobId,
      status: 'COMMITTED',
    };
    setLedgerEntries((prev) => [newEntry, ...prev]);

    setDispatchResult({
      success: true,
      jobId,
      tier: selectedTier,
      estimatedCost: cost,
      remainingBalance: newBal,
      leaseToken,
      expiresAt,
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div id="interactive-sandbox" className="space-y-6 py-6">
      {/* Simulator Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-3 rounded-xl">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-white tracking-tight">Interactive Systems Simulator</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setActiveSimulator('webhook')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSimulator === 'webhook'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            PayPal Webhook & SSRF
          </button>
          <button
            onClick={() => setActiveSimulator('idempotency')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSimulator === 'idempotency'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Idempotent Ledger & Locks
          </button>
          <button
            onClick={() => setActiveSimulator('compute')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSimulator === 'compute'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Compute Broker & Lease
          </button>
          <button
            onClick={() => setActiveSimulator('health')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSimulator === 'health'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            /health & asyncpg Pool
          </button>
          <button
            onClick={() => setActiveSimulator('telemetry')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSimulator === 'telemetry'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Live GPU Telemetry (WSS)
          </button>
        </div>

        {/* Live Tenant Balance Indicator */}
        <div className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400">Tenant Balance:</span>
          <span className="text-emerald-400 font-bold">{tenantBalance.toFixed(2)} Credits</span>
        </div>
      </div>

      {/* Simulator 1: PayPal Webhook & SSRF Defense */}
      {activeSimulator === 'webhook' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-400" />
                <span>Webhook Ingestion Attack Scenarios</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Test how the backend validates cryptographic signatures and blocks forged payloads before touching the database.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Test Scenario</label>
              <div className="space-y-2">
                <button
                  onClick={() => setWebhookMode('valid')}
                  className={`w-full text-left p-3 rounded-lg border text-xs transition-all ${
                    webhookMode === 'valid'
                      ? 'bg-blue-950/60 border-blue-500/50 text-blue-200'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="font-semibold text-slate-200">1. Legitimate PayPal Webhook</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Valid signature against PAYPAL_WEBHOOK_ID. Triggers balance top-up (+250).</div>
                </button>

                <button
                  onClick={() => setWebhookMode('tampered')}
                  className={`w-full text-left p-3 rounded-lg border text-xs transition-all ${
                    webhookMode === 'tampered'
                      ? 'bg-red-950/60 border-red-500/50 text-red-200'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="font-semibold text-slate-200">2. Forged / Tampered Payload</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Invalid cryptographic signature. Throws 401 Unauthorized with zero state mutation.</div>
                </button>

                <button
                  onClick={() => setWebhookMode('ssrf')}
                  className={`w-full text-left p-3 rounded-lg border text-xs transition-all ${
                    webhookMode === 'ssrf'
                      ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="font-semibold text-slate-200">3. Malicious SSRF Cert URL</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Cert URL points to AWS metadata IP (169.254.169.254). validate_paypal_cert_url drops request.</div>
                </button>

                <button
                  onClick={() => setWebhookMode('replay')}
                  className={`w-full text-left p-3 rounded-lg border text-xs transition-all ${
                    webhookMode === 'replay'
                      ? 'bg-purple-950/60 border-purple-500/50 text-purple-200'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="font-semibold text-slate-200">4. Webhook Replay Attack</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Duplicate transmission_id re-sent. Handled idempotently without double-crediting.</div>
                </button>
              </div>
            </div>

            <button
              onClick={handleSimulateWebhook}
              disabled={isProcessingWebhook}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isProcessingWebhook ? 'Verifying Signature...' : 'Send Simulated Webhook'}</span>
            </button>
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Cryptographic Webhook Ingestion Log</span>
              </h3>
              <span className="text-xs text-slate-500 font-mono">POST /billing/webhook</span>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {webhookLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-3.5 rounded-lg border text-xs font-mono space-y-1.5 ${
                    log.signatureStatus === 'VERIFIED'
                      ? 'bg-slate-950 border-emerald-500/30 text-slate-300'
                      : log.signatureStatus === 'REPLAY_DETECTED'
                      ? 'bg-slate-950 border-purple-500/30 text-slate-300'
                      : 'bg-slate-950 border-red-500/30 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">{log.timestamp}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.signatureStatus === 'VERIFIED'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : log.signatureStatus === 'REPLAY_DETECTED'
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {log.signatureStatus}
                    </span>
                  </div>
                  <div className="text-xs text-white font-semibold">Event: {log.eventType}</div>
                  <div className="text-[11px] text-slate-400 truncate">Transmission ID: {log.transmissionId}</div>
                  <div className="text-[11px] text-slate-400 truncate">Cert URL: {log.certUrl}</div>
                  <div className="text-xs text-slate-300 pt-1 border-t border-slate-800/80">{log.details}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Simulator 2: Idempotent Double-Entry Ledger & Concurrency Tester */}
      {activeSimulator === 'idempotency' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-400" />
                <span>Idempotency & Row Lock Controls</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Verify that repeated requests with the same Idempotency-Key return cached responses without duplicate balance deductions.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Current Idempotency Key</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={idempotencyKey}
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => copyToClipboard(idempotencyKey, 'idemp-key')}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  {copiedText === 'idemp-key' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => handleTestIdempotency(false)}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                Send Fresh Request (New Key)
              </button>
              <button
                onClick={() => handleTestIdempotency(true)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              >
                Send Duplicate Request (Same Key)
              </button>
            </div>

            {idempotencyResult && (
              <div
                className={`p-3.5 rounded-lg border text-xs font-mono space-y-1.5 ${
                  idempotencyResult.isReplay
                    ? 'bg-purple-950/40 border-purple-500/40 text-purple-200'
                    : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                }`}
              >
                <div className="font-bold">{idempotencyResult.status} (HTTP {idempotencyResult.code})</div>
                <div className="text-[11px] text-slate-300">{idempotencyResult.message}</div>
                <div className="text-[11px] text-slate-400">Balance: {idempotencyResult.currentBalance.toFixed(2)} Credits</div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Immutable Double-Entry Ledger Entries (ledger_entries)</span>
              </h3>
              <span className="text-xs text-slate-500 font-mono">SELECT * FOR UPDATE</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono text-slate-300">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Balance Before</th>
                    <th className="py-2.5 px-3">Balance After</th>
                    <th className="py-2.5 px-3">Idempotency Key</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {ledgerEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-white">{entry.type}</td>
                      <td className={`py-2.5 px-3 font-bold ${entry.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {entry.amount > 0 ? `+${entry.amount.toFixed(2)}` : entry.amount.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{entry.balanceBefore.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-slate-200">{entry.balanceAfter.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-slate-400 truncate max-w-[140px]">{entry.idempotencyKey}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400">
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Simulator 3: Compute Broker & HMAC Lease Generator */}
      {activeSimulator === 'compute' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span>Compute Broker Workload Sizer</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Configure autonomous compute specifications and test pre-flight balance holds.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Hardware Tier</label>
                <select
                  value={selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500 mt-1"
                >
                  {Object.keys(tiers).map((tierKey) => (
                    <option key={tierKey} value={tierKey}>
                      {tierKey} (${tiers[tierKey].base.toFixed(2)}/hr base)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">{tiers[selectedTier]?.description}</p>
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Allocated CPU Cores:</span>
                  <span className="font-mono text-white">{cpuCores} vCPU</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="64"
                  value={cpuCores}
                  onChange={(e) => setCpuCores(Number(e.target.value))}
                  className="w-full accent-purple-500 mt-1"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Memory Allocation:</span>
                  <span className="font-mono text-white">{(memoryMb / 1024).toFixed(0)} GB</span>
                </div>
                <input
                  type="range"
                  min="1024"
                  max="131072"
                  step="1024"
                  value={memoryMb}
                  onChange={(e) => setMemoryMb(Number(e.target.value))}
                  className="w-full accent-purple-500 mt-1"
                />
              </div>

              {selectedTier.includes('GPU') && (
                <div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">GPU Accelerators:</span>
                    <span className="font-mono text-white">{gpuCount} GPU</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={gpuCount}
                    onChange={(e) => setGpuCount(Number(e.target.value))}
                    className="w-full accent-purple-500 mt-1"
                  />
                </div>
              )}

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Upfront Hold Estimate:</span>
                <span className="text-purple-400 font-bold text-sm">{currentCost.toFixed(4)} Credits/hr</span>
              </div>
            </div>

            <button
              onClick={handleDispatchCompute}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              Dispatch Compute Workload
            </button>
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-400" />
                <span>Cryptographic Execution Lease & Dispatch Response</span>
              </h3>
              <span className="text-xs text-slate-500 font-mono">POST /compute/dispatch</span>
            </div>

            {dispatchResult ? (
              <div className="space-y-4">
                {dispatchResult.success ? (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-lg flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-emerald-300">Compute Workload Dispatched & Credits Reserved</div>
                        <div className="text-[11px] text-slate-300 mt-0.5">
                          Job ID <span className="font-mono text-white">{dispatchResult.jobId}</span> assigned to worker lease pool.
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">Signed HMAC-SHA256 Lease Token:</span>
                        <button
                          onClick={() => copyToClipboard(dispatchResult.leaseToken, 'lease-token')}
                          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                        >
                          {copiedText === 'lease-token' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>Copy Token</span>
                        </button>
                      </div>
                      <div className="p-2.5 bg-slate-900 rounded font-mono text-[11px] text-purple-300 break-all border border-slate-800/80">
                        {dispatchResult.leaseToken}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono text-slate-400">
                        <div>Tier: <span className="text-white">{dispatchResult.tier}</span></div>
                        <div>Cost: <span className="text-white">-{dispatchResult.estimatedCost.toFixed(4)}</span></div>
                        <div>Balance: <span className="text-emerald-400">{dispatchResult.remainingBalance.toFixed(2)}</span></div>
                        <div>TTL: <span className="text-white">3600s</span></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-red-950/40 border border-red-500/30 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-red-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Dispatch Rejected: {dispatchResult.error}</span>
                    </div>
                    <p className="text-xs text-slate-300">{dispatchResult.message}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                Configure parameters and click "Dispatch Compute Workload" to view generated HMAC lease tokens and atomic ledger deduction.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Simulator 4: /health Readiness Probe & asyncpg Connection Pool */}
      {activeSimulator === 'health' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-sm font-semibold text-white">Production /health Diagnostic Probe</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">Render container health checks query this route every 30 seconds.</p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 self-start sm:self-auto">
              HTTP 200 OK
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-mono text-slate-400">PostgreSQL Status</span>
              <div className="text-lg font-bold text-emerald-400 mt-1">HEALTHY</div>
              <span className="text-[10px] text-slate-500 font-mono">Ping Latency: 1.84ms</span>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-mono text-slate-400">Connection Pool (asyncpg)</span>
              <div className="text-lg font-bold text-white mt-1">5 / 20 Active</div>
              <span className="text-[10px] text-slate-500 font-mono">15 Idle Connections</span>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-mono text-slate-400">SSL Enforcement</span>
              <div className="text-lg font-bold text-blue-400 mt-1">ENABLED</div>
              <span className="text-[10px] text-slate-500 font-mono">TLSv1.3 Encrypted</span>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-mono text-slate-400">System Uptime</span>
              <div className="text-lg font-bold text-purple-400 mt-1">99.998%</div>
              <span className="text-[10px] text-slate-500 font-mono">Zero Memory Leaks</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>GET /health JSON Response Payload:</span>
              <button
                onClick={() => copyToClipboard(`{\n  "status": "OPERATIONAL",\n  "service": "ApexSovereign.ai",\n  "version": "2.4.0-enterprise",\n  "environment": "production",\n  "database": {\n    "status": "HEALTHY",\n    "latency_ms": 1.84,\n    "pool": {\n      "size": 5,\n      "free": 15,\n      "min_size": 5,\n      "max_size": 20\n    }\n  }\n}`, 'health-json')}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
              >
                {copiedText === 'health-json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>Copy JSON</span>
              </button>
            </div>
            <pre className="p-4 bg-slate-950 rounded-xl font-mono text-xs text-emerald-300 border border-slate-800 overflow-x-auto">
{`{
  "status": "OPERATIONAL",
  "service": "ApexSovereign.ai",
  "version": "2.4.0-enterprise",
  "environment": "production",
  "uptime_seconds": 841920,
  "database": {
    "status": "HEALTHY",
    "latency_ms": 1.84,
    "pool": {
      "size": 5,
      "free": 15,
      "min_size": 5,
      "max_size": 20
    }
  },
  "timestamp": ${Math.floor(Date.now() / 1000)}
}`}
            </pre>
          </div>
        </div>
      )}

      {/* Simulator 5: Real-Time WebSocket GPU Telemetry Stream */}
      {activeSimulator === 'telemetry' && (
        <div className="space-y-4">
          <LiveGpuTelemetryStream />
        </div>
      )}
    </div>
  );
};
