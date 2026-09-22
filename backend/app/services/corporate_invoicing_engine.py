"""
ApexSovereign.ai - Milestone 6: Enterprise Procurement & Automated ACH/Wire Invoicing Engine
Features:
- Corporate wire/ACH invoice generation for institutional Net-15 / Net-30 purchase orders.
- Programmatic base64 / HTML PDF invoice generator with banking routing coordinates.
- Two-phase bank deposit reconciliation hook: matches incoming SWIFT/Fedwire reference codes
  and atomically provisions double-entry ledger credits upon cleared settlement.
"""

from __future__ import annotations

import base64
import json
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from asyncpg.connection import Connection

from backend.app.api.deps import get_db_tx, require_api_key
from backend.app.services.ledger_service import LedgerService

logger = logging.getLogger("apexsovereign.invoicing")
router = APIRouter(prefix="/billing/corporate-invoices", tags=["Enterprise Wire/ACH Invoicing"])

BANK_ROUTING_ABA = "021000021"
BANK_ACCOUNT_LAST4 = "8824"
BANK_SWIFT_BIC = "CHASUS33"
BANK_BENEFICIARY = "ApexSovereign Treasury Holdings LLC"
BANK_NAME = "JPMorgan Chase Bank, N.A. (Commercial Banking)"


class CreateInvoiceRequest(BaseModel):
    tenant_id: str = Field(..., description="Tenant UUID")
    organization_name: str = Field(..., min_length=2, max_length=255)
    contact_email: EmailStr = Field(..., description="Accounts payable email")
    billing_address: str = Field(..., min_length=5)
    subtotal_amount: float = Field(..., gt=100.0, description="Minimum $100 for institutional wire billing")
    currency: str = Field(default="USD")
    payment_terms: str = Field(default="NET_30", description="NET_15, NET_30, or DUE_ON_RECEIPT")
    credits_requested: float = Field(..., gt=0.0, description="Credits to provision upon settlement")


class SettleDepositRequest(BaseModel):
    wire_reference_code: str = Field(..., description="Unique WIRE-APEX-... tracking reference")
    cleared_amount: float = Field(..., gt=0.0, description="Amount credited in bank statement")
    bank_confirmation_id: str = Field(..., description="Fedwire IMAD/OMAD or ACH trace number")
    idempotency_key: str = Field(..., min_length=16)


class InvoiceResponse(BaseModel):
    invoice_id: str
    invoice_number: str
    tenant_id: str
    organization_name: str
    total_amount: float
    currency: str
    payment_terms: str
    status: str
    wire_reference_code: str
    bank_coordinates: Dict[str, str]
    credits_allocated: float
    credits_provisioned: bool
    due_date: str
    issued_at: str
    invoice_pdf_data_uri: str


def generate_invoice_number() -> str:
    year = datetime.now().year
    rand_seq = random.randint(10000, 99999)
    return f"INV-{year}-APEX-{rand_seq}"


def generate_wire_reference() -> str:
    token = uuid.uuid4().hex[:8].upper()
    return f"WIRE-APEX-{token}"


