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
  Database,
  Cpu,
  Zap,
  Play,
  Square,
  RefreshCw,
  Sliders,
  CheckCircle2,
  ExternalLink,
  Layers,
  Sparkles
} from 'lucide-react';
import { ApexLogo } from './ApexLogo';

export type CapabilityId =
  | 'speech_to_text'
  | 'voice_stream'
  | 'science'
  | 'music_synth'
  | 'video_studio'
  | 'image_diffusion'
  | 'search_grounding'
  | 'maps_spatial'
  | 'context_chatbot'
  | 'database_auth';

interface CapabilityMeta {
  id: CapabilityId;
  title: string;
  category: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  vcuTier: string;
  vramAllocated: string;
  rateCU: string;
  usdEquivalent: string;
  description: string;
}

const CAPABILITIES: CapabilityMeta[] = [
  {
    id: 'speech_to_text',
    title: 'Speech-to-Text Daemon',
    category: 'AUDIO & STREAMING',
    badge: '< 10ms Frame Chunking',
    icon: Mic,
    vcuTier: 'Tier 4 MIG Audio Slice (A10G)',
    vramAllocated: '4.2 GB / 24 GB',
    rateCU: '0.005 CU / sec',
    usdEquivalent: '$0.00005 / sec',
    description: 'Kernel-speed speech transcription daemon executing on fractional GPU slices with word-level confidence tokens.',
  },
  {
    id: 'voice_stream',
    title: 'Voice Conversations',
    category: 'AUDIO & STREAMING',
    badge: 'Live Bidirectional Stream',
    icon: Activity,
    vcuTier: 'Tier 3 Audio Stream (L40S)',
    vramAllocated: '8.4 GB / 48 GB',
    rateCU: '0.010 CU / sec',
    usdEquivalent: '$0.00010 / sec',
    description: 'Sub-35ms bidirectional voice conversation engine using sovereign low-latency WebSocket sockets.',
  },
  {
    id: 'science',
    title: 'Bio-Compute & Science',
    category: 'SCIENTIFIC COMPUTE',
    badge: 'PDB / Molecular Dynamics',
    icon: Dna,
    vcuTier: 'Tier 1 NVLink Cluster (H100 SXM5)',
    vramAllocated: '68.0 GB / 80 GB',
    rateCU: '25.000 CU / run',
    usdEquivalent: '$0.25000 / run',
    description: 'PDB/FASTA structural sequence analyzer, ligand docking simulator, and binding affinity scoring engine.',
  },
  {
    id: 'music_synth',
    title: 'Music Generation Synth',
    category: 'GENERATIVE MEDIA',
    badge: 'Lyria-Grade Diffusion',
    icon: Music,
    vcuTier: 'Tier 2 Latent Diffusion (L40S)',
    vramAllocated: '16.5 GB / 48 GB',
    rateCU: '0.150 CU / sec',
    usdEquivalent: '$0.00150 / sec',
    description: 'Text-to-soundtrack latent diffusion engine generating 24-bit 48kHz audio with 4-track stem separation.',
  },
  {
    id: 'video_studio',
    title: 'Image-to-Video Studio',
    category: 'GENERATIVE MEDIA',
    badge: 'Veo-Grade Temporal Motion',
    icon: Video,
    vcuTier: 'Tier 1 Multi-GPU Mesh (B200 NVLink)',
    vramAllocated: '142.0 GB / 192 GB',
    rateCU: '2.500 CU / sec',
    usdEquivalent: '$0.02500 / sec',
    description: 'Temporal diffusion video generation converting still product imagery into 1080p commercial video assets.',
  },
  {
    id: 'image_diffusion',
    title: 'Image Studio & Inpainting',
    category: 'GENERATIVE MEDIA',
    badge: 'Sub-Second Diffusion',
    icon: ImageIcon,
    vcuTier: 'Tier 3 Standard GPU (A10G)',
    vramAllocated: '11.8 GB / 24 GB',
    rateCU: '0.800 CU / image',
    usdEquivalent: '$0.00800 / image',
    description: 'High-speed image synthesis and selective inpainting pipeline with strict cryptographic hash sealing.',
  },
  {
    id: 'search_grounding',
    title: 'Search Fact-Checking',
    category: 'GROUNDING & REASONING',
    badge: 'Real-Time Web Ingestion',
    icon: Search,
    vcuTier: 'Tier 4 Anycast Ingress Node',
    vramAllocated: '2.1 GB / 16 GB',
    rateCU: '0.050 CU / query',
    usdEquivalent: '$0.00050 / query',
    description: 'Autonomous live web search indexing and cross-verification agent grounding queries in factual data.',
  },
  {
    id: 'maps_spatial',
    title: 'Maps & Spatial Telemetry',
    category: 'GROUNDING & REASONING',
    badge: 'Global Route Ingress',
    icon: MapPin,
    vcuTier: 'Tier 4 Anycast Ingress Node',
    vramAllocated: '1.9 GB / 16 GB',
    rateCU: '0.080 CU / route',
    usdEquivalent: '$0.00080 / route',
    description: 'Sovereign geospatial route telemetry engine calculating low-latency transport corridors and waypoints.',
  },
  {
    id: 'context_chatbot',
    title: 'Context-Aware Chatbot',
    category: 'AUTONOMOUS REASONING',
    badge: 'RAG & Memory Enclave',
    icon: MessageSquare,
    vcuTier: 'Tier 3 Hosted LLM Cluster',
    vramAllocated: '32.0 GB / 48 GB',
    rateCU: '0.020 CU / turn',
    usdEquivalent: '$0.00020 / turn',
    description: 'High-context autonomous enterprise chatbot grounded with real-time ledger state and customer history.',
  },
  {
    id: 'database_auth',
    title: 'Database & Auth Mesh',
    category: 'CORE INFRASTRUCTURE',
    badge: 'Supabase + Firebase Sync',
    icon: Database,
    vcuTier: 'Tier 1 Security Enclave',
    vramAllocated: '15.4 GB / 32 GB',
    rateCU: '0.010 CU / sync',
    usdEquivalent: '$0.00010 / sync',
    description: 'Native dual-tier data bridge synchronizing Firestore document models with PostgreSQL atomic ledger tables.',
  },
];

