import React, { useState } from 'react';
import { CustomerUser } from '../types';
import { ApexLogo } from './ApexLogo';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Brain,
  ChevronDown,
  CircleUserRound,
  Code2,
  CreditCard,
  Gauge,
  Globe2,
  LogOut,
  Menu,
  Server,
  Settings2,
  ShieldCheck,
  Terminal,
  X,
  Zap,
} from 'lucide-react';

export type ActiveNavTab =
  | 'executive' | 'controlcenter' | 'solutions' | 'pricing' | 'crm' | 'swarm' | 'neural'
  | 'vault' | 'mesh' | 'tuning' | 'portal' | 'requirements' | 'signer' | 'architecture'
  | 'sandbox' | 'code' | 'schema' | 'deploy' | 'compute' | 'security' | 'benchmarks'
  | 'developers' | 'terminal' | 'multimodal';

interface NavbarProps {
  activeTab: ActiveNavTab;
  setActiveTab: (tab: ActiveNavTab) => void;
  currentUser: CustomerUser | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  isAdminUnlocked?: boolean;
}

type NavItem = { id: ActiveNavTab; label: string; detail: string; icon: React.ElementType };

const primary: NavItem[] = [
  { id: 'executive', label: 'Command', detail: 'Executive operating system', icon: Gauge },
  { id: 'terminal', label: 'Terminal', detail: 'Capacity and spot routing', icon: Zap },
  { id: 'pricing', label: 'Billing', detail: 'Plans, credits, settlements', icon: CreditCard },
  { id: 'developers', label: 'Developers', detail: 'API, SDK, sandbox', icon: Code2 },
];

const advanced: NavItem[] = [
  { id: 'controlcenter', label: 'Control center', detail: 'NVLink fleet telemetry', icon: Server },
  { id: 'compute', label: 'Global compute', detail: 'Regional capacity mesh', icon: Globe2 },
  { id: 'benchmarks', label: 'Benchmarks', detail: 'Performance and arbitrage proof', icon: BarChart3 },
  { id: 'security', label: 'Trust and security', detail: 'Compliance and perimeter', icon: ShieldCheck },
  { id: 'architecture', label: 'Architecture', detail: 'System design and topology', icon: Activity },
  { id: 'multimodal', label: 'Intelligence studio', detail: 'Multi-modal engines', icon: Brain },
  { id: 'crm', label: 'CRM and docs', detail: 'Enterprise work OS', icon: Terminal },
  { id: 'vault', label: 'Security vault', detail: 'Keys and audit console', icon: ShieldCheck },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onOpenAuth,
  onLogout,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const navigate = (tab: ActiveNavTab) => {
    setActiveTab(tab);
    setAdvancedOpen(false);
    setMobileOpen(false);
  };

  return (
    <header className="apex-header" id="apex-header">
      <div className="apex-header__inner">
        <button className="apex-brand" onClick={() => navigate('executive')} aria-label="Open ApexSovereign command center">
          <ApexLogo size={34} pulse={false} />
          <span className="apex-brand__copy">
            <span className="apex-brand__name">Apex<span>Sovereign</span><b>.ai</b></span>
            <span className="apex-brand__meta">GLOBAL COMPUTE LIQUIDITY / CONTROL PLANE</span>
          </span>
        </button>

        <button className="apex-mobile-toggle" onClick={() => setMobileOpen(v => !v)} aria-label="Toggle navigation" aria-expanded={mobileOpen}>
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        <nav className={`apex-nav ${mobileOpen ? 'is-open' : ''}`} aria-label="Primary navigation">
          <div className="apex-nav__primary">
            {primary.map(({ id, label, detail, icon: Icon }) => (
              <button key={id} id={`tab-${id}`} className={`apex-nav__item ${activeTab === id ? 'is-active' : ''}`} onClick={() => navigate(id)}>
                <Icon size={15} strokeWidth={1.8} />
                <span><strong>{label}</strong><small>{detail}</small></span>
              </button>
            ))}
          </div>

          <div className="apex-nav__advanced">
            <button className={`apex-nav__more ${advancedOpen ? 'is-active' : ''}`} onClick={() => setAdvancedOpen(v => !v)} aria-expanded={advancedOpen}>
              <Settings2 size={15} /> Explore platform <ChevronDown size={14} className={advancedOpen ? 'rotate-180' : ''} />
            </button>
            {advancedOpen && (
              <div className="apex-command-menu">
                <div className="apex-command-menu__label">ADVANCED WORKSPACES</div>
                {advanced.map(({ id, label, detail, icon: Icon }) => (
                  <button key={id} id={`tab-${id}`} className={activeTab === id ? 'is-selected' : ''} onClick={() => navigate(id)}>
                    <span className="apex-command-menu__icon"><Icon size={15} /></span>
                    <span><strong>{label}</strong><small>{detail}</small></span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="apex-header__actions">
          <span className="apex-environment"><i /> PRODUCTION</span>
          {currentUser ? (
            <div className="apex-user">
              <button className="apex-user__button" onClick={() => setUserOpen(v => !v)} aria-expanded={userOpen}>
                <CircleUserRound size={17} /> <span>{currentUser.company || currentUser.email}</span> <ChevronDown size={13} />
              </button>
              {userOpen && (
                <div className="apex-user__menu">
                  <div className="apex-user__identity">{currentUser.email}<small>{currentUser.role === 'admin' ? 'Administrator' : 'Customer workspace'}</small></div>
                  <button onClick={() => { navigate('portal'); setUserOpen(false); }}>Open account</button>
                  <button onClick={onLogout}><LogOut size={14} /> Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <button className="apex-signin" onClick={onOpenAuth}>Sign in <ArrowUpRight size={14} /></button>
          )}
        </div>
      </div>
    </header>
  );
};
