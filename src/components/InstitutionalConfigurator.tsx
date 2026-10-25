import React, { useState } from 'react';
import { 
  Building2, 
  Check, 
  Copy, 
  Cpu, 
  Download, 
  FileText, 
  Lock, 
  Network, 
  ShieldAlert, 
  ShieldCheck, 
  Sliders, 
  Zap, 
  HardDrive 
} from 'lucide-react';

interface TopologyNode {
  id: string;
  gpuIndex: number;
  temperatureC: number;
  powerWatts: number;
  nvlinkBandwidthTbS: number;
  status: 'optimal' | 'reserved' | 'standby';
}

export const InstitutionalConfigurator: React.FC = () => {
  const [nodeCount, setNodeCount] = useState<number>(4); // 4 nodes = 32 GPUs = 256 VCUs
  const [enableEbpfFailover, setEnableEbpfFailover] = useState<boolean>(true);
  const [enableEscrowBackstop, setEnableEscrowBackstop] = useState<boolean>(true);
  const [enableMerkleAudit, setEnableMerkleAudit] = useState<boolean>(true);
  const [enableCrossRegionMesh, setEnableCrossRegionMesh] = useState<boolean>(false);
  const [hoveredGpu, setHoveredGpu] = useState<number | null>(null);
  const [contractCopied, setContractCopied] = useState<boolean>(false);

  // Calculations
  const gpusPerNode = 8;
  const totalGpus = nodeCount * gpusPerNode;
  const totalVcus = totalGpus * 8; // 8 VCUs per B200
  const hourlyRatePerGpu = 2.95;
  const baseMonthly = totalGpus * hourlyRatePerGpu * 730;

  // Add SLA multipliers
  const slaMultiplier = 1.0 + 
    (enableEbpfFailover ? 0.05 : 0) + 
    (enableEscrowBackstop ? 0.10 : 0) + 
    (enableMerkleAudit ? 0.03 : 0) + 
    (enableCrossRegionMesh ? 0.07 : 0);

  const totalMonthlyCommitment = Math.round(baseMonthly * slaMultiplier);
  const contractHash = `0x9e7a88b14c3029f6d71b88e1a539b6f1_${totalVcus}VCU_${nodeCount}NODE`;

  // Simulated 16-GPU NVLink Mesh preview
  const topologyNodes: TopologyNode[] = Array.from({ length: 16 }, (_, i) => ({
    id: `GPU-${i.toString().padStart(2, '0')}`,
    gpuIndex: i,
    temperatureC: 44 + (i % 5),
    powerWatts: 420 + (i % 30),
    nvlinkBandwidthTbS: 1.8,
    status: i < (nodeCount * 2) ? 'optimal' : 'standby'
  }));

  const handleCopyContract = () => {
    navigator.clipboard.writeText(contractHash);
    setContractCopied(true);
    setTimeout(() => setContractCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-semibold mb-1">
            TIER 1 & TIER 2 INSTITUTIONAL RESERVATIONS
          </div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-400" />
            Institutional NVLink 5 Topology & SLA Configurator
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Full bare-metal cluster isolation with sub-millisecond eBPF failover and cryptographic SLA guarantees.
          </p>
        </div>

        <div className="text-right font-mono">
          <div className="text-xs text-slate-400">NET-30 MONTHLY COMMITMENT</div>
          <div className="text-2xl font-bold text-emerald-400 tabular-nums">
            ${totalMonthlyCommitment.toLocaleString()} / mo
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive NVLink 5 Topology Mesh */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-cyan-400 font-mono font-semibold mb-1">
                HARDWARE FABRIC
              </div>
              <h3 className="text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <Network className="w-4 h-4 text-cyan-400" />
                16x B200 NVLink 5 Bisection Fabric (1.8 TB/s)
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded">
              NON-BLOCKING ALL-TO-ALL
            </span>
          </div>

          {/* NVLink 16-GPU Visual Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5 bg-slate-950/90 border border-slate-800/85 p-4 rounded-lg">
            {topologyNodes.map(node => {
              const isHovered = hoveredGpu === node.gpuIndex;
              const isActive = node.status === 'optimal';
              return (
                <div
                  key={node.id}
                  onMouseEnter={() => setHoveredGpu(node.gpuIndex)}
                  onMouseLeave={() => setHoveredGpu(null)}
                  className={`p-3 rounded border text-center transition-all cursor-pointer ${
                    isActive
                      ? isHovered
                        ? 'bg-emerald-950 border-emerald-400 ring-2 ring-emerald-400/50 shadow-lg'
                        : 'bg-slate-900 border-emerald-600/60 hover:border-emerald-500'
                      : 'bg-slate-950 border-slate-850 opacity-40 hover:opacity-70'
                  }`}
                >
                  <div className="text-[10px] font-mono text-slate-400">{node.id}</div>
                  <Cpu className={`w-5 h-5 mx-auto my-1.5 ${isActive ? 'text-emerald-400' : 'text-slate-600'}`} />
                  <div className="text-[9px] font-mono text-slate-300 tabular-nums">
                    {node.temperatureC}°C
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hovered GPU Inspection Card */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-md p-4 text-xs font-mono grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-300">
            <div>
              <div className="text-slate-500 text-[10px]">SELECTED DOMAIN</div>
              <div className="font-bold text-slate-100">
                {hoveredGpu !== null ? `B200-GPU-${hoveredGpu.toString().padStart(2, '0')}` : 'DOMAIN-PRIMARY'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px]">BISECTION BANDWIDTH</div>
              <div className="text-cyan-300 font-bold">1.8 TB/s per GPU</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px]">TOTAL HBM3e vRAM</div>
              <div className="text-emerald-300 font-bold">{totalGpus * 192} GB HBM3e</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px]">THERMAL HEALTH</div>
              <div className="text-emerald-400 font-bold">NOMINAL (&lt;48°C)</div>
            </div>
          </div>

          {/* Cluster Sizing Slider */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-semibold text-slate-300 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                ENTERPRISE NODE COMMITMENT ({nodeCount} NODES = {totalGpus} B200 GPUs)
              </label>
              <span className="text-xs font-mono text-emerald-400 font-bold tabular-nums">
                {totalVcus} VCUs
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="16"
              value={nodeCount}
              onChange={e => setNodeCount(Number(e.target.value))}
              className="w-full accent-emerald-500 h-2 bg-slate-950 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Right Column: SLA Toggles & Net-30 Contract Generator */}
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl flex flex-col justify-between space-y-6">
          <div>
            <div className="border-b border-slate-800 pb-4 mb-4">
              <div className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-semibold mb-1">
                SLA ENFORCEMENT
              </div>
              <h3 className="text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Institutional SLA Add-Ons
              </h3>
            </div>

            {/* SLA Toggles */}
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-slate-700 transition-all">
                <input
                  type="checkbox"
                  checked={enableEbpfFailover}
                  onChange={e => setEnableEbpfFailover(e.target.checked)}
                  className="mt-1 accent-emerald-500 h-4 w-4 rounded"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-100">Sub-10ms eBPF Failover & Hot Sockets (+5%)</div>
                  <div className="text-slate-400 mt-0.5">Automated kernel sockmap redirection on node failure.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-slate-700 transition-all">
                <input
                  type="checkbox"
                  checked={enableEscrowBackstop}
                  onChange={e => setEnableEscrowBackstop(e.target.checked)}
                  className="mt-1 accent-emerald-500 h-4 w-4 rounded"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-100">Dedicated Escrow Backstop (+10%)</div>
                  <div className="text-slate-400 mt-0.5">Pre-funded hot standby capacity ensuring 99.999% uptime.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-slate-700 transition-all">
                <input
                  type="checkbox"
                  checked={enableMerkleAudit}
                  onChange={e => setEnableMerkleAudit(e.target.checked)}
                  className="mt-1 accent-emerald-500 h-4 w-4 rounded"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-100">Cryptographic Merkle Audit Receipts (+3%)</div>
                  <div className="text-slate-400 mt-0.5">Hourly SHA-256 state root seals for compliance invariance.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-slate-700 transition-all">
                <input
                  type="checkbox"
                  checked={enableCrossRegionMesh}
                  onChange={e => setEnableCrossRegionMesh(e.target.checked)}
                  className="mt-1 accent-emerald-500 h-4 w-4 rounded"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-100">Cross-Region Low-Latency Mesh (+7%)</div>
                  <div className="text-slate-400 mt-0.5">Synchronized replication between Virginia and Frankfurt.</div>
                </div>
              </label>
            </div>
          </div>

          {/* Contract / Hash Output Box */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">IMMUTABLE CONTRACT SPEC</span>
              <button
                onClick={handleCopyContract}
                className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-[11px]"
              >
                {contractCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {contractCopied ? 'COPIED' : 'COPY HASH'}
              </button>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-800 text-[11px] font-mono text-slate-300 truncate select-all">
              {contractHash}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => alert(`Generated Net-30 enterprise invoice for $${totalMonthlyCommitment.toLocaleString()}`)}
                className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-mono font-bold text-xs rounded flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all"
              >
                <FileText className="w-3.5 h-3.5" />
                Issue Net-30 Invoice
              </button>
              <button
                onClick={() => alert(`Locked escrow reservation hash: ${contractHash}`)}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono font-semibold text-xs rounded flex items-center justify-center gap-1.5 border border-slate-700 transition-all"
              >
                <Lock className="w-3.5 h-3.5 text-cyan-400" />
                Lock Escrow Vault
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
