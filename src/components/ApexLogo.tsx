import React from 'react';

export type ApexLogoSize = 'sm' | 'md' | 'lg' | 'xl' | number;

export interface ApexLogoProps {
  /** Size variant or explicit pixel dimension */
  size?: ApexLogoSize;
  /** Custom CSS classes for the root wrapper */
  className?: string;
  /** Whether to render radiant cyan outer glow */
  glow?: boolean;
  /** Active eBPF telemetry pulse animation state */
  pulse?: boolean;
  /** Whether to display accompanying brand typography */
  showText?: boolean;
  /** Subtitle text underneath the brand name (used when showText is true) */
  subtitle?: string;
  /** Optional badge text displayed next to brand name (e.g., 'EMPIRE CORE', 'SOVEREIGN') */
  badgeText?: string;
  /** Layout variant: 'icon' (emblem only), 'lockup' (horizontal text), 'stacked' (vertical text) */
  variant?: 'icon' | 'lockup' | 'stacked';
  /** Click handler */
  onClick?: () => void;
}

/**
 * ApexSovereign.ai - Permanent Diamond Cyan Logo Component
 * 
 * Production-grade, zero-dependency SVG vector emblem featuring:
 * 1. Geometrically precise 45-degree diamond polygon with faceted internal planes.
 * 2. High-contrast institutional color gradients (#00f0ff to #0088cc) with deep obsidian facets.
 * 3. Radiant cyan outer glow filter (drop-shadow [0 0 14px rgba(0,240,255,0.5)]).
 * 4. Responsive sizing ('sm' | 'md' | 'lg' | 'xl' | px) and real-time eBPF pulse state.
 */
