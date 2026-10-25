import React from 'react';
import { CyanFacetedJewelEmblem } from './CyanFacetedJewelEmblem';

interface NavbarProps {
  activePage?: string;
  onNavigate?: (page: 'landing' | 'terminal' | 'futures' | 'billing') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activePage = 'landing',
  onNavigate,
}) => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#00F0FF]/20 bg-[#080D16]/85 backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
        {/* Permanent Cyan Faceted Jewel Emblem Vector */}
        <div
          onClick={() => onNavigate?.('landing')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <CyanFacetedJewelEmblem className="w-8 h-8" />
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-extrabold tracking-wider font-mono text-white group-hover:text-[#00F0FF] transition">
              APEXSOVEREIGN<span className="text-[#00F0FF]">.AI</span>
            </span>
            <span className="text-[9px] font-mono text-slate-400 tracking-widest uppercase">
              TIER-6 SOVEREIGN INSTITUTIONAL NETWORK
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-2">
          {[
            { id: 'landing', label: 'EXCHANGES' },
            { id: 'terminal', label: 'TERMINAL' },
            { id: 'futures', label: 'FUTURES' },
            { id: 'billing', label: 'BILLING & LEDGER' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate?.(item.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono tracking-wider transition ${
                activePage === item.id
                  ? 'bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40 font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right SLA & CTA Controls */}
        <div className="flex items-center gap-3">
          <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-full bg-[#030508] border border-slate-800 text-[10px] font-mono">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-slate-300">10.4ms SLA</span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 font-bold">AMD SEV-SNP & CC</span>
            <span className="text-slate-600">|</span>
            <span className="text-[#00F0FF]">$1.00 = 100 CU</span>
          </div>

          <button
            onClick={() => onNavigate?.('terminal')}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00F0FF] hover:bg-[#38BDF8] text-[#020305] font-mono font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(0,240,255,0.4)] transition"
          >
            LAUNCH TERMINAL
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
