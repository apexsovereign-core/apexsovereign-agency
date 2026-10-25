'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Layers, Activity, RefreshCw, Eye, Lock, Zap, Shield, Cpu } from 'lucide-react';

export type HardwareModelType = 'rubin' | 'b200' | 'h100' | 'a100' | 'l40s';

export interface HardwarePreset {
  id: HardwareModelType;
  name: string;
  architecture: string;
  vram: string;
  interconnect: string;
  features: string;
  dieColor: number;
  highlightColor: number;
  chipCount: number;
  isDualDie?: boolean;
  hasMigSlices?: boolean;
}

export const HARDWARE_PRESETS: HardwarePreset[] = [
  {
    id: 'rubin',
    name: 'NVIDIA Rubin / HBM4',
    architecture: 'Optical Backplane Architecture',
    vram: '288GB HBM4 (22 TB/s)',
    interconnect: '3.6 TB/s NVLink 6 Optical',
    features: 'Dual AMD SEV-SNP + NVIDIA CC Hardware Enclaves',
    dieColor: 0x00f0ff,
    highlightColor: 0x38bdf8,
    chipCount: 8,
  },
  {
    id: 'b200',
    name: 'NVIDIA B200 NVL72',
    architecture: 'Dual-Die Blackwell Expansion',
    vram: '192GB HBM3e (8 TB/s)',
    interconnect: '1.8 TB/s NVLink 5 Fabric',
    features: 'Dual-Die Co-Packaged High Bandwidth Memory',
    dieColor: 0x38bdf8,
    highlightColor: 0x00f0ff,
    chipCount: 6,
    isDualDie: true,
  },
  {
    id: 'h100',
    name: 'NVIDIA H100 SXM5',
    architecture: 'SXM5 Substrate Isolation',
    vram: '80GB HBM3 (3.35 TB/s)',
    interconnect: '900 GB/s NVLink 4',
    features: 'Hardware Root-of-Trust Isolated Substrate',
    dieColor: 0x10b981,
    highlightColor: 0x34d399,
    chipCount: 4,
  },
  {
    id: 'a100',
    name: 'NVIDIA A100 SXM4',
    architecture: '7-Slice MIG Partition Visualizer',
    vram: '80GB HBM2e (2 TB/s)',
    interconnect: '600 GB/s NVLink 3',
    features: '7 Isolated Hardware Multi-Instance Partitions',
    dieColor: 0xa78bfa,
    highlightColor: 0xc4b5fd,
    chipCount: 7,
    hasMigSlices: true,
  },
  {
    id: 'l40s',
    name: 'NVIDIA L40S PCIe',
    architecture: 'Single-Slot PCIe Blade',
    vram: '48GB GDDR6 (864 GB/s)',
    interconnect: '64 GB/s PCIe Gen4',
    features: 'Ada Lovelace High-Throughput Token Streaming',
    dieColor: 0xf59e0b,
    highlightColor: 0xfbbf24,
    chipCount: 2,
  },
];

export interface DeconstructionLayer {
  number: string;
  name: string;
  tagline: string;
  description: string;
  specs: { label: string; value: string }[];
}

