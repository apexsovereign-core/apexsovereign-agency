import React from 'react';

interface EmblemProps {
  className?: string;
  size?: number;
}

export const CyanFacetedJewelEmblem: React.FC<EmblemProps> = ({
  className = 'w-8 h-8',
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${className} filter drop-shadow-[0_0_12px_rgba(0,240,255,0.8)] transition-transform duration-300 hover:scale-105`}
      aria-label="ApexSovereign Emblem"
    >
      <defs>
        <linearGradient id="apexCyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00F0FF" />
          <stop offset="50%" stopColor="#00A8E8" />
          <stop offset="100%" stopColor="#005580" />
        </linearGradient>
      </defs>
      <polygon
        points="50,5 92,28 92,72 50,95 8,72 8,28"
        fill="url(#apexCyanGrad)"
        stroke="#00F0FF"
        strokeWidth="2"
      />
      <polygon
        points="50,5 92,28 50,50 8,28"
        fill="rgba(255,255,255,0.25)"
      />
      <polygon
        points="50,22 68,36 50,50 32,36"
        fill="#020305"
        stroke="#00F0FF"
        strokeWidth="1.5"
      />
    </svg>
  );
};
