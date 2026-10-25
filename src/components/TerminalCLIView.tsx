import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Send, Trash2, Copy, Check, Shield, CornerDownLeft, Sparkles, Cpu, Lock } from 'lucide-react';

interface HistoryItem {
  id: string;
  command: string;
  timestamp: string;
  output: string;
  isError?: boolean;
}

const COMMAND_OUTPUTS: Record<string, object> = {
  status: {
    network_tier: "TIER-6_SOVEREIGN_INSTITUTIONAL",
    status: "OPERATIONAL",
    mesh_version: "v3.6.0-sovereign-kernel",
    edge_p99_latency_ms: 10.4,
    sla_target_ms: 18.0,
    mesh_uptime_pct: 99.999,
    active_exaflops: 1.44,
    hardware_security: {
      amd_sev_snp: "ENFORCED_ACTIVE",
      nvidia_cc: "ENABLED_ON_DIE_ROT",
      memory_encryption: "AES-256-XTS",
      attestation_service: "VERIFIED_CRYPTO_BOUND",
    },
    cryptographic_ledger: "VERIFIED_HMAC_SHA256",
    settlement_ratio: "$1.00 USD = 100 CU",
    ebpf_filter_status: "ACTIVE_INSPECTING",
    nodes_online: 14,
    failover_subsystems: "HOT_STANDBY_SUB18MS",
  },
  quote: {
    market: "APEX_SOVEREIGN_SPOT_ARBITRAGE",
    timestamp_utc: new Date().toISOString(),
    gRpc_telemetry_cadence: "1,500ms continuous sweep",
    clearing_currency: "Compute Units (CU) & USD",
    rates: [
      {
        accelerator: "NVIDIA Rubin / HBM4",
        vram: "288GB HBM4",
        interconnect: "3.6 TB/s NVLink 6",
        apex_spot_rate_hr: "$2.40",
        hyperscaler_baseline_hr: "$5.10",
        savings_margin: "52.9%",
        enclave: "AMD SEV-SNP + NVIDIA CC Dual Enclave",
        availability: "IMMEDIATE_DISPATCH",
      },
      {
        accelerator: "NVIDIA B200 NVL72 Rack",
        vram: "192GB HBM3e",
        interconnect: "1.8 TB/s NVLink 5",
        apex_spot_rate_hr: "$2.85",
        hyperscaler_baseline_hr: "$4.60",
        savings_margin: "38.0%",
        enclave: "NVIDIA Confidential Computing RoT",
        availability: "ALLOCATION_READY",
      },
      {
        accelerator: "NVIDIA H100 SXM5 80GB",
        vram: "80GB HBM3",
        interconnect: "900 GB/s NVLink 4",
        apex_spot_rate_hr: "$1.94",
        hyperscaler_baseline_hr: "$3.29",
        savings_margin: "41.0%",
        enclave: "AMD SEV-SNP Attested",
        availability: "HIGH_CAPACITY",
      },
      {
        accelerator: "NVIDIA A100 SXM4 80GB",
        vram: "80GB HBM2e",
        interconnect: "600 GB/s NVLink 3",
        apex_spot_rate_hr: "$1.42",
        hyperscaler_baseline_hr: "$2.20",
        savings_margin: "35.5%",
        enclave: "Hardware MIG Slicing",
        availability: "HIGH_CAPACITY",
      },
    ],
  },
  nodes: {
    topology: "GLOBAL_SOVEREIGN_VECTOR_MESH",
    active_clusters: 3,
    inter_cluster_rtt_ms: 18.2,
    hardware_enclaves_enforced: true,
    clusters: [
      {
        node_id: "us-east-01",
        region: "Virginia, United States",
        jurisdiction: "US-VA",
        datacenter_tier: "Tier 4 Hydro-Cooled",
        latency_p99_ms: 9.8,
        allocated_gpus: 1120,
        available_gpus: 480,
        confidential_computing: "AMD SEV-SNP + NVIDIA CC",
      },
      {
        node_id: "eu-central-02",
        region: "Frankfurt, Germany",
        jurisdiction: "EU-DE (GDPR Sovereign Enclave)",
        datacenter_tier: "Tier 4 Carbon-Neutral",
        latency_p99_ms: 11.2,
        allocated_gpus: 890,
        available_gpus: 310,
        confidential_computing: "AMD SEV-SNP + Hardware Root of Trust",
      },
      {
        node_id: "ap-southeast-01",
        region: "Singapore",
        jurisdiction: "SG-SG (Equinix SG3)",
        datacenter_tier: "Tier 4 Direct Liquid",
        latency_p99_ms: 10.4,
        allocated_gpus: 1440,
        available_gpus: 650,
        confidential_computing: "AMD SEV-SNP + Secure Memory Encryption",
      },
    ],
  },
  orderbook: {
    market: "SPOT_AND_FORWARD_GPU_CLEARING",
    settlement_engine: "ATOMIC_DOUBLE_ENTRY",
    spread_pct: "0.04%",
    bids: [
      { price_usd_hr: 2.38, gpus_demanded: 64, accelerator: "NVIDIA Rubin", duration: "720h" },
      { price_usd_hr: 2.82, gpus_demanded: 128, accelerator: "NVIDIA B200 NVL72", duration: "360h" },
      { price_usd_hr: 1.92, gpus_demanded: 256, accelerator: "NVIDIA H100 SXM5", duration: "168h" },
    ],
    asks: [
      { price_usd_hr: 2.40, gpus_offered: 96, accelerator: "NVIDIA Rubin", location: "us-east-01" },
      { price_usd_hr: 2.85, gpus_offered: 64, accelerator: "NVIDIA B200 NVL72", location: "eu-central-02" },
      { price_usd_hr: 1.94, gpus_offered: 320, accelerator: "NVIDIA H100 SXM5", location: "ap-southeast-01" },
    ],
  },
  provision: {
    action: "ATOMIC_CLUSTER_PROVISION",
    provision_id: "prv_apex_" + Math.random().toString(36).substring(2, 10),
    status: "PROVISIONED_CONFIDENTIAL_ENCLAVE",
    accelerators_allocated: 32,
    model: "NVIDIA Rubin / HBM4",
    cluster_routing_target: "us-east-01 (Ashburn Core)",
    enclave_verification: {
      amd_sev_snp: "ATTESTATION_PASSED",
      nvidia_cc: "ON_DIE_ISOLATION_ACTIVE",
      memory_encryption_key: "0x" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    },
    lease_hmac_sha256: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    hourly_rate_usd: 2.40,
    hourly_rate_cu: 240,
    mesh_ingress_endpoint: "grpc://mesh-ingress.apexsovereign.ai:443",
    timestamp: new Date().toISOString(),
  },
};

