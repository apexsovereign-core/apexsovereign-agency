import React, { useState } from 'react';
import { TrendingUp, Coins, ShieldCheck, CheckCircle2, Clock, Calendar, ArrowRight, FileText, Lock } from 'lucide-react';

interface FutureContract {
  id: string;
  type: 'CAPACITY' | 'TOKEN_PRODUCTION';
  title: string;
  underlying: string;
  forwardTerm: string;
  strikeRate: string;
  baselineRate: string;
  discountPct: number;
  minCommitment: string;
  settlementDate: string;
  guarantee: string;
  status: 'CLEARING_OPEN' | 'OVERSUBSCRIBED' | 'GUARANTEED';
}

const CONTRACTS: FutureContract[] = [
  {
    id: 'FUT-RUBIN-30D',
    type: 'CAPACITY',
    title: 'NVIDIA Rubin Forward Capacity 30D',
    underlying: '64x NVIDIA Rubin HBM4 (288GB)',
    forwardTerm: '30 Calendar Days (720 Hours)',
    strikeRate: '$1.88 / GPU-Hour',
    baselineRate: '$5.10 / GPU-Hour',
    discountPct: 63,
    minCommitment: '$86,592 USD (8,659,200 CU)',
    settlementDate: 'November 25, 2026',
    guarantee: '100% VRAM Allocation SLA or 2x Escrow Penalty',
    status: 'CLEARING_OPEN',
  },
  {
    id: 'FUT-B200-60D',
    type: 'CAPACITY',
    title: 'Blackwell B200 NVL72 Rack Forward 60D',
    underlying: '1x NVL72 Full Pod (72 GPUs, 13.8 TB VRAM)',
    forwardTerm: '60 Calendar Days (1440 Hours)',
    strikeRate: '$2.15 / GPU-Hour',
    baselineRate: '$4.60 / GPU-Hour',
    discountPct: 53,
    minCommitment: '$222,912 USD (22,291,200 CU)',
    settlementDate: 'December 25, 2026',
    guarantee: '1.8 TB/s All-to-All Fabric Verification',
    status: 'CLEARING_OPEN',
  },
  {
    id: 'FUT-TOKEN-500M',
    type: 'TOKEN_PRODUCTION',
    title: '500M DeepSeek-V3 / Llama-3.1 70B Token Forward',
    underlying: 'Autoregressive Token Stream (Prompt + Decode)',
    forwardTerm: 'Continuous 14-Day Delivery',
    strikeRate: '$0.065 / 1M Tokens',
    baselineRate: '$0.150 / 1M Tokens',
    discountPct: 56,
    minCommitment: '$32,500 USD (3,250,000 CU)',
    settlementDate: 'Immediate Rolling Delivery',
    guarantee: 'Sub-25ms Median Inter-Token Latency (ITL)',
    status: 'GUARANTEED',
  },
  {
    id: 'FUT-H100-90D',
    type: 'CAPACITY',
    title: 'Hopper H100 SXM5 Sustained Pre-Training Block',
    underlying: '128x NVIDIA H100 SXM5 80GB',
    forwardTerm: '90 Calendar Days (2160 Hours)',
    strikeRate: '$1.62 / GPU-Hour',
    baselineRate: '$3.29 / GPU-Hour',
    discountPct: 50,
    minCommitment: '$447,897 USD (44,789,760 CU)',
    settlementDate: 'January 25, 2027',
    guarantee: 'Sub-18ms Automated Host Eviction Migration',
    status: 'OVERSUBSCRIBED',
  },
];

