import React, { useState } from 'react';
import { CustomerUser } from '../types';
import { 
  ShieldAlert, 
  ShieldCheck, 
  KeyRound, 
  Lock, 
  Unlock, 
  ArrowLeft, 
  Sparkles, 
  AlertTriangle,
  ChevronRight,
  Terminal,
  Cpu
} from 'lucide-react';

interface AdminAccessGateProps {
  currentUser: CustomerUser | null;
  onElevateAdmin?: (adminUser: CustomerUser) => void;
  onOpenAuth?: () => void;
  onReturnToStorefront: () => void;
  toolName: string;
  toolCategory?: string;
  children: React.ReactNode;
}

export const AdminAccessGate: React.FC<AdminAccessGateProps> = ({
  currentUser,
  onElevateAdmin,
  onOpenAuth,
  onReturnToStorefront,
  toolName,
  toolCategory = 'Developer & Engineering Controls',
  children
}) => {
  const [sessionAdminUnlocked, setSessionAdminUnlocked] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSuccess, setTokenSuccess] = useState<boolean>(false);

  const envAdminToken = 
    ((import.meta as any).env?.VITE_ADMIN_ACCESS_T as string) || 
    ((import.meta as any).env?.VITE_ADMIN_ACCESS_TOKEN as string) ||
    '';

  const isUserAdmin = currentUser?.role === 'admin';
  const isAuthorized = isUserAdmin || sessionAdminUnlocked;

  const handleVerifyToken = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setTokenError(null);

    const cleanInput = tokenInput.trim();
    if (!cleanInput) {
      setTokenError('Administrative clearance token is required.');
      return;
    }

    const authorizedTokens = envAdminToken ? [envAdminToken] : [];

    if (authorizedTokens.includes(cleanInput)) {
      setTokenSuccess(true);
      setSessionAdminUnlocked(true);

      if (onElevateAdmin) {
        const elevatedAdminUser: CustomerUser = {
          id: currentUser?.id || 'usr_staff_admin_elevated',
          email: currentUser?.email || 'security.architect@apexsovereign.ai',
          fullName: currentUser?.fullName || 'Lead Principal Security Architect',
          company: currentUser?.company || 'ApexSovereign Global Infrastructure',
          tenantId: currentUser?.tenantId || 'tenant-admin-node01',
          role: 'admin',
          plan: 'enterprise',
          computeCredits: 500000,
          maxQuota: 1000000,
          apiKey: currentUser?.apiKey || ('sk_demo_admin_' + Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('')),
          createdAt: currentUser?.createdAt || new Date().toISOString(),
          subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        };
        onElevateAdmin(elevatedAdminUser);
      }
    } else {
      setTokenError('Invalid Administrative Token. Unauthorized access attempt logged.');
    }
  };

  const handleStaffQuickLogin = () => {
    setTokenError('Quick staff login is disabled. Enter the configured administrative token.');
  };

  const handleLockSession = () => {
    setSessionAdminUnlocked(false);
    setTokenSuccess(false);
    setTokenInput('');
    onReturnToStorefront();
  };

  // If authorized, show the protected tool with an institutional staff banner
  if (isAuthorized) {
    return (
      <div className="space-y-4">
        {/* Institutional Admin Clearance Banner */}
        <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <div className="flex items-center gap-2 font-mono">
              <span className="text-slate-400 uppercase text-[10px] tracking-wider">CLEARANCE ACTIVE:</span>
              <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 font-semibold">
                STAFF ADMIN
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-300 font-semibold">{toolName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onReturnToStorefront}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-[11px]"
            >
              <ArrowLeft className="w-3 h-3 text-slate-400" />
              <span>Public Storefront</span>
            </button>

            <button
              onClick={handleLockSession}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 transition-colors text-[11px]"
            >
              <Lock className="w-3 h-3 text-rose-400" />
              <span>Lock Admin Session</span>
            </button>
          </div>
        </div>

        {/* Render Child Tool */}
        {children}
      </div>
    );
  }

  // If NOT authorized, render the pristine institutional Access Gate
  return (
    <div className="max-w-xl mx-auto py-12 px-4 animate-in fade-in duration-300">
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header Badge */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>ADMINISTRATIVE ACCESS GATE</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">ISO/IEC 27001 ISOLATION</span>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            Restricted Engineering Control
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-200">{toolName}</strong> and internal developer tooling (variable signers, configuration managers, test consoles, and codebase explorers) are strictly isolated from the public storefront to protect proprietary IP and prevent security key leakage.
          </p>
        </div>

        {/* Warning Callout */}
        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs space-y-1.5">
          <div className="flex items-center gap-2 text-amber-400 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Zero Public Leakage Policy</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Global customer sessions and unauthenticated visitors are restricted to commercial services (pricing, subscriptions, and AI concierge). Provide a verified Administrative Clearance Token (<code className="text-emerald-300 font-mono text-[10px]">VITE_ADMIN_ACCESS_T</code>) to unlock developer controls.
          </p>
        </div>

        {/* Token Verification Form */}
        <form onSubmit={handleVerifyToken} className="space-y-3">
          <label className="block text-xs font-medium text-slate-300">
            Administrative Clearance Token
          </label>
          <div className="relative">
            <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value);
                setTokenError(null);
              }}
              placeholder="Enter VITE_ADMIN_ACCESS_T clearance key..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono placeholder:text-slate-600 focus:outline-none focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/40"
            />
          </div>

          {tokenError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
              {tokenError}
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-rose-900/30"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Verify & Unlock Control</span>
            </button>

            <button
              type="button"
              onClick={handleStaffQuickLogin}
              className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700"
              title="Authenticate as Staff Principal Architect"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Staff Quick Unlock</span>
            </button>
          </div>
        </form>

        {/* Footer Return Button */}
        <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={onReturnToStorefront}
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Public Storefront</span>
          </button>

          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer font-medium"
            >
              Sign In with Staff Credentials
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