def build_invoice_html_pdf(
    invoice_number: str,
    org_name: str,
    total_amount: float,
    currency: str,
    wire_ref: str,
    due_date: str,
    credits: float,
) -> str:
    """Generates an enterprise HTML-based printable document encoded as a base64 Data URI."""
    html_doc = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; color: #1e293b; }}
  .header {{ display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 20px; }}
  .title {{ font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }}
  .badge {{ background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 12px; }}
  .details-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 30px 0; }}
  .section-title {{ font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 6px; }}
  .wire-box {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-top: 20px; }}
  .highlight {{ color: #0284c7; font-family: monospace; font-weight: 700; font-size: 16px; }}
  .amount-box {{ font-size: 28px; font-weight: 800; color: #0f172a; margin-top: 10px; }}
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">APEXSOVEREIGN.AI</div>
      <div style="color: #64748b; font-size: 13px;">Autonomous Enterprise AI Compute Brokerage</div>
    </div>
    <div style="text-align: right;">
      <div class="badge">OFFICIAL TAX INVOICE</div>
      <div style="margin-top: 6px; font-weight: 700;">{invoice_number}</div>
    </div>
  </div>

  <div class="details-grid">
    <div>
      <div class="section-title">Billed To</div>
      <div style="font-weight: 700; font-size: 15px;">{org_name}</div>
      <div style="color: #64748b; font-size: 13px; margin-top: 4px;">Institutional Net-Terms Account</div>
    </div>
    <div>
      <div class="section-title">Payment Summary</div>
      <div>Due Date: <strong>{due_date}</strong></div>
      <div>Compute Credits: <strong>{credits:,.2f} APEX Credits</strong></div>
      <div class="amount-box">{currency} ${total_amount:,.2f}</div>
    </div>
  </div>

  <div class="wire-box">
    <div class="section-title">Corporate Wire & ACH Instructions</div>
    <div style="font-size: 13px; line-height: 1.6; margin-top: 8px;">
      <div>Beneficiary Name: <strong>{BANK_BENEFICIARY}</strong></div>
      <div>Bank Name: <strong>{BANK_NAME}</strong></div>
      <div>Routing Number (ABA): <strong>{BANK_ROUTING_ABA}</strong></div>
      <div>Account Number (Last 4): <strong>••••••••{BANK_ACCOUNT_LAST4}</strong></div>
      <div>SWIFT / BIC Code: <strong>{BANK_SWIFT_BIC}</strong></div>
      <div style="margin-top: 12px; padding: 10px; background: #e0f2fe; border-radius: 6px;">
        Mandatory Wire Memo/Reference: <span class="highlight">{wire_ref}</span>
        <div style="font-size: 11px; color: #0369a1; margin-top: 2px;">(Automated settlement engine requires this exact code in wire Field 70)</div>
      </div>
    </div>
  </div>
</body>
</html>"""
    b64_encoded = base64.b64encode(html_doc.encode("utf-8")).decode("utf-8")
    return f"data:text/html;base64,{b64_encoded}"


@router.post(
    "/generate",
    response_model=InvoiceResponse,
    summary="Create Institutional Net-Terms Invoice",
    description="Generates corporate Net-15/Net-30 invoice with banking coordinates and reference tracking.",
)
async def create_corporate_invoice(
    payload: CreateInvoiceRequest,
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> InvoiceResponse:
    invoice_num = generate_invoice_number()
    wire_ref = generate_wire_reference()
    days = 15 if payload.payment_terms == "NET_15" else 30
    due_date = datetime.now(timezone.utc) + timedelta(days=days)
    total = payload.subtotal_amount  # Zero tax for enterprise B2B cloud compute

    pdf_data_uri = build_invoice_html_pdf(
        invoice_number=invoice_num,
        org_name=payload.organization_name,
        total_amount=total,
        currency=payload.currency,
        wire_ref=wire_ref,
        due_date=due_date.strftime("%Y-%m-%d"),
        credits=payload.credits_requested,
    )

    row = await conn.fetchrow(
        """
        INSERT INTO corporate_invoices (
            invoice_number, tenant_id, organization_name, contact_email, billing_address,
            subtotal_amount, total_amount, currency, payment_terms, status,
            wire_reference_code, bank_beneficiary, bank_name, wire_routing_aba,
            wire_account_last4, swift_bic, credits_allocated, credits_provisioned,
            pdf_s3_url, due_date, issued_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, 'ISSUED',
            $10, $11, $12, $13, $14, $15, $16, FALSE,
            $17, $18, NOW()
        ) RETURNING id, created_at;
        """,
        invoice_num,
        payload.tenant_id,
        payload.organization_name,
        payload.contact_email,
        payload.billing_address,
        payload.subtotal_amount,
        total,
        payload.currency,
        payload.payment_terms,
        wire_ref,
        BANK_BENEFICIARY,
        BANK_NAME,
        BANK_ROUTING_ABA,
        BANK_ACCOUNT_LAST4,
        BANK_SWIFT_BIC,
        payload.credits_requested,
        pdf_data_uri,
        due_date,
    )

    return InvoiceResponse(
        invoice_id=str(row["id"]),
        invoice_number=invoice_num,
        tenant_id=payload.tenant_id,
        organization_name=payload.organization_name,
        total_amount=total,
        currency=payload.currency,
        payment_terms=payload.payment_terms,
        status="ISSUED",
        wire_reference_code=wire_ref,
        bank_coordinates={
            "beneficiary": BANK_BENEFICIARY,
            "bank_name": BANK_NAME,
            "routing_aba": BANK_ROUTING_ABA,
            "account_last4": BANK_ACCOUNT_LAST4,
            "swift_bic": BANK_SWIFT_BIC,
        },
        credits_allocated=payload.credits_requested,
        credits_provisioned=False,
        due_date=due_date.isoformat(),
        issued_at=datetime.now(timezone.utc).isoformat(),
        invoice_pdf_data_uri=pdf_data_uri,
    )


@router.post(
    "/reconcile-deposit",
    summary="Reconcile Inbound Wire Deposit & Provision Credits",
    description="Matches wire reference code, records cleared deposit, and atomically credits tenant balance.",
)
async def reconcile_wire_deposit(
    payload: SettleDepositRequest,
    conn: Connection = Depends(get_db_tx),
    _auth: str = Depends(require_api_key),
) -> Dict[str, Any]:
    """Matches wire memo to pending invoice and triggers atomic ledger crediting."""
    invoice = await conn.fetchrow(
        """
        SELECT * FROM corporate_invoices
        WHERE wire_reference_code = $1
        FOR UPDATE;
        """,
        payload.wire_reference_code,
    )

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No corporate invoice found for wire reference '{payload.wire_reference_code}'.",
        )

    if invoice["status"] == "SETTLED" and invoice["credits_provisioned"]:
        return {
            "status": "ALREADY_SETTLED",
            "invoice_number": invoice["invoice_number"],
            "wire_reference_code": payload.wire_reference_code,
            "message": "Deposit already reconciled and credits previously allocated.",
        }

    invoice_id = str(invoice["id"])
    tenant_id = str(invoice["tenant_id"])
    credits = float(invoice["credits_allocated"])

    # 1. Update invoice status
    await conn.execute(
        """
        UPDATE corporate_invoices
        SET status = 'SETTLED',
            credits_provisioned = TRUE,
            cleared_at = NOW(),
            updated_at = NOW()
        WHERE id = $1::uuid;
        """,
        invoice_id,
    )

    # 2. Atomically allocate credits in tenant ledger via double-entry system
    fulfillment = await LedgerService.fulfill_payment_idempotent(
        conn=conn,
        tenant_id=tenant_id,
        amount_currency=payload.cleared_amount,
        currency=invoice["currency"],
        credits_allocated=credits,
        provider_order_id=f"WIRE_{payload.bank_confirmation_id}",
        provider_capture_id=payload.wire_reference_code,
        webhook_event_id=None,
        idempotency_key=payload.idempotency_key,
        raw_payload={
            "bank_confirmation_id": payload.bank_confirmation_id,
            "wire_reference_code": payload.wire_reference_code,
            "cleared_amount": payload.cleared_amount,
            "invoice_number": invoice["invoice_number"],
        },
    )

    logger.info(
        "Successfully reconciled wire deposit for invoice %s. %s credits provisioned to tenant %s.",
        invoice["invoice_number"],
        credits,
        tenant_id,
    )

    return {
        "status": "SETTLED",
        "invoice_number": invoice["invoice_number"],
        "tenant_id": tenant_id,
        "cleared_amount": payload.cleared_amount,
        "credits_provisioned": credits,
        "new_balance": fulfillment["balance_after"],
        "ledger_id": fulfillment["ledger_id"],
        "settled_at": datetime.now(timezone.utc).isoformat(),
    }
