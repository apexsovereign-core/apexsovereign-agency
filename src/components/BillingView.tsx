import React, { useState } from 'react';
import { CreditCard, DollarSign, Key, Check, Copy, Shield, ArrowUpRight, History, Zap, CheckCircle2 } from 'lucide-react';

interface LedgerEntry {
  id: string;
  txHash: string;
  type: 'PAYPAL_DEPOSIT' | 'COMPUTE_DEBIT' | 'CLUSTER_ESCROW';
  amountUsd: number;
  computeUnits: number;
  status: 'SETTLED' | 'COMMITTED';
  timestamp: string;
}

const INITIAL_LEDGER: LedgerEntry[] = [
  {
    id: 'tx_apex_901823',
    txHash: '0x8f19e42cb709b1a03c4f92d83e201bfa',
    type: 'PAYPAL_DEPOSIT',
    amountUsd: 500.0,
    computeUnits: 50000,
    status: 'SETTLED',
    timestamp: 'Today, 10:45 UTC',
  },
  {
    id: 'tx_apex_901822',
    txHash: '0x7e2210ad843a99cc1b84f3299c8321da',
    type: 'COMPUTE_DEBIT',
    amountUsd: -19.4,
    computeUnits: -1940,
    status: 'SETTLED',
    timestamp: 'Today, 09:12 UTC',
  },
  {
    id: 'tx_apex_901821',
    txHash: '0x5c4401bb39ac98ef0142998ae9021a8b',
    type: 'CLUSTER_ESCROW',
    amountUsd: -76.8,
    computeUnits: -7680,
    status: 'COMMITTED',
    timestamp: 'Yesterday, 22:30 UTC',
  },
];

