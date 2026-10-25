import React, { useEffect, useRef, useState } from 'react';
import { Network, Activity, Globe, Zap, Shield, CheckCircle2, Lock } from 'lucide-react';

interface MeshNode {
  id: string;
  name: string;
  region: string;
  xPct: number;
  yPct: number;
  latencyMs: number;
  activeGpus: number;
  status: 'OPTIMAL' | 'ACTIVE';
  tier: string;
  hardwareEnclave: string;
}

const NODES: MeshNode[] = [
  {
    id: 'us-east-01',
    name: 'Virginia Node',
    region: 'us-east-01 (Ashburn)',
    xPct: 0.28,
    yPct: 0.38,
    latencyMs: 9.8,
    activeGpus: 1120,
    status: 'OPTIMAL',
    tier: 'Tier 4 Liquid',
    hardwareEnclave: 'AMD SEV-SNP + NVIDIA CC Dual Enclave',
  },
  {
    id: 'eu-central-02',
    name: 'Frankfurt Hub',
    region: 'eu-central-02 (Equinix FR5)',
    xPct: 0.52,
    yPct: 0.32,
    latencyMs: 11.2,
    activeGpus: 890,
    status: 'OPTIMAL',
    tier: 'GDPR Sovereign',
    hardwareEnclave: 'AMD SEV-SNP On-Die Attestation',
  },
  {
    id: 'ap-southeast-01',
    name: 'Singapore Cluster',
    region: 'ap-southeast-01 (SG3)',
    xPct: 0.78,
    yPct: 0.58,
    latencyMs: 10.4,
    activeGpus: 1440,
    status: 'OPTIMAL',
    tier: 'Subsea Interconnect',
    hardwareEnclave: 'NVIDIA Confidential Computing Root-of-Trust',
  },
];

export const GlobalMeshCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedNode, setSelectedNode] = useState<MeshNode>(NODES[0]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let t = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * (window.devicePixelRatio || 1);
      canvas.height = rect.height * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    };

    resize();
    window.addEventListener('resize', resize);

    const routes = [
      { from: NODES[0], to: NODES[1] },
      { from: NODES[1], to: NODES[2] },
      { from: NODES[2], to: NODES[0] },
    ];

    const render = () => {
      t += 0.015;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // Background grid points
      ctx.fillStyle = 'rgba(0, 240, 255, 0.04)';
      for (let x = 20; x < w; x += 30) {
        for (let y = 20; y < h; y += 30) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Bezier Curves between nodes
      routes.forEach((route, rIdx) => {
        const x1 = route.from.xPct * w;
        const y1 = route.from.yPct * h;
        const x2 = route.to.xPct * w;
        const y2 = route.to.yPct * h;

        const midX = (x1 + x2) / 2;
        const midY = Math.min(y1, y2) - 45;

        // Route line
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(midX, midY, x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Animated pulse packet (#00F0FF)
        for (let p = 0; p < 2; p++) {
          const progress = (t * 0.4 + rIdx * 0.33 + p * 0.5) % 1;
          const currX = (1 - progress) * (1 - progress) * x1 + 2 * (1 - progress) * progress * midX + progress * progress * x2;
          const currY = (1 - progress) * (1 - progress) * y1 + 2 * (1 - progress) * progress * midY + progress * progress * y2;

          const glow = ctx.createRadialGradient(currX, currY, 1, currX, currY, 8);
          glow.addColorStop(0, 'rgba(0, 240, 255, 1)');
          glow.addColorStop(0.5, 'rgba(0, 240, 255, 0.4)');
          glow.addColorStop(1, 'transparent');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(currX, currY, 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#00F0FF';
          ctx.beginPath();
          ctx.arc(currX, currY, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Draw Nodes
      NODES.forEach((node) => {
        const nx = node.xPct * w;
        const ny = node.yPct * h;
        const isSelected = selectedNode.id === node.id;

        const ringRadius = 12 + Math.sin(t * 3 + node.latencyMs) * 3;
        ctx.strokeStyle = isSelected ? '#00F0FF' : 'rgba(0, 240, 255, 0.4)';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.beginPath();
        ctx.arc(nx, ny, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#00F0FF' : '#0A1526';
        ctx.beginPath();
        ctx.arc(nx, ny, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = isSelected ? '#00F0FF' : '#94A3B8';
        ctx.fillText(node.name, nx - 24, ny + 22);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    const handleCanvasClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;

      NODES.forEach((node) => {
        const nx = node.xPct * w;
        const ny = node.yPct * h;
        const dist = Math.hypot(clickX - nx, clickY - ny);
        if (dist < 30) {
          setSelectedNode(node);
        }
      });
    };

    canvas.addEventListener('click', handleCanvasClick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [selectedNode]);

  return (
    <div className="w-full rounded-2xl bg-[#030508] border border-[#00F0FF]/25 shadow-[0_0_50px_rgba(0,240,255,0.06)] overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-[#00F0FF]/15 bg-[#080D16]/85 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00F0FF] animate-ping" />
          <span className="text-xs font-mono font-bold text-white tracking-wider uppercase">
            TIER-6 VECTOR MESH TOPOLOGY & CONFIDENTIAL ENCLAVES
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-slate-400">P99 SLA LATENCY: <strong className="text-[#00F0FF]">10.4ms</strong></span>
          <span className="text-slate-400">HARDWARE ENCLAVES: <strong className="text-emerald-400">AMD SEV-SNP & CC</strong></span>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="relative min-h-[360px] sm:min-h-[420px] bg-gradient-to-b from-[#020305] via-[#040813] to-[#020305]">
        <canvas ref={canvasRef} className="w-full h-[400px] cursor-pointer" />

        {/* Floating Active Cluster HUD Info with Hardware Security */}
        <div className="absolute top-4 left-4 p-4 rounded-xl bg-[#080D16]/90 border border-[#00F0FF]/30 backdrop-blur-xl max-w-sm shadow-xl space-y-2 pointer-events-none">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-[#00F0FF] uppercase">
              SELECTED VECTOR ROUTE
            </span>
            <span className="text-[10px] font-mono text-[#10B981] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {selectedNode.status}
            </span>
          </div>

          <h4 className="text-sm font-bold text-white font-sans">{selectedNode.name}</h4>
          <div className="text-[11px] font-mono text-slate-300">{selectedNode.region}</div>

          <div className="p-2 rounded bg-[#030508] border border-slate-800 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-[#10B981] shrink-0" />
            <span className="truncate">{selectedNode.hardwareEnclave}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-500 block">MEASURED RTT</span>
              <span className="text-[#00F0FF] font-bold">{selectedNode.latencyMs}ms</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">ACTIVE CAPACITY</span>
              <span className="text-white font-bold">{selectedNode.activeGpus} GPUs</span>
            </div>
          </div>
        </div>

        {/* Bottom Node Switcher Buttons */}
        <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-[#080D16]/90 border border-slate-800 backdrop-blur-xl">
          <div className="text-xs font-mono text-slate-400">
            CLICK TO ROUTE PACKETS:
          </div>
          <div className="flex items-center gap-2">
            {NODES.map((node) => (
              <button
                key={node.id}
                onClick={() => setSelectedNode(node)}
                className={`px-3 py-1 rounded text-xs font-mono font-bold transition border ${
                  selectedNode.id === node.id
                    ? 'bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF] shadow-[0_0_12px_rgba(0,240,255,0.3)]'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {node.name.split(' ')[0]} ({node.latencyMs}ms)
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
