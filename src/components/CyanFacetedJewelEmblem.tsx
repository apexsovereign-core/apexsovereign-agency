import React from 'react';

interface EmblemProps {
  className?: string;
  size?: number;
  glow?: boolean;
}

export const CyanFacetedJewelEmblem: React.FC<EmblemProps> = ({
  className = 'w-9 h-9',
  size = 36,
  glow = true,
}) => {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {glow && (
        <div 
          className="absolute -inset-1 rounded-full opacity-60 blur-md pointer-events-none animate-pulse"
          style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.4) 0%, rgba(0,85,128,0.1) 70%, transparent 100%)' }}
        />
      )}
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 transition-transform duration-300 hover:scale-105"
        role="img"
        aria-label="ApexSovereign.ai Cyan Faceted Jewel Emblem"
      >
        <defs>
          <linearGradient id="apexJewelGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00F0FF" />
            <stop offset="50%" stopColor="#00A3CC" />
            <stop offset="100%" stopColor="#005580" />
          </linearGradient>
          <linearGradient id="apexJewelLight" x1="25" y1="10" x2="75" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E0FFFF" />
            <stop offset="60%" stopColor="#00F0FF" />
            <stop offset="100%" stopColor="#0080B3" />
          </linearGradient>
          <linearGradient id="apexJewelDeep" x1="50" y1="50" x2="90" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#005580" />
            <stop offset="100%" stopColor="#020305" />
          </linearGradient>
          <filter id="apexJewelFilter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Faceted Diamond Shell */}
        <polygon
          points="50,6 92,42 50,94 8,42"
          fill="url(#apexJewelDeep)"
          stroke="url(#apexJewelGrad)"
          strokeWidth="1.8"
        />

        {/* Upper Crown Facet - High Refractive Apex */}
        <polygon
          points="50,6 74,34 50,48 26,34"
          fill="url(#apexJewelLight)"
          fillOpacity="0.9"
          stroke="#00F0FF"
          strokeWidth="1.2"
        />

        {/* Left Wing Facet */}
        <polygon
          points="8,42 26,34 50,48 32,74"
          fill="url(#apexJewelGrad)"
          fillOpacity="0.85"
          stroke="#00F0FF"
          strokeWidth="1"
        />

        {/* Right Wing Facet */}
        <polygon
          points="92,42 74,34 50,48 68,74"
          fill="url(#apexJewelGrad)"
          fillOpacity="0.75"
          stroke="#00F0FF"
          strokeWidth="1"
        />

        {/* Obsidian Core - Deep Zero-Leak Void Cryptographic Base */}
        <polygon
          points="50,48 68,74 50,94 32,74"
          fill="#020305"
          stroke="#00F0FF"
          strokeWidth="1.4"
        />

        {/* Central Luminous Delta Pivot */}
        <polygon
          points="50,56 61,71 39,71"
          fill="#00F0FF"
          fillOpacity="0.95"
          filter="url(#apexJewelFilter)"
        />
      </svg>
    </div>
  );
};
