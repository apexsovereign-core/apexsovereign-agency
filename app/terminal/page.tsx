'use client';

import React from 'react';
import Link from 'next/link';
import { TerminalCLIView } from '../../src/components/TerminalCLIView';

export default function TerminalPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-mono text-[#00F0FF] uppercase tracking-wider">
            EXCHANGE CONTROL PLANE
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Autonomous CLI Terminal & JSON Inspector
          </h1>
        </div>
        <Link
          href="/"
          className="text-xs font-mono text-slate-400 hover:text-white transition"
        >
          ← BACK TO OVERVIEW
        </Link>
      </div>

      <TerminalCLIView />
    </div>
  );
}