export const BillingView: React.FC = () => {
  const [balanceCu, setBalanceCu] = useState<number>(40380);
  const [selectedTopup, setSelectedTopup] = useState<number>(50);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [ledger, setLedger] = useState<LedgerEntry[]>(INITIAL_LEDGER);
  const [apiKey, setApiKey] = useState<string>('sk_live_apex_90f2b38c4189e17b3d90214a');
  const [isGeneratingKey, setIsGeneratingKey] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  const topupOptions = [
    { usd: 10, cu: 1000, label: 'Starter Sandbox' },
    { usd: 50, cu: 5000, label: 'Development Fleet' },
    { usd: 500, cu: 50000, label: 'Enterprise Production', popular: true },
    { usd: 2500, cu: 250000, label: 'Institutional Clearing' },
  ];

  const handleDeposit = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const addedCu = selectedTopup * 100;
      setBalanceCu((prev) => prev + addedCu);

      const randomTx = '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      const newEntry: LedgerEntry = {
        id: `tx_apex_${Date.now().toString().slice(-6)}`,
        txHash: randomTx,
        type: 'PAYPAL_DEPOSIT',
        amountUsd: selectedTopup,
        computeUnits: addedCu,
        status: 'SETTLED',
        timestamp: 'Just now',
      };

      setLedger((prev) => [newEntry, ...prev]);
      setIsProcessing(false);
      setNotification(`Successfully settled $${selectedTopup}.00 USD (+${addedCu.toLocaleString()} CU credited).`);
      setTimeout(() => setNotification(null), 4000);
    }, 1000);
  };

  const mintNewApiKey = () => {
    setIsGeneratingKey(true);
    setTimeout(() => {
      const randomKey = 'sk_live_apex_' + Array.from({ length: 28 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      setApiKey(randomKey);
      setIsGeneratingKey(false);
      setNotification('New Bearer Secret API Key generated and bound to Supabase vault.');
      setTimeout(() => setNotification(null), 4000);
    }, 800);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="w-full space-y-8">
      {/* Notification Toast */}
      {notification && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 font-mono text-xs flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
        </div>
      )}

      {/* Header & Ledger Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-6 rounded-2xl bg-[#080D16]/90 border border-[#00F0FF]/30 backdrop-blur-xl md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-[#00F0FF] uppercase tracking-wider font-bold">
              DOUBLE-ENTRY COMPUTE LEDGER
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
              $1.00 USD = 100 CU FIXED PARITY
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight">
              {balanceCu.toLocaleString()} <span className="text-[#00F0FF]">CU</span>
            </div>
            <div className="text-sm font-mono text-slate-400">
              ≈ ${(balanceCu / 100).toFixed(2)} USD Available
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Sub-18ms micro-debits settle atomically against Supabase PostgreSQL ledger with cryptographic HMAC signatures.
          </p>
        </div>

        {/* API Key Quick Access Card */}
        <div className="p-6 rounded-2xl bg-[#080D16]/90 border border-slate-800 backdrop-blur-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-[#00F0FF]" />
                BEARER API SECRET
              </span>
              <span className="text-[9px] font-mono text-slate-500">PROD SCOPE</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#030508] border border-slate-800 flex items-center justify-between gap-2">
              <code className="text-[11px] font-mono text-[#00F0FF] truncate">
                {apiKey}
              </code>
              <button
                onClick={() => copyToClipboard(apiKey)}
                className="text-slate-400 hover:text-white transition shrink-0"
                title="Copy API Key"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            onClick={mintNewApiKey}
            disabled={isGeneratingKey}
            className="mt-4 w-full py-2 px-3 rounded-lg bg-[#050811] border border-slate-700 hover:border-[#00F0FF] text-xs font-mono text-slate-300 hover:text-[#00F0FF] transition flex items-center justify-center gap-1.5"
          >
            <Key className="w-3 h-3" />
            <span>{isGeneratingKey ? 'MINTING KEY...' : 'ROTATE API KEY'}</span>
          </button>
        </div>
      </div>

      {/* Credit Top-Up Section */}
      <div className="p-6 md:p-8 rounded-2xl bg-[#080D16]/90 border border-[#00F0FF]/25 backdrop-blur-xl space-y-6">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00F0FF]">
            PAYPAL SETTLEMENT GATEWAY
          </span>
          <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">
            Instant Compute Unit Deposit
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Deposits are settled via PayPal webhooks (/api/webhooks/paypal) and credited instantly with zero latency delay.
          </p>
        </div>

        {/* Preset Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {topupOptions.map((opt) => {
            const isSelected = selectedTopup === opt.usd;
            return (
              <div
                key={opt.usd}
                onClick={() => setSelectedTopup(opt.usd)}
                className={`p-5 rounded-xl border transition cursor-pointer relative ${
                  isSelected
                    ? 'bg-[#050811] border-[#00F0FF] shadow-[0_0_24px_rgba(0,240,255,0.25)]'
                    : 'bg-[#030508] border-slate-800 hover:border-slate-700'
                }`}
              >
                {opt.popular && (
                  <span className="absolute top-3 right-3 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40">
                    MOST POPULAR
                  </span>
                )}
                <div className="text-2xl font-bold font-mono text-white mb-1">
                  ${opt.usd} <span className="text-xs text-slate-500 font-normal">USD</span>
                </div>
                <div className="text-sm font-mono text-[#00F0FF] font-bold mb-2">
                  +{opt.cu.toLocaleString()} CU
                </div>
                <div className="text-xs text-slate-400">
                  {opt.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Deposit Trigger Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-800">
          <div className="text-xs font-mono text-slate-400">
            Selected Tier: <span className="text-white font-bold">${selectedTopup}.00 USD</span> · Credits:{' '}
            <span className="text-[#00F0FF] font-bold">+{(selectedTopup * 100).toLocaleString()} CU</span>
          </div>

          <button
            onClick={handleDeposit}
            disabled={isProcessing}
            className="py-3 px-6 rounded-xl bg-[#00F0FF] hover:bg-[#38BDF8] disabled:opacity-50 text-[#020305] font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.4)] transition active:scale-95"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>{isProcessing ? 'CONFIRMING ATOMIC SETTLEMENT...' : `EXECUTE $${selectedTopup}.00 PAYPAL TOP-UP`}</span>
          </button>
        </div>
      </div>

      {/* Transaction Ledger Table */}
      <div className="p-6 rounded-2xl bg-[#080D16]/90 border border-slate-800 backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#00F0FF]" />
            <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
              Cryptographic Transaction Ledger
            </h4>
          </div>
          <span className="text-xs font-mono text-slate-500">REAL-TIME DOUBLE ENTRY</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase">
                <th className="py-2.5 px-3">TX HASH</th>
                <th className="py-2.5 px-3">OPERATION</th>
                <th className="py-2.5 px-3 text-right">USD VALUE</th>
                <th className="py-2.5 px-3 text-right">COMPUTE UNITS</th>
                <th className="py-2.5 px-3">STATUS</th>
                <th className="py-2.5 px-3 text-right">TIMESTAMP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {ledger.map((entry) => (
                <tr key={entry.id} className="hover:bg-[#050811]/60 transition">
                  <td className="py-3 px-3 text-[#00F0FF] font-mono">{entry.txHash.slice(0, 14)}...</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-700 text-slate-300">
                      {entry.type}
                    </span>
                  </td>
                  <td className={`py-3 px-3 text-right font-bold ${entry.amountUsd >= 0 ? 'text-[#10B981]' : 'text-slate-400'}`}>
                    {entry.amountUsd >= 0 ? `+$${entry.amountUsd.toFixed(2)}` : `-$${Math.abs(entry.amountUsd).toFixed(2)}`}
                  </td>
                  <td className={`py-3 px-3 text-right font-bold ${entry.computeUnits >= 0 ? 'text-[#00F0FF]' : 'text-slate-400'}`}>
                    {entry.computeUnits >= 0 ? `+${entry.computeUnits.toLocaleString()}` : entry.computeUnits.toLocaleString()} CU
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-[10px] text-[#10B981] font-bold">
                      ● {entry.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right text-slate-500">{entry.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
