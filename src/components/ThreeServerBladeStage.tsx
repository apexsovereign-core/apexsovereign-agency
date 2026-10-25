import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Cpu, Network, ShieldCheck, Layers, Eye, RefreshCw, Activity } from 'lucide-react';

interface LayerInfo {
  id: string;
  number: string;
  name: string;
  tagline: string;
  color: string;
  accentHex: number;
  specs: { label: string; value: string }[];
  description: string;
}

const BLADE_LAYERS: LayerInfo[] = [
  {
    id: 'l1',
    number: 'L1',
    name: 'Rust/Axum Ingress & eBPF Routing Mesh',
    tagline: 'Zero-Copy Kernel Packet Filtering · Sub-18ms SLA Engine',
    color: '#00F0FF',
    accentHex: 0x00f0ff,
    specs: [
      { label: 'Edge Latency', value: '10.4ms P99' },
      { label: 'Kernel Probe', value: 'eBPF TC Ingress' },
      { label: 'Ingress Mesh', value: 'Rust / Axum 0.7' },
      { label: 'Failover Time', value: '< 18ms Seamless' },
    ],
    description:
      'Low-latency ingress gateways deployed across Virginia, Frankfurt, and Singapore executing eBPF byte-code filters for line-rate packet dispatching.',
  },
  {
    id: 'l2',
    number: 'L2',
    name: 'Disaggregated GPU VRAM & InfiniBand Fabric',
    tagline: 'Rubin HBM4 · B200 NVL72 · H100 SXM5 · 3.2 Tbps Fabric',
    color: '#38BDF8',
    accentHex: 0x38bdf8,
    specs: [
      { label: 'Interconnect', value: '3.2 Tbps NVLink 5' },
      { label: 'Prefill Nodes', value: 'Disaggregated TTFT' },
      { label: 'Decode Clusters', value: 'Linear Streaming' },
      { label: 'VRAM Pool', value: '1.44 Exaflops' },
    ],
    description:
      'Disaggregated inference pipeline isolating prompt prefill memory on high-bandwidth nodes while offloading sustained autoregressive token generation.',
  },
  {
    id: 'l3',
    number: 'L3',
    name: 'Supabase Atomic Ledger & PayPal Settlement',
    tagline: 'HMAC-SHA256 Verification · $1.00 USD = 100 CU Atomic Parity',
    color: '#10B981',
    accentHex: 0x10b981,
    specs: [
      { label: 'Conversion', value: '$1.00 = 100 CU' },
      { label: 'Integrity', value: 'HMAC-SHA256 Signed' },
      { label: 'Database', value: 'Supabase RLS Bound' },
      { label: 'Settlement', value: 'Instant Webhook Commit' },
    ],
    description:
      'Double-entry cryptographic ledger ensuring deterministic lease contracts, zero micro-debit drift, and instantaneous compute provisioning.',
  },
];

