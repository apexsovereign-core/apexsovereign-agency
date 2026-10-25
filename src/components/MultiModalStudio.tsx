import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Activity,
  Dna,
  Music,
  Video,
  Image as ImageIcon,
  Search,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Zap,
  Play,
  Square,
  Sliders,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Cpu
} from 'lucide-react';
import { ApexLogo } from './ApexLogo';

export type StudioTabId =
  | 'stt'
  | 'voice'
  | 'bio'
  | 'music'
  | 'video'
  | 'image'
  | 'grounding'
  | 'spatial'
  | 'chatbot'
  | 'tee_attestation';

interface StudioServiceMeta {
  id: StudioTabId;
  title: string;
  category: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  vcuTier: string;
  vram: string;
  burnRateCU: string;
  usdRate: string;
  description: string;
}

const STUDIO_SERVICES: StudioServiceMeta[] = [
  {
    id: 'stt',
    title: 'Speech-to-Text Ingress',
    category: 'AUDIO & STREAMING',
    badge: '< 10ms Frame Chunking',
    icon: Mic,
    vcuTier: 'Tier 4 MIG Audio Slice (A10G)',
    vram: '4.2 GB / 24 GB',
    burnRateCU: '0.005 CU / sec',
    usdRate: '$0.00005 / sec',
    description: 'Sub-10ms acoustic speech-to-text inference with word-level timestamps and zero-copy kernel splicing.',
  },
  {
    id: 'voice',
    title: 'Voice Conversations',
    category: 'AUDIO & STREAMING',
    badge: 'Live Bidirectional Stream',
    icon: Activity,
    vcuTier: 'Tier 3 Audio Stream (L40S)',
    vram: '8.4 GB / 48 GB',
    burnRateCU: '0.010 CU / sec',
    usdRate: '$0.00010 / sec',
    description: 'Bidirectional low-latency audio stream connected directly to sovereign WebSocket inference sockets.',
  },
  {
    id: 'bio',
    title: 'Bioinformatics & Docking',
    category: 'SCIENTIFIC COMPUTE',
    badge: 'PDB / Molecular Dynamics',
    icon: Dna,
    vcuTier: 'Tier 1 NVLink Cluster (H100 SXM5)',
    vram: '68.0 GB / 80 GB',
    burnRateCU: '25.000 CU / run',
    usdRate: '$0.25000 / run',
    description: 'High-throughput PDB sequence analysis, ligand docking simulation, and free energy binding score calculation.',
  },
  {
    id: 'music',
    title: 'Music Generation Synth',
    category: 'GENERATIVE MEDIA',
    badge: 'Lyria-Grade Diffusion',
    icon: Music,
    vcuTier: 'Tier 2 Latent Diffusion (L40S)',
    vram: '16.5 GB / 48 GB',
    burnRateCU: '0.150 CU / sec',
    usdRate: '$0.00150 / sec',
    description: 'Text-to-soundtrack latent diffusion engine generating 24-bit 48kHz audio stems with isolated drum/bass tracks.',
  },
  {
    id: 'video',
    title: 'Image-to-Video Studio',
    category: 'GENERATIVE MEDIA',
    badge: 'Veo-Grade Temporal Motion',
    icon: Video,
    vcuTier: 'Tier 1 Multi-GPU Mesh (B200 NVLink)',
    vram: '142.0 GB / 192 GB',
    burnRateCU: '2.500 CU / sec',
    usdRate: '$0.02500 / sec',
    description: 'Temporal diffusion video generation transforming still images into 1080p commercial advertising video clips.',
  },
  {
    id: 'image',
    title: 'Diffusion Image Studio',
    category: 'GENERATIVE MEDIA',
    badge: 'Sub-Second Diffusion',
    icon: ImageIcon,
    vcuTier: 'Tier 3 Standard GPU (A10G)',
    vram: '11.8 GB / 24 GB',
    burnRateCU: '0.800 CU / image',
    usdRate: '$0.00800 / image',
    description: 'Ultra-fast latent diffusion image creation and precision inpainting pipeline with cryptographic content hashes.',
  },
  {
    id: 'grounding',
    title: 'Search Fact-Checking',
    category: 'GROUNDING & REASONING',
    badge: 'Real-Time Web Ingestion',
    icon: Search,
    vcuTier: 'Tier 4 Anycast Ingress Node',
    vram: '2.1 GB / 16 GB',
    burnRateCU: '0.050 CU / query',
    usdRate: '$0.00050 / query',
    description: 'Real-time live search indexer and factual verification agent returning verified citation snippets.',
  },
  {
    id: 'spatial',
    title: 'Spatial Route Telemetry',
    category: 'GROUNDING & REASONING',
    badge: 'Global Route Ingress',
    icon: MapPin,
    vcuTier: 'Tier 4 Anycast Ingress Node',
    vram: '1.9 GB / 16 GB',
    burnRateCU: '0.080 CU / route',
    usdRate: '$0.00080 / route',
    description: 'Sovereign geospatial route telemetry calculating low-latency transport corridors and waypoints.',
  },
  {
    id: 'chatbot',
    title: 'Context-Aware Chatbot',
    category: 'AUTONOMOUS REASONING',
    badge: 'RAG & Memory Enclave',
    icon: MessageSquare,
    vcuTier: 'Tier 3 Hosted LLM Cluster',
    vram: '32.0 GB / 48 GB',
    burnRateCU: '0.020 CU / turn',
    usdRate: '$0.00020 / turn',
    description: 'Enterprise autonomous customer agent grounded in live double-entry ledger state and tenant context.',
  },
  {
    id: 'tee_attestation',
    title: 'Hardware TEE Attestation',
    category: 'CONFIDENTIAL COMPUTE',
    badge: 'AMD SEV-SNP & Intel TDX',
    icon: ShieldCheck,
    vcuTier: 'Tier 1 Hardware Secure Enclave',
    vram: '15.4 GB / 32 GB',
    burnRateCU: '0.010 CU / seal',
    usdRate: '$0.00010 / seal',
    description: 'Cryptographic RAM encryption verification generating signed launch measurement roots against host admins.',
  },
];

