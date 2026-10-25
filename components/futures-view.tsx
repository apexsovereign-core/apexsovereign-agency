import React, { useState } from 'react';
import { TrendingUp, Coins, ShieldCheck, CheckCircle2, Clock, Calendar, ArrowRight, FileText, Lock, Droplets, Percent, RefreshCw } from 'lucide-react';

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
  hardwareSecurity: string;
  status: 'CLEARING_OPEN' | 'OVERSUBSCRIBED' | 'GUARANTEED';
}

interface HedgingPool {
  id: string;
  name: string;
  asset: string;
  tvlUsd: string;
  apyPct: number;
  utilizationPct: number;
  hedgingVolume: string;
  status: 'OPTIMAL' | 'HIGH_DEMAND';
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
    hardwareSecurity: 'AMD SEV-SNP + NVIDIA CC Dual Enclave Attested',
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
    hardwareSecurity: 'NVIDIA Confidential Computing RoT Enforced',
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
    hardwareSecurity: 'Isolated Memory Enclave with Zero Logging',
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
    hardwareSecurity: 'AMD SEV-SNP Cryptographic Memory Partition',
    status: 'OVERSUBSCRIBED',
  },
];

const HEDGING_POOLS: HedgingPool[] = [
  {
    id: 'pool-rubin-alpha',
    name: 'Rubin Forward Liquidity Pool',
    asset: 'NVIDIA Rubin HBM4',
    tvlUsd: '$4.85M USD',
    apyPct: 14.8,
    utilizationPct: 92.4,
    hedgingVolume: '2,800 GPU-Months Hedged',
    status: 'OPTIMAL',
  },
  {
    id: 'pool-b200-delta',
    name: 'Blackwell B200 Delta Hedging Pool',
    asset: 'Blackwell B200 NVL72',
    tvlUsd: '$6.20M USD',
    apyPct: 12.4,
    utilizationPct: 88.6,
    hedgingVolume: '4,100 GPU-Months Hedged',
    status: 'OPTIMAL',
  },
  {
    id: 'pool-token-yield',
    name: 'Token Production Yield Pool',
    asset: 'Autoregressive Token Volume',
    tvlUsd: '$3.15M USD',
    apyPct: 16.2,
    utilizationPct: 96.1,
    hedgingVolume: '14.2B Tokens Guaranteed',
    status: 'HIGH_DEMAND',
  },
];

