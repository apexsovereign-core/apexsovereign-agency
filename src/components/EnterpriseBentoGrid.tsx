import React from 'react';
import { TrendingUp, Coins, BarChart3, CalendarCheck, Zap, Lock, ArrowUpRight, Shield } from 'lucide-react';

interface BentoCard {
  id: string;
  title: string;
  badge: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  metric: string;
  metricLabel: string;
  accent: string;
  cta: string;
}

const BENTO_CARDS: BentoCard[] = [
  {
    id: 'capacity-futures',
    title: 'Capacity Futures',
    badge: 'CLEARINGHOUSE',
    description: 'Trade forward GPU capacity contracts with transparent pricing and multi-week settlement windows.',
    icon: TrendingUp,
    metric: '$1.84/hr',
    metricLabel: '30-Day Forward Rubin Contract',
    accent: '#00F0FF',
    cta: 'Trade Futures',
  },
  {
    id: 'token-futures',
    title: 'Token Production Futures',
    badge: 'GUARANTEED OUTPUT',
    description: 'Lock in future token output volume at fixed rates for predictable cost planning.',
    icon: Coins,
    metric: '100M Tokens',
    metricLabel: 'Fixed Rate at $0.08 / 1M Tokens',
    accent: '#10B981',
    cta: 'Lock Tokens',
  },
  {
    id: 'order-book',
    title: 'Live Order Book',
    badge: 'HIGH-FREQUENCY MESH',
    description: 'Real-time bid and ask depth showing live demand and supply across the sovereign mesh.',
    icon: BarChart3,
    metric: '2,840 GPUs',
    metricLabel: 'Active Depth Across 3 Tier-1 Hubs',
    accent: '#38BDF8',
    cta: 'View Depth',
  },
  {
    id: 'reservation-calendar',
    title: 'Reservation Calendar',
    badge: 'ATOMIC BOOKING',
    description: 'Book hard or soft GPU reservations weeks or months in advance with automatic confirmation.',
    icon: CalendarCheck,
    metric: '99.999%',
    metricLabel: 'SLA Guaranteed Delivery',
    accent: '#A78BFA',
    cta: 'Book Dates',
  },
  {
    id: 'disaggregated-prefill',
    title: 'Disaggregated Prefill',
    badge: 'TTFT OPTIMIZATION',
    description: 'Offload high-context LLM prompt prefilling to high-bandwidth memory clusters to eliminate initial TTFT bottlenecks.',
    icon: Zap,
    metric: '14.2ms',
    metricLabel: 'Median Time to First Token (TTFT)',
    accent: '#F59E0B',
    cta: 'Configure Mesh',
  },
  {
    id: 'confidential-enclaves',
    title: 'Confidential Enclaves',
    badge: 'HARDWARE SECURITY',
    description: 'Hardware-enforced secure memory encryption ensuring total client IP privacy during enterprise training runs.',
    icon: Lock,
    metric: 'AMD SEV-SNP',
    metricLabel: 'NVIDIA H100 Confidential Compute',
    accent: '#EC4899',
    cta: 'Audit Perimeter',
  },
];

interface EnterpriseBentoGridProps {
  onSelectAction?: (actionId: string) => void;
}

export const EnterpriseBentoGrid: React.FC<EnterpriseBentoGridProps> = ({ onSelectAction }) => {
  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#00F0FF] uppercase tracking-wider mb-1">
            <Shield className="w-3.5 h-3.5 text-[#00F0FF]" />
            SOVEREIGN ENTERPRISE MARKETS & EXECUTION FABRIC
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Institutional Compute Primitives
          </h3>
        </div>
        <p className="text-xs font-mono text-slate-400 max-w-md">
          Zero-spread forward contracts, deterministic preemption failover, and hardware-level encryption across global nodes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {BENTO_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className="group p-6 rounded-2xl bg-[#080D16]/90 border border-slate-800 hover:border-[#00F0FF]/60 backdrop-blur-xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,240,255,0.12)] flex flex-col justify-between relative overflow-hidden"
            >
              {/* Top Accent Gradient Line */}
              <div
                className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${card.accent}, transparent)` }}
              />

              <div>
                {/* Header */}
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{
                      backgroundColor: `${card.accent}15`,
                      border: `1px solid ${card.accent}40`,
                    }}
                  >
                    <Icon className="w-5 h-5" style={{ color: card.accent }} />
                  </div>
                  <span
                    className="text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor: `${card.accent}10`,
                      borderColor: `${card.accent}30`,
                      color: card.accent,
                    }}
                  >
                    {card.badge}
                  </span>
                </div>

                {/* Title & Copy */}
                <h4 className="text-lg font-bold text-white mb-2 group-hover:text-[#00F0FF] transition">
                  {card.title}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed mb-6">
                  {card.description}
                </p>
              </div>

              {/* Bottom Metric & Action */}
              <div className="pt-4 border-t border-slate-800/80 flex items-end justify-between">
                <div>
                  <div className="text-sm font-mono font-bold text-white">
                    {card.metric}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {card.metricLabel}
                  </div>
                </div>

                <button
                  onClick={() => onSelectAction?.(card.id)}
                  className="flex items-center gap-1 text-xs font-mono font-bold text-[#00F0FF] group-hover:translate-x-1 transition-transform"
                >
                  <span>{card.cta}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
