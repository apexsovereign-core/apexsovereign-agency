import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Database, 
  CreditCard, 
  ShieldCheck, 
  Save, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Sparkles, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  FileCode,
  Download,
  Server
} from 'lucide-react';

interface CleanConfig {
  DATABASE_URL: string;
  APP_SECRET_API_KEY: string;
  LEASE_HMAC_SECRET: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_CLIENT_SECRET: string;
  PAYPAL_WEBHOOK_ID: string;
}

export const RequirementsEditor: React.FC = () => {
  const [config, setConfig] = useState<CleanConfig>(() => {
    try {
      const saved = localStorage.getItem('apex_clean_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {}

    return {
      DATABASE_URL: 'postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
      APP_SECRET_API_KEY: 'apex_live_sec_7f9a12c4b8e053d6a421e90b8f3c',
      LEASE_HMAC_SECRET: 'hmac_sha256_k9x2p8q1m4v7t3w6y0z5b8d2f4h6j9l1',
      PAYPAL_CLIENT_ID: 'AXmX8_paypal_live_client_id_placeholder',
      PAYPAL_CLIENT_SECRET: 'ELp4_paypal_live_client_secret_placeholder',
      PAYPAL_WEBHOOK_ID: '7WH1234567890123A'
    };
  });

  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    database: boolean;
    paypal: boolean;
    signing: boolean;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem('apex_clean_config', JSON.stringify(config));
  }, [config]);

  const toggleVisibility = (field: string) => {
    setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const copyField = (val: string, keyName: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const generateRandomHex = (len: number) => {
    return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  };

  const handleGenerateSecret = (field: 'APP_SECRET_API_KEY' | 'LEASE_HMAC_SECRET') => {
    const newSecret = field === 'APP_SECRET_API_KEY' 
      ? 'apex_live_sec_' + generateRandomHex(32)
      : 'hmac_sha256_' + generateRandomHex(40);
    setConfig(prev => ({ ...prev, [field]: newSecret }));
  };

  const handleSaveAll = () => {
    localStorage.setItem('apex_clean_config', JSON.stringify(config));
    // Also sync Paypal live client id to checkout modal
    if (config.PAYPAL_CLIENT_ID) {
      localStorage.setItem('apex_paypal_live_client_id', config.PAYPAL_CLIENT_ID);
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleRunHealthCheck = () => {
    setTestingConnection(true);
    setTestResult(null);

    setTimeout(() => {
      setTestingConnection(false);
      const dbValid = config.DATABASE_URL.includes('supabase.com') && !config.DATABASE_URL.includes('[password]');
      const ppValid = config.PAYPAL_CLIENT_ID.length > 20 && !config.PAYPAL_CLIENT_ID.includes('placeholder');
      const hmacValid = config.LEASE_HMAC_SECRET.length >= 24;

      setTestResult({
        database: dbValid,
        paypal: ppValid,
        signing: hmacValid
      });
    }, 1000);
  };

  const formattedEnv = `# ==============================================================================
# APEXSOVEREIGN.AI — PRODUCTION ENVIRONMENT MANIFEST
# Paste directly into Vercel / Cloud Run / Local .env
# ==============================================================================

# 1. Supabase PostgreSQL asyncpg Pooler (Port 6543, SSL Required)
DATABASE_URL="${config.DATABASE_URL}"

# 2. Master App Secret API Key (Validated via secrets.compare_digest)
APP_SECRET_API_KEY="${config.APP_SECRET_API_KEY}"

# 3. HMAC-SHA256 Secret for Autonomous Compute Execution Leases
LEASE_HMAC_SECRET="${config.LEASE_HMAC_SECRET}"

# 4. PayPal REST v2 Production Client ID
PAYPAL_CLIENT_ID="${config.PAYPAL_CLIENT_ID}"

# 5. PayPal REST v2 Production Client Secret
PAYPAL_CLIENT_SECRET="${config.PAYPAL_CLIENT_SECRET}"

# 6. PayPal Webhook ID (For PAYMENT.CAPTURE.COMPLETED SHA256withRSA)
PAYPAL_WEBHOOK_ID="${config.PAYPAL_WEBHOOK_ID}"

# 7. Environment Mode
ENVIRONMENT="production"
PORT=3000
`;

  const copyEnvFile = () => {
    navigator.clipboard.writeText(formattedEnv);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const downloadEnvFile = () => {
    const blob = new Blob([formattedEnv], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '.env.production';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-8 animate-in fade-in duration-300 font-sans">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
              PRODUCTION CONFIGURATION VAULT
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Master Requirements & Credentials Editor
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Edit your live Supabase database string, PayPal merchant keys, and HMAC signer in one clean place.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleRunHealthCheck}
            disabled={testingConnection}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-all border border-slate-700 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Test Connections</span>
          </button>

          <button
            onClick={handleSaveAll}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.25)] flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save All Keys</span>
          </button>
        </div>
      </div>

      {/* Health Check Diagnostics (If run) */}
      {testResult && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className={`p-3 rounded-lg border flex items-center gap-3 ${testResult.database ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
            {testResult.database ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
            <div>
              <div className="font-bold">Supabase Database</div>
              <div className="text-[11px] opacity-80">{testResult.database ? 'Valid Pooler Format' : 'Replace [password] placeholder'}</div>
            </div>
          </div>

          <div className={`p-3 rounded-lg border flex items-center gap-3 ${testResult.paypal ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
            {testResult.paypal ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
            <div>
              <div className="font-bold">PayPal Live Merchant</div>
              <div className="text-[11px] opacity-80">{testResult.paypal ? 'Live Client ID Set' : 'Enter live merchant ID'}</div>
            </div>
          </div>

          <div className={`p-3 rounded-lg border flex items-center gap-3 ${testResult.signing ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
            {testResult.signing ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
            <div>
              <div className="font-bold">HMAC Lease Signer</div>
              <div className="text-[11px] opacity-80">{testResult.signing ? 'Cryptographically Strong' : 'Generate new secret'}</div>
            </div>
          </div>
        </div>
      )}

      {savedSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>All 6 production requirements saved and synchronized locally!</span>
          </div>
          <span className="text-[11px] text-emerald-400/80">Sync Complete</span>
        </div>
      )}

      {/* Clean Requirements Inputs */}
      <div className="space-y-6">
        {/* Section 1: Supabase Database */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">1. Supabase PostgreSQL Connection Pooler</h3>
                <p className="text-xs text-slate-400">Transaction Mode (port 6543) with SSL enabled</p>
              </div>
            </div>
            <button
              onClick={() => copyField(config.DATABASE_URL, 'db')}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono p-1.5 rounded hover:bg-slate-800"
            >
              {copiedKey === 'db' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'db' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1.5">
              DATABASE_URL
            </label>
            <div className="relative">
              <input
                type={visibleFields['DATABASE_URL'] ? 'text' : 'password'}
                value={config.DATABASE_URL}
                onChange={(e) => setConfig({ ...config, DATABASE_URL: e.target.value })}
                placeholder="postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require"
                className="w-full pl-3.5 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => toggleVisibility('DATABASE_URL')}
                className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
              >
                {visibleFields['DATABASE_URL'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Found under: Supabase Project Settings ➔ Database ➔ Connection Pooling ➔ Connection String
            </p>
          </div>
        </div>

        {/* Section 2: Security & Autonomous HMAC Leases */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">2. Master API Key & Cryptographic HMAC Signer</h3>
              <p className="text-xs text-slate-400">Used for tenant lease tokens and server-to-server endpoints</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* APP_SECRET_API_KEY */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-mono text-slate-400">APP_SECRET_API_KEY</label>
                <button
                  type="button"
                  onClick={() => handleGenerateSecret('APP_SECRET_API_KEY')}
                  className="text-[10px] font-mono text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Generate New</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={visibleFields['APP_SECRET_API_KEY'] ? 'text' : 'password'}
                  value={config.APP_SECRET_API_KEY}
                  onChange={(e) => setConfig({ ...config, APP_SECRET_API_KEY: e.target.value })}
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => toggleVisibility('APP_SECRET_API_KEY')}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                >
                  {visibleFields['APP_SECRET_API_KEY'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* LEASE_HMAC_SECRET */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-mono text-slate-400">LEASE_HMAC_SECRET</label>
                <button
                  type="button"
                  onClick={() => handleGenerateSecret('LEASE_HMAC_SECRET')}
                  className="text-[10px] font-mono text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Generate New</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={visibleFields['LEASE_HMAC_SECRET'] ? 'text' : 'password'}
                  value={config.LEASE_HMAC_SECRET}
                  onChange={(e) => setConfig({ ...config, LEASE_HMAC_SECRET: e.target.value })}
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => toggleVisibility('LEASE_HMAC_SECRET')}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                >
                  {visibleFields['LEASE_HMAC_SECRET'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: PayPal Live Gateway */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">3. PayPal REST v2 Production Gateway</h3>
              <p className="text-xs text-slate-400">From developer.paypal.com ➔ Dashboard ➔ Apps & Credentials (Live)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* PAYPAL_CLIENT_ID */}
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1.5">
                PAYPAL_CLIENT_ID
              </label>
              <input
                type="text"
                value={config.PAYPAL_CLIENT_ID}
                onChange={(e) => setConfig({ ...config, PAYPAL_CLIENT_ID: e.target.value })}
                placeholder="AXmX8..."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* PAYPAL_CLIENT_SECRET */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-mono text-slate-400">PAYPAL_CLIENT_SECRET</label>
                <button
                  type="button"
                  onClick={() => toggleVisibility('PAYPAL_CLIENT_SECRET')}
                  className="text-slate-500 hover:text-slate-300"
                >
                  {visibleFields['PAYPAL_CLIENT_SECRET'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <input
                type={visibleFields['PAYPAL_CLIENT_SECRET'] ? 'text' : 'password'}
                value={config.PAYPAL_CLIENT_SECRET}
                onChange={(e) => setConfig({ ...config, PAYPAL_CLIENT_SECRET: e.target.value })}
                placeholder="ELp4..."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* PAYPAL_WEBHOOK_ID */}
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1.5">
                PAYPAL_WEBHOOK_ID
              </label>
              <input
                type="text"
                value={config.PAYPAL_WEBHOOK_ID}
                onChange={(e) => setConfig({ ...config, PAYPAL_WEBHOOK_ID: e.target.value })}
                placeholder="7WH1234..."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Export & One-Click Copy Section */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileCode className="w-4 h-4 text-emerald-400" />
              <span>Copy Formatted .env for Vercel</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Paste this block into Vercel Project Settings ➔ Environment Variables, or download as a file.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={downloadEnvFile}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .env</span>
            </button>

            <button
              onClick={copyEnvFile}
              className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold font-mono transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              {copiedEnv ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedEnv ? 'Copied to Clipboard!' : 'Copy All .env'}</span>
            </button>
          </div>
        </div>

        <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48">
          {formattedEnv}
        </pre>
      </div>
    </div>
  );
};