export const FuturesView: React.FC = () => {
  const [selectedContract, setSelectedContract] = useState<FutureContract>(CONTRACTS[0]);
  const [signedLeaseHash, setSignedLeaseHash] = useState<string | null>(null);
  const [isMinting, setIsMinting] = useState<boolean>(false);

  // Interactive Forward Calculator State
  const [calcGpus, setCalcGpus] = useState<number>(32);
  const [calcDays, setCalcDays] = useState<number>(30);
  const strikeNum = parseFloat(selectedContract.strikeRate.replace(/[^0-9.]/g, '')) || 1.88;
  const baseNum = parseFloat(selectedContract.baselineRate.replace(/[^0-9.]/g, '')) || 5.10;
  const totalHours = calcDays * 24;
  const totalCostApex = strikeNum * calcGpus * totalHours;
  const totalCostBase = baseNum * calcGpus * totalHours;
  const totalSaved = totalCostBase - totalCostApex;

  const lockContract = () => {
    setIsMinting(true);
    setTimeout(() => {
      const randomHex = Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      setSignedLeaseHash(`0x${randomHex}`);
      setIsMinting(false);
    }, 1000);
  };

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-[#080D16]/90 border border-[#00F0FF]/25 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#00F0FF] uppercase tracking-wider mb-1">
            <TrendingUp className="w-4 h-4 text-[#00F0FF]" />
            TIER-6 INSTITUTIONAL DERIVATIVES & LIQUIDITY CLEARING
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Capacity Futures & Liquidity Hedging Pools
          </h2>
          <p className="text-xs font-mono text-slate-400 mt-1 max-w-2xl">
            Forward GPU capacity clearing, fixed-rate token contracts, and liquidity risk pools backed by AMD SEV-SNP & NVIDIA Confidential Computing attestation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-[#030508] border border-[#00F0FF]/30 text-right">
            <span className="text-[10px] font-mono text-slate-400 block uppercase">TOTAL CLEARING TVL</span>
            <span className="text-lg font-mono font-bold text-[#00F0FF]">$14.20M USD</span>
          </div>
        </div>
      </div>

      {/* 1. Liquidity Hedging Pools Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-xs font-mono text-[#00F0FF] uppercase tracking-wider">
            <Droplets className="w-3.5 h-3.5" />
            <span>ACTIVE LIQUIDITY HEDGING POOLS</span>
          </div>
          <span className="text-xs font-mono text-slate-500">AUTOMATIC ESCROW REBALANCING</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {HEDGING_POOLS.map((pool) => (
            <div
              key={pool.id}
              className="p-5 rounded-xl bg-[#080D16] border border-slate-800 hover:border-[#00F0FF]/50 transition flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                    +{pool.apyPct}% FIXED APY
                  </span>
                  <span className="text-[10px] font-mono text-[#00F0FF]">
                    ● {pool.status}
                  </span>
                </div>
                <h4 className="text-base font-bold text-white mb-1">{pool.name}</h4>
                <div className="text-xs font-mono text-slate-400">{pool.asset}</div>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-800 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Value Locked:</span>
                  <span className="text-white font-bold">{pool.tvlUsd}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pool Utilization:</span>
                  <span className="text-emerald-400 font-bold">{pool.utilizationPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Hedging Volume:</span>
                  <span className="text-slate-300">{pool.hedgingVolume}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Interactive Forward-Rate Contract Calculator */}
      <div className="p-6 md:p-8 rounded-2xl bg-[#080D16]/90 border border-[#00F0FF]/25 backdrop-blur-xl space-y-6">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00F0FF]">
            FORWARD-RATE CONTRACT MODELER
          </span>
          <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">
            Hedging & Capacity Savings Calculator
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Calculate forward lock-in rates and capital retained against hyperscaler on-demand pricing.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300">GPU QUANTITY TO HEDGE:</span>
                <span className="text-[#00F0FF] font-bold">{calcGpus} GPUs</span>
              </div>
              <input
                type="range"
                min="8"
                max="256"
                step="8"
                value={calcGpus}
                onChange={(e) => setCalcGpus(parseInt(e.target.value))}
                className="w-full accent-[#00F0FF] cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300">FORWARD CONTRACT DURATION:</span>
                <span className="text-white font-bold">{calcDays} DAYS ({totalHours} HOURS)</span>
              </div>
              <input
                type="range"
                min="14"
                max="180"
                step="7"
                value={calcDays}
                onChange={(e) => setCalcDays(parseInt(e.target.value))}
                className="w-full accent-[#00F0FF] cursor-pointer"
              />
            </div>

            <div className="p-3 rounded-lg bg-[#050811] border border-slate-800 text-xs font-mono text-slate-300 flex items-center justify-between">
              <span>SELECTED CONTRACT UNDERLYING:</span>
              <span className="text-[#00F0FF] font-bold">{selectedContract.title}</span>
            </div>
          </div>

          <div className="lg:col-span-5 p-6 rounded-xl bg-gradient-to-b from-[#050914] to-[#020409] border border-[#00F0FF]/30 space-y-4">
            <div className="flex justify-between items-center text-xs font-mono pb-2 border-b border-slate-800">
              <span className="text-slate-400">NET CAPITAL RETAINED</span>
              <span className="text-[#10B981] font-bold">-{selectedContract.discountPct}% SPREAD</span>
            </div>

            <div className="text-3xl sm:text-4xl font-extrabold text-[#00F0FF] font-mono tracking-tight drop-shadow-[0_0_20px_rgba(0,240,255,0.35)]">
              ${totalSaved.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded bg-[#080D16] border border-slate-800">
                <div className="text-[10px] text-slate-500">APEX FORWARD</div>
                <div className="text-white font-bold mt-0.5">${totalCostApex.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              </div>
              <div className="p-2.5 rounded bg-[#080D16] border border-slate-800">
                <div className="text-[10px] text-slate-500">AWS / GCP BASE</div>
                <div className="text-slate-400 line-through mt-0.5">${totalCostBase.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Grid: Contracts List + Clearing Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Contracts Selection Cards */}
        <div className="lg:col-span-7 space-y-4">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider px-1">
            ACTIVE FORWARD CONTRACTS
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
                  <div className="text-xs text-slate-300 font-mono mb-2">
                    {contract.underlying}
                  </div>

                  <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 mb-3">
                    <Lock className="w-3 h-3 text-[#10B981]" />
                    <span>{contract.hardwareSecurity}</span>
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
                  <span className="text-slate-400">Commitment Size:</span>
                  <span className="text-white font-bold">{selectedContract.minCommitment}</span>
                </div>
              </div>

              {/* SLA Guarantee Note */}
              <div className="p-3 rounded-lg bg-[#00F0FF]/10 border border-[#00F0FF]/25 text-[11px] font-mono text-slate-300 flex items-start gap-2">
                <Lock className="w-4 h-4 text-[#00F0FF] shrink-0 mt-0.5" />
                <span><strong>Hardware SLA:</strong> {selectedContract.guarantee}</span>
              </div>

              {/* Signed Lease Hash Display */}
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