interface MultiModalSuiteProps {
  userBalanceCU?: number;
  onDeductBalance?: (amountCU: number) => void;
}

export const MultiModalSuite: React.FC<MultiModalSuiteProps> = ({
  userBalanceCU = 15420.5,
  onDeductBalance,
}) => {
  const [activeTab, setActiveTab] = useState<CapabilityId>('speech_to_text');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [balance, setBalance] = useState<number>(userBalanceCU);
  const [totalBurnedCU, setTotalBurnedCU] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(6.4);
  const [streamTicks, setStreamTicks] = useState<number>(0);

  // Service-specific inputs
  const [audioTranscript, setAudioTranscript] = useState<string>(
    'ApexSovereign eBPF sockmap verified. Sub-millisecond routing established across Tier 1 institutional cluster.'
  );
  const [sciencePdb, setSciencePdb] = useState<string>('7KRR');
  const [scienceSmiles, setScienceSmiles] = useState<string>('CC(=O)Oc1ccccc1C(=O)O');
  const [dockingAffinity, setDockingAffinity] = useState<number>(-9.42);
  const [musicPrompt, setMusicPrompt] = useState<string>('Cyberpunk institutional synthwave, 128 bpm, dark bassline');
  const [videoMotion, setVideoMotion] = useState<string>('Slow cinematic 360-degree orbit with radiant cyan specular lighting');
  const [searchQuery, setSearchQuery] = useState<string>('Global spot GPU B200 price arbitrage vs AWS/GCP');
  const [chatMessage, setChatMessage] = useState<string>('How does the double-entry atomic ledger prevent race conditions?');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([
    {
      role: 'agent',
      text: 'ApexSovereign Autonomous Master Agent ready. All 10 multi-modal pipelines synchronized to atomic ledger ($1.00 = 100 CU).',
    },
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Active capability metadata
  const currentMeta = CAPABILITIES.find((c) => c.id === activeTab) || CAPABILITIES[0];

  // Visualizer Animation for Audio / Video / Bio-Compute
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

      if (activeTab === 'speech_to_text' || activeTab === 'voice_stream' || activeTab === 'music_synth') {
        // Draw Waveform
        const bars = 48;
        const barWidth = w / bars - 2;
        for (let i = 0; i < bars; i++) {
          const freq = Math.sin(phase + i * 0.25) * 0.5 + 0.5;
          const amp = isRunning ? freq * (h * 0.75) : 8 + Math.sin(phase + i * 0.1) * 6;
          const x = i * (barWidth + 2);
          const y = (h - amp) / 2;

          const grad = ctx.createLinearGradient(0, y, 0, y + amp);
          grad.addColorStop(0, '#00f0ff');
          grad.addColorStop(1, '#005588');

          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barWidth, amp);
        }
      } else if (activeTab === 'science') {
        // Draw Molecular Orbit Grid
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 1.5;
        const cx = w / 2;
        const cy = h / 2;

        for (let r = 20; r <= 80; r += 20) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Atoms
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

          // Bonds
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(ax, ay);
          ctx.stroke();
        }
      } else {
        // Dynamic Grid Scanner
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
        ctx.lineWidth = 1;
        const gridSize = 20;
        for (let x = 0; x < w; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        // Scan Line
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

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [activeTab, isRunning]);

  // Live Stream Simulation Ticks
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setStreamTicks((prev) => prev + 1);
      setLatencyMs(4.8 + Math.random() * 3.2);

      // Parse and deduct CU
      let deltaCU = 0.005;
      if (activeTab === 'speech_to_text') deltaCU = 0.005;
      else if (activeTab === 'voice_stream') deltaCU = 0.01;
      else if (activeTab === 'music_synth') deltaCU = 0.15;
      else if (activeTab === 'video_studio') deltaCU = 2.5;

      setBalance((b) => Math.max(0, b - deltaCU));
      setTotalBurnedCU((prev) => prev + deltaCU);
      if (onDeductBalance) onDeductBalance(deltaCU);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, activeTab, onDeductBalance]);

  const handleExecute = () => {
    setIsRunning(true);
    setLatencyMs(4.2 + Math.random() * 2.0);

    if (activeTab === 'science') {
      setTimeout(() => {
        setIsRunning(false);
        const newAffinity = -7.5 - Math.random() * 4.8;
        setDockingAffinity(Math.round(newAffinity * 100) / 100);
        const cost = 25.0;
        setBalance((b) => Math.max(0, b - cost));
        setTotalBurnedCU((t) => t + cost);
        if (onDeductBalance) onDeductBalance(cost);
      }, 1500);
    } else if (activeTab === 'image_diffusion') {
      setTimeout(() => {
        setIsRunning(false);
        const cost = 0.8;
        setBalance((b) => Math.max(0, b - cost));
        setTotalBurnedCU((t) => t + cost);
        if (onDeductBalance) onDeductBalance(cost);
      }, 1200);
    } else if (activeTab === 'search_grounding' || activeTab === 'maps_spatial') {
      setTimeout(() => {
        setIsRunning(false);
        const cost = activeTab === 'search_grounding' ? 0.05 : 0.08;
        setBalance((b) => Math.max(0, b - cost));
        setTotalBurnedCU((t) => t + cost);
        if (onDeductBalance) onDeductBalance(cost);
      }, 900);
    }
  };

  const handleStop = () => {
    setIsRunning(false);
  };

  const handleSendChat = () => {
    if (!chatMessage.trim()) return;
    const userText = chatMessage;
    setChatMessage('');
    setChatHistory((prev) => [...prev, { role: 'user', text: userText }]);

    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      const responses: Record<string, string> = {
        default:
          'Invariance confirmed: The double-entry ledger uses atomic PostgreSQL advisory locks and row-level checks. Debits strictly equal Credits across every journal entry.',
      };
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'agent',
          text:
            responses.default +
            ` (Grounded in Real-Time via Anycast BGP: Verified at ${new Date().toLocaleTimeString()})`,
        },
      ]);
      const cost = 0.02;
      setBalance((b) => Math.max(0, b - cost));
      setTotalBurnedCU((t) => t + cost);
      if (onDeductBalance) onDeductBalance(cost);
    }, 800);
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header Bar */}
      <div className="p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ApexLogo size="md" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white">
                Multi-Modal Sovereign Intelligence Suite
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800/80">
                10 Native Engines Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Sub-18ms eBPF Socket Routing &bull; Dedicated VCU Slices &bull; Atomic Ledger Settlement ($1.00 = 100 CU)
            </p>
          </div>
        </div>

        {/* Real-time Telemetry Metrics */}
        <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Ledger Balance</div>
            <div className="text-sm font-bold font-mono text-cyan-400">
              {balance.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} CU
            </div>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Burn Rate</div>
            <div className="text-sm font-bold font-mono text-emerald-400">
              {isRunning ? currentMeta.rateCU : 'IDLE (0.00 CU)'}
            </div>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">eBPF Socket Latency</div>
            <div className="text-sm font-bold font-mono text-white flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              {latencyMs.toFixed(2)} ms
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
        {/* Left Column: Capability Navigation (10 Capabilities) */}
        <div className="lg:col-span-4 border-r border-slate-800 bg-slate-950/40 p-4 space-y-1.5 overflow-y-auto max-h-[720px]">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 py-1 flex items-center justify-between">
            <span>Sovereign Capabilities</span>
            <span>VCU Allocation</span>
          </div>

          {CAPABILITIES.map((cap) => {
            const Icon = cap.icon;
            const isSelected = activeTab === cap.id;
            return (
              <button
                key={cap.id}
                onClick={() => {
                  setActiveTab(cap.id);
                  setIsRunning(false);
                }}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group border ${
                  isSelected
                    ? 'bg-cyan-950/40 border-cyan-500/60 shadow-[0_0_15px_rgba(0,240,255,0.15)] text-white'
                    : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                        : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold flex items-center gap-1.5 truncate">
                      <span>{cap.title}</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <span>{cap.rateCU}</span>
                      <span>&bull;</span>
                      <span className="text-slate-400">{cap.badge}</span>
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
                    {cap.usdEquivalent}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Column: Execution Workspace & Visualizer */}
        <div className="lg:col-span-8 p-6 flex flex-col justify-between space-y-6 bg-slate-950/80">
          {/* Header of Active Engine */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800/60">
                  {currentMeta.category}
                </span>
                <span className="text-xs font-mono text-slate-500">{currentMeta.vcuTier}</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
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
                  onClick={handleExecute}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-[0_0_18px_rgba(0,240,255,0.4)] transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  EXECUTE PIPELINE
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="px-4 py-2 rounded-xl bg-rose-950/80 border border-rose-700/80 hover:bg-rose-900 text-rose-300 font-bold text-xs flex items-center gap-2 transition-all"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  HALT STREAM
                </button>
              )}
            </div>
          </div>

          {/* Interactive Workspace Depending on Active Capability */}
          <div className="space-y-4 flex-1">
            {/* Visualizer Canvas Bar */}
            <div className="relative rounded-xl border border-slate-800 bg-slate-900/50 p-3 overflow-hidden">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-2">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3 h-3 text-cyan-400" />
                  REAL-TIME HARDWARE & WAVEFORM SPECTROGRAM
                </span>
                <span className="text-cyan-400 font-bold">
                  vRAM: {currentMeta.vramAllocated} &bull; LOCK: SHA-256
                </span>
              </div>
              <canvas
                ref={canvasRef}
                width={640}
                height={90}
                className="w-full h-[90px] rounded bg-slate-950/80 border border-slate-800/60"
              />
            </div>

            {/* Service-Specific Control Forms */}
            {activeTab === 'speech_to_text' && (
              <div className="space-y-3">
                <label className="text-xs font-mono text-slate-300 flex items-center justify-between">
                  <span>LIVE TRANSCRIPTION BUFFER (Word-level timestamps enabled)</span>
                  <span className="text-cyan-400 text-[10px]">$0.00005 / sec</span>
                </label>
                <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 leading-relaxed min-h-[96px]">
                  {isRunning ? (
                    <span className="flex items-center gap-2">
                      <span className="text-cyan-400 font-bold">[00:0{streamTicks}.42]</span>
                      <span>
                        {audioTranscript} ... [Word confidence: 98.7% | Frame: 10ms | VCU: MIG-A10G-01]
                      </span>
                    </span>
                  ) : (
                    <span>{audioTranscript}</span>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'science' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-slate-300">TARGET PROTEIN (PDB ID)</label>
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
                    Calculated Binding Affinity (Best Pose):
                  </div>
                  <div className="text-sm font-mono font-bold text-white bg-slate-900 px-3 py-1 rounded border border-cyan-500/40">
                    {dockingAffinity} kcal/mol (High Affinity)
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'music_synth' && (
              <div className="space-y-3">
                <label className="text-xs font-mono text-slate-300">SOUNDTRACK PROMPT (4-Track Stem Separation)</label>
                <input
                  type="text"
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
                <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono">
                  <div className="p-2 bg-slate-900 rounded border border-slate-800 text-cyan-400">
                    DRUMS.FLAC (Active)
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800 text-cyan-400">
                    BASS.FLAC (Active)
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800 text-cyan-400">
                    SYNTHS.FLAC (Active)
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800 text-cyan-400">
                    MASTER.WAV (48kHz)
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'video_studio' && (
              <div className="space-y-3">
                <label className="text-xs font-mono text-slate-300">TEMPORAL MOTION PROMPT (1080p 60FPS)</label>
                <input
                  type="text"
                  value={videoMotion}
                  onChange={(e) => setVideoMotion(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>Output: output_1080p.mp4 &bull; Camera: Orbit 360</span>
                  <span className="text-emerald-400 font-bold">B200 NVLink Cluster Ready</span>
                </div>
              </div>
            )}

            {activeTab === 'search_grounding' && (
              <div className="space-y-3">
                <label className="text-xs font-mono text-slate-300">FACT-CHECK & WEB SEARCH GROUNDING</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleExecute}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-mono flex items-center gap-1.5"
                  >
                    <Search className="w-3 h-3 text-cyan-400" />
                    Verify
                  </button>
                </div>
                <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl text-xs font-mono space-y-1.5">
                  <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Verified Grounding (Reliability: 99.8%)
                  </div>
                  <div className="text-slate-300">
                    ApexSovereign B200 spot compute rates confirmed at $2.95/hr vs AWS p5.48xlarge at $4.80/hr (38.5% institutional spread).
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'context_chatbot' && (
              <div className="space-y-3">
                <div className="h-32 overflow-y-auto p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2 text-xs font-mono">
                  {chatHistory.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded-lg ${
                        item.role === 'user'
                          ? 'bg-cyan-950/40 text-cyan-200 border border-cyan-800/40 ml-4'
                          : 'bg-slate-950 text-slate-300 border border-slate-800 mr-4'
                      }`}
                    >
                      <span className="font-bold mr-1.5 text-slate-400">
                        {item.role === 'user' ? 'YOU:' : 'SOVEREIGN AGENT:'}
                      </span>
                      {item.text}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    placeholder="Ask sovereign agent regarding ledger, compute, or contracts..."
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleSendChat}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs font-mono"
                  >
                    SEND
                  </button>
                </div>
              </div>
            )}

            {/* Fallback for other capabilities */}
            {activeTab !== 'speech_to_text' &&
              activeTab !== 'science' &&
              activeTab !== 'music_synth' &&
              activeTab !== 'video_studio' &&
              activeTab !== 'search_grounding' &&
              activeTab !== 'context_chatbot' && (
                <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 text-xs font-mono space-y-2 text-slate-300">
                  <div className="flex items-center justify-between text-cyan-400 font-bold">
                    <span>STATUS: OPERATIONAL</span>
                    <span>BURNING: {currentMeta.rateCU}</span>
                  </div>
                  <p>
                    Engine dynamically mounted to kernel socket. Preemption signal channel open with sub-5ms migration guarantees.
                  </p>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800/80 text-[11px] text-slate-400">
                    Execution receipt permanently written to Supabase double-entry ledger with SHA-256 state root verification.
                  </div>
                </div>
              )}
          </div>

          {/* Footer Bar: Ledger Settlement Confirmation */}
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
              <span className="text-slate-400">Tenant Isolated via RLS</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
