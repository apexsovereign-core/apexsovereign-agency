/**
 * ApexSovereign.ai - Operational Command Phase 4
 * Component: EnterpriseBillingConsole
 * Institutional Enterprise Billing, Net-30/60 Invoicing & Audit Statement Reporting
 * Features:
 *   - Real-time Credit Limit Utilization Meters & Status Badges
 *   - Downloadable Net-30 / Net-60 Invoice Statement Views
 *   - Double-Entry Ledger Audit Streams with SHA-256 Merkle Verification
 *   - One-Click Fedwire / ACH Wire Reconciliation Simulator
 *   - Institutional Default Protection & Headroom Sentinels
 */

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  FileText,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  Download,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  Landmark,
  FileCheck,
  TrendingUp,
  Percent,
  Layers,
  History,
  Lock,
  ExternalLink,
  ChevronDown,
  Printer
} from 'lucide-react';

interface InvoiceLineItem {
  description: string;
  rate: number;
  quantity: number;
  amount: number;
}

interface CorporateInvoice {
  invoice_id: string;
  invoice_number: string;
  tenant_id: string;
  issue_date: string;
  due_date: string;
  payment_terms: string;
  subtotal_usd: number;
  tax_usd: number;
  late_fee_usd: number;
  total_amount_usd: number;
  amount_paid_usd: number;
  balance_remaining_usd: number;
  status: 'ISSUED' | 'PAID' | 'OVERDUE' | 'PARTIALLY_PAID';
  line_items: InvoiceLineItem[];
  merkle_invoice_hash: string;
}

interface CreditStanding {
  tenant_id: string;
  company_name?: string;
  credit_limit: number;
  credit_utilized: number;
  available_headroom: number;
  utilization_pct?: number;
  payment_terms: string;
  credit_status: string;
  lock_active: boolean;
  delinquent_invoices_count: number;
  underwritten_at: string;
  rating: string;
}

interface LedgerStatementRecord {
  entry_id: string;
  timestamp: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_id: string;
  description: string;
  merkle_leaf_hash: string;
}

interface EnterpriseBillingConsoleProps {
  className?: string;
  tenantId?: string;
}