export const DECONSTRUCTION_LAYERS: DeconstructionLayer[] = [
  {
    number: 'L1',
    name: 'Chassis Surface & eBPF Routing Mesh',
    tagline: 'Dual-Axial Airflow Fans · Sub-18ms Line-Rate TC Filters',
    description:
      'Physical blade enclosures with automated dual-axial counter-rotating fans, eBPF TC ingress probes, and hardware bypass routing for 10.4ms P99 SLA.',
    specs: [
      { label: 'Cooling', value: 'Dual-Axial / Hydro-Loop' },
      { label: 'Ingress Probe', value: 'eBPF TC Bypass' },
      { label: 'Target Latency', value: '< 18ms Edge RTT' },
      { label: 'Packet Drop', value: '0.0001% Zero-Loss' },
    ],
  },
  {
    number: 'L2',
    name: 'Silicon VRAM & InfiniBand Interconnect',
    tagline: 'Disaggregated HBM3e/HBM4 · 3.2 Tbps Quantum-2 Fabric',
    description:
      'Isolated prompt prefill memory pools and high-bandwidth NVLink switching plane decoupling compute silicon from localized storage constraints.',
    specs: [
      { label: 'Interconnect', value: '3.2 Tbps NVLink 5/6' },
      { label: 'Memory Bus', value: 'HBM4 22 TB/s' },
      { label: 'Fabric Topology', value: 'Quantum-2 Rail-Optimized' },
      { label: 'Prefill Decoupling', value: 'Sub-15ms TTFT' },
    ],
  },
  {
    number: 'L3',
    name: 'Supabase Core & Confidential Enclave',
    tagline: 'AMD SEV-SNP / NVIDIA CC · Double-Entry PayPal Settlement',
    description:
      'Hardware-enforced confidential computing memory partitions with remote attestation bound directly to atomic PostgreSQL double-entry settlement.',
    specs: [
      { label: 'Enclaves', value: 'AMD SEV-SNP & NVIDIA CC' },
      { label: 'Attestation', value: 'On-Die Hardware RoT' },
      { label: 'Settlement Parity', value: '$1.00 USD = 100 CU' },
      { label: 'Ledger Audit', value: 'HMAC-SHA256 Signed' },
    ],
  },
];