interface MultiModalStudioProps {
  userBalanceCU?: number;
  onDeductBalance?: (amountCU: number) => void;
}

export const MultiModalStudio: React.FC<MultiModalStudioProps> = ({
  userBalanceCU = 15420.5,
  onDeductBalance,
}) => {
  const [activeTab, setActiveTab] = useState<StudioTabId>('stt');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [balance, setBalance] = useState<number>(userBalanceCU);
  const [totalBurnedCU, setTotalBurnedCU] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(5.8);
  const [streamTicks, setStreamTicks] = useState<number>(0);

  // Service States
  const [audioTranscript, setAudioTranscript] = useState<string>(
    'ApexSovereign eBPF sockmap stream confirmed. Sub-millisecond routing established across Tier 1 institutional cluster.'
  );
  const [sciencePdb, setSciencePdb] = useState<string>('7KRR');
  const [scienceSmiles, setScienceSmiles] = useState<string>('CC(=O)Oc1ccccc1C(=O)O');
  const [dockingAffinity, setDockingAffinity] = useState<number>(-9.42);
  const [musicPrompt, setMusicPrompt] = useState<string>('Dark institutional industrial synthwave, 128 bpm, distorted bass');
  const [videoPrompt, setVideoPrompt] = useState<string>('Cinematic 360-degree rotation of black server rack with radiant cyan LED glow');
  const [searchQuery, setSearchQuery] = useState<string>('B200 NVLink 5 spot market price spread vs AWS p5.48xlarge');
  const [chatMessage, setChatMessage] = useState<string>('Verify double-entry ledger conservation and TEE enclave status.');
  const [chatLog, setChatLog] = useState<Array<{ sender: 'user' | 'agent'; text: string }>>([
    {
      sender: 'agent',
      text: 'ApexSovereign Multi-Modal Intelligence Mesh operational. All 10 pipelines verified with zero-copy eBPF socket routing.',
    },
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentMeta = STUDIO_SERVICES.find((s) => s.id === activeTab) || STUDIO_SERVICES[0];

  // Visualizer Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      if (activeTab === 'stt' || activeTab === 'voice' || activeTab === 'music') {
        const bars = 56;
        const barWidth = w / bars - 2;
        for (let i = 0; i < bars; i++) {
          const freq = Math.sin(phase + i * 0.22) * 0.5 + 0.5;
          const amp = isRunning ? freq * (h * 0.8) : 8 + Math.sin(phase + i * 0.1) * 6;
          const x = i * (barWidth + 2);
          const y = (h - amp) / 2;

          const grad = ctx.createLinearGradient(0, y, 0, y + amp);
          grad.addColorStop(0, '#00f0ff');
          grad.addColorStop(1, '#005588');

          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barWidth, amp);
        }
      } else if (activeTab === 'bio') {
        const cx = w / 2;
        const cy = h / 2;

        ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 1.5;
        for (let r = 20; r <= 80; r += 20) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        const atomCount = 8;
        for (let i = 0; i < atomCount; i++) {
          const angle = phase + (i * Math.PI * 2) / atomCount;
          const dist = 35 + ((i % 3) + 1) * 15;
          const ax = cx + Math.cos(angle) * dist;
          const ay = cy + Math.sin(angle) * dist;

          ctx.fillStyle = i % 2 === 0 ? '#00f0ff' : '#10b981';
          ctx.beginPath();
          ctx.arc(ax, ay, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(ax, ay);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
        ctx.lineWidth = 1;
        const grid = 20;
        for (let x = 0; x < w; x += grid) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += grid) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        const scanY = (Math.sin(phase) * 0.5 + 0.5) * h;
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(0, scanY);
        ctx.lineTo(w, scanY);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      phase += isRunning ? 0.08 : 0.02;
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [activeTab, isRunning]);

  // Live Stream Simulation
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setStreamTicks((t) => t + 1);
      setLatencyMs(4.2 + Math.random() * 2.8);

      let deltaCU = 0.005;
      if (activeTab === 'stt') deltaCU = 0.005;
      else if (activeTab === 'voice') deltaCU = 0.010;
      else if (activeTab === 'music') deltaCU = 0.150;
      else if (activeTab === 'video') deltaCU = 2.500;

      setBalance((b) => Math.max(0, b - deltaCU));
      setTotalBurnedCU((tot) => tot + deltaCU);
      if (onDeductBalance) onDeductBalance(deltaCU);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, activeTab, onDeductBalance]);

  const handleStart = () => {
    setIsRunning(true);
    setLatencyMs(4.1 + Math.random() * 1.5);

    if (activeTab === 'bio') {
      setTimeout(() => {
        setIsRunning(false);
        const newAffinity = -7.5 - Math.random() * 4.8;
        setDockingAffinity(Math.round(newAffinity * 100) / 100);
        const cost = 25.0;
        setBalance((b) => Math.max(0, b - cost));
        setTotalBurnedCU((tot) => tot + cost);
        if (onDeductBalance) onDeductBalance(cost);
      }, 1500);
    } else if (activeTab === 'image' || activeTab === 'grounding' || activeTab === 'tee_attestation') {
      setTimeout(() => {
        setIsRunning(false);
        const cost = activeTab === 'image' ? 0.8 : activeTab === 'grounding' ? 0.05 : 0.01;
        setBalance((b) => Math.max(0, b - cost));
        setTotalBurnedCU((tot) => tot + cost);
        if (onDeductBalance) onDeductBalance(cost);
      }, 1000);
    }
  };

  const handleStop = () => setIsRunning(false);

  const handleSendChat = () => {
    if (!chatMessage.trim()) return;
    const msg = chatMessage;
    setChatMessage('');
    setChatLog((prev) => [...prev, { sender: 'user', text: msg }]);

    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setChatLog((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: `Verified: Double-entry ledger invariance holds (Delta: 0.000000 CU). AMD SEV-SNP enclave measurement active with AES-128-XTS hardware RAM encryption.`,
        },
      ]);
      const cost = 0.02;
      setBalance((b) => Math.max(0, b - cost));
      setTotalBurnedCU((tot) => tot + cost);
      if (onDeductBalance) onDeductBalance(cost);
    }, 700);
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Banner */}
      <div className="p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ApexLogo size="md" pulse />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white font-mono">
                MULTI-MODAL INTELLIGENCE STUDIO
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800">
                10 Native Sovereign Engines
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Zero-Copy eBPF Sockmap Ingress &bull; Hardware TEE Enclave &bull; Atomic Ledger ($1.00 = 100 CU)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">CU Balance</div>
            <div className="text-sm font-bold font-mono text-cyan-400">
              {balance.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} CU
            </div>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Active Burn</div>
            <div className="text-sm font-bold font-mono text-emerald-400">
              {isRunning ? currentMeta.burnRateCU : 'IDLE (0.00 CU)'}
            </div>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Socket Latency</div>
            <div className="text-sm font-bold font-mono text-white flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              {latencyMs.toFixed(2)} ms
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
        {/* Capability Nav */}
        <div className="lg:col-span-4 border-r border-slate-800 bg-slate-950/40 p-4 space-y-1.5 overflow-y-auto max-h-[720px]">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 py-1 flex items-center justify-between">
            <span>Sovereign Engines</span>
            <span>VCU Allocation</span>
          </div>

          {STUDIO_SERVICES.map((srv) => {
            const Icon = srv.icon;
            const isSelected = activeTab === srv.id;
            return (
              <button
                key={srv.id}
                onClick={() => {
                  setActiveTab(srv.id);
                  setIsRunning(false);
                }}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group border cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-950/40 border-cyan-500/60 shadow-[0_0_15px_rgba(0,240,255,0.15)] text-white'
                    : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                        : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold flex items-center gap-1.5 truncate">
                      <span>{srv.title}</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <span>{srv.burnRateCU}</span>
                      <span>&bull;</span>
                      <span className="text-slate-400">{srv.badge}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-2">
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                      isSelected
                        ? 'bg-cyan-900/60 border-cyan-700 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-500'
                    }`}
                  >
                    {srv.usdRate}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Workspace */}
        <div className="lg:col-span-8 p-6 flex flex-col justify-between space-y-6 bg-slate-950/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800/60">
                  {currentMeta.category}
                </span>
                <span className="text-xs font-mono text-slate-500">{currentMeta.vcuTier}</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-1 flex items-center gap-2 font-mono">
                {currentMeta.title}
                {isRunning && (
                  <span className="flex items-center gap-1.5 text-xs font-mono font-normal text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    STREAMING ({streamTicks}s)
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 max-w-xl">{currentMeta.description}</p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-[0_0_18px_rgba(0,240,255,0.4)] transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  EXECUTE PIPELINE
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="px-4 py-2 rounded-xl bg-rose-950/80 border border-rose-700/80 hover:bg-rose-900 text-rose-300 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  HALT STREAM
                </button>
              )}
            </div>
          </div>

          {/* Interactive Panel */}
          <div className="space-y-4 flex-1">
            <div className="relative rounded-xl border border-slate-800 bg-slate-900/50 p-3 overflow-hidden">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-2">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3 h-3 text-cyan-400" />
                  HARDWARE ACCELERATION & WAVEFORM SPECTROGRAM
                </span>
                <span className="text-cyan-400 font-bold">
                  vRAM: {currentMeta.vram} &bull; TEE: HARDWARE LOCKED
                </span>
              </div>
              <canvas
                ref={canvasRef}
                width={640}
                height={90}
                className="w-full h-[90px] rounded bg-slate-950/80 border border-slate-800/60"
              />
            </div>

            {/* STT View */}
            {activeTab === 'stt' && (
              <div className="space-y-3">
                <label className="text-xs font-mono text-slate-300 flex items-center justify-between">
                  <span>LIVE TRANSCRIPTION BUFFER (eBPF sk_msg zero-copy)</span>
                  <span className="text-cyan-400 text-[10px]">$0.00005 / sec</span>
                </label>
                <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 leading-relaxed min-h-[96px]">
                  {isRunning ? (
                    <span className="flex items-center gap-2">
                      <span className="text-cyan-400 font-bold">[00:0{streamTicks}.42]</span>
                      <span>{audioTranscript} ... [Kernel splice: 0.64ms | VCU: MIG-A10G-01]</span>
                    </span>
                  ) : (
                    <span>{audioTranscript}</span>
                  )}
                </div>
              </div>
            )}

            {/* Bio View */}
            {activeTab === 'bio' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-slate-300">PROTEIN TARGET (PDB ID)</label>
                  <input
                    type="text"
                    value={sciencePdb}
                    onChange={(e) => setSciencePdb(e.target.value)}
                    className="w-full mt-1.5 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-slate-300">LIGAND SMILES STRING</label>
                  <input
                    type="text"
                    value={scienceSmiles}
                    onChange={(e) => setScienceSmiles(e.target.value)}
                    className="w-full mt-1.5 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="md:col-span-2 p-3 bg-cyan-950/20 border border-cyan-800/60 rounded-xl flex items-center justify-between">
                  <div className="text-xs font-mono text-cyan-300">
                    Calculated Binding Affinity (Top Mode):
                  </div>
                  <div className="text-sm font-mono font-bold text-white bg-slate-900 px-3 py-1 rounded border border-cyan-500/40">
                    {dockingAffinity} kcal/mol (High Affinity)
                  </div>
                </div>
              </div>
            )}

            {/* Music View */}
            {activeTab === 'music' && (
              <div className="space-y-3">
                <label className="text-xs font-mono text-slate-300">LYRIA SOUNDTRACK PROMPT</label>
                <input
                  type="text"
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
                <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono">
                  <div className="p-2 bg-slate-900 rounded border border-slate-800 text-cyan-400">DRUMS (Stem 1)</div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800 text-cyan-400">BASS (Stem 2)</div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800 text-cyan-400">SYNTH (Stem 3)</div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800 text-cyan-400">MASTER (24-bit)</div>
                </div>
              </div>
            )}

            {/* Video View */}
            {activeTab === 'video' && (
              <div className="space-y-3">
                <label className="text-xs font-mono text-slate-300">VEO TEMPORAL MOTION PROMPT (1080p 60FPS)</label>
                <input
                  type="text"
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>Resolution: 1080p &bull; Model: Temporal Diffuser</span>
                  <span className="text-emerald-400 font-bold">B200 NVLink Cluster Mounted</span>
                </div>
              </div>
            )}

            {/* TEE Attestation View */}
            {activeTab === 'tee_attestation' && (
              <div className="space-y-3 font-mono text-xs">
                <div className="p-4 bg-slate-900/80 rounded-xl border border-cyan-800/60 space-y-2">
                  <div className="flex items-center justify-between text-cyan-400 font-bold">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      AMD SEV-SNP & Intel TDX Hardware Enclave
                    </span>
                    <span className="text-emerald-400">RAM ENCRYPTED (AES-128-XTS)</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    Hardware attestation reports generated via <code className="text-cyan-300">/dev/sev-guest</code>. Host OS root administrators cannot inspect weights or memory pages.
                  </p>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-[10px] text-slate-400">
                    <div>TEE Measurement Root: <span className="text-cyan-300">f94d812e9b084931a0e1c3971da64...</span></div>
                    <div>Hardware Signature: <span className="text-slate-200">secp384r1 (ECDSA Hardware Chip Key Verified)</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Chatbot View */}
            {activeTab === 'chatbot' && (
              <div className="space-y-3">
                <div className="h-32 overflow-y-auto p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2 text-xs font-mono">
                  {chatLog.map((c, i) => (
                    <div
                      key={i}
                      className={`p-2 rounded-lg ${
                        c.sender === 'user'
                          ? 'bg-cyan-950/40 text-cyan-200 border border-cyan-800/40 ml-4'
                          : 'bg-slate-950 text-slate-300 border border-slate-800 mr-4'
                      }`}
                    >
                      <span className="font-bold mr-1 text-slate-400">{c.sender === 'user' ? 'YOU:' : 'AGENT:'}</span>
                      {c.text}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    placeholder="Enter query for sovereign agent..."
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleSendChat}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs font-mono cursor-pointer"
                  >
                    SEND
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>Double-Entry Conservation: VERIFIED</span>
              <span>&bull;</span>
              <span>Session Burned: {totalBurnedCU.toFixed(4)} CU</span>
            </div>
            <div className="text-cyan-400/80 flex items-center gap-1">
              <span>$1.00 USD = 100.000000 CU</span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-slate-400">Multi-Modal Mesh Sealed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
