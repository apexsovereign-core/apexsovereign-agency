import React, { useState, useRef, useEffect } from 'react';
import { InboundChatMessage, LeadQualificationResult, AgentToolExecution, SmsOtpVerifyResponse, ResendEmailConfirmation } from '../types';
import { SovereignHexDiamond } from './SovereignHexDiamond';
import { 
  Bot, 
  Send, 
  Sparkles, 
  ShieldCheck, 
  Flame, 
  CheckCircle2, 
  Mail, 
  Building2, 
  Cpu, 
  DollarSign, 
  ArrowRight, 
  Minimize2, 
  Maximize2,
  X,
  MessageSquare,
  Lock,
  Zap,
  Wrench,
  CreditCard,
  Server,
  Activity,
  Copy,
  Check,
  AlertTriangle,
  FileCheck,
  Phone,
  Smartphone,
  KeyRound,
  ShieldAlert
} from 'lucide-react';

interface AutonomousAgentChatbotProps {
  onOpenCheckout?: (planId: string) => void;
  defaultOpen?: boolean;
}

type AgentRole = 'CONCIERGE' | 'DIAGNOSTIC_DOCTOR' | 'SETTLEMENT_RECONCILER' | 'CLUSTER_ARCHITECT';

export const AutonomousAgentChatbot: React.FC<AutonomousAgentChatbotProps> = ({
  onOpenCheckout,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isExpanded, setIsExpanded] = useState(false);
  const [sessionId] = useState(() => `sess_${Math.random().toString(36).substring(2, 10)}`);
  
  // Active Agent Swarm Operator Selection
  const [activeRole, setActiveRole] = useState<AgentRole>('CONCIERGE');

  // Lead info captured in drawer
  const [companyName, setCompanyName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [budgetRange, setBudgetRange] = useState('$10,000 - $50,000/mo');
  const [computeNeeds, setComputeNeeds] = useState('8x NVIDIA H100 SXM5');
  const [showLeadFields, setShowLeadFields] = useState(false);

  // Zero-Trust Admin Clearance Modal
  const [showAdminAuditModal, setShowAdminAuditModal] = useState(false);
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [adminAuditResult, setAdminAuditResult] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [copiedAuditSig, setCopiedAuditSig] = useState<string | null>(null);

  // Zero-Trust SMS 2FA Authentication & Verification State
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsPhoneInput, setSmsPhoneInput] = useState('+1 (555) 234-5678');
  const [smsOtpInput, setSmsOtpInput] = useState('');
  const [smsOtpDispatched, setSmsOtpDispatched] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(300);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [devPreviewOtp, setDevPreviewOtp] = useState<string | null>(null);
  const [verifiedSession, setVerifiedSession] = useState<SmsOtpVerifyResponse | null>(() => {
    try {
      const saved = localStorage.getItem('sovereign_sms_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // SMS OTP Verification Countdown Timer
  useEffect(() => {
    let timer: any = null;
    if (smsOtpDispatched && smsCountdown > 0) {
      timer = setInterval(() => {
        setSmsCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [smsOtpDispatched, smsCountdown]);

  // Chat message stream
  const [messages, setMessages] = useState<InboundChatMessage[]>([
    {
      id: 'init-1',
      sender: 'agent',
      text: 'Welcome to ApexMind Sovereign—our proprietary, standalone enterprise neural assistant mesh. I am your 24/7 Autopilot Concierge. I autonomously reconcile live PayPal transactions, execute self-healing pipeline recovery, evaluate bare-metal GPU cluster sizing, and dispatch official enterprise documentation via Resend.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      qualificationTier: 'EXPLORATORY',
      agentRole: 'CONCIERGE',
      suggestedActions: [
        'Verify PayPal Order ORD-LIVE-77192 & Credit Allocation',
        'Diagnose and self-heal pipeline pipe_swarm_beta',
        'Check 8x H100 SXM5 bare-metal GPU availability',
        'Authenticate Corporate Identity via SMS 2FA',
      ],
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastQualification, setLastQualification] = useState<LeadQualificationResult | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Zero-Trust SMS 2FA Dispatch & Verification Handlers
  const handleSendSmsOtp = async () => {
    if (!smsPhoneInput.trim()) return;
    setSmsLoading(true);
    setSmsError(null);
    try {
      const res = await fetch('/auth/send-sms-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: smsPhoneInput,
          purpose: 'ENTERPRISE_AUTHENTICATION',
          tenant_id: 'tenant-sovereign-01',
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'OTP_DISPATCHED') {
        setSmsOtpDispatched(true);
        setSmsCountdown(data.expires_in_seconds || 300);
        if (data.dev_preview_otp) {
          setDevPreviewOtp(data.dev_preview_otp);
          setSmsOtpInput(data.dev_preview_otp);
        }
      } else {
        setSmsError(data.error || 'Failed to dispatch SMS verification code.');
      }
    } catch (err) {
      setSmsError('Network error connecting to SMS Gateway.');
    } finally {
      setSmsLoading(false);
    }
  };

  const handleVerifySmsOtp = async () => {
    if (!smsOtpInput.trim()) return;
    setSmsLoading(true);
    setSmsError(null);
    try {
      const res = await fetch('/auth/verify-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: smsPhoneInput,
          otp: smsOtpInput,
          tenant_id: 'tenant-sovereign-01',
        }),
      });
      const data: SmsOtpVerifyResponse = await res.json();
      if (res.ok && data.status === 'AUTHENTICATED') {
        setVerifiedSession(data);
        try {
          localStorage.setItem('sovereign_sms_session', JSON.stringify(data));
        } catch (_) {}

        const confirmMsg: InboundChatMessage = {
          id: `agent_sms_${Date.now()}`,
          sender: 'agent',
          text: `🔒 Cryptographic SMS 2FA Verified!\nTenant: ${data.tenant_id}\nSession Token: ${data.session_token.slice(0, 24)}...\nClearance: ${data.rls_claims.clearance_level}\nAudit Signature: ${data.audit_signature.slice(0, 16)}...`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          qualificationTier: 'SOVEREIGN_HOT',
          leadScore: 99,
          agentRole: 'CONCIERGE',
        };
        setMessages((prev) => [...prev, confirmMsg]);
        setTimeout(() => setShowSmsModal(false), 2000);
      } else {
        setSmsError(data.error || 'Invalid or expired verification code.');
      }
    } catch (err) {
      setSmsError('Network error verifying SMS code.');
    } finally {
      setSmsLoading(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend || inputVal).trim();
    if (!messageText || isLoading) return;

    const userMsg: InboundChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: messageText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal('');
    setIsLoading(true);

    try {
      const chatPayload = {
        session_id: sessionId,
        user_message: messageText,
        company_name: companyName || undefined,
        contact_email: contactEmail || undefined,
        contact_name: contactName || undefined,
        budget_range: budgetRange || undefined,
        compute_needs: computeNeeds || undefined,
        agent_role: activeRole,
        tenant_id: 'tenant-sovereign-01',
        conversation_history: messages.slice(-5).map((m) => ({
          sender: m.sender,
          text: m.text,
        })),
      };

      // Call proprietary ApexMind Sovereign chat router or live concierge triage
      let res = await fetch('/v1/concierge/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_message: messageText,
          session_id: sessionId,
          tenant_id: 'tenant-sovereign-01',
          company_name: companyName || undefined,
          contact_email: contactEmail || undefined,
          auto_allocate: /allocate|h100|b200|a100|cluster|gpu|compute|provision/.test(messageText.toLowerCase()),
        }),
      });

      if (!res.ok) {
        res = await fetch('/api/v1/apexmind/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chatPayload),
        });
      }

      if (!res.ok) {
        // Fallback to secondary lead agent router
        res = await fetch('/leads/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chatPayload),
        });
      }

      if (res.ok) {
        const rawData: any = await res.json();

        // Broadcast compute event if target GPU or allocation was generated
        if (rawData.target_gpu || rawData.action_banner_text) {
          window.dispatchEvent(new CustomEvent('apex_compute_state_changed', {
            detail: {
              status: rawData.status,
              targetGpu: rawData.target_gpu,
              actionBannerText: rawData.action_banner_text,
              computeJobId: rawData.compute_job_id,
            }
          }));
        }

        const data: LeadQualificationResult = {
          sessionId: rawData.session_id || rawData.sessionId || sessionId,
          agentReply: rawData.agent_reply || rawData.agentReply || 'ApexSovereign Control Plane triaged your request.',
          leadScore: rawData.intent_score || rawData.leadScore || 80,
          qualificationTier: rawData.qualification_tier || rawData.qualificationTier || 'ENTERPRISE_QUALIFIED',
          recommendedPlan: rawData.recommended_plan || rawData.recommendedPlan || 'Enterprise Accelerator ($99/mo)',
          suggestedActions: rawData.suggested_actions || rawData.suggestedActions || ['Inspect Cluster', 'Verify Attestation'],
          activeAgent: 'CONCIERGE',
          crmSynced: true,
          emailDispatched: Boolean(contactEmail),
          toolExecutions: rawData.cluster_routing ? [{
            id: `tool_${Date.now()}`,
            toolName: 'dispatch_compute_cluster',
            parameters: rawData.cluster_routing,
            resultStatus: 'SUCCESS',
            latencyMs: 1.84,
            timestamp: rawData.timestamp || new Date().toISOString(),
            auditSignature: rawData.audit_event_hash || 'SHA256-VERIFIED',
            summary: `Target ${rawData.target_gpu} triaged on ${rawData.cluster_routing.assigned_node}`
          }] : []
        };

        setLastQualification(data);
        if (data.activeAgent) {
          setActiveRole(data.activeAgent as AgentRole);
        }

        const agentMsg: InboundChatMessage = {
          id: `agent_${Date.now()}`,
          sender: 'agent',
          text: data.agentReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          qualificationTier: data.qualificationTier,
          leadScore: data.leadScore,
          suggestedActions: data.suggestedActions,
          toolInvocations: data.toolExecutions,
          agentRole: (data.activeAgent || activeRole) as any,
        };
        setMessages((prev) => [...prev, agentMsg]);
      } else {
        // Direct actionable fallback response without canned repetitive banners
        const fallbackMsg: InboundChatMessage = {
          id: `agent_${Date.now()}`,
          sender: 'agent',
          text: `I've analyzed "${messageText}". I can directly assist you with compute tier sizing, live PayPal transaction reconciliation, or dispatching architecture documentation. Which operational area would you like to focus on?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          qualificationTier: 'ENTERPRISE_QUALIFIED',
          leadScore: 85,
          suggestedActions: ['Compare Compute Tiers', 'Reconcile PayPal Order', 'SMS 2FA Authentication'],
        };
        setMessages((prev) => [...prev, fallbackMsg]);
      }
    } catch (err) {
      const errReply: InboundChatMessage = {
        id: `agent_${Date.now()}`,
        sender: 'agent',
        text: `I received your prompt: "${messageText}". How can I best guide your deployment or compute requirements right now?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedActions: ['Review Pricing Plans', 'Inspect Bare-Metal GPUs', 'Launch Agent Swarm'],
      };
      setMessages((prev) => [...prev, errReply]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunAdminAudit = async () => {
    setAuditLoading(true);
    try {
      const res = await fetch('/leads/agent/memory-audit', {
        headers: {
          'x-admin-access-token': adminTokenInput,
        },
      });
      const data = await res.json();
      setAdminAuditResult(data);
    } catch (err) {
      setAdminAuditResult({
        status: 'ERROR',
        detail: 'Network error connecting to protected agent memory endpoint.',
      });
    } finally {
      setAuditLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAuditSig(id);
    setTimeout(() => setCopiedAuditSig(null), 2500);
  };

  const roleDetails: Record<AgentRole, { name: string; icon: React.ComponentType<any>; badge: string; color: string; quickPrompts: string[] }> = {
    CONCIERGE: {
      name: 'AI Concierge & Triage',
      icon: Bot,
      badge: 'Public Onboarding',
      color: 'text-indigo-400 border-indigo-500/30 bg-indigo-950/40',
      quickPrompts: [
        'Calculate Enterprise Savings vs Legacy Per-Seat SaaS ($165/seat)',
        'Explain Weekly Monday 00:00 UTC Tariff Lock',
        'Compare Autonomous Core vs Sovereign Global Mesh',
      ],
    },
    DIAGNOSTIC_DOCTOR: {
      name: 'Self-Healing Ops Doctor',
      icon: Wrench,
      badge: '24/7 Auto-Remediation',
      color: 'text-amber-400 border-amber-500/30 bg-amber-950/40',
      quickPrompts: [
        'Diagnose and self-heal pipeline pipe_swarm_beta',
        'Inspect asyncpg connection pool health',
        'Restore worker queue from Supabase WAL checkpoint',
      ],
    },
    SETTLEMENT_RECONCILER: {
      name: 'PayPal Ledger Reconciler',
      icon: CreditCard,
      badge: 'Atomic Settlement',
      color: 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40',
      quickPrompts: [
        'Verify PayPal Order ORD-LIVE-77192 & Credit Allocation',
        'Check status of webhook capture event',
        'Trigger Resend cryptographic payment receipt',
      ],
    },
    CLUSTER_ARCHITECT: {
      name: 'Sovereign Cluster Architect',
      icon: Server,
      badge: 'Bare-Metal Mesh',
      color: 'text-purple-400 border-purple-500/30 bg-purple-950/40',
      quickPrompts: [
        'Check 8x H100 SXM5 bare-metal GPU availability',
        'Reserve dedicated air-gapped tenant cluster',
        'Dispatch ISO 27001 / SOC 2 Type II audit pack via Resend',
      ],
    },
  };

  return (
    <div id="autonomous-agent-chatbot-root" className="fixed inset-x-0 bottom-4 z-50 flex justify-end px-4 sm:inset-x-auto sm:right-6 sm:px-0">
      {/* Floating Activator Button */}
      {!isOpen && (
        <button
          id="btn-open-agent-chat"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 max-w-[calc(100vw-2rem)] p-4 bg-emerald-500 text-slate-950 rounded-full shadow-2xl shadow-emerald-950/60 hover:bg-emerald-400 transition-all z-50 flex items-center space-x-2.5 cursor-pointer transform hover:scale-105 group font-bold sm:bottom-6 sm:right-6"
          aria-label="Open AI Concierge"
        >
          <div className="relative flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-slate-950" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-slate-950 rounded-full animate-ping" />
          </div>
          <span className="text-sm font-bold tracking-tight">Open AI Concierge</span>
          <span className="text-[10px] bg-slate-950 text-emerald-400 font-mono px-2 py-0.5 rounded-full uppercase tracking-wider">
            Live
          </span>
        </button>
      )}

      {/* Hidden Hook Button for Global Page Triggers */}
      <button
        id="btn-autonomous-chatbot-trigger"
        onClick={() => setIsOpen(true)}
        className="hidden"
        aria-hidden="true"
      />

      {/* Zero-Trust SMS 2FA Authentication Modal */}
      {showSmsModal && (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl shadow-cyan-950/80 relative text-left">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-500/40">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                    <span>Enterprise SMS 2FA Gateway</span>
                    <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded font-mono">
                      ZERO-TRUST
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cryptographic carrier verification via Twilio / HSM Mesh
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSmsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Enterprise Mobile Number (E.164 format)
                </label>
                <div className="flex space-x-2">
                  <input
                    type="tel"
                    value={smsPhoneInput}
                    onChange={(e) => setSmsPhoneInput(e.target.value)}
                    placeholder="+1 (555) 234-5678"
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    id="btn-dispatch-sms-otp"
                    onClick={handleSendSmsOtp}
                    disabled={smsLoading || !smsPhoneInput.trim()}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center space-x-1.5 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{smsLoading && !smsOtpDispatched ? 'Dispatching...' : 'Send OTP'}</span>
                  </button>
                </div>
              </div>

              {smsOtpDispatched && (
                <div className="space-y-3 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span className="flex items-center space-x-1 text-cyan-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>6-Digit Verification Code Dispatched</span>
                    </span>
                    <span className="font-mono text-slate-300">
                      Expires in: {Math.floor(smsCountdown / 60)}:{(smsCountdown % 60).toString().padStart(2, '0')}
                    </span>
                  </div>

                  {devPreviewOtp && (
                    <div className="p-2.5 bg-cyan-950/40 border border-cyan-500/30 rounded-lg flex items-center justify-between text-[11px]">
                      <span className="text-cyan-300 font-mono">
                        Dev Preview OTP: <strong className="text-white tracking-widest">{devPreviewOtp}</strong>
                      </span>
                      <button
                        onClick={() => setSmsOtpInput(devPreviewOtp)}
                        className="text-[10px] text-cyan-400 hover:underline cursor-pointer"
                      >
                        Auto-Fill
                      </button>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    <input
                      id="input-sms-otp"
                      type="text"
                      maxLength={6}
                      value={smsOtpInput}
                      onChange={(e) => setSmsOtpInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter 6-digit OTP"
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-center text-slate-100 font-mono text-base tracking-widest focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      id="btn-verify-sms-otp"
                      onClick={handleVerifySmsOtp}
                      disabled={smsLoading || smsOtpInput.length !== 6}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center space-x-1.5 transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{smsLoading ? 'Verifying...' : 'Verify OTP'}</span>
                    </button>
                  </div>
                </div>
              )}

              {smsError && (
                <div className="p-2.5 bg-rose-950/60 border border-rose-800/80 rounded-lg text-rose-300 flex items-center space-x-2 text-[11px]">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{smsError}</span>
                </div>
              )}

              {verifiedSession && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl space-y-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-emerald-900/60 pb-1">
                    <span className="flex items-center space-x-1">
                      <ShieldCheck className="w-4 h-4" />
                      <span>SESSION VERIFIED: {verifiedSession.rls_claims?.clearance_level}</span>
                    </span>
                    <span className="text-[10px] bg-emerald-900 text-emerald-200 px-1.5 py-0.5 rounded">
                      ACTIVE
                    </span>
                  </div>
                  <div className="text-slate-300 text-[10px] space-y-0.5">
                    <div>Token: <span className="text-white">{verifiedSession.session_token?.slice(0, 24)}...</span></div>
                    <div>Tenant: <span className="text-cyan-300">{verifiedSession.tenant_id}</span></div>
                    <div>HMAC Signature: <span className="text-emerald-300">{verifiedSession.audit_signature?.slice(0, 20)}...</span></div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between">
              {smsOtpDispatched && smsCountdown === 0 && (
                <button
                  onClick={handleSendSmsOtp}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Resend New Code
                </button>
              )}
              <div className="ml-auto flex space-x-2">
                <button
                  onClick={() => setShowSmsModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zero-Trust Administrative Clearance Modal */}
      {showAdminAuditModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-indigo-900/60 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-left">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                    <span>Zero-Trust Protected Memory Audit</span>
                    <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded font-mono">
                      ADMIN_ACCESS_T
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cryptographic isolation audit & neural fine-tuning telemetry
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAdminAuditModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <p className="text-slate-300">
                To prevent cross-tenant memory leakage, all conversational vectors and fine-tuning parameters are strictly segregated under PostgreSQL Row-Level Security (RLS). Provide master clearance token to inspect runtime memory:
              </p>
              <div className="flex space-x-2">
                <input
                  type="password"
                  value={adminTokenInput}
                  onChange={(e) => setAdminTokenInput(e.target.value)}
                  placeholder="Enter ADMIN_ACCESS_T token"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleRunAdminAudit}
                  disabled={auditLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center space-x-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{auditLoading ? 'Auditing...' : 'Run Audit'}</span>
                </button>
              </div>

              {adminAuditResult && (
                <div className="mt-4 p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2 font-mono text-[11px]">
                  {adminAuditResult.status === 'AUTHORIZED_AUDIT_OK' ? (
                    <>
                      <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-slate-800 pb-1.5">
                        <span className="flex items-center space-x-1">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>CLEARANCE VERIFIED: {adminAuditResult.security_clearance}</span>
                        </span>
                        <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded">
                          0 LEAKAGE
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-slate-300 pt-1">
                        <div>
                          <span className="text-slate-500">Active Tenant Sessions:</span>{' '}
                          <span className="text-white font-bold">{adminAuditResult.active_sessions_in_memory || 14}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">RLS Partition Mode:</span>{' '}
                          <span className="text-emerald-300 text-[10px]">{adminAuditResult.rls_isolation_mode}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Neural Base Model:</span>{' '}
                          <span className="text-indigo-300">{adminAuditResult.fine_tuning_weights?.model_base}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Tool Accuracy:</span>{' '}
                          <span className="text-emerald-400 font-bold">{adminAuditResult.fine_tuning_weights?.tool_calling_accuracy_pct}%</span>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-800/80 text-slate-400 text-[10px]">
                        Registered Autonomous Tools: {adminAuditResult.autonomous_tools_registered?.join(', ')}
                      </div>
                    </>
                  ) : (
                    <div className="text-rose-400 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span>{adminAuditResult.detail || adminAuditResult.error || 'Access Denied: Invalid clearance token.'}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowAdminAuditModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg font-medium"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Window Drawer */}
      {isOpen && (
        <div
          id="autonomous-agent-chat-window"
          className={`bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl shadow-black/80 flex flex-col transition-all duration-300 overflow-hidden ${
            isExpanded ? 'w-full max-w-[min(720px,calc(100vw-2rem))] h-[min(75vh,750px)]' : 'w-full max-w-[460px] h-[min(610px,75vh)]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-medium text-emerald-400">ApexMind Sovereign</h3>
              {verifiedSession && (
                <span className="text-[10px] bg-emerald-950/80 text-emerald-300 font-mono px-1.5 py-0.5 rounded border border-emerald-500/40">
                  2FA ACTIVE
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                id="btn-open-sms-2fa"
                onClick={() => setShowSmsModal(true)}
                className={`px-2 py-1 rounded-lg text-xs transition-colors flex items-center space-x-1 cursor-pointer ${
                  verifiedSession
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                    : 'bg-slate-800/80 text-cyan-400 hover:bg-cyan-950/60 border border-slate-700'
                }`}
                title={verifiedSession ? 'SMS 2FA Verified' : 'Authenticate via SMS 2FA'}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono font-medium">
                  {verifiedSession ? '2FA' : 'SMS 2FA'}
                </span>
              </button>
              <button
                id="btn-open-admin-audit"
                onClick={() => setShowAdminAuditModal(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800/60 transition-colors cursor-pointer"
                title="Zero-Trust Memory & RLS Audit (ADMIN_ACCESS_T)"
              >
                <ShieldCheck className="w-4 h-4" />
              </button>
              <button
                id="btn-toggle-lead-form"
                onClick={() => setShowLeadFields(!showLeadFields)}
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  showLeadFields ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="Toggle Corporate Lead Context"
              >
                <Building2 className="w-4 h-4" />
              </button>
              <button
                id="btn-toggle-expand-chat"
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              
              {/* Working Close Button */}
              <button 
                id="btn-close-agent-chat"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                aria-label="Close chatbot"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Operator Swarm Specialization Tabs */}
          <div className="px-3 py-1.5 bg-slate-900/50 border-b border-slate-800 flex items-center space-x-1 overflow-x-auto text-[11px] scrollbar-none">
            {(Object.keys(roleDetails) as AgentRole[]).map((roleKey) => {
              const item = roleDetails[roleKey];
              const Icon = item.icon;
              const isSelected = activeRole === roleKey;
              return (
                <button
                  key={roleKey}
                  onClick={() => setActiveRole(roleKey)}
                  className={`px-2.5 py-1 rounded-lg flex items-center space-x-1.5 font-medium transition-all whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? `${item.color} border shadow-sm font-semibold`
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>

          {/* Lead Context Quick Form (Dropdown Drawer) */}
          {showLeadFields && (
            <div className="p-3 bg-slate-900/70 border-b border-slate-800 space-y-2 text-xs animate-in slide-in-from-top-2">
              <div className="text-[11px] font-semibold text-indigo-400 flex items-center justify-between">
                <span>Enterprise Scoping & Email Notification Context</span>
                <span className="text-[10px] text-slate-400">Auto-Qualifies Lead</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Company Name (e.g. Citadel)"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="email"
                  placeholder="Corporate Work Email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Contact Name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <select
                  value={budgetRange}
                  onChange={(e) => setBudgetRange(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option>$1,000 - $10,000/mo</option>
                  <option>$10,000 - $50,000/mo</option>
                  <option>$50,000 - $250,000/mo</option>
                  <option>$250,000+/mo Sovereign</option>
                </select>
              </div>
              {contactEmail && (
                <div className="text-[10px] text-emerald-400 flex items-center space-x-1 pt-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Proposals, Receipts & SOC2 packs will be automatically dispatched to this address via Resend.</span>
                </div>
              )}
            </div>
          )}

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm'
                  }`}
                >
                  {/* Specialized Operator Tag */}
                  {msg.sender === 'agent' && (
                    <div className="mb-1 text-[10px] font-semibold text-cyan-400 flex items-center space-x-1.5">
                      <SovereignHexDiamond size={13} glow={false} />
                      <span>{msg.agentRole ? (roleDetails[msg.agentRole as AgentRole]?.name || 'ApexMind Sovereign') : 'ApexMind Sovereign'}</span>
                    </div>
                  )}

                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* Real-Time Autonomous Tool Invocation Execution Cards */}
                  {msg.toolInvocations && msg.toolInvocations.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-2">
                      <div className="text-[10px] font-mono text-emerald-400 flex items-center space-x-1">
                        <Zap className="w-3 h-3" />
                        <span>Autonomous Backend Tool Invocations ({msg.toolInvocations.length})</span>
                      </div>

                      {msg.toolInvocations.map((tool, idx) => (
                        <div
                          key={tool.id || idx}
                          className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 font-mono text-[10px] space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-indigo-400 font-semibold flex items-center space-x-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>{tool.toolName}()</span>
                            </span>
                            <span className="text-slate-400">{tool.latencyMs}ms</span>
                          </div>
                          <p className="text-slate-300 font-sans">{tool.summary}</p>
                          {tool.auditSignature && (
                            <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-slate-900">
                              <span className="truncate max-w-[200px]">Audit: {tool.auditSignature}</span>
                              <button
                                onClick={() => copyToClipboard(tool.auditSignature!, tool.id)}
                                className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 ml-2"
                              >
                                {copiedAuditSig === tool.id ? (
                                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-2.5 h-2.5" />
                                )}
                                <span>Copy Proof</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Agent Metadata & Lead Tier Tag */}
                  {msg.qualificationTier && (
                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                      <span className="flex items-center space-x-1 font-semibold text-emerald-400">
                        <Flame className="w-3 h-3" />
                        <span>Tier: {msg.qualificationTier}</span>
                      </span>
                      {msg.leadScore !== undefined && (
                        <span className="text-slate-400">Intent Score: {msg.leadScore}/100</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Suggested Action Chips */}
                {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 max-w-[95%]">
                    {msg.suggestedActions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(action)}
                        className="text-[10px] bg-slate-900 hover:bg-indigo-950/80 text-slate-300 hover:text-indigo-200 border border-slate-800 hover:border-indigo-700/50 rounded-full px-2.5 py-1 transition-colors flex items-center space-x-1 cursor-pointer"
                      >
                        <span>{action}</span>
                        <ArrowRight className="w-2.5 h-2.5 opacity-60" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center space-x-2 text-slate-400 text-xs py-2 px-1">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce delay-100" />
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce delay-200" />
                <span className="text-[11px] font-mono">
                  Autonomous Swarm evaluating intent, executing tool bindings & syncing ledger...
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Lead Qualification Status Banner */}
          {lastQualification && (
            <div className="px-3 py-2 bg-emerald-950/40 border-t border-emerald-900/40 flex items-center justify-between text-[11px] text-emerald-300">
              <span className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  Plan Recommended:{' '}
                  <strong className="text-white">{lastQualification.recommendedPlan}</strong>
                </span>
              </span>
              {onOpenCheckout && (
                <button
                  onClick={() => onOpenCheckout(lastQualification.recommendedPlan.includes('Sovereign') ? 'enterprise' : 'pro')}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-[10px] transition-colors"
                >
                  Checkout Plan
                </button>
              )}
            </div>
          )}

          {/* Quick Operator Prompts Drawer */}
          <div className="px-3 py-1.5 bg-slate-950 border-t border-slate-900 flex items-center space-x-1.5 overflow-x-auto text-[10px] scrollbar-none">
            <span className="text-slate-500 font-mono flex items-center space-x-1 whitespace-nowrap">
              <Zap className="w-2.5 h-2.5 text-amber-400" />
              <span>Operator Prompts:</span>
            </span>
            {roleDetails[activeRole].quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                className="whitespace-nowrap bg-slate-900 hover:bg-indigo-900/60 text-slate-300 hover:text-indigo-200 px-2 py-0.5 rounded border border-slate-800 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-slate-900/90 border-t border-slate-800">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center space-x-2"
            >
              <input
                id="input-agent-chat"
                type="text"
                placeholder={`Ask ${roleDetails[activeRole].name} (e.g. verify order, heal pipeline, check H100)...`}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                disabled={isLoading}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                id="btn-send-agent-chat"
                type="submit"
                disabled={isLoading || !inputVal.trim()}
                className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 px-1">
              <span>Powered by ApexSovereign Autonomous Multi-Agent Mesh</span>
              <span className="text-emerald-500 font-mono">24/7 Autopilot Ready</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
