import React from 'react';
import { ApexLogo } from './ApexLogo';

export interface SovereignHexDiamondProps {
  size?: number | string;
  className?: string;
  glow?: boolean;
  showText?: boolean;
  textSubtitle?: string;
  animated?: boolean;
}

/**
 * Permanent Logo Mark & Visual Symbol for ApexSovereign Empire:
 * Renders the precision Diamond Cyan Logo mark with faceted geometry,
 * radiant cyan glow, and high-contrast institutional dark tokens.
 */
export const SovereignHexDiamond: React.FC<SovereignHexDiamondProps> = ({
  size = 39,
  className = '',
  glow = true,
  showText = false,
  textSubtitle = 'Autonomous Enterprise Work OS & Sovereign Compute Broker Platform',
  animated = false,
}) => {
  const numericSize = typeof size === 'number' ? size : parseInt(String(size), 10) || 39;

  return (
    <ApexLogo
      size={numericSize}
      className={className}
      glow={glow}
      pulse={animated}
      showText={showText}
      subtitle={textSubtitle}
      badgeText={showText ? 'EMPIRE CORE' : undefined}
      variant={showText ? 'lockup' : 'icon'}
    />
  );
};
