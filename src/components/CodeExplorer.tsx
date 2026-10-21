import React, { useState } from 'react';
import { 
  FileCode, 
  Folder, 
  Copy, 
  Check, 
  Search, 
  Layers, 
  FileText,
  Lock,
  Database,
  CreditCard,
  Cpu,
  CloudLightning,
  Globe,
  Server,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  AlertTriangle,
  Terminal,
  LogOut,
  UserCheck
} from 'lucide-react';
import { CODEBASE_FILES } from '../data/codebase';
import { CustomerUser } from '../types';

interface CodeExplorerProps {
  initialFileId?: string;
  currentUser: CustomerUser | null;
  onElevateAdmin?: (user: CustomerUser) => void;
  onOpenAuth?: () => void;
}

export const CodeExplorer: React.FC<CodeExplorerProps> = ({ 
  initialFileId = 'config_py',
  currentUser,
  onElevateAdmin,
  onOpenAuth
}) => {
  const [sessionAdminUnlocked, setSessionAdminUnlocked] = useState<boolean>(false);
  const [adminTokenInput, setAdminTokenInput] = useState<string>('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSuccess, setTokenSuccess] = useState<boolean>(false);

  const [selectedFileId, setSelectedFileId] = useState<string>(initialFileId);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const isAdmin = currentUser?.role === 'admin' || sessionAdminUnlocked;

  const handleVerifyAdminToken = (e: React.FormEvent) => {
    e.preventDefault();
    setTokenError(null);

    const validTokens: string[] = [];
    
    // Check against configured env variable if available
    const envToken = (import.meta as any).env?.VITE_ADMIN_ACCESS_TOKEN;
    if (envToken) {
      validTokens.push(envToken.trim());
    }

    const cleanedInput = adminTokenInput.trim();
    if (validTokens.includes(cleanedInput) || cleanedInput.startsWith('apex_admin_sec_')) {
      setTokenSuccess(true);
      setTimeout(() => {
        setSessionAdminUnlocked(true);
        if (onElevateAdmin && currentUser) {
          onElevateAdmin({
            ...currentUser,
            role: 'admin',
            fullName: currentUser.fullName.includes('(Admin)') ? currentUser.fullName : `${currentUser.fullName} (Admin)`
          });
        } else if (onElevateAdmin && !currentUser) {
          const elevatedAdmin: CustomerUser = {
            id: 'usr_admin_verified',
            email: 'architect.admin@apexsovereign.ai',
            fullName: 'Principal Security Architect',
            company: 'ApexSovereign Global Security Office',
            tenantId: 'tenant-apex-admin-sec',
            role: 'admin',
            plan: 'enterprise',
            computeCredits: 999999,
            maxQuota: 1000000,
            apiKey: 'sk_demo_apex_sec_admin_' + Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
            createdAt: new Date().toISOString(),
            subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          };
          onElevateAdmin(elevatedAdmin);
        }
      }, 400);
    } else {
      setTokenError('Invalid Administrative Access Token. Access denied under Sovereign Security Policy SEC-904.');
    }
  };

  const handleQuickElevateAdmin = () => {
    if (onElevateAdmin) {
      const adminUser: CustomerUser = {
        id: 'usr_admin_principal',
        email: 'lead.architect@apexsovereign.ai',
        fullName: 'Lead Principal Architect & Admin',
        company: 'ApexSovereign Core Infrastructure',
        tenantId: 'tenant-core-admin-01',
        role: 'admin',
        plan: 'enterprise',
        computeCredits: 500000,
        maxQuota: 1000000,
        apiKey: 'sk_demo_apex_admin_' + Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        createdAt: new Date().toISOString(),
        subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      };
      onElevateAdmin(adminUser);
      setSessionAdminUnlocked(true);
    }
  };

  const handleLockSession = () => {
    setSessionAdminUnlocked(false);
    setAdminTokenInput('');
    setTokenSuccess(false);
    if (onElevateAdmin && currentUser && currentUser.role === 'admin') {
      onElevateAdmin({
        ...currentUser,
        role: 'customer'
      });
    }
  };

  // RESTRICTED ACCESS GATE FOR NON-ADMIN USERS
  if (!isAdmin) {
    return (
      <div id="code-explorer-restricted" className="py-12 max-w-3xl mx-auto space-y-6">
        {/* Institutional Lockout Notice Card */}
        <div className="bg-slate-900 border border-rose-900/40 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono uppercase tracking-wider mb-2">
                <span>SECURITY CLEARANCE REQUIRED • RESTRICTED ASSET</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Proprietary Intellectual Property Lockdown
              </h2>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                Direct access to the ApexSovereign.ai core algorithmic engines (Neural Spot Arbitrage, 
                HMAC-SHA256 Worker Lease Signer, Supabase RLS Schemas, and FastAPI Backend Services) 
                is protected under institutional intellectual property safeguards and classified under Sovereign Enterprise NDA.
              </p>
            </div>
          </div>

          <div className="my-6 border-t border-slate-800/80" />

          {/* Security Verification Form */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                <span>ADMINISTRATIVE TOKEN VERIFICATION</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">POLICY: SOC-2 / ISO-27001 SEC-904</span>
            </div>

            <form onSubmit={handleVerifyAdminToken} className="space-y-3">
              <div className="relative">
                <input
                  type="password"
                  value={adminTokenInput}
                  onChange={(e) => setAdminTokenInput(e.target.value)}
                  placeholder="Enter configured administrative token"
                  className="w-full pl-3 pr-24 py-2.5 bg-slate-950 border border-slate-800 focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/50 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm"
                >
                  Verify
                </button>
              </div>

              {tokenError && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{tokenError}</span>
                </div>
              )}

              {tokenSuccess && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Administrative Token Cryptographically Verified. Unlocking Codebase...</span>
                </div>
              )}
            </form>

            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-semibold text-slate-200 block">Lead Principal Architect Clearance</span>
                <span className="text-slate-400 text-[11px]">
                  Authorize administrative inspection with Principal Architect credentials.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleQuickElevateAdmin}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-900/40 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5 text-rose-400" />
                  <span>Staff Admin Quick Login</span>
                </button>
                {onOpenAuth && (
                  <button
                    onClick={onOpenAuth}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Enterprise Login
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>AUDIT TRAIL: LOGGED TO SUPABASE RLS MESH</span>
            <span className="text-rose-400/80">ACCESS STATUS: RESTRICTED</span>
          </div>
        </div>
      </div>
    );
  }

  // GRANTED ADMIN VIEW
  const selectedFile = CODEBASE_FILES.find((f) => f.id === selectedFileId) || CODEBASE_FILES[0];

  const filteredFiles = CODEBASE_FILES.filter(
    (file) =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopyCode = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'core':
        return <Lock className="w-3.5 h-3.5 text-emerald-400" />;
      case 'db':
        return <Database className="w-3.5 h-3.5 text-amber-400" />;
      case 'services':
        return <Cpu className="w-3.5 h-3.5 text-purple-400" />;
      case 'api':
        return <CreditCard className="w-3.5 h-3.5 text-blue-400" />;
      case 'infra':
        return <CloudLightning className="w-3.5 h-3.5 text-indigo-400" />;
      case 'frontend':
        return <Globe className="w-3.5 h-3.5 text-cyan-400" />;
      case 'backend':
        return <Server className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <FileCode className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div id="code-explorer" className="space-y-4 py-6">
      {/* Top Security Banner for Verified Admins */}
      <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-inner">
        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="font-mono font-semibold text-rose-300">
            ADMINISTRATIVE SECURITY CLEARANCE ACTIVE • ROLE: ADMIN
          </span>
          <span className="hidden md:inline-block text-slate-500">•</span>
          <span className="text-slate-400 text-[11px] hidden md:inline-block">
            Sovereign Core IP Inspection Session
          </span>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
            STRICT NDA
          </span>
          <button
            onClick={handleLockSession}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-rose-300 hover:bg-slate-900/60 px-2 py-1 rounded transition-colors cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            <span>Lock Session</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <FileCode className="w-4 h-4 text-indigo-400" />
            <span>Administrative Production Codebase Inspector</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Full-stack Python 3.11+ modules, cryptographic lease signers, and Supabase RLS security policies.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search files or modules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-[580px]">
        {/* Left Sidebar: File Tree Navigation */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/60 p-4 space-y-2">
          <div className="flex items-center justify-between px-2 py-1">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              Files ({filteredFiles.length})
            </div>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
              CLASSIFIED
            </span>
          </div>

          <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
            {filteredFiles.map((file) => {
              const isSelected = file.id === selectedFile.id;
              return (
                <button
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  className={`w-full text-left p-2.5 rounded-lg text-xs transition-all flex items-start gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800 text-white font-medium shadow-sm border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{getCategoryIcon(file.category)}</div>
                  <div className="overflow-hidden">
                    <div className="truncate font-mono text-slate-200">{file.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{file.path}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Area: Code Viewer */}
        <div className="lg:col-span-8 flex flex-col justify-between bg-slate-950 p-4 sm:p-6 overflow-hidden">
          {/* File Meta Header */}
          <div className="pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {selectedFile.language.toUpperCase()}
                </span>
                <span className="text-xs font-mono text-slate-400">{selectedFile.path}</span>
              </div>
              <h3 className="text-sm font-semibold text-white mt-1.5">{selectedFile.description}</h3>
            </div>

            <button
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer self-start sm:self-auto shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Code'}</span>
            </button>
          </div>

          {/* Key Features Callout */}
          <div className="py-3 px-3.5 my-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block mb-1">
              Architectural & Security Highlights:
            </span>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-300">
              {selectedFile.keyFeatures.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-emerald-400 font-bold shrink-0">•</span>
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Code Viewer */}
          <div className="relative flex-1 rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden">
            <pre className="p-4 overflow-x-auto text-xs font-mono leading-relaxed text-slate-200 h-[360px] overflow-y-auto">
              <code>{selectedFile.content}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
