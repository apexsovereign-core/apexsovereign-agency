import React from 'react';
import type { Metadata } from 'next';
import { CyanFacetedJewelEmblem } from '../src/components/CyanFacetedJewelEmblem';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ApexSovereign.ai | The Autonomous Global Sovereign Compute Exchange',
  description:
    'ApexSovereign.ai — The Autonomous Global Sovereign Compute Exchange and Spot Arbitrage Clearinghouse. 10.4ms SLA, 99.999% uptime, 1.44 Exaflops capacity, and 32% to 52% margin savings.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
      </head>
      <body className="min-h-screen bg-[#020305] text-slate-100 font-sans antialiased selection:bg-[#00F0FF]/30 selection:text-white">
        {/* Navigation Header with Permanent Cyan Faceted Jewel Emblem */}
        <header className="sticky top-0 z-50 w-full border-b border-[#00F0FF]/20 bg-[#080D16]/85 backdrop-blur-2xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 group">
              <CyanFacetedJewelEmblem size={34} glow={true} />
              <div className="flex flex-col">
                <span className="text-base sm:text-lg font-extrabold tracking-wider font-mono text-white group-hover:text-[#00F0FF] transition">
                  APEXSOVEREIGN<span className="text-[#00F0FF]">.AI</span>
                </span>
                <span className="text-[9px] font-mono text-slate-400 tracking-widest uppercase">
                  SOVEREIGN COMPUTE EXCHANGE
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-2">
              <Link
                href="/"
                className="px-3 py-1.5 rounded-lg text-xs font-mono tracking-wider text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
              >
                EXCHANGES
              </Link>
              <Link
                href="/terminal"
                className="px-3 py-1.5 rounded-lg text-xs font-mono tracking-wider text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
              >
                TERMINAL
              </Link>
              <Link
                href="/futures"
                className="px-3 py-1.5 rounded-lg text-xs font-mono tracking-wider text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
              >
                FUTURES
              </Link>
              <Link
                href="/billing"
                className="px-3 py-1.5 rounded-lg text-xs font-mono tracking-wider text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
              >
                BILLING & LEDGER
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-full bg-[#030508] border border-slate-800 text-[10px] font-mono">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                <span className="text-slate-300">10.4ms SLA</span>
                <span className="text-slate-600">|</span>
                <span className="text-[#00F0FF]">$1.00 = 100 CU</span>
              </div>

              <Link
                href="/terminal"
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00F0FF] hover:bg-[#38BDF8] text-[#020305] font-mono font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(0,240,255,0.4)] transition"
              >
                LAUNCH TERMINAL
              </Link>
            </div>
          </div>
        </header>

        {children}

        {/* Global Footer */}
        <footer className="w-full border-t border-slate-900 bg-[#020305] py-8 text-xs font-mono text-slate-500 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CyanFacetedJewelEmblem size={24} glow={false} />
              <span>APEXSOVEREIGN.AI // CRYPTOGRAPHIC CONTROL PLANE · V3.2.0</span>
            </div>
            <div className="text-[10px] text-slate-600">
              ALL SYSTEMS NOMINAL · 10.4ms P99 SLA · $1.00 = 100 CU
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
