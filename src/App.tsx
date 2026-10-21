/**
 * ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
 * Multi-Tenant Workload Broker, Cryptographic Leases, and PayPal Invoicing
 */

import React, { useState, useEffect } from 'react';
import { Navbar, ActiveNavTab } from './components/Navbar';
import { SolutionsView } from './components/SolutionsView';
import { ArchitectureView } from './components/ArchitectureView';
import { InteractiveSandbox } from './components/InteractiveSandbox';
import { CodeExplorer } from './components/CodeExplorer';
import { SchemaViewer } from './components/SchemaViewer';
import { DeploymentGuide } from './components/DeploymentGuide';
import { VariableSigner } from './components/VariableSigner';
import { RequirementsEditor } from './components/RequirementsEditor';
import { PricingPlans, SUBSCRIPTION_TIERS } from './components/PricingPlans';
import { CustomerPortal } from './components/CustomerPortal';
import { EnterpriseCrmPipeline } from './components/EnterpriseCrmPipeline';
import { AutonomousAgentSwarm } from './components/AutonomousAgentSwarm';
import { NeuralChatInterface } from './components/NeuralChatInterface';
import { AgentOperationsPanel } from './components/AgentOperationsPanel';
import { VaultSecurityConsole } from './components/VaultSecurityConsole';
import { MeshFederationConsole } from './components/MeshFederationConsole';
import { ModelTuningConsole } from './components/ModelTuningConsole';
import { MasterExecutiveConsole } from './components/MasterExecutiveConsole';
import { AuthModal } from './components/AuthModal';
import { PayPalCheckoutModal } from './components/PayPalCheckoutModal';
import { AutonomousAgentChatbot } from './components/AutonomousAgentChatbot';
import { AdminAccessGate } from './components/AdminAccessGate';
import { LivePlatformStatus } from './components/LivePlatformStatus';
import { DeveloperPortal } from './components/DeveloperPortal';
import { TrustComplianceHub } from './components/TrustComplianceHub';
import { TechnicalEvidencePanel } from './components/TechnicalEvidencePanel';
import { GlobalSwarmMap } from './components/GlobalSwarmMap';
import { CostIntelligenceOptimizer } from './components/CostIntelligenceOptimizer';
import { SovereignDashboard } from './components/SovereignDashboard';
import { FleetTicker } from './components/FleetTicker';
import { DeveloperSandbox } from './components/DeveloperSandbox';
import { InstitutionalConfigurator } from './components/InstitutionalConfigurator';
import { MultiModalSuite } from './components/MultiModalSuite';
import { FleetTerminal } from './components/FleetTerminal';
import { MultiModalStudio } from './components/MultiModalStudio';
import { ApexLogo } from './components/ApexLogo';
import { SovereignLoadingScreen } from './components/SovereignLoadingScreen';
import { CustomerUser, SubscriptionTier, PaymentTransaction } from './types';
import { ShieldCheck, Server, Database, Lock, Cpu, Key, ShieldAlert, ArrowRight, Zap, TrendingUp, Sliders, Activity } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveNavTab>(() => {
    try {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('developer') || path.includes('sandbox')) return 'developers';
      if (path.includes('security') || path.includes('compliance')) return 'security';
      if (path.includes('benchmark')) return 'benchmarks';
      if (path.includes('compute')) return 'compute';
      if (path.includes('architecture')) return 'architecture';
    } catch (_) {}
    return 'executive';
  });
  const [selectedFileForCodeExplorer, setSelectedFileForCodeExplorer] = useState<string>('config_py');
  const [tradingSubView, setTradingSubView] = useState<'all' | 'arbitrage' | 'sandbox' | 'nvlink' | 'multimodal'>('all');

  // Customer User Authentication & Session State
  const [currentUser, setCurrentUser] = useState<CustomerUser | null>(() => {
    try {
      const saved = localStorage.getItem('apex_customer_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => currentUser?.role === 'admin');

  // Recorded Transactions
  const [transactions, setTransactions] = useState<PaymentTransaction[]>(() => {
    try {
      const saved = localStorage.getItem('apex_transactions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [selectedTierForCheckout, setSelectedTierForCheckout] = useState<SubscriptionTier>(SUBSCRIPTION_TIERS[1]);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [telemetryToast, setTelemetryToast] = useState<{
    orderId: string;
    unitsAwarded: number;
    newBalance: number;
  } | null>(null);
  const [showBootScreen, setShowBootScreen] = useState(false);

  // Sync session changes to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('apex_customer_user', JSON.stringify(currentUser));
      if (currentUser.role === 'admin') {
        setIsAdminUnlocked(true);
      }
    } else {
      localStorage.removeItem('apex_customer_user');
      setIsAdminUnlocked(false);
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('apex_transactions', JSON.stringify(transactions));
  }, [transactions]);

  const handleLoginSuccess = (user: CustomerUser) => {
    setCurrentUser(user);
    if (user.role === 'admin') {
      setIsAdminUnlocked(true);
      setActiveTab('signer');
    } else {
      setActiveTab('portal');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsAdminUnlocked(false);
    setActiveTab('solutions');
  };

  const handleSelectTierForPurchase = (tier: SubscriptionTier, interval: 'monthly' | 'annual' = 'monthly') => {
    setSelectedTierForCheckout(tier);
    setBillingInterval(interval);
    setIsCheckoutModalOpen(true);
  };

  const handlePaymentSuccess = (tx: PaymentTransaction) => {
    setTransactions(prev => [tx, ...prev]);

    // Active Trigger: On PayPal payment completion on App.tsx, dispatch the order ID to POST /v1/billing/verify-paypal-order
    if (tx.paypalOrderId) {
      fetch('/v1/billing/verify-paypal-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: tx.paypalOrderId,
          tenant_id: tx.tenantId || currentUser?.tenantId || 'tenant-global-mesh',
          units: tx.creditsAwarded,
          compute_units: tx.creditsAwarded,
          amount: tx.amount,
          expected_amount: tx.amount,
          plan_id: tx.planId,
        }),
      }).catch(() => {});
    }

    if (currentUser) {
      const updatedCredits = currentUser.computeCredits + tx.creditsAwarded;
      const updatedUser: CustomerUser = {
        ...currentUser,
        plan: tx.planId as any,
        computeCredits: updatedCredits,
        maxQuota: currentUser.maxQuota + tx.creditsAwarded,
        subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
      setCurrentUser(updatedUser);

      // Real-Time Telemetry Toast: Show a glowing green confirmation banner displaying updated Compute Unit balance
      setTelemetryToast({
        orderId: tx.paypalOrderId,
        unitsAwarded: tx.creditsAwarded,
        newBalance: updatedCredits,
      });

      setTimeout(() => {
        setTelemetryToast(null);
      }, 8000);
    }
  };

  const handleExploreCode = (fileId: string) => {
    setSelectedFileForCodeExplorer(fileId);
    setActiveTab('code');
  };

  const handleOpenSandbox = (mode: string) => {
    setActiveTab('sandbox');
  };

  const handleElevateAdmin = (adminUser: CustomerUser) => {
    setCurrentUser(adminUser);
    setIsAdminUnlocked(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Target 3: Real-Time Telemetry Toast - Glowing Green Confirmation Banner */}
      {telemetryToast && (
        <div className="fixed top-5 right-5 z-50 max-w-md p-4 rounded-2xl bg-gradient-to-r from-emerald-950/95 via-[#051c14] to-emerald-950/90 border border-emerald-500/60 shadow-[0_0_35px_rgba(16,185,129,0.35)] backdrop-blur-md animate-in slide-in-from-top duration-300">
          <div className="flex items-center justify-between pb-2 border-b border-emerald-500/30">
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-emerald-400">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_10px_#10b981]" />
              </span>
              <span>SETTLEMENT TELEMETRY CONFIRMED</span>
            </div>
            <button
              onClick={() => setTelemetryToast(null)}
              className="text-slate-400 hover:text-white text-xs font-mono px-1.5 py-0.5 rounded hover:bg-slate-800/60 transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="pt-2 flex items-baseline justify-between font-mono">
            <span className="text-xs text-slate-300">Updated Compute Unit Balance:</span>
            <span className="text-xl font-black text-emerald-300">
              {telemetryToast.newBalance.toLocaleString()} CU
            </span>
          </div>
          <div className="text-[11px] font-mono text-emerald-400 mt-1 flex items-center justify-between">
            <span>+{telemetryToast.unitsAwarded.toLocaleString()} CU Credited</span>
            <span className="text-slate-400 text-[10px]">Order: {telemetryToast.orderId}</span>
          </div>
        </div>
      )}

      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        isAdminUnlocked={isAdminUnlocked}
      />
      <LivePlatformStatus />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {/* Master Executive Operating System Console (Default Primary Workspace) */}
        {activeTab === 'executive' && (
          <div className="py-4">
            <MasterExecutiveConsole
              currentUser={currentUser}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          </div>
        )}

        {/* Sovereign Executive Control Center & NVLink Telemetry Dashboard */}
        {activeTab === 'controlcenter' && (
          <div className="py-2">
            <SovereignDashboard
              currentUser={currentUser}
              onOpenAuth={() => setIsAuthModalOpen(true)}
              onOpenCheckout={() => handleSelectTierForPurchase(SUBSCRIPTION_TIERS[1], 'monthly')}
            />
          </div>
        )}

        {/* ApexSovereign.ai Institutional Trading Terminal & Four-Tier Storefront */}
        {activeTab === 'terminal' && (
          <div className="py-4 space-y-6">
            <FleetTerminal />
          </div>
        )}

        {/* Multi-Modal Sovereign Intelligence Studio */}
        {activeTab === 'multimodal' && (
          <div className="py-4 space-y-6">
            <MultiModalStudio />
          </div>
        )}

        {/* Customer Facing Views (Public Storefront & Portal) */}
        {activeTab === 'solutions' && (
          <SolutionsView
            onSelectPlan={(tier) => handleSelectTierForPurchase(tier, 'monthly')}
            onOpenConcierge={() => {
              // Trigger autonomous concierge chatbot
              const chatBtn = document.getElementById('btn-autonomous-chatbot-trigger');
              if (chatBtn) chatBtn.click();
            }}
            onNavigatePricing={() => setActiveTab('pricing')}
            onNavigateCrm={() => setActiveTab('crm')}
            onNavigateSwarm={() => setActiveTab('swarm')}
            onOpenControlPlane={() => setActiveTab('executive')}
            onExploreArchitecture={() => setActiveTab('architecture')}
            onNavigateDevelopers={() => setActiveTab('developers')}
            onNavigateSecurity={() => setActiveTab('security')}
          />
        )}

        {/* Module 1: The Tier 2 Developer Onboarding & Sandbox Portal */}
        {activeTab === 'developers' && (
          <div className="py-4 space-y-6">
            <DeveloperSandbox />
            <DeveloperPortal
              currentUser={currentUser}
              onOpenAuth={() => setIsAuthModalOpen(true)}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          </div>
        )}

        {/* Module 2: The Tier 3 Enterprise Trust & Compliance Layer */}
        {activeTab === 'security' && (
          <div className="py-4">
            <TrustComplianceHub />
          </div>
        )}

        {/* Technical Benchmarks & Arbitrage Comparison */}
        {activeTab === 'benchmarks' && (
          <div className="py-4 space-y-6">
            <TechnicalEvidencePanel />
            <CostIntelligenceOptimizer onDeployWorkload={() => handleSelectTierForPurchase(SUBSCRIPTION_TIERS[1], 'monthly')} />
          </div>
        )}

        {/* Module 3: Global Compute Swarm & Multi-AZ Federation */}
        {activeTab === 'compute' && (
          <div className="py-4 space-y-6">
            <FleetTicker />
            <InstitutionalConfigurator />
            <GlobalSwarmMap />
            <MeshFederationConsole currentUser={currentUser} />
          </div>
        )}

        {activeTab === 'pricing' && (
          <PricingPlans
            onSelectTier={handleSelectTierForPurchase}
            currentUser={currentUser}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        )}

        {/* Enterprise CRM & Sovereign Work OS */}
        {activeTab === 'crm' && (
          <div className="py-4">
            <EnterpriseCrmPipeline />
          </div>
        )}

        {/* 24/7 Autonomous Agent Swarm Operations */}
        {activeTab === 'swarm' && (
          <div className="py-4">
            <AutonomousAgentSwarm />
          </div>
        )}

        {/* ApexSovereign Neural Interface (Native Command Core) & Live Agent Operations */}
        {activeTab === 'neural' && (
          <div className="py-4 space-y-6">
            <AgentOperationsPanel currentUser={currentUser} />
            <NeuralChatInterface
              currentUser={currentUser}
              onOpenAuth={() => setIsAuthModalOpen(true)}
            />
          </div>
        )}

        {/* Sovereign Vault Perimeter & Automated Threat Defense Gateway */}
        {activeTab === 'vault' && (
          <div className="py-4">
            <VaultSecurityConsole currentUser={currentUser} />
          </div>
        )}

        {/* Autonomous Multi-Tenant Mesh Federation & Failover Controller */}
        {activeTab === 'mesh' && (
          <div className="py-4">
            <MeshFederationConsole currentUser={currentUser} />
          </div>
        )}

        {/* Automated AI Model Fine-Tuning Pipeline & Sovereign Inference Gateway */}
        {activeTab === 'tuning' && (
          <div className="py-4">
            <ModelTuningConsole currentUser={currentUser} />
          </div>
        )}

        {activeTab === 'portal' && (
          currentUser ? (
            <CustomerPortal
              user={currentUser}
              transactions={transactions}
              onOpenPricing={() => setActiveTab('pricing')}
              onUpdateUser={(u) => setCurrentUser(u)}
            />
          ) : (
            <div className="py-16 text-center space-y-4 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white">Client Authentication Required</h2>
              <p className="text-xs text-slate-400">
                Sign in to your isolated sovereign tenant partition to view compute quotas, manage API keys, and launch autonomous workloads.
              </p>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="py-2.5 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md cursor-pointer"
              >
                Sign In to Tenant Workspace
              </button>
            </div>
          )
        )}

        {/* Developer & Operations Console Views - Strictly Protected behind AdminAccessGate */}
        {activeTab === 'requirements' && (
          <AdminAccessGate
            currentUser={currentUser}
            onElevateAdmin={handleElevateAdmin}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onReturnToStorefront={() => setActiveTab('solutions')}
            toolName="Master Requirements & Global Config Engine"
          >
            <RequirementsEditor />
          </AdminAccessGate>
        )}

        {activeTab === 'signer' && (
          <AdminAccessGate
            currentUser={currentUser}
            onElevateAdmin={handleElevateAdmin}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onReturnToStorefront={() => setActiveTab('solutions')}
            toolName="6 Variables Signer & Secret Manager"
          >
            <VariableSigner />
          </AdminAccessGate>
        )}

        {activeTab === 'architecture' && (
          <div className="py-4 space-y-6">
            <TechnicalEvidencePanel />
            {isAdminUnlocked || currentUser?.role === 'admin' ? (
              <ArchitectureView
                onExploreCode={handleExploreCode}
                onOpenSandbox={handleOpenSandbox}
              />
            ) : (
              <AdminAccessGate
                currentUser={currentUser}
                onElevateAdmin={handleElevateAdmin}
                onOpenAuth={() => setIsAuthModalOpen(true)}
                onReturnToStorefront={() => setActiveTab('solutions')}
                toolName="Low-Level Architecture Specifications & Deep Inspection"
              >
                <ArchitectureView
                  onExploreCode={handleExploreCode}
                  onOpenSandbox={handleOpenSandbox}
                />
              </AdminAccessGate>
            )}
          </div>
        )}

        {activeTab === 'sandbox' && (
          <AdminAccessGate
            currentUser={currentUser}
            onElevateAdmin={handleElevateAdmin}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onReturnToStorefront={() => setActiveTab('solutions')}
            toolName="Autonomous Test Simulators & Webhook Replay"
          >
            <InteractiveSandbox />
          </AdminAccessGate>
        )}

        {activeTab === 'code' && (
          <AdminAccessGate
            currentUser={currentUser}
            onElevateAdmin={handleElevateAdmin}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onReturnToStorefront={() => setActiveTab('solutions')}
            toolName="Proprietary IP Codebase Inspection"
          >
            <CodeExplorer
              initialFileId={selectedFileForCodeExplorer}
              currentUser={currentUser}
              onElevateAdmin={handleElevateAdmin}
              onOpenAuth={() => setIsAuthModalOpen(true)}
            />
          </AdminAccessGate>
        )}

        {activeTab === 'schema' && (
          <AdminAccessGate
            currentUser={currentUser}
            onElevateAdmin={handleElevateAdmin}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onReturnToStorefront={() => setActiveTab('solutions')}
            toolName="Supabase PostgreSQL Schema & RLS Rules"
          >
            <SchemaViewer />
          </AdminAccessGate>
        )}

        {activeTab === 'deploy' && (
          <AdminAccessGate
            currentUser={currentUser}
            onElevateAdmin={handleElevateAdmin}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onReturnToStorefront={() => setActiveTab('solutions')}
            toolName="Enterprise Deployment & Infrastructure Guide"
          >
            <DeploymentGuide />
          </AdminAccessGate>
        )}
      </main>

      {/* Global Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      <PayPalCheckoutModal
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        tier={selectedTierForCheckout}
        billingInterval={billingInterval}
        currentUser={currentUser}
        onPaymentSuccess={handlePaymentSuccess}
        onRequireLogin={() => setIsAuthModalOpen(true)}
      />

      {/* Autonomous 24/7 AI Agent Chatbot & Inbound Lead Qualification */}
      <AutonomousAgentChatbot
        onOpenCheckout={(planId) => {
          const matchedTier = SUBSCRIPTION_TIERS.find((t) => t.id === planId) || SUBSCRIPTION_TIERS[1];
          setSelectedTierForCheckout(matchedTier);
          setIsCheckoutModalOpen(true);
        }}
      />

      {/* Enterprise Commercial Footer with Permanent Diamond Cyan Logo Lock */}
      <footer className="border-t border-slate-900 bg-slate-950/90 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            {/* Permanent Vector Emblem Lock */}
            <div 
              onClick={() => setActiveTab('executive')}
              className="flex items-center gap-2 cursor-pointer group"
              title="ApexSovereign.ai - Empire Core"
            >
              <ApexLogo size={22} glow variant="icon" />
              <span className="font-extrabold text-white text-xs font-sans tracking-tight">
                ApexSovereign<span className="text-[#00f0ff]">.ai</span>
              </span>
            </div>

            <span className="text-slate-800">•</span>

            <span className="flex items-center gap-1.5 font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>All Systems Operational</span>
            </span>

            <span className="text-slate-800">•</span>

            {/* Diagnostic Bootloader Trigger */}
            <button
              onClick={() => setShowBootScreen(true)}
              className="flex items-center gap-1 font-mono text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
              title="Run Cryptographic Kernel Diagnostics"
            >
              <Activity className="w-3 h-3 text-[#00f0ff] animate-pulse" />
              <span>Diagnostic Bootloader</span>
            </button>

            <span className="text-slate-800">•</span>
            <span>FastAPI 0.115</span>
            <span className="text-slate-800">•</span>
            <span>Supabase PostgreSQL (RLS Enforced)</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[11px] font-mono">
            <button
              onClick={() => setActiveTab('architecture')}
              className="hover:text-cyan-300 transition-colors cursor-pointer text-slate-400"
            >
              /architecture
            </button>
            <button
              onClick={() => setActiveTab('compute')}
              className="hover:text-cyan-300 transition-colors cursor-pointer text-slate-400"
            >
              /compute
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className="hover:text-cyan-300 transition-colors cursor-pointer text-slate-400"
            >
              /security
            </button>
            <button
              onClick={() => setActiveTab('benchmarks')}
              className="hover:text-cyan-300 transition-colors cursor-pointer text-slate-400"
            >
              /benchmarks
            </button>
            <button
              onClick={() => setActiveTab('developers')}
              className="hover:text-cyan-300 transition-colors cursor-pointer text-slate-400"
            >
              /developers
            </button>
            <span className="text-slate-700 hidden sm:inline">•</span>
            <button
              onClick={() => setActiveTab('solutions')}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('pricing')}
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors cursor-pointer"
            >
              Pricing
            </button>
            {currentUser && (
              <button
                onClick={() => setActiveTab('portal')}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Workspace
              </button>
            )}
            <span className="text-slate-700 hidden sm:inline">•</span>
            <button
              onClick={() => setActiveTab('signer')}
              className="text-slate-600 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
              title="Staff Administrative Access Gate"
            >
              <Lock className="w-3 h-3 text-slate-600" />
              <span>Staff Clearance</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Sovereign Command Loading & Diagnostic Splash Screen */}
      {showBootScreen && (
        <SovereignLoadingScreen
          onComplete={() => setShowBootScreen(false)}
          autoDismiss={false}
        />
      )}
    </div>
  );
}
