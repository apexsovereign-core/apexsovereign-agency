import React, { useState } from 'react';
import { 
  Check, 
  Copy, 
  CreditCard, 
  Key, 
  Play, 
  Terminal, 
  Zap, 
  Cpu, 
  Sliders, 
  ShieldCheck, 
  ArrowRight, 
  Coins 
} from 'lucide-react';

interface FractionalGpuOption {
  id: string;
  name: string;
  slice: string;
  vramGb: number;
  smQuota: number;
  costPerTokenUsd: number;
  costPerTokenMicro: number;
  description: string;
}

const GPU_SLICES: FractionalGpuOption[] = [
  {
    id: 'l40s_eighth',
    name: 'NVIDIA L40S (1/8th Slice)',
    slice: 'mps.1/8',
    vramGb: 6,
    smQuota: 18,
    costPerTokenUsd: 0.000002,
    costPerTokenMicro: 2,
    description: 'Ideal for 7B-8B parameter models, lightweight embedding workflows, and code completion.'
  },
  {
    id: 'l40s_quarter',
    name: 'NVIDIA L40S (1/4th Slice)',
    slice: 'mps.1/4',
    vramGb: 12,
    smQuota: 36,
    costPerTokenUsd: 0.000004,
    costPerTokenMicro: 4,
    description: 'Sufficient for quantized 14B models and high-concurrency structured extraction.'
  },
  {
    id: 'h100_eighth',
    name: 'NVIDIA H100 (MIG 1g.10gb)',
    slice: '1g.10gb',
    vramGb: 10,
    smQuota: 19,
    costPerTokenUsd: 0.000010,
    costPerTokenMicro: 10,
    description: 'Hardware-isolated MIG partition with full HBM3 memory bandwidth for FP8 inference.'
  },
  {
    id: 'h100_quarter',
    name: 'NVIDIA H100 (MIG 2g.20gb)',
    slice: '2g.20gb',
    vramGb: 20,
    smQuota: 38,
    costPerTokenUsd: 0.000018,
    costPerTokenMicro: 18,
    description: 'High-throughput MIG slice for 32B-70B FP8 reasoning and agent tool use.'
  },
  {
    id: 'h100_full',
    name: 'NVIDIA H100 (Full 7g.80gb)',
    slice: '7g.80gb',
    vramGb: 80,
    smQuota: 132,
    costPerTokenUsd: 0.000032,
    costPerTokenMicro: 32,
    description: 'Unconstrained 80GB HBM3 dedicated instance with zero-preemption protection.'
  }
];