export const ThreeServerBladeStage: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [activeLayer, setActiveLayer] = useState<number>(0);
  const [separation, setSeparation] = useState<number>(1.2);
  const [isRotating, setIsRotating] = useState<boolean>(true);
  const [fps, setFps] = useState<number>(60);

  // References for Three.js state
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const bladesGroupRef = useRef<THREE.Group | null>(null);
  const layerGroupsRef = useRef<THREE.Group[]>([]);
  const isDraggingRef = useRef<boolean>(false);
  const previousMousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const width = container.clientWidth;
    const height = container.clientHeight || 480;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(4, 2.5, 5.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 2. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0x050a14, 2.5);
    scene.add(ambientLight);

    const cyanLight = new THREE.PointLight(0x00f0ff, 3, 20);
    cyanLight.position.set(3, 4, 3);
    scene.add(cyanLight);

    const emeraldLight = new THREE.PointLight(0x10b981, 2, 20);
    emeraldLight.position.set(-3, -3, 2);
    scene.add(emeraldLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // 3. Grid Helper
    const grid = new THREE.GridHelper(10, 20, 0x00f0ff, 0x0a192f);
    grid.position.y = -2;
    scene.add(grid);

    // 4. Construct 3 Server Blade Layers
    const mainBladesGroup = new THREE.Group();
    bladesGroupRef.current = mainBladesGroup;
    scene.add(mainBladesGroup);

    const layerGroups: THREE.Group[] = [];

    BLADE_LAYERS.forEach((layer, idx) => {
      const layerGroup = new THREE.Group();

      // Blade Chassis
      const chassisGeo = new THREE.BoxGeometry(3.6, 0.18, 2.2);
      const chassisMat = new THREE.MeshStandardMaterial({
        color: 0x060911,
        metalness: 0.9,
        roughness: 0.2,
      });
      const chassis = new THREE.Mesh(chassisGeo, chassisMat);
      layerGroup.add(chassis);

      // Neon Rim Wireframe
      const edgesGeo = new THREE.EdgesGeometry(chassisGeo);
      const edgesMat = new THREE.LineBasicMaterial({
        color: layer.accentHex,
        linewidth: 2,
      });
      const edges = new THREE.LineSegments(edgesGeo, edgesMat);
      layerGroup.add(edges);

      // Microcircuit Components / Accelerator Dies on top of blade
      for (let i = -1.2; i <= 1.2; i += 0.8) {
        for (let j = -0.6; j <= 0.6; j += 0.6) {
          const chipGeo = new THREE.BoxGeometry(0.5, 0.08, 0.4);
          const chipMat = new THREE.MeshStandardMaterial({
            color: 0x0a1526,
            metalness: 0.95,
            roughness: 0.1,
          });
          const chip = new THREE.Mesh(chipGeo, chipMat);
          chip.position.set(i, 0.12, j);
          layerGroup.add(chip);

          // Glowing Cap/Heat Spreader
          const capGeo = new THREE.BoxGeometry(0.42, 0.02, 0.32);
          const capMat = new THREE.MeshBasicMaterial({
            color: idx === 0 ? 0x00f0ff : idx === 1 ? 0x38bdf8 : 0x10b981,
            wireframe: true,
          });
          const cap = new THREE.Mesh(capGeo, capMat);
          cap.position.set(i, 0.17, j);
          layerGroup.add(cap);
        }
      }

      // Connecting bus lines (optical waveguides)
      const busGeo = new THREE.CylinderGeometry(0.015, 0.015, 3.4, 8);
      busGeo.rotateZ(Math.PI / 2);
      const busMat = new THREE.MeshBasicMaterial({ color: layer.accentHex });
      const bus1 = new THREE.Mesh(busGeo, busMat);
      bus1.position.set(0, 0.11, -0.9);
      layerGroup.add(bus1);

      const bus2 = new THREE.Mesh(busGeo, busMat);
      bus2.position.set(0, 0.11, 0.9);
      layerGroup.add(bus2);

      // Set initial vertical position based on layer index and separation
      const yOffset = (1 - idx) * separation;
      layerGroup.position.y = yOffset;

      mainBladesGroup.add(layerGroup);
      layerGroups.push(layerGroup);
    });

    layerGroupsRef.current = layerGroups;

    // 5. Animation & Interaction Loop
    let animationFrameId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsTimer = performance.now();

    const animate = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(animate);

      // Measure FPS
      frameCount++;
      if (currentTime - fpsTimer >= 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - fpsTimer)));
        frameCount = 0;
        fpsTimer = currentTime;
      }

      const delta = (currentTime - lastTime) * 0.001;
      lastTime = currentTime;

      // Auto rotation when enabled and not dragging
      if (isRotating && !isDraggingRef.current && mainBladesGroup) {
        mainBladesGroup.rotation.y += delta * 0.35;
      }

      // Pulse floating levitation effect
      layerGroups.forEach((grp, idx) => {
        const floatOffset = Math.sin(currentTime * 0.002 + idx * 1.5) * 0.04;
        const targetY = (1 - idx) * separation + floatOffset;
        grp.position.y += (targetY - grp.position.y) * 0.1;
      });

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    // 6. Mouse Drag Controls
    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !mainBladesGroup) return;
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;

      mainBladesGroup.rotation.y += deltaX * 0.008;
      mainBladesGroup.rotation.x += deltaY * 0.008;
      // Clamp x rotation to avoid flipping
      mainBladesGroup.rotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, mainBladesGroup.rotation.x));

      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // 7. Handle Window Resize
    const handleResize = () => {
      if (!container || !rendererRef.current) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight || 480;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [isRotating]);

  // Dynamic separation update
  useEffect(() => {
    layerGroupsRef.current.forEach((grp, idx) => {
      const targetY = (1 - idx) * separation;
      grp.position.y = targetY;
    });
  }, [separation]);

  return (
    <div className="relative w-full rounded-2xl bg-[#030508] border border-[#00F0FF]/25 shadow-[0_0_50px_rgba(0,240,255,0.06)] overflow-hidden">
      {/* Stage Header / Telemetry HUD */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-[#00F0FF]/15 bg-[#080D16]/85 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[#00F0FF] text-[10px] font-mono tracking-wider uppercase font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] animate-ping" />
            3D STICKY SCROLL-SCRUB STAGE
          </div>
          <span className="text-xs font-mono text-slate-400">
            DECONSTRUCTED HIGH-DENSITY SERVER BLADES
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Activity className="w-3.5 h-3.5 text-[#10B981]" />
            <span>RENDER: {fps} FPS</span>
          </div>
          <button
            onClick={() => setIsRotating(!isRotating)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded border text-[11px] transition ${
              isRotating
                ? 'bg-[#00F0FF]/15 border-[#00F0FF]/50 text-[#00F0FF]'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${isRotating ? 'animate-spin' : ''}`} />
            <span>{isRotating ? 'ROTATION: AUTO' : 'ROTATION: PAUSED'}</span>
          </button>
        </div>
      </div>

      {/* Main 3D Canvas Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[480px]">
        {/* Left Interactive 3D Canvas Area */}
        <div className="lg:col-span-8 relative min-h-[440px] flex items-center justify-center cursor-grab active:cursor-grabbing bg-gradient-to-b from-[#020305] via-[#050912] to-[#020305]">
          <div ref={mountRef} className="w-full h-full min-h-[440px]" />

          {/* Interactive Scrub Floating Controls */}
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#080D16]/90 border border-[#00F0FF]/25 backdrop-blur-xl shadow-lg z-20">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <Layers className="w-4 h-4 text-[#00F0FF]" />
              <span>EXPLODE DECONSTRUCTION:</span>
              <input
                type="range"
                min="0.3"
                max="2.2"
                step="0.05"
                value={separation}
                onChange={(e) => setSeparation(parseFloat(e.target.value))}
                className="w-28 accent-[#00F0FF] cursor-pointer"
              />
              <span className="text-[#00F0FF] font-bold">{separation.toFixed(2)}x</span>
            </div>

            {/* Layer Quick Selectors */}
            <div className="flex items-center gap-1.5">
              {BLADE_LAYERS.map((layer, idx) => (
                <button
                  key={layer.id}
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

        {/* Right Architectural Layer Inspector Panel */}
        <div className="lg:col-span-4 p-6 border-t lg:border-t-0 lg:border-l border-[#00F0FF]/15 bg-[#050811]/95 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30">
                ACTIVE ARCHITECTURAL LAYER
              </span>
              <span className="text-xs font-mono text-slate-500">
                LAYER {activeLayer + 1} OF 3
              </span>
            </div>

            <h3 className="text-lg font-bold text-white font-sans tracking-tight mb-1">
              {BLADE_LAYERS[activeLayer].name}
            </h3>
            <p className="text-xs font-mono text-[#00F0FF] mb-4">
              {BLADE_LAYERS[activeLayer].tagline}
            </p>

            <p className="text-xs text-slate-300 leading-relaxed mb-6 border-l-2 border-[#00F0FF]/50 pl-3">
              {BLADE_LAYERS[activeLayer].description}
            </p>

            {/* Technical Specifications Grid */}
            <div className="grid grid-cols-2 gap-2.5 mb-6">
              {BLADE_LAYERS[activeLayer].specs.map((spec, sIdx) => (
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
            {BLADE_LAYERS.map((layer, idx) => (
              <button
                key={layer.id}
                onClick={() => setActiveLayer(idx)}
                className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between ${
                  activeLayer === idx
                    ? 'bg-[#00F0FF]/10 border-[#00F0FF]/60 text-white'
                    : 'bg-[#080D16]/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-mono font-bold"
                    style={{
                      backgroundColor: `${layer.color}20`,
                      color: layer.color,
                      border: `1px solid ${layer.color}40`,
                    }}
                  >
                    {layer.number}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      {layer.id === 'l1'
                        ? 'eBPF Routing Layer'
                        : layer.id === 'l2'
                        ? 'GPU VRAM Fabric'
                        : 'Atomic Ledger Layer'}
                    </div>
                  </div>
                </div>
                <Eye
                  className={`w-4 h-4 ${
                    activeLayer === idx ? 'text-[#00F0FF]' : 'text-slate-600'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