export const FuturesView: React.FC = () => {
  const [selectedContract, setSelectedContract] = useState<FutureContract>(CONTRACTS[0]);
  const [signedLeaseHash, setSignedLeaseHash] = useState<string | null>(null);
  const [isMinting, setIsMinting] = useState<boolean>(false);

  const lockContract = () => {
    setIsMinting(true);
    setTimeout(() => {
      const randomHex = Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      setSignedLeaseHash(`0x${randomHex}`);
      setIsMinting(false);
    }, 1200);
  };

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-[#080D16]/90 border border-[#00F0FF]/25 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#00F0FF] uppercase tracking-wider mb-1">
            <TrendingUp className="w-4 h-4 text-[#00F0FF]" />
            INSTITUTIONAL DERIVATIVES & CAPACITY CLEARING
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Sovereign Capacity Futures Exchange
          </h2>
          <p className="text-xs font-mono text-slate-400 mt-1 max-w-2xl">
            Lock forward GPU reservation hours and fixed-rate token production contracts with atomic Supabase double-entry settlement and hardware SLA guarantees.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-[#030508] border border-[#00F0FF]/30 text-right">
            <span className="text-[10px] font-mono text-slate-400 block uppercase">AGGREGATE OPEN INTEREST</span>
            <span className="text-lg font-mono font-bold text-[#00F0FF]">$14.8M USD</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Contracts List + Contract Clearing Modal/Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Contracts Selection Cards */}
        <div className="lg:col-span-7 space-y-4">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider px-1">
            ACTIVE FORWARD CONTRACTS (ORDER BY DISCOUNT SPREAD)
          </div>

          <div className="space-y-3">
            {CONTRACTS.map((contract) => {
              const isSelected = contract.id === selectedContract.id;
              return (
                <div
                  key={contract.id}
                  onClick={() => {
                    setSelectedContract(contract);
                    setSignedLeaseHash(null);
                  }}
                  className={`p-5 rounded-xl border transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-[#080D16] border-[#00F0FF] shadow-[0_0_24px_rgba(0,240,255,0.18)]'
                      : 'bg-[#050811]/90 border-slate-800 hover:border-slate-700 hover:bg-[#070B14]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-mono text-slate-400 font-semibold">
                      {contract.id}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                        -{contract.discountPct}% SPREAD
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/25">
                        {contract.status}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white mb-1">
                    {contract.title}
                  </h3>
                  <div className="text-xs text-slate-300 font-mono mb-3">
                    {contract.underlying}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-500 block">LOCKED STRIKE</span>
                      <span className="text-[#00F0FF] font-bold">{contract.strikeRate}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">TERM DURATION</span>
                      <span className="text-white">{contract.forwardTerm}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">SETTLEMENT DATE</span>
                      <span className="text-slate-300">{contract.settlementDate}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Contract Clearing Terminal Card */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-[#080D16]/95 border border-[#00F0FF]/30 backdrop-blur-xl shadow-2xl flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#00F0FF]" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  CONTRACT EXECUTION ENGINE
                </span>
              </div>
              <span className="text-[10px] font-mono text-[#10B981] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Sovereign Escrow Ready
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <h4 className="text-lg font-bold text-white">{selectedContract.title}</h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                {selectedContract.underlying} · Guaranteed delivery with atomic double-entry ledger allocation.
              </p>

              <div className="p-4 rounded-xl bg-[#030508] border border-slate-800 space-y-2.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Locked Strike Rate:</span>
                  <span className="text-[#00F0FF] font-bold">{selectedContract.strikeRate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Hyperscaler Retail:</span>
                  <span className="text-slate-500 line-through">{selectedContract.baselineRate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Capital Retained:</span>
                  <span className="text-[#10B981] font-bold">{selectedContract.discountPct}% Net Savings</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-800">
                  <span className="text-slate-400">Total Commitment:</span>
                  <span className="text-white font-bold">{selectedContract.minCommitment}</span>
                </div>
              </div>

              {/* SLA Guarantee Note */}
              <div className="p-3 rounded-lg bg-[#00F0FF]/10 border border-[#00F0FF]/25 text-[11px] font-mono text-slate-300 flex items-start gap-2">
                <Lock className="w-4 h-4 text-[#00F0FF] shrink-0 mt-0.5" />
                <span><strong>Hardware SLA:</strong> {selectedContract.guarantee}</span>
              </div>

              {/* Signed Lease Hash Display if minted */}
              {signedLeaseHash && (
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 text-xs font-mono space-y-1.5 animate-fadeIn">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>CONTRACT CRYPTOGRAPHICALLY COMMITTED</span>
                  </div>
                  <div className="text-[10px] text-slate-400 break-all">
                    LEASE_HMAC_SIG: <span className="text-emerald-300">{signedLeaseHash}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Timestamp: {new Date().toISOString()} · Supabase Ledger Bound
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={lockContract}
            disabled={isMinting}
            className="w-full py-3.5 px-4 rounded-xl bg-[#00F0FF] hover:bg-[#38BDF8] disabled:opacity-50 text-[#020305] font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(0,240,255,0.4)] transition active:scale-98"
          >
            {isMinting ? (
              <span>SIGNING HMAC LEASE & COMMITTING ESCROW...</span>
            ) : (
              <>
                <span>LOCK {selectedContract.id} ATOMICALLY</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