export const TerminalCLIView: React.FC = () => {
  const [inputVal, setInputVal] = useState<string>('');
  const [history, setHistory] = useState<HistoryItem[]>([
    {
      id: 'init-1',
      command: 'status',
      timestamp: new Date().toLocaleTimeString(),
      output: JSON.stringify(COMMAND_OUTPUTS.status, null, 2),
    },
  ]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const executeCommand = (cmd: string) => {
    const trimmed = cmd.trim().toLowerCase();
    if (!trimmed) return;

    if (trimmed === 'clear') {
      setHistory([]);
      setInputVal('');
      return;
    }

    let resultOutput = '';
    let isError = false;

    if (trimmed === 'help') {
      resultOutput = JSON.stringify(
        {
          executable_commands: [
            { command: 'status', description: 'Returns real-time mesh operational state and hardware enclave status.' },
            { command: 'quote', description: 'Displays live spot arbitrage rate cards with hyperscaler comparison.' },
            { command: 'nodes', description: 'Lists active sovereign clusters in Virginia, Frankfurt, and Singapore.' },
            { command: 'orderbook', description: 'Outputs live bid/ask order book depth across compute capacity.' },
            { command: 'provision', description: 'Instantly provisions an isolated confidential GPU enclave atomically.' },
            { command: 'clear', description: 'Clears the active terminal output history.' },
          ],
        },
        null,
        2
      );
    } else if (trimmed === 'provision') {
      // Dynamic provision payload
      const dynamicProvision = {
        ...COMMAND_OUTPUTS.provision,
        provision_id: "prv_apex_" + Math.random().toString(36).substring(2, 10),
        timestamp: new Date().toISOString(),
        lease_hmac_sha256: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      };
      resultOutput = JSON.stringify(dynamicProvision, null, 2);
    } else if (COMMAND_OUTPUTS[trimmed]) {
      resultOutput = JSON.stringify(COMMAND_OUTPUTS[trimmed], null, 2);
    } else {
      isError = true;
      resultOutput = JSON.stringify(
        {
          error: "COMMAND_NOT_RECOGNIZED",
          message: `Unknown command: '${trimmed}'. Type 'help' to inspect supported commands.`,
          supported_commands: ['status', 'quote', 'nodes', 'orderbook', 'provision', 'clear', 'help'],
        },
        null,
        2
      );
    }

    setHistory((prev) => [
      ...prev,
      {
        id: `cmd-${Date.now()}`,
        command: trimmed,
        timestamp: new Date().toLocaleTimeString(),
        output: resultOutput,
        isError,
      },
    ]);

    setInputVal('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand(inputVal);
    }
  };

  const copyOutput = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  return (
    <div className="w-full space-y-4">
      {/* Terminal Title & Toolbar */}
      <div className="p-4 rounded-xl bg-[#080D16] border border-[#00F0FF]/30 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
            <Terminal className="w-4 h-4 text-[#00F0FF]" />
            <span className="text-xs font-mono font-bold text-white tracking-wider">
              TIER-6 INSTITUTIONAL CLI EXCHANGE
            </span>
          </div>
        </div>

        {/* Quick Command Suggestion Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {['status', 'quote', 'nodes', 'orderbook', 'provision', 'clear'].map((cmd) => (
            <button
              key={cmd}
              onClick={() => executeCommand(cmd)}
              className="px-2.5 py-1 rounded bg-[#030508] border border-slate-700 hover:border-[#00F0FF] text-[11px] font-mono text-slate-300 hover:text-[#00F0FF] transition active:scale-95"
            >
              ${cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal CLI Window Body */}
      <div className="rounded-2xl bg-[#020305] border border-[#00F0FF]/25 shadow-[0_0_50px_rgba(0,240,255,0.08)] overflow-hidden">
        {/* Terminal Output Area */}
        <div className="p-6 font-mono text-xs space-y-6 max-h-[550px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          <div className="text-slate-500 text-[11px] border-b border-slate-800 pb-3">
            [SYS_INIT] ApexSovereign Tier-6 Institutional CLI connected to cluster: <span className="text-[#00F0FF]">apex-hyper-mesh-global</span>. Authenticated via <span className="text-emerald-400 font-bold">HMAC-SHA256 & AMD SEV-SNP</span>. Type <span className="text-emerald-400 font-bold">help</span> to list commands.
          </div>

          {history.map((item) => (
            <div key={item.id} className="space-y-2">
              {/* Command Prompt Line */}
              <div className="flex items-center justify-between text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="text-[#00F0FF] font-bold">apex@mesh:~$</span>
                  <span className="text-white font-bold">{item.command}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-600">{item.timestamp}</span>
                  <button
                    onClick={() => copyOutput(item.output, item.id)}
                    className="text-slate-500 hover:text-[#00F0FF] transition"
                    title="Copy output JSON"
                  >
                    {copiedId === item.id ? (
                      <Check className="w-3.5 h-3.5 text-[#10B981]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Formatted JSON Output */}
              <pre
                className={`p-4 rounded-xl overflow-x-auto text-[11px] leading-relaxed border ${
                  item.isError
                    ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                    : 'bg-[#050811] border-[#00F0FF]/15 text-[#38BDF8]'
                }`}
              >
                <code>{item.output}</code>
              </pre>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input Interactive Bar */}
        <div className="p-4 border-t border-slate-800/80 bg-[#080D16] flex items-center gap-3">
          <span className="text-[#00F0FF] font-mono font-bold text-sm">apex@mesh:~$</span>
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type 'status', 'quote', 'nodes', 'orderbook', 'provision', or 'help'..."
            className="flex-1 bg-transparent font-mono text-sm text-white placeholder-slate-600 outline-none"
          />
          <button
            onClick={() => executeCommand(inputVal)}
            className="px-4 py-1.5 rounded-lg bg-[#00F0FF] hover:bg-[#38BDF8] text-[#020305] font-mono font-bold text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,240,255,0.4)] transition active:scale-95"
          >
            <span>EXECUTE</span>
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