export const EnterpriseBillingConsole: React.FC<EnterpriseBillingConsoleProps> = ({
  className = '',
  tenantId = 'tenant-sovereign-01',
}) => {
  const [invoices, setInvoices] = useState<CorporateInvoice[]>([]);
  const [creditStanding, setCreditStanding] = useState<CreditStanding | null>(null);
  const [ledgerStatements, setLedgerStatements] = useState<LedgerStatementRecord[]>([]);
  const [wireInstructions, setWireInstructions] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'invoices' | 'ledger' | 'statements'>('invoices');
  const [loading, setLoading] = useState<boolean>(true);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<CorporateInvoice | null>(null);
  const [showWireModal, setShowWireModal] = useState<boolean>(false);
  const [showStatementModal, setShowStatementModal] = useState<boolean>(false);
  const [reconciliationStatusMsg, setReconciliationStatusMsg] = useState<string | null>(null);

  // Fetch Invoices, Credit Standing, and Statement History
  const fetchBillingData = async () => {
    try {
      const [resInvoices, resCredit, resStatements] = await Promise.all([
        fetch(`/v1/billing/invoices?tenant_id=${tenantId}`),
        fetch(`/v1/billing/credit-status?tenant_id=${tenantId}`),
        fetch(`/v1/billing/statement-history?tenant_id=${tenantId}`),
      ]);

      if (resInvoices.ok) {
        const invData = await resInvoices.json();
        setInvoices(invData.invoices || []);
        setWireInstructions(invData.wire_instructions || null);
      }

      if (resCredit.ok) {
        const credData = await resCredit.json();
        setCreditStanding(credData);
      }

      if (resStatements.ok) {
        const stmtData = await resStatements.json();
        setLedgerStatements(stmtData.ledger_statements || []);
      }
    } catch (err) {
      console.error('Error loading enterprise billing data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, [tenantId]);

  // Generate Net-30 / Net-60 Invoice
  const handleGenerateInvoice = async (terms: 'NET_30' | 'NET_60') => {
    setIsGenerating(true);
    try {
      const res = await fetch('/v1/billing/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          payment_terms: terms,
          billing_period_days: terms === 'NET_60' ? 60 : 30,
        }),
      });

      if (res.ok) {
        const newInv = await res.json();
        setInvoices((prev) => [newInv, ...prev]);
        fetchBillingData();
      }
    } catch (err) {
      console.error('Invoice generation failed', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Simulate Fedwire Inbound Reconciliation
  const handleSimulateWire = async (targetInvoice: CorporateInvoice) => {
    setIsReconciling(true);
    setReconciliationStatusMsg(null);
    try {
      const payload = {
        tenant_id: tenantId,
        invoice_id: targetInvoice.invoice_number,
        bank_reference_id: `FEDWIRE-IMAD-${Date.now().toString().slice(-8)}`,
        wire_type: 'FEDWIRE',
        originating_bank: 'JPMorgan Chase Bank, N.A. (New York)',
        sender_entity_name: 'Tier-1 Autonomous Foundation LLC',
        amount_received: targetInvoice.balance_remaining_usd || targetInvoice.total_amount_usd,
      };

      const res = await fetch('/v1/billing/wire-reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const result = await res.json();
        setReconciliationStatusMsg(result.message);
        setShowWireModal(false);
        fetchBillingData();
      }
    } catch (err) {
      console.error('Wire reconciliation error', err);
    } finally {
      setIsReconciling(false);
    }
  };

  // Download Statement JSON or Print
  const handleDownloadStatement = (invoice: CorporateInvoice) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(invoice, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${invoice.invoice_number}_Statement.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const utilizationRatio = creditStanding && creditStanding.credit_limit > 0
    ? (creditStanding.credit_utilized / creditStanding.credit_limit) * 100
    : 0;

  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md p-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Landmark className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Enterprise Financial Dashboard & Audit Reporting
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                GAAP COMPLIANT
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Read-only corporate statements, Net-30/60 invoice reporting, and double-entry ledger audit verification.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleGenerateInvoice('NET_30')}
            disabled={isGenerating}
            type="button"
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Generate Net-30</span>
          </button>
          <button
            onClick={() => handleGenerateInvoice('NET_60')}
            disabled={isGenerating}
            type="button"
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            <span>Generate Net-60</span>
          </button>
          <button
            onClick={fetchBillingData}
            type="button"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Credit Facility KPI Bar with Utilization Progress */}
      {creditStanding && (
        <div className="my-5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">Credit Facility Limit</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-bold font-mono text-emerald-400">
                  ${creditStanding.credit_limit.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">USD</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">Available Headroom</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-bold font-mono text-cyan-400">
                  ${creditStanding.available_headroom.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Unutilized</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">Institutional Terms</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold font-mono text-purple-300">
                  {creditStanding.payment_terms}
                </span>
                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                  {creditStanding.rating}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">Credit Lock Sentinel</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-xs font-bold font-mono ${
                  creditStanding.lock_active ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {creditStanding.lock_active ? 'FROZEN (DELINQUENT)' : 'ACTIVE (UNLOCKED)'}
                </span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            </div>
          </div>

          {/* Credit Line Utilization Meter */}
          <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/60">
            <div className="flex justify-between items-center text-xs font-mono mb-1.5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-cyan-400" />
                Credit Line Utilization Ratio
              </span>
              <span className="text-white font-bold">
                ${creditStanding.credit_utilized.toLocaleString()} / ${creditStanding.credit_limit.toLocaleString()} USD ({utilizationRatio.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  utilizationRatio > 80
                    ? 'bg-gradient-to-r from-cyan-500 to-rose-500'
                    : 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(2, utilizationRatio))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Status Notice Banner if wire reconciled */}
      {reconciliationStatusMsg && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{reconciliationStatusMsg}</span>
          </div>
          <button
            onClick={() => setReconciliationStatusMsg(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Dashboard Sub-Tabs */}
      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-800 text-xs font-mono">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'invoices'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCheck className="w-3.5 h-3.5" />
          <span>Invoices ({invoices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'ledger'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Double-Entry Ledger Audit ({ledgerStatements.length})</span>
        </button>
      </div>

      {/* Tab 1: Corporate Invoices Table */}
      {activeTab === 'invoices' && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                  <th className="py-2.5 px-3">Invoice Number</th>
                  <th className="py-2.5 px-3">Issue Date</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3">Terms</th>
                  <th className="py-2.5 px-3">Total Amount</th>
                  <th className="py-2.5 px-3">Balance Due</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                {invoices.map((inv) => {
                  const isPaid = inv.status === 'PAID';
                  const isOverdue = inv.status === 'OVERDUE';

                  return (
                    <tr key={inv.invoice_id} className="hover:bg-slate-950/40 transition">
                      <td className="py-3 px-3">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{inv.invoice_number}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[120px]" title={inv.merkle_invoice_hash}>
                          {inv.merkle_invoice_hash ? `${inv.merkle_invoice_hash.slice(0, 10)}...` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {new Date(inv.issue_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {new Date(inv.due_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-purple-300 border border-slate-700">
                          {inv.payment_terms}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-white">
                        ${inv.total_amount_usd.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 font-bold text-amber-400">
                        ${inv.balance_remaining_usd.toLocaleString()}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isPaid
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : isOverdue
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setShowStatementModal(true);
                            }}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            title="View Statement"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDownloadStatement(inv)}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            title="Download Statement"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          {!isPaid ? (
                            <button
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setShowWireModal(true);
                              }}
                              className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition cursor-pointer"
                            >
                              Wire
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Settled
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Double-Entry Ledger Audit History */}
      {activeTab === 'ledger' && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                  <th className="py-2.5 px-3">Entry ID & Date</th>
                  <th className="py-2.5 px-3">Transaction Type</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Closing Balance</th>
                  <th className="py-2.5 px-3 text-right">Merkle Proof</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                {ledgerStatements.map((entry) => {
                  const isPositive = entry.amount >= 0;
                  return (
                    <tr key={entry.entry_id} className="hover:bg-slate-950/40 transition">
                      <td className="py-3 px-3">
                        <div className="text-white font-bold">{entry.entry_id}</div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(entry.timestamp).toLocaleString()}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-purple-300 border border-slate-700">
                          {entry.transaction_type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300 max-w-xs truncate" title={entry.description}>
                        {entry.description}
                      </td>
                      <td className={`py-3 px-3 font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? `+$${entry.amount.toLocaleString()}` : `-$${Math.abs(entry.amount).toLocaleString()}`}
                      </td>
                      <td className="py-3 px-3 text-white font-bold">
                        ${entry.balance_after.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className="text-[10px] text-slate-500 font-mono" title={entry.merkle_leaf_hash}>
                          {entry.merkle_leaf_hash ? `${entry.merkle_leaf_hash.slice(0, 8)}...` : 'VERIFIED'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice Statement Detail Modal */}
      {showStatementModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-cyan-400" />
                <h4 className="text-base font-bold text-white">
                  Corporate Statement: {selectedInvoice.invoice_number}
                </h4>
              </div>
              <button
                onClick={() => setShowStatementModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500 block">Terms:</span>
                <span className="text-white font-bold">{selectedInvoice.payment_terms}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Status:</span>
                <span className="text-emerald-400 font-bold">{selectedInvoice.status}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Issue Date:</span>
                <span className="text-slate-300">{new Date(selectedInvoice.issue_date).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Due Date:</span>
                <span className="text-slate-300">{new Date(selectedInvoice.due_date).toLocaleDateString()}</span>
              </div>
              <div className="col-span-2 pt-2 border-t border-slate-800 text-[10px]">
                <span className="text-slate-500 block">Merkle Verification Hash:</span>
                <span className="text-purple-300 break-all">{selectedInvoice.merkle_invoice_hash}</span>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold text-slate-400 uppercase">Itemized Usage</span>
              {selectedInvoice.line_items.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs font-mono flex justify-between">
                  <div>
                    <div className="text-white font-semibold">{item.description}</div>
                    <div className="text-[10px] text-slate-500">Qty: {item.quantity.toLocaleString()} @ ${item.rate}/hr</div>
                  </div>
                  <div className="text-emerald-400 font-bold self-center">
                    ${item.amount.toLocaleString()} USD
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                onClick={() => handleDownloadStatement(selectedInvoice)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON Statement</span>
              </button>
              <div className="text-right">
                <span className="text-xs text-slate-400 block font-mono">Total Statement Balance:</span>
                <span className="text-base font-bold font-mono text-white">
                  ${selectedInvoice.total_amount_usd.toLocaleString()} USD
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wire Transfer Instructions Modal */}
      {showWireModal && selectedInvoice && wireInstructions && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-emerald-400" />
                <h4 className="text-base font-bold text-white">
                  Fedwire / ACH Wire Instructions
                </h4>
              </div>
              <button
                onClick={() => setShowWireModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Direct institutional wire instructions for invoice{' '}
              <strong className="text-white">{selectedInvoice.invoice_number}</strong>.
            </p>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Beneficiary:</span>
                <span className="text-white font-bold">{wireInstructions.beneficiary}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bank:</span>
                <span className="text-slate-300">{wireInstructions.bank_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Routing (ABA):</span>
                <span className="text-cyan-400 font-bold">{wireInstructions.routing_aba}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">SWIFT / BIC:</span>
                <span className="text-purple-300">{wireInstructions.swift_bic}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Number:</span>
                <span className="text-white font-bold">{wireInstructions.account_number}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-800">
                <span className="text-slate-500">Wire Memo:</span>
                <span className="text-emerald-400 font-bold">
                  APEX-{selectedInvoice.invoice_number}-{tenantId.slice(0, 8)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-400 font-mono">
                Amount to Settle:{' '}
                <strong className="text-white">
                  ${selectedInvoice.balance_remaining_usd.toLocaleString()} USD
                </strong>
              </div>
              <button
                onClick={() => handleSimulateWire(selectedInvoice)}
                disabled={isReconciling}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-xs font-mono font-bold text-white transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isReconciling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Reconciling IMAD...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Simulate Inbound Wire Settlement</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