export const DeveloperSandbox: React.FC = () => {
  const [balanceCredits, setBalanceCredits] = useState<number>(2.50); // $2.50 initial test credit
  const [selectedSliceIndex, setSelectedSliceIndex] = useState<number>(0);
  const [apiKey, setApiKey] = useState<string>('sk_retail_9a8f2e71b4c34958');
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [testPrompt, setTestPrompt] = useState<string>(
    'Synthesize a sub-5ms low-latency algorithmic trading order router in Rust using tokio and axum.'
  );
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [streamedOutput, setStreamedOutput] = useState<string>('');
  const [tokensGenerated, setTokensGenerated] = useState<number>(0);
  const [depositAmount, setDepositAmount] = useState<number>(10.00);
  const [notification, setNotification] = useState<string | null>(null);

  const currentSlice = GPU_SLICES[selectedSliceIndex];

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleDeposit = (amount: number, method: string) => {
    setBalanceCredits(prev => +(prev + amount).toFixed(2));
    setNotification(`Successfully added $${amount.toFixed(2)} via ${method}. Wallet updated.`);
    setTimeout(() => setNotification(null), 3500);
  };

  const generateNewKey = () => {
    const randomHex = Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    const newKey = `sk_retail_${randomHex}`;
    setApiKey(newKey);
    setNotification('Generated new cryptographic retail API key.');
    setTimeout(() => setNotification(null), 3000);
  };

  const runSimulation = () => {
    if (balanceCredits <= 0) {
      setNotification('Insufficient balance. Please deposit funds or claim test credits.');
      return;
    }

    setIsExecuting(true);
    setStreamedOutput('');
    setTokensGenerated(0);

    const fullResponse = `// Generated via ApexSovereign ${currentSlice.name} [${currentSlice.slice}]\n` +
      `use axum::{routing::post, Router};\n` +
      `use tokio::net::TcpListener;\n\n` +
      `#[tokio::main]\n` +
      `async fn main() -> Result<(), Box<dyn std::error::Error>> {\n` +
      `    // eBPF kernel bypass ingress listener\n` +
      `    let app = Router::new().route("/order", post(route_order));\n` +
      `    let listener = TcpListener::bind("0.0.0.0:443").await?;\n` +
      `    axum::serve(listener, app).await?;\n` +
      `    Ok(())\n` +
      `}\n\n` +
      `// Microsecond deterministic order dispatcher confirmed.`;

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < fullResponse.length) {
        setStreamedOutput(prev => prev + fullResponse.charAt(currentIndex));
        currentIndex += 3;
        setTokensGenerated(t => t + 1);

        // Deduct micro-credits
        const cost = currentSlice.costPerTokenUsd;
        setBalanceCredits(b => Math.max(0, +(b - cost).toFixed(6)));
      } else {
        clearInterval(interval);
        setIsExecuting(false);
      }
    }, 20);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Alert */}
      {notification && (
        <div className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs px-4 py-3 rounded-lg flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-emerald-500 hover:text-emerald-300 font-bold">
            ×
          </button>
        </div>
      )}

      {/* Main Sandbox Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: API Key Management & Fractional Slice Selector */}
        <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <div className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-semibold mb-1">
              TIER 4 SELF-SERVICE ONBOARDING
            </div>
            <h2 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
              <Key className="w-5 h-5 text-emerald-400" />
              Instant Developer Sandbox
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Zero credit card required for testing. Generate keys instantly with micro-second billing.
            </p>
          </div>

          {/* API Key Box */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">YOUR PRODUCTION API KEY</span>
              <button
                onClick={generateNewKey}
                className="text-cyan-400 hover:text-cyan-300 underline text-[11px]"
              >
                Regenerate Key
              </button>
            </div>
            <div className="flex items-center justify-between bg-slate-900/90 border border-slate-700/60 rounded px-3 py-2.5">
              <code className="text-xs text-emerald-300 font-mono truncate select-all">
                {apiKey}
              </code>
              <button
                onClick={handleCopyKey}
                className="ml-3 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded flex items-center gap-1.5 transition-all"
              >
                {copiedKey ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>COPIED</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>COPY</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Wallet Balance & Instant Topup */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400 font-mono">ACTIVE PRE-PAID WALLET</div>
                <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                  ${balanceCredits.toFixed(4)}
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                {(balanceCredits * 1_000_000).toLocaleString()} MICRO-CREDITS
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => handleDeposit(10.00, 'PayPal / Card')}
                className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-mono font-semibold text-xs rounded flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Deposit $10.00
              </button>
              <button
                onClick={() => handleDeposit(2.50, 'Free Grant')}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono font-semibold text-xs rounded flex items-center justify-center gap-2 border border-slate-700 transition-all"
              >
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                Claim +$2.50 Grant
              </button>
            </div>
          </div>

          {/* Fractional GPU Slicing Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-semibold text-slate-300 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                FRACTIONAL GPU SLICE PARTITION
              </label>
              <span className="text-xs font-mono text-cyan-400 font-bold">
                {currentSlice.slice}
              </span>
            </div>

            <input
              type="range"
              min="0"
              max={GPU_SLICES.length - 1}
              value={selectedSliceIndex}
              onChange={e => setSelectedSliceIndex(Number(e.target.value))}
              className="w-full accent-emerald-500 h-2 bg-slate-950 rounded-lg cursor-pointer"
            />

            {/* Selected Slice Details */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-md p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-100">{currentSlice.name}</span>
                <span className="text-xs font-mono text-emerald-400 font-semibold tabular-nums">
                  ${currentSlice.costPerTokenUsd.toFixed(6)} / tok
                </span>
              </div>
              <p className="text-xs text-slate-400">{currentSlice.description}</p>
              <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] font-mono text-slate-400 border-t border-slate-800/80">
                <div>vRAM CEILING: <strong className="text-slate-200">{currentSlice.vramGb} GB</strong></div>
                <div>SM COMPUTE QUOTA: <strong className="text-slate-200">{currentSlice.smQuota} SMs</strong></div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Live Execution Sandbox */}
        <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl flex flex-col justify-between space-y-6">
          <div>
            <div className="border-b border-slate-800 pb-4 mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-cyan-400 font-mono font-semibold mb-1">
                  INTERACTIVE REPL
                </div>
                <h3 className="text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  Live Token Inference Runner
                </h3>
              </div>
              <button
                onClick={runSimulation}
                disabled={isExecuting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-mono font-bold text-xs rounded transition-all flex items-center gap-2 shadow-md shadow-emerald-600/20"
              >
                <Play className={`w-3.5 h-3.5 fill-current ${isExecuting ? 'animate-pulse' : ''}`} />
                {isExecuting ? 'STREAMING...' : 'RUN INFERENCE'}
              </button>
            </div>

            {/* Prompt Input */}
            <div className="space-y-2 mb-4">
              <label className="text-xs font-mono text-slate-400">INFERENCE PROMPT</label>
              <textarea
                value={testPrompt}
                onChange={e => setTestPrompt(e.target.value)}
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-md p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 transition-all resize-none"
              />
            </div>

            {/* Streaming Output Terminal */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">OUTPUT STREAM</span>
                <span className="text-slate-500 tabular-nums">
                  {tokensGenerated} TOKENS GENERATED
                </span>
              </div>
              <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 font-mono text-xs text-emerald-400/90 h-[220px] overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                {streamedOutput || (
                  <span className="text-slate-600 italic">
                    Click 'RUN INFERENCE' to dispatch a task to the allocated fractional GPU slice...
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Integration Snippet */}
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <div className="text-[11px] font-mono text-slate-400">CURL INTEGRATION QUICKSTART</div>
            <div className="bg-slate-950 rounded p-2.5 text-[11px] font-mono text-slate-300 overflow-x-auto select-all">
              curl -X POST https://api.apexsovereign.ai/v1/compute/dispatch \<br />
              &nbsp;&nbsp;-H "Authorization: Bearer {apiKey}" \<br />
              &nbsp;&nbsp;-d '{`{"slice": "${currentSlice.slice}", "tokens": 128}`}'
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
