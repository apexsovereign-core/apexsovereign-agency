import React from 'react';
import Link from 'next/link';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-slate-900 bg-[#020305] py-10 text-xs font-mono text-slate-500 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Permanent Cyan Faceted Jewel Emblem Vector */}
        <div className="flex items-center gap-3">
          <svg
            viewBox="0 0 100 100"
            className="w-8 h-8 filter drop-shadow-[0_0_12px_rgba(0,240,255,0.8)]"
            aria-label="ApexSovereign Emblem"
          >
            <defs>
              <linearGradient id="apexCyanGradFooter" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00F0FF" />
                <stop offset="50%" stopColor="#00A8E8" />
                <stop offset="100%" stopColor="#005580" />
              </linearGradient>
            </defs>
            <polygon
              points="50,5 92,28 92,72 50,95 8,72 8,28"
              fill="url(#apexCyanGradFooter)"
              stroke="#00F0FF"
              strokeWidth="2"
            />
            <polygon
              points="50,5 92,28 50,50 8,28"
              fill="rgba(255,255,255,0.25)"
            />
            <polygon
              points="50,22 68,36 50,50 32,36"
              fill="#020305"
              stroke="#00F0FF"
              strokeWidth="1.5"
            />
          </svg>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white tracking-wider">
              APEXSOVEREIGN<span className="text-[#00F0FF]">.AI</span>
            </span>
            <span className="text-[10px] text-slate-500">
              CRYPTOGRAPHIC CONTROL PLANE · V3.6.0-GOLD
            </span>
          </div>
        </div>

        {/* Footer Navigation Links */}
        <div className="flex flex-wrap items-center gap-6 text-[11px]">
          <Link href="/" className="hover:text-white transition">
            EXCHANGES
          </Link>
          <Link href="/terminal" className="hover:text-white transition">
            TERMINAL
          </Link>
          <Link href="/futures" className="hover:text-white transition">
            FUTURES
          </Link>
          <Link href="/billing" className="hover:text-white transition">
            BILLING & LEDGER
          </Link>
          <a
            href="https://apexsovereign-agency.onrender.com/health"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#10B981] transition flex items-center gap-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            HEALTH PROBE
          </a>
        </div>

        <div className="text-[10px] text-slate-600 text-center md:text-right">
          ALL SYSTEMS NOMINAL · 10.4ms P99 SLA · $1.00 = 100 CU · AMD SEV-SNP & NVIDIA CC
        </div>
      </div>
    </footer>
  );
};

export default Footer;
