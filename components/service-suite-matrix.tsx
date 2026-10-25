'use client';

import React from 'react';
import Link from 'next/link';
import {
  TrendingDown,
  Calendar,
  Coins,
  Shield,
  CreditCard,
  Zap,
  ArrowUpRight,
  CheckCircle2,
  Lock,
  Cpu
} from 'lucide-react';

export interface ServiceItem {
  id: string;
  number: string;
  title: string;
  tagline: string;
  description: string;
  metric: string;
  metricLabel: string;
  accent: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const APEX_SERVICES: ServiceItem[] = [
  {
    id: 'spot-arbitrage',
    number: '01',
    title: 'Real-Time GPU Spot Arbitrage',
    tagline: 'Sub-18ms Routing · Bare-Metal Lowest Cost',
    description:
      'Continuous spot arbitrage dynamically rerouting training & inference jobs to lowest-cost bare-metal capacity with 32% to 41% verified savings against hyperscaler on-demand rates.',
    metric: '32% - 52%',
    metricLabel: 'Net Margin Savings vs AWS/GCP',
    accent: '#00F0FF',
    href: '/terminal',
    icon: TrendingDown,
  },
  {
    id: 'capacity-futures',
    number: '02',
    title: 'Capacity Futures Clearing',
    tagline: 'Locked-Rate 30/60/90-Day Forward Contracts',
    description:
      'Institutional forward reservation contracts locking GPU clusters weeks or months in advance with double-entry escrow clearing and 100% hardware SLA guarantee.',
    metric: '$1.88 / hr',
    metricLabel: '30-Day Forward Rubin Contract',
    accent: '#38BDF8',
    href: '/futures',
    icon: Calendar,
  },
  {
    id: 'token-production-futures',
    number: '03',
    title: 'Token Production Futures',
    tagline: 'Fixed-Cost Guaranteed Token Throughput',
    description:
      'Derivative token supply contracts hedging volatility by fixing inference costs per 1M tokens across DeepSeek-V3, Llama-3.1 70B, and custom MoE architectures.',
    metric: '$0.065 / 1M',
    metricLabel: 'Fixed Throughput Guarantee',
    accent: '#10B981',
    href: '/futures',
    icon: Coins,
  },
  {
    id: 'confidential-enclaves',
    number: '04',
    title: 'Confidential Compute Enclaves',
    tagline: 'AMD SEV-SNP & NVIDIA CC Memory Isolation',
    description:
      'Hardware-encrypted memory partitions ensuring zero-leak confidential computing for proprietary enterprise models, weights, and private customer training data.',
    metric: 'AES-256-XTS',
    metricLabel: 'On-Die Cryptographic RoT',
    accent: '#EC4899',
    href: '/terminal',
    icon: Lock,
  },
  {
    id: 'atomic-settlement',
    number: '05',
    title: 'Atomic Ledger Settlement',
    tagline: 'Double-Entry PayPal Webhooks ($1.00 = 100 CU)',
    description:
      'Instant financial clearing via verified cryptographic PayPal webhooks (/v1/webhooks/paypal) executing atomic Supabase PostgreSQL double-entry credit minting.',
    metric: '$1.00 = 100 CU',
    metricLabel: 'Fixed Parity Instant Minting',
    accent: '#A78BFA',
    href: '/billing',
    icon: CreditCard,
  },
  {
    id: 'disaggregated-mesh',
    number: '06',
    title: 'Disaggregated Prefill/Decode Mesh',
    tagline: 'Split-Phase Inference Memory Architecture',
    description:
      'Disaggregated pipeline separating compute-heavy prompt prefilling on high-bandwidth optical nodes from token generation nodes for maximum FLOP efficiency and sub-15ms TTFT.',
    metric: '10.4ms P99',
    metricLabel: 'Split-Phase Median RTT',
    accent: '#F59E0B',
    href: '/terminal',
    icon: Zap,
  },
];

export const ServiceSuiteMatrix: React.FC = () => {
  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#00F0FF] uppercase tracking-wider mb-1">
            <Shield className="w-4 h-4 text-[#00F0FF]" />
            COMPLETE INSTITUTIONAL SERVICE SUITE
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Six Sovereign Enterprise Capabilities
          </h2>
        </div>
        <p className="text-xs font-mono text-slate-400 max-w-md">
          Hardware-level cryptographic security, bare-metal spot arbitrage, and forward derivative clearing.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {APEX_SERVICES.map((srv) => {
          const Icon = srv.icon;
          return (
            <div
              key={srv.id}
              className="p-6 rounded-2xl bg-[#080D16]/90 border border-slate-800 hover:border-[#00F0FF]/60 backdrop-blur-xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,240,255,0.12)] flex flex-col justify-between relative overflow-hidden group"
            >
              <div
                className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${srv.accent}, transparent)` }}
              />

              <div>
                <div className="flex items-center justify-between mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{
                      backgroundColor: `${srv.accent}15`,
                      border: `1px solid ${srv.accent}40`,
                    }}
                  >
                    <Icon className="w-5 h-5" style={{ color: srv.accent }} />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-500 tracking-wider">
                    SERVICE // {srv.number}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white mb-1 group-hover:text-[#00F0FF] transition">
                  {srv.title}
                </h3>
                <div className="text-xs font-mono text-[#00F0FF] mb-3">
                  {srv.tagline}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-6">
                  {srv.description}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex items-end justify-between">
                <div>
                  <div className="text-sm font-mono font-bold text-white">
                    {srv.metric}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {srv.metricLabel}
                  </div>
                </div>

                <Link
                  href={srv.href}
                  className="flex items-center gap-1 text-xs font-mono font-bold text-[#00F0FF] group-hover:translate-x-1 transition-transform"
                >
                  <span>EXECUTE</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ServiceSuiteMatrix;
