import React from 'react';
import { ApexLogo } from './ApexLogo';

export interface NavbarLogoProps {
  /** Size of the emblem in pixels (default: 38) */
  size?: number;
  /** Custom CSS classes for the root container */
  className?: string;
  /** Whether to show the subtitle underneath brand name */
  showSubtitle?: boolean;
  /** Custom subtitle text */
  subtitle?: string;
  /** Whether to display the live operational status badge */
  showBadge?: boolean;
  /** Status badge text (default: 'Live') */
  badgeText?: string;
  /** Status badge styling variant */
  badgeVariant?: 'live' | 'operational' | 'master';
  /** Optional telemetry active pulse state */
  pulse?: boolean;
  /** Optional click handler for navigation */
  onClick?: () => void;
}

/**
 * ApexSovereign.ai - Brand Emblem & Header Navigation Logo
 * Renders the permanent Diamond Cyan Logo vector emblem, brand typography,
 * and live system operational telemetry badges.
 */
export const NavbarLogo: React.FC<NavbarLogoProps> = ({
  size = 38,
  className = '',
  showSubtitle = true,
  subtitle = 'The Sovereign Global Work OS',
  showBadge = true,
  badgeText = 'Live',
  badgeVariant = 'live',
  pulse = false,
  onClick,
}) => {
  const getBadgeStyles = () => {
    switch (badgeVariant) {
      case 'master':
        return 'bg-purple-500/10 text-purple-300 border-purple-500/30';
      case 'operational':
        return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
      case 'live':
      default:
        return 'bg-cyan-500/10 text-[#00f0ff] border-cyan-500/30';
    }
  };

  const getIndicatorStyles = () => {
    switch (badgeVariant) {
      case 'master':
        return 'bg-purple-400';
      case 'operational':
        return 'bg-emerald-400';
      case 'live':
      default:
        return 'bg-[#00f0ff]';
    }
  };

  const Content = (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Permanent Diamond Cyan Logo SVG Emblem */}
      <ApexLogo
        size={size}
        glow
        pulse={pulse}
        variant="icon"
      />

      {/* Brand Typography & Status Indicator */}
      <div className="flex flex-col select-none">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-white tracking-tight text-base sm:text-lg leading-tight flex items-center">
            <span>ApexSovereign</span>
            <span className="text-[#00f0ff] drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]">
              .ai
            </span>
          </span>

          {showBadge && (
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border shadow-sm ${getBadgeStyles()}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${getIndicatorStyles()} animate-ping`} />
              <span>{badgeText}</span>
            </span>
          )}
        </div>

        {showSubtitle && (
          <span className="text-[10px] text-slate-400 font-medium tracking-tight mt-0.5 truncate max-w-[200px] sm:max-w-[280px]">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        type="button"
        className="flex items-center text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg group cursor-pointer transition-opacity hover:opacity-90"
        aria-label="ApexSovereign - Return to Executive Console"
      >
        {Content}
      </button>
    );
  }

  return Content;
};