export const HardwareDeconstructionStage: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedHardware, setSelectedHardware] = useState<HardwareModelType>('rubin');
  const [activeLayer, setActiveLayer] = useState<number>(1);
  const [separation, setSeparation] = useState<number>(1.25);
  const [isRotating, setIsRotating] = useState<boolean>(true);
  const [fps, setFps] = useState<number>(60);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const mainGroupRef = useRef<THREE.Group | null>(null);
  const layerGroupsRef = useRef<THREE.Group[]>([]);
  const isDraggingRef = useRef<boolean>(false);
  const prevMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const activePreset = HARDWARE_PRESETS.find((p) => p.id === selectedHardware) || HARDWARE_PRESETS[0];

  // Re-build procedural 3D model when hardware preset changes
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const width = container.clientWidth;
    const height = container.clientHeight || 500;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(4.2, 2.8, 5.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    rendererRef.current = renderer;

    // Clear previous children
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // 2. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0x060d1a, 2.5);
    scene.add(ambientLight);

    const cyanPoint = new THREE.PointLight(activePreset.dieColor, 3.5, 25);
    cyanPoint.position.set(3, 4, 3);
    scene.add(cyanPoint);

    const emeraldPoint = new THREE.PointLight(0x10b981, 2.2, 20);
    emeraldPoint.position.set(-3, -2, 2);
    scene.add(emeraldPoint);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(6, 12, 8);
    scene.add(dirLight);

    // 3. Ambient Grid Floor
    const grid = new THREE.GridHelper(12, 24, 0x00f0ff, 0x081528);
    grid.position.y = -2.2;
    scene.add(grid);

    // 4. Main Exploded Assembly Group
    const mainGroup = new THREE.Group();
    mainGroupRef.current = mainGroup;
    scene.add(mainGroup);

    const layers: THREE.Group[] = [];

    // ==========================================
    // LAYER 1: Physical Chassis & Airflow Fans (Top)
    // ==========================================
    const layer1 = new THREE.Group();
    {
      // Metal Chassis Top Lid
      const lidGeo = new THREE.BoxGeometry(3.8, 0.14, 2.4);
      const lidMat = new THREE.MeshStandardMaterial({
        color: 0x080f1e,
        metalness: 0.95,
        roughness: 0.2,
      });
      const lid = new THREE.Mesh(lidGeo, lidMat);
      layer1.add(lid);

      // Neon Wireframe Rim
      const lidEdges = new THREE.EdgesGeometry(lidGeo);
      const lidWire = new THREE.LineSegments(
        lidEdges,
        new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 })
      );
      layer1.add(lidWire);

      // Dual-Axial Fans on Chassis
      for (const fx of [-1.1, 1.1]) {
        const fanCasing = new THREE.CylinderGeometry(0.45, 0.45, 0.16, 24);
        const fanMat = new THREE.MeshStandardMaterial({ color: 0x050811, metalness: 0.8 });
        const fan = new THREE.Mesh(fanCasing, fanMat);
        fan.position.set(fx, 0.08, 0);
        layer1.add(fan);

        // Fan Hub Glow
        const fanHub = new THREE.CylinderGeometry(0.12, 0.12, 0.18, 16);
        const fanHubMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
        const hub = new THREE.Mesh(fanHub, fanHubMat);
        hub.position.set(fx, 0.09, 0);
        layer1.add(hub);
      }
    }
    layer1.position.y = separation;
    mainGroup.add(layer1);
    layers.push(layer1);

    // ==========================================
    // LAYER 2: Silicon Dies & InfiniBand Fabric (Middle)
    // ==========================================
    const layer2 = new THREE.Group();
    {
      // Substrate Board
      const subGeo = new THREE.BoxGeometry(3.6, 0.08, 2.2);
      const subMat = new THREE.MeshStandardMaterial({
        color: 0x0a1424,
        metalness: 0.85,
        roughness: 0.3,
      });
      const substrate = new THREE.Mesh(subGeo, subMat);
      layer2.add(substrate);

      const subEdges = new THREE.EdgesGeometry(subGeo);
      const subWire = new THREE.LineSegments(
        subEdges,
        new THREE.LineBasicMaterial({ color: activePreset.dieColor, linewidth: 1.5 })
      );
      layer2.add(subWire);

      // Procedural GPU Dies based on active hardware preset
      if (activePreset.isDualDie) {
        // Dual-Die Blackwell B200 Layout
        for (const dx of [-0.6, 0.6]) {
          const dieGeo = new THREE.BoxGeometry(0.9, 0.12, 0.8);
          const dieMat = new THREE.MeshStandardMaterial({
            color: 0x030712,
            metalness: 0.98,
            roughness: 0.1,
          });
          const die = new THREE.Mesh(dieGeo, dieMat);
          die.position.set(dx, 0.08, 0);
          layer2.add(die);

          // Die Cap Wireframe
          const capEdges = new THREE.EdgesGeometry(dieGeo);
          const capWire = new THREE.LineSegments(
            capEdges,
            new THREE.LineBasicMaterial({ color: 0x00f0ff })
          );
          capWire.position.set(dx, 0.08, 0);
          layer2.add(capWire);
        }
      } else if (activePreset.hasMigSlices) {
        // 7-Slice MIG Partition Visualizer (A100)
        for (let s = 0; s < 7; s++) {
          const sx = -1.2 + s * 0.4;
          const sliceGeo = new THREE.BoxGeometry(0.32, 0.1, 0.7);
          const sliceMat = new THREE.MeshStandardMaterial({
            color: 0x081326,
            metalness: 0.9,
          });
          const slice = new THREE.Mesh(sliceGeo, sliceMat);
          slice.position.set(sx, 0.07, 0);
          layer2.add(slice);

          const sliceEdges = new THREE.EdgesGeometry(sliceGeo);
          const wire = new THREE.LineSegments(
            sliceEdges,
            new THREE.LineBasicMaterial({ color: activePreset.highlightColor })
          );
          wire.position.set(sx, 0.07, 0);
          layer2.add(wire);
        }
      } else {
        // Rubin / HBM4 or H100 Grid Array
        const count = activePreset.chipCount;
        const cols = Math.min(4, count);
        const rows = Math.ceil(count / cols);

        for (let i = 0; i < count; i++) {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const cx = -1.1 + c * 0.75;
          const cz = -0.5 + r * 0.7;

          const chipGeo = new THREE.BoxGeometry(0.55, 0.1, 0.45);
          const chipMat = new THREE.MeshStandardMaterial({
            color: 0x040813,
            metalness: 0.95,
            roughness: 0.15,
          });
          const chip = new THREE.Mesh(chipGeo, chipMat);
          chip.position.set(cx, 0.08, cz);
          layer2.add(chip);

          const chipEdges = new THREE.EdgesGeometry(chipGeo);
          const chipWire = new THREE.LineSegments(
            chipEdges,
            new THREE.LineBasicMaterial({ color: activePreset.highlightColor })
          );
          chipWire.position.set(cx, 0.08, cz);
          layer2.add(chipWire);
        }
      }

      // Optical Waveguide Bus Interconnects (3.6 TB/s Fabric)
      for (const bz of [-0.85, 0.85]) {
        const busGeo = new THREE.CylinderGeometry(0.02, 0.02, 3.4, 8);
        busGeo.rotateZ(Math.PI / 2);
        const busMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
        const bus = new THREE.Mesh(busGeo, busMat);
        bus.position.set(0, 0.06, bz);
        layer2.add(bus);
      }
    }
    layer2.position.y = 0;
    mainGroup.add(layer2);
    layers.push(layer2);

    // ==========================================
    // LAYER 3: Core Security Enclave & Ledger (Bottom)
    // ==========================================
    const layer3 = new THREE.Group();
    {
      const baseGeo = new THREE.BoxGeometry(3.8, 0.16, 2.4);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x03050a,
        metalness: 0.9,
        roughness: 0.4,
      });
      const baseChassis = new THREE.Mesh(baseGeo, baseMat);
      layer3.add(baseChassis);

      const baseEdges = new THREE.EdgesGeometry(baseGeo);
      const baseWire = new THREE.LineSegments(
        baseEdges,
        new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2 })
      );
      layer3.add(baseWire);

      // Hardware Security Cryptographic Shield Emblems (AMD SEV-SNP & NVIDIA CC)
      for (const sx of [-0.8, 0.8]) {
        const shieldGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 6);
        const shieldMat = new THREE.MeshBasicMaterial({ color: 0x10b981, wireframe: true });
        const shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.position.set(sx, 0.11, 0);
        layer3.add(shield);
      }
    }
    layer3.position.y = -separation;
    mainGroup.add(layer3);
    layers.push(layer3);

    layerGroupsRef.current = layers;

    // 5. Render Loop & Animation
    let animId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsTimer = performance.now();

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      // Measure FPS
      frameCount++;
      if (time - fpsTimer >= 1000) {
        setFps(Math.round((frameCount * 1000) / (time - fpsTimer)));
        frameCount = 0;
        fpsTimer = time;
      }

      const delta = (time - lastTime) * 0.001;
      lastTime = time;

      if (isRotating && !isDraggingRef.current && mainGroup) {
        mainGroup.rotation.y += delta * 0.3;
      }

      // Smooth floating oscillation
      layers.forEach((grp, idx) => {
        const floatVal = Math.sin(time * 0.002 + idx * 1.5) * 0.04;
        const targetY = (1 - idx) * separation + floatVal;
        grp.position.y += (targetY - grp.position.y) * 0.1;
      });

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    // 6. Interactive Mouse Drag
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !mainGroup) return;
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;
      mainGroup.rotation.y += dx * 0.008;
      mainGroup.rotation.x += dy * 0.008;
      mainGroup.rotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, mainGroup.rotation.x));
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    const onResize = () => {
      if (!container || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight || 500;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', onResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [selectedHardware, isRotating]);

  // Update separation distance on slider scrub
  useEffect(() => {
    layerGroupsRef.current.forEach((grp, idx) => {
      grp.position.y = (1 - idx) * separation;
    });
  }, [separation]);

  return (
    <div className="relative w-full rounded-2xl bg-[#030508] border border-[#00F0FF]/25 shadow-[0_0_50px_rgba(0,240,255,0.06)] overflow-hidden">
      {/* 1. Hardware Selector Bar */}
      <div className="p-4 border-b border-[#00F0FF]/15 bg-[#080D16]/90 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#00F0FF]" />
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              DYNAMIC HARDWARE ARCHITECTURE SELECTOR:
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-400">RENDER: <strong className="text-[#10B981]">{fps} FPS</strong></span>
            <button
              onClick={() => setIsRotating(!isRotating)}
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded border text-[11px] ${
                isRotating
                  ? 'bg-[#00F0FF]/15 border-[#00F0FF]/50 text-[#00F0FF]'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${isRotating ? 'animate-spin' : ''}`} />
              <span>{isRotating ? 'AUTO' : 'PAUSED'}</span>
            </button>
          </div>
        </div>

        {/* 5 Procedural Hardware Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {HARDWARE_PRESETS.map((p) => {
            const isSelected = p.id === selectedHardware;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedHardware(p.id)}
                className={`p-2.5 rounded-xl border text-left transition ${
                  isSelected
                    ? 'bg-[#050811] border-[#00F0FF] shadow-[0_0_16px_rgba(0,240,255,0.25)]'
                    : 'bg-[#020409] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-mono font-bold text-white truncate">{p.name}</div>
                <div className="text-[10px] font-mono text-slate-400 truncate">{p.architecture}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 3D Interactive Canvas & Exploded Layers HUD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[480px]">
        {/* Left 3D Viewport */}
        <div className="lg:col-span-8 relative min-h-[440px] flex items-center justify-center cursor-grab active:cursor-grabbing bg-gradient-to-b from-[#020305] via-[#050912] to-[#020305]">
          <div ref={mountRef} className="w-full h-full min-h-[440px]" />

          {/* Interactive Scrub Bar */}
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#080D16]/90 border border-[#00F0FF]/25 backdrop-blur-xl shadow-lg z-20">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <Layers className="w-4 h-4 text-[#00F0FF]" />
              <span>EXPLODE CHASSIS:</span>
              <input
                type="range"
                min="0.4"
                max="2.5"
                step="0.05"
                value={separation}
                onChange={(e) => setSeparation(parseFloat(e.target.value))}
                className="w-28 accent-[#00F0FF] cursor-pointer"
              />
              <span className="text-[#00F0FF] font-bold">{separation.toFixed(2)}x</span>
            </div>

            <div className="flex items-center gap-1.5">
              {DECONSTRUCTION_LAYERS.map((layer, idx) => (
                <button
                  key={layer.number}
                  onClick={() => setActiveLayer(idx)}
                  className={`px-2.5 py-1 rounded text-[10px] font-mono tracking-wider transition font-bold border ${
                    activeLayer === idx
                      ? 'bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF] shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                      : 'bg-slate-900/80 border-slate-700/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {layer.number}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Layer Inspector Card */}
        <div className="lg:col-span-4 p-6 border-t lg:border-t-0 lg:border-l border-[#00F0FF]/15 bg-[#050811]/95 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30">
                ACTIVE HARDWARE LAYER
              </span>
              <span className="text-xs font-mono text-slate-500">
                LAYER {activeLayer + 1} OF 3
              </span>
            </div>

            <h3 className="text-lg font-bold text-white font-sans tracking-tight mb-1">
              {DECONSTRUCTION_LAYERS[activeLayer].name}
            </h3>
            <p className="text-xs font-mono text-[#00F0FF] mb-3">
              {DECONSTRUCTION_LAYERS[activeLayer].tagline}
            </p>

            <p className="text-xs text-slate-300 leading-relaxed mb-6 border-l-2 border-[#00F0FF]/50 pl-3">
              {DECONSTRUCTION_LAYERS[activeLayer].description}
            </p>

            <div className="grid grid-cols-2 gap-2.5 mb-6">
              {DECONSTRUCTION_LAYERS[activeLayer].specs.map((spec, sIdx) => (
                <div
                  key={sIdx}
                  className="p-2.5 rounded-lg bg-[#080D16] border border-[#00F0FF]/15"
                >
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    {spec.label}
                  </div>
                  <div className="text-xs font-mono font-bold text-white mt-0.5">
                    {spec.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Layer Selector Cards */}
          <div className="space-y-2 pt-4 border-t border-slate-800">
            {DECONSTRUCTION_LAYERS.map((layer, idx) => (
              <button
                key={layer.number}
                onClick={() => setActiveLayer(idx)}
                className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between ${
                  activeLayer === idx
                    ? 'bg-[#00F0FF]/10 border-[#00F0FF]/60 text-white'
                    : 'bg-[#080D16]/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-mono font-bold bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40">
                    {layer.number}
                  </span>
                  <span className="text-xs font-semibold text-white truncate">
                    {layer.name.split('&')[0]}
                  </span>
                </div>
                <Eye className={`w-4 h-4 ${activeLayer === idx ? 'text-[#00F0FF]' : 'text-slate-600'}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HardwareDeconstructionStage;