export const ApexLogo: React.FC<ApexLogoProps> = ({
  size = 'md',
  className = '',
  glow = true,
  pulse = false,
  showText = false,
  subtitle = 'Autonomous Enterprise Work OS & Sovereign Compute Broker',
  badgeText,
  variant = 'icon',
  onClick,
}) => {
  // Resolve pixel dimensions based on size token or numeric input
  const pixelSize = typeof size === 'number' 
    ? size 
    : size === 'sm' 
      ? 24 
      : size === 'md' 
        ? 36 
        : size === 'lg' 
          ? 48 
          : 72; // 'xl'

  // Unique identifier suffix for SVG gradient IDs to prevent DOM collision across instances
  const idPrefix = React.useId().replace(/:/g, '');

  const Emblem = (
    <div
      style={{ width: pixelSize, height: pixelSize }}
      className={`relative shrink-0 flex items-center justify-center transition-transform duration-300 ${
        pulse ? 'animate-pulse' : ''
      } ${onClick ? 'cursor-pointer hover:scale-105' : ''}`}
    >
      <svg
        viewBox="0 0 200 200"
        width={pixelSize}
        height={pixelSize}
        className={`w-full h-full select-none ${
          glow ? 'filter drop-shadow-[0_0_14px_rgba(0,240,255,0.5)]' : ''
        }`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="ApexSovereign Diamond Cyan Insignia"
      >
        <defs>
          {/* Radiant Primary Cyan Gradient (#00f0ff -> #0088cc) */}
          <linearGradient id={`${idPrefix}-cyanGrad`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="20%" stopColor="#70F7FF" />
            <stop offset="55%" stopColor="#00F0FF" />
            <stop offset="100%" stopColor="#0088CC" />
          </linearGradient>

          {/* Core Facet Specular Highlight */}
          <linearGradient id={`${idPrefix}-coreSpecular`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E0FCFF" />
            <stop offset="40%" stopColor="#38DDF8" />
            <stop offset="85%" stopColor="#00A2E8" />
            <stop offset="100%" stopColor="#006699" />
          </linearGradient>

          {/* Deep Obsidian Left-Facet Gradient */}
          <linearGradient id={`${idPrefix}-obsidianLeft`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0C1B2E" />
            <stop offset="50%" stopColor="#060F1A" />
            <stop offset="100%" stopColor="#02050A" />
          </linearGradient>

          {/* Deep Obsidian Right-Facet Gradient */}
          <linearGradient id={`${idPrefix}-obsidianRight`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#122A47" />
            <stop offset="60%" stopColor="#091729" />
            <stop offset="100%" stopColor="#040912" />
          </linearGradient>

          {/* Lower Keel Shading */}
          <linearGradient id={`${idPrefix}-keelShade`} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#004466" stopOpacity="0.2" />
          </linearGradient>

          {/* SVG Glow Filter */}
          <filter id={`${idPrefix}-glowFilter`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. Outer Diamond Silhouette / Dark Base */}
        <polygon
          points="100,10 190,100 100,190 10,100"
          fill="#030812"
          stroke={`url(#${idPrefix}-cyanGrad)`}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        {/* 2. Faceted Quadrant Planes */}
        {/* Upper Left Facet (Dark Obsidian) */}
        <polygon
          points="100,10 10,100 100,100"
          fill={`url(#${idPrefix}-obsidianLeft)`}
          stroke={`url(#${idPrefix}-cyanGrad)`}
          strokeWidth="0.8"
          strokeOpacity="0.4"
        />

        {/* Upper Right Facet (Luminous Steeled Obsidian) */}
        <polygon
          points="100,10 190,100 100,100"
          fill={`url(#${idPrefix}-obsidianRight)`}
          stroke={`url(#${idPrefix}-cyanGrad)`}
          strokeWidth="0.8"
          strokeOpacity="0.4"
        />

        {/* Lower Left Facet */}
        <polygon
          points="10,100 100,190 100,100"
          fill="#050B14"
          stroke={`url(#${idPrefix}-cyanGrad)`}
          strokeWidth="0.8"
          strokeOpacity="0.4"
        />

        {/* Lower Right Facet */}
        <polygon
          points="190,100 100,190 100,100"
          fill="#081424"
          stroke={`url(#${idPrefix}-cyanGrad)`}
          strokeWidth="0.8"
          strokeOpacity="0.4"
        />

        {/* 3. Cardinal Precision Seam Beams (Crosshairs of Sovereign Authority) */}
        <line
          x1="100"
          y1="10"
          x2="100"
          y2="190"
          stroke={`url(#${idPrefix}-cyanGrad)`}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.85"
        />
        <line
          x1="10"
          y1="100"
          x2="190"
          y2="100"
          stroke={`url(#${idPrefix}-cyanGrad)`}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* 4. Intermediate Geometric Diamond Inset Matrix */}
        <polygon
          points="100,38 162,100 100,162 38,100"
          fill="none"
          stroke={`url(#${idPrefix}-cyanGrad)`}
          strokeWidth="1.8"
          strokeDasharray="4 3"
          opacity="0.6"
        />

        {/* 5. Inner Faceted Radiant Core Diamond */}
        <polygon
          points="100,56 144,100 100,144 56,100"
          fill={`url(#${idPrefix}-coreSpecular)`}
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeOpacity="0.9"
        />

        {/* 6. Central Cryptographic Solid Diamond Node (High Intensity Spark) */}
        <polygon
          points="100,78 122,100 100,122 78,100"
          fill="#FFFFFF"
          opacity="0.95"
        />
        <polygon
          points="100,85 115,100 100,115 85,100"
          fill="#00F0FF"
        />

        {/* 7. Precision Corner Accents / Radar Calibration Ticks */}
        <circle cx="100" cy="10" r="2.5" fill="#00F0FF" />
        <circle cx="190" cy="100" r="2.5" fill="#00F0FF" />
        <circle cx="100" cy="190" r="2.5" fill="#00F0FF" />
        <circle cx="10" cy="100" r="2.5" fill="#00F0FF" />
      </svg>
    </div>
  );

  // Return emblem only if not displaying accompanying typography
  if (!showText && variant === 'icon') {
    return Emblem;
  }

  // Render Lockup Variant (Horizontal) or Stacked Variant (Vertical)
  const isStacked = variant === 'stacked';

  return (
    <div
      onClick={onClick}
      className={`inline-flex ${
        isStacked ? 'flex-col items-center text-center' : 'items-center'
      } gap-3 select-none ${className} ${onClick ? 'cursor-pointer group' : ''}`}
    >
      {Emblem}

      <div className={`flex flex-col ${isStacked ? 'items-center' : 'items-start'}`}>
        <div className="flex items-center gap-2">
          <span className="font-black text-white tracking-tight leading-none text-base sm:text-lg flex items-center font-sans">
            <span className="group-hover:text-slate-100 transition-colors">ApexSovereign</span>
            <span className="text-[#00f0ff] font-extrabold drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]">
              .ai
            </span>
          </span>

          {badgeText && (
            <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider font-bold rounded bg-cyan-950/80 text-[#00f0ff] border border-cyan-500/40 shadow-[0_0_8px_rgba(0,240,255,0.2)]">
              {badgeText}
            </span>
          )}
        </div>

        {subtitle && (
          <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono tracking-tight mt-0.5 truncate max-w-[280px] sm:max-w-[360px]">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};
