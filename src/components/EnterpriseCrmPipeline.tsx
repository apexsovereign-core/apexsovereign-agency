import React, { useState } from 'react';
import { CrmDealRecord, CrmStage, ProductivityDoc } from '../types';
import { 
  Building2, 
  DollarSign, 
  Cpu, 
  Sparkles, 
  Send, 
  FileText, 
  CheckCircle2, 
  Layers, 
  Mail, 
  ExternalLink, 
  Workflow, 
  Flame, 
  Clock, 
  ChevronRight, 
  Plus, 
  Check, 
  Copy, 
  Search, 
  BarChart2, 
  Share2, 
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

const INITIAL_DEALS: CrmDealRecord[] = [
  {
    id: 'deal_apex_891',
    companyName: 'Vanguard DeepMind Labs',
    contactName: 'Dr. Elena Rostova',
    contactEmail: 'e.rostova@vanguard-ai.org',
    valueUsd: 144000,
    computeUnitsMonthly: 1200000,
    stage: 'CLOSED_ACTIVE_COMPUTE',
    winProbability: 100,
    aiSentiment: 'HIGH_INTENT',
    clusterTarget: 'H100_SXM5',
    zeroTouchLogs: [
      'Inbound query parsed via Autonomous Concierge (Session #902)',
      'Lead Score: 98/100 • Priority Rank: SOVEREIGN_HOT',
      'PayPal Enterprise subscription validated ($12,000/mo)',
      'Automated Resend transactional proposal dispatched & counter-signed',
      '8x H100 SXM5 GPU lease allocated on bare-metal node ashburn-04'
    ],
    lastActivity: '2 mins ago',
    createdAt: '2026-09-17',
    resendProposalSent: true,
    paypalInvoiceLinked: true
  },
  {
    id: 'deal_apex_892',
    companyName: 'OmniGlobal Logistics Inc',
    contactName: 'Marcus Sterling',
    contactEmail: 'm.sterling@omniglobal.ch',
    valueUsd: 78000,
    computeUnitsMonthly: 500000,
    stage: 'HMAC_LEASE_PROVISIONED',
    winProbability: 85,
    aiSentiment: 'URGENT',
    clusterTarget: 'HYBRID_DISTRIBUTED',
    zeroTouchLogs: [
      'Webhook ingested from CRM conduit: Freight optimization request',
      'Auto-calculated ROI: $412,000 annual manual drag eliminated',
      'HMAC token lease generated: lease_tok_89a42f with 24h validity',
      'Waiting for final PayPal billing authorization token capture'
    ],
    lastActivity: '14 mins ago',
    createdAt: '2026-09-18',
    resendProposalSent: true,
    paypalInvoiceLinked: true
  },
  {
    id: 'deal_apex_893',
    companyName: 'Aether Bio-Informatics',
    contactName: 'Dr. Sarah Chen',
    contactEmail: 'schen@aetherbio.io',
    valueUsd: 216000,
    computeUnitsMonthly: 2500000,
    stage: 'SECURITY_CLEARANCE',
    winProbability: 70,
    aiSentiment: 'TECHNICAL_DEEP',
    clusterTarget: 'H100_SXM5',
    zeroTouchLogs: [
      'Technical validation agent checked ISO 27001 & HIPAA compliance requirements',
      'Supabase multi-tenant RLS schema isolated to schema tenant_aether_bio',
      'Drafted SLA contract with 99.999% uptime guarantee'
    ],
    lastActivity: '1 hour ago',
    createdAt: '2026-09-19',
    resendProposalSent: true,
    paypalInvoiceLinked: false
  },
  {
    id: 'deal_apex_894',
    companyName: 'FinNova Quantum Analytics',
    contactName: 'Julian Thorne',
    contactEmail: 'jthorne@finnova-capital.co.uk',
    valueUsd: 48000,
    computeUnitsMonthly: 300000,
    stage: 'QUALIFIED_OPPORTUNITY',
    winProbability: 60,
    aiSentiment: 'HIGH_INTENT',
    clusterTarget: 'A100_SXM4',
    zeroTouchLogs: [
      'Inbound query evaluated: Algorithmic risk modeling',
      'Automated Resend technical overview sent with PayPal direct checkout URL'
    ],
    lastActivity: '3 hours ago',
    createdAt: '2026-09-19',
    resendProposalSent: true,
    paypalInvoiceLinked: false
  }
];

const STAGES: { id: CrmStage; label: string; badgeColor: string }[] = [
  { id: 'DISCOVERY', label: 'Discovery', badgeColor: 'bg-slate-800 text-slate-300' },
  { id: 'QUALIFIED_OPPORTUNITY', label: 'Qualified', badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { id: 'SECURITY_CLEARANCE', label: 'Security Review', badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { id: 'HMAC_LEASE_PROVISIONED', label: 'HMAC Leased', badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { id: 'CLOSED_ACTIVE_COMPUTE', label: 'Active Compute', badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
];

const INITIAL_DOCS: ProductivityDoc[] = [
  {
    id: 'doc_sla_vanguard',
    title: 'Enterprise High-Availability SLA & Bare-Metal GPU Allocation Spec',
    category: 'SLA_SPEC',
    collaborators: ['Dr. Elena Rostova', 'Chief Architect (Apex)', 'Autonomous Scribe Agent'],
    content: `# APEXSOVEREIGN ENTERPRISE SERVICE LEVEL SPECIFICATION
**Tenant Identifier:** tenant_vanguard_deepmind_01
**Cluster Architecture:** 8x NVIDIA H100 SXM5 80GB (PCIe Gen5, 3.2TB/s InfiniBand)
**Guaranteed Uptime:** 99.999% Hardware Node Availability
**Settlement Mechanism:** Continuous Ledger Sync via Live PayPal Subscriptions v2

## 1. Zero-Downtime Failover Conduits
The tenant compute mesh is provisioned with automated hot-spare routing across us-east-1 and eu-central-1. If any GPU worker suffers thermal throttling or memory ECC faults, workloads migrate in <350ms with zero state loss.

## 2. Cryptographic Access Leases
Execution nodes require signed HMAC tokens with rotating 24-hour expirations, enforced at the kernel level via eBPF filters.`,
    lastEdited: 'Just now',
    autoSynced: true,
    agentApproved: true,
    securityClearance: 'RESTRICTED_SOVEREIGN'
  },
  {
    id: 'doc_runbook_omni',
    title: 'OmniGlobal Logistics Autonomous Agentic Routing Runbook',
    category: 'COMPUTE_RUNBOOK',
    collaborators: ['Marcus Sterling', 'Autonomous Triage Agent'],
    content: `# RUNBOOK: CROSS-BORDER SUPPLY CHAIN INGESTION PIPELINE
- Event Ingest Rate: 12,500 webhook events/sec
- Database Isolation: Supabase PostgreSQL with active RLS policy \`tenant_id = 'tenant_omniglobal'\`
- Double-Entry Ledger: Every transaction processed with \`SELECT ... FOR UPDATE\` lock to guarantee idempotency.`,
    lastEdited: '18 mins ago',
    autoSynced: true,
    agentApproved: true,
    securityClearance: 'CONFIDENTIAL'
  }
];

export const EnterpriseCrmPipeline: React.FC = () => {
  const [deals, setDeals] = useState<CrmDealRecord[]>(INITIAL_DEALS);
  const [selectedDeal, setSelectedDeal] = useState<CrmDealRecord>(INITIAL_DEALS[0]);
  const [activeSubTab, setActiveSubTab] = useState<'pipeline' | 'docs' | 'conduits'>('pipeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [docs, setDocs] = useState<ProductivityDoc[]>(INITIAL_DOCS);
  const [selectedDoc, setSelectedDoc] = useState<ProductivityDoc>(INITIAL_DOCS[0]);
  const [isCopied, setIsCopied] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const totalPipelineValue = deals.reduce((acc, d) => acc + d.valueUsd, 0);
  const totalComputeCommitted = deals.reduce((acc, d) => acc + d.computeUnitsMonthly, 0);
  const activeComputeDeals = deals.filter(d => d.stage === 'CLOSED_ACTIVE_COMPUTE');

  const handleAdvanceStage = (dealId: string) => {
    const stageOrder: CrmStage[] = [
      'DISCOVERY',
      'QUALIFIED_OPPORTUNITY',
      'SECURITY_CLEARANCE',
      'HMAC_LEASE_PROVISIONED',
      'CLOSED_ACTIVE_COMPUTE'
    ];

    setDeals(prev => prev.map(deal => {
      if (deal.id !== dealId) return deal;
      const currentIndex = stageOrder.indexOf(deal.stage);
      if (currentIndex < stageOrder.length - 1) {
        const nextStage = stageOrder[currentIndex + 1];
        const updatedDeal: CrmDealRecord = {
          ...deal,
          stage: nextStage,
          winProbability: Math.min(100, deal.winProbability + 15),
          lastActivity: 'Just now',
          zeroTouchLogs: [
            `Stage advanced to ${nextStage.replace(/_/g, ' ')} via Autonomous Agent Pipeline`,
            ...deal.zeroTouchLogs
          ]
        };
        if (selectedDeal.id === dealId) setSelectedDeal(updatedDeal);
        showNotice(`Advanced ${deal.companyName} to ${nextStage.replace(/_/g, ' ')}`);
        return updatedDeal;
      }
      return deal;
    }));
  };

  const handleSendResendProposal = (deal: CrmDealRecord) => {
    showNotice(`Resend transactional proposal re-dispatched to ${deal.contactEmail}`);
    setDeals(prev => prev.map(d => {
      if (d.id === deal.id) {
        const updated = {
          ...d,
          resendProposalSent: true,
          zeroTouchLogs: [
            `Automated Resend transactional proposal sent to ${deal.contactEmail} (Status: DELIVERED)`,
            ...d.zeroTouchLogs
          ]
        };
        if (selectedDeal.id === d.id) setSelectedDeal(updated);
        return updated;
      }
      return d;
    }));
  };

  const handleProvisionHmac = (deal: CrmDealRecord) => {
    const newLease = 'lease_tok_' + Math.random().toString(36).substring(2, 10);
    showNotice(`Provisioned HMAC cryptographic lease: ${newLease}`);
    setDeals(prev => prev.map(d => {
      if (d.id === deal.id) {
        const updated = {
          ...d,
          stage: 'HMAC_LEASE_PROVISIONED' as CrmStage,
          winProbability: Math.max(90, d.winProbability),
          zeroTouchLogs: [
            `Provisioned cryptographic execution lease (${newLease}) with sub-ms broker clearance`,
            ...d.zeroTouchLogs
          ]
        };
        if (selectedDeal.id === d.id) setSelectedDeal(updated);
        return updated;
      }
      return d;
    }));
  };

  const filteredDeals = deals.filter(d => 
    d.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.clusterTarget.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 right-6 z-50 p-3.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-slate-950" />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Banner: Sovereign Pipeline Synthesis */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-semibold mb-1">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>SOVEREIGN PIPELINE & COLLABORATIVE PRODUCTIVITY SYNTHESIS</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            Autonomous CRM & Collaborative Productivity Core
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Zero-manual-entry opportunity tracking fused with live document conduits, instant PayPal recurring subscription synchronization, and automated cryptographic lease provisioning.
          </p>
        </div>

        {/* Global Summary Metrics */}
        <div className="flex items-center gap-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-right">
            <div className="text-slate-500 text-[10px] font-mono uppercase">Total Pipeline</div>
            <div className="text-emerald-400 font-mono font-extrabold text-base sm:text-lg">
              ${(totalPipelineValue).toLocaleString()}/yr
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-right">
            <div className="text-slate-500 text-[10px] font-mono uppercase">Compute Committed</div>
            <div className="text-indigo-400 font-mono font-extrabold text-base sm:text-lg">
              {(totalComputeCommitted).toLocaleString()} CU/mo
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-right">
            <div className="text-slate-500 text-[10px] font-mono uppercase">Active Nodes</div>
            <div className="text-white font-mono font-extrabold text-base sm:text-lg">
              {activeComputeDeals.length} Clusters
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('pipeline')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'pipeline'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Autonomous Pipeline (Sovereign Engine)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('docs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'docs'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Productivity Conduits (Sovereign Docs)</span>
          </button>
        </div>

        {activeSubTab === 'pipeline' && (
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search companies, contacts, clusters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        )}
      </div>

      {/* VIEW 1: SOVEREIGN PIPELINE */}
      {activeSubTab === 'pipeline' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Deal Cards & Stage Kanban (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>{filteredDeals.length} Active Enterprise Accounts</span>
              <span className="font-mono text-emerald-400">100% Zero Manual Entry via Autonomous Ingestion</span>
            </div>

            <div className="space-y-3">
              {filteredDeals.map((deal) => {
                const isSelected = selectedDeal.id === deal.id;
                return (
                  <div
                    key={deal.id}
                    onClick={() => setSelectedDeal(deal)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-slate-900 border-emerald-500/50 shadow-lg shadow-emerald-950/20' 
                        : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{deal.companyName}</h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {deal.clusterTarget}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {deal.contactName} • <span className="font-mono text-slate-500">{deal.contactEmail}</span>
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-bold font-mono text-emerald-400">
                          ${(deal.valueUsd).toLocaleString()}/yr
                        </div>
                        <div className="text-[11px] font-mono text-indigo-400">
                          {(deal.computeUnitsMonthly).toLocaleString()} CU/mo
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar & Stage Indicator */}
                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase text-slate-500">Stage:</span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          {deal.stage.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-[11px] font-mono text-slate-400">
                          Win Prob: <strong className="text-emerald-400">{deal.winProbability}%</strong>
                        </div>
                        <span className="text-slate-600">•</span>
                        <span className="text-[11px] text-slate-500">{deal.lastActivity}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Deep Deal Workspace & Autonomous Execution Controls (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
                    {selectedDeal.companyName.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedDeal.companyName}</h3>
                    <p className="text-[11px] text-slate-400 font-mono">ID: {selectedDeal.id}</p>
                  </div>
                </div>

                <span className="px-2 py-1 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {selectedDeal.aiSentiment}
                </span>
              </div>

              {/* Deal Overview Table */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-500">ANNUAL CONTRACT VALUE</div>
                  <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
                    ${(selectedDeal.valueUsd).toLocaleString()}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-500">COMPUTE ALLOCATION</div>
                  <div className="text-base font-bold font-mono text-indigo-400 mt-0.5">
                    {(selectedDeal.computeUnitsMonthly).toLocaleString()} CU
                  </div>
                </div>
              </div>

              {/* Autonomous Stage Progression Button */}
              {selectedDeal.stage !== 'CLOSED_ACTIVE_COMPUTE' ? (
                <button
                  type="button"
                  onClick={() => handleAdvanceStage(selectedDeal.id)}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-950"
                >
                  <span>Advance to Next Stage</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Account Fully Provisioned • Active On-Demand Compute Streaming</span>
                </div>
              )}

              {/* Instant Autonomous Actions */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  AUTONOMOUS CONDUIT TRIGGERS
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendResendProposal(selectedDeal)}
                    className="p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Dispatch Resend PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProvisionHmac(selectedDeal)}
                    className="p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                    <span>Issue HMAC Lease</span>
                  </button>
                </div>
              </div>

              {/* Zero-Touch Audit Event Stream */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    ZERO-TOUCH AGENT AUDIT LOG
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">AUTOPILOT</span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedDeal.zeroTouchLogs.map((log, i) => (
                    <div key={i} className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span className="leading-tight">{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: SOVEREIGN PRODUCTIVITY CONDUITS */}
      {activeSubTab === 'docs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Document Index (4 Cols) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="text-xs text-slate-400 px-1 font-mono uppercase">
              Collaborative Runbooks & SLA Specifications
            </div>
            {docs.map((doc) => {
              const isSelected = selectedDoc.id === doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 border-indigo-500/50 shadow-lg'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-white line-clamp-1">{doc.title}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {doc.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400 font-mono">
                    <span>{doc.collaborators.length} Collaborators</span>
                    <span>•</span>
                    <span>{doc.lastEdited}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Document Editor & Live Execution Conduit (8 Cols) */}
          <div className="lg:col-span-8 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">{selectedDoc.title}</h3>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                  <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-400" /> Auto-Synced to Supabase
                  </span>
                  <span>•</span>
                  <span className="font-mono text-[10px] text-slate-500">Security: {selectedDoc.securityClearance}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedDoc.content);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{isCopied ? 'Copied' : 'Copy Spec'}</span>
                </button>
              </div>
            </div>

            {/* Document Content Canvas */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {selectedDoc.content}
            </div>

            {/* Collaborator Conduit Footer */}
            <div className="pt-2 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Active conduits:</span>
                {selectedDoc.collaborators.map((c, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300">
                    {c}
                  </span>
                ))}
              </div>
              <span className="text-[10px] font-mono text-emerald-400">ISO/IEC 27001 REVISION AUDITED</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
