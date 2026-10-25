import React from 'react';
import type { Metadata } from 'next';
import Navbar from '../components/navbar';
import Footer from '../components/footer';

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
      <body className="min-h-screen bg-[#020305] text-slate-100 font-sans antialiased selection:bg-[#00F0FF]/30 selection:text-white flex flex-col justify-between">
        <Navbar />

        {/* Global Network Telemetry Banner */}
        <div className="w-full bg-[#030508] border-b border-[#00F0FF]/15 px-4 py-2 text-center overflow-x-auto whitespace-nowrap">
          <div className="inline-flex items-center gap-4 text-[10px] sm:text-[11px] font-mono tracking-wider text-slate-300">
            <span className="flex items-center gap-1.5 text-[#00F0FF] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] animate-ping" />
              10.4ms SLA LATENCY
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-[#10B981] font-bold">99.999% MESH UPTIME</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-bold">AMD SEV-SNP & NVIDIA CC ENCLAVES</span>
            <span className="text-slate-600">•</span>
            <span className="text-white">$1.00 USD = 100 CU ATOMIC LEDGER</span>
            <span className="text-slate-600">•</span>
            <span className="text-[#38BDF8] font-bold">1.44 EXAFLOPS AGGREGATE POOL</span>
          </div>
        </div>

        <main className="flex-1 w-full">
          {children}
        </main>

        <Footer />
      </body>
    </html>
  );
}
