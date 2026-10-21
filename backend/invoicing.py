"""
ApexSovereign.ai - Direct Wire / ACH Enterprise Invoicing Module
Handles institutional Net-15/Net-30 corporate accounts exceeding standard credit card limits,
providing immutable audit ledgers, wire instructions, and atomic credit provisioning hooks.
"""

import os
import uuid
import time
import random
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import (
    Column,
    String,
    Numeric,
    DateTime,
    Boolean,
    Text,
    desc,
)
from sqlalchemy.orm import Session

# Import shared Base, Session dependency, and User model from compute_broker
from compute_broker import Base, get_db, User
from metrics import record_invoice_event

# ---------------------------------------------------------------------------
# Corporate Wire Coordinates (ApexSovereign Treasury Banking)
# ---------------------------------------------------------------------------
DEFAULT_BANK_NAME = os.getenv("CORPORATE_BANK_NAME", "JPMorgan Chase Bank, N.A. (Commercial Banking)")
DEFAULT_ROUTING_ABA = os.getenv("CORPORATE_WIRE_ROUTING", "021000021")
DEFAULT_ACCOUNT_LAST4 = os.getenv("CORPORATE_WIRE_ACCOUNT_LAST4", "8824")
DEFAULT_SWIFT_BIC = os.getenv("CORPORATE_SWIFT_BIC", "CHASUS33")
DEFAULT_BENEFICIARY = os.getenv("CORPORATE_BENEFICIARY_NAME", "ApexSovereign Holdings LLC")

# ---------------------------------------------------------------------------
# SQLAlchemy Models
# ---------------------------------------------------------------------------
class EnterpriseInvoice(Base):
    """
    Primary corporate billing record for enterprise wire and ACH transactions.
    """
    __tablename__ = "enterprise_invoices"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_number = Column(String(64), unique=True, index=True, nullable=False)
    tenant_id = Column(String(64), index=True, nullable=False)
    organization_name = Column(String(255), nullable=False)
    contact_email = Column(String(255), nullable=False)
    billing_address = Column(Text, nullable=False)

    subtotal_amount = Column(Numeric(12, 2), nullable=False)
    tax_amount = Column(Numeric(12, 2), default=0.00, nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(8), default="USD", nullable=False)

    payment_terms = Column(String(32), default="NET_30", nullable=False)  # NET_15, NET_30, DUE_ON_RECEIPT
    status = Column(String(32), default="ISSUED", nullable=False)          # DRAFT, ISSUED, PAID, OVERDUE, VOIDED

    # Wire Coordinates & Tracking
    bank_name = Column(String(128), default=DEFAULT_BANK_NAME, nullable=False)
    wire_routing_number = Column(String(64), default=DEFAULT_ROUTING_ABA, nullable=False)
    wire_account_last4 = Column(String(8), default=DEFAULT_ACCOUNT_LAST4, nullable=False)
    swift_bic = Column(String(32), default=DEFAULT_SWIFT_BIC, nullable=False)
    beneficiary_name = Column(String(128), default=DEFAULT_BENEFICIARY, nullable=False)
    reference_code = Column(String(64), unique=True, index=True, nullable=False)

    # Compute Credits Entitlement
    credits_to_provision = Column(Numeric(14, 4), nullable=False)
    credits_provisioned = Column(Boolean, default=False, nullable=False)

    # Settlement Evidence
    wire_confirmation_number = Column(String(128), nullable=True)
    cleared_amount = Column(Numeric(12, 2), nullable=True)

    # Timestamps
    issued_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    due_at = Column(DateTime, nullable=False)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    notes = Column(Text, nullable=True)


class InvoiceAuditLedger(Base):
    """
    Immutable audit trail for financial compliance, tracking changes and manual credit approvals.
    """
    __tablename__ = "invoice_audit_ledgers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id = Column(String(36), index=True, nullable=False)
    action = Column(String(64), nullable=False)  # INVOICE_CREATED, PAYMENT_RECORDED, CREDITS_PROVISIONED, INVOICE_VOIDED
    performed_by = Column(String(128), nullable=False)
    notes = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


# ---------------------------------------------------------------------------
# Helper Utility Functions
# ---------------------------------------------------------------------------
def generate_invoice_number() -> str:
    current_year = datetime.now().year
    random_digits = f"{random.randint(10000, 99999)}"
    return f"APEX-INV-{current_year}-{random_digits}"


def generate_wire_reference_code() -> str:
    hex_suffix = uuid.uuid4().hex[:8].upper()
    return f"WIRE-APEX-{hex_suffix}"


def calculate_due_date(terms: str) -> datetime:
    now = datetime.now(timezone.utc)
    if terms == "NET_15":
        return now + timedelta(days=15)
    elif terms == "DUE_ON_RECEIPT":
        return now + timedelta(days=1)
    # Default: NET_30
    return now + timedelta(days=30)


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class InvoiceCreateRequest(BaseModel):
    tenant_id: str = Field(..., example="tenant-enterprise-4401")
    organization_name: str = Field(..., example="DeepTensor Dynamics Corp")
    contact_email: EmailStr = Field(..., example="billing@deeptensor.ai")
    billing_address: str = Field(..., example="500 Howard St, Suite 400, San Francisco, CA 94105")
    subtotal_amount: float = Field(..., ge=500.0, description="Minimum enterprise wire commitment: $500")
    tax_amount: float = Field(0.0, ge=0.0)
    payment_terms: str = Field("NET_30", description="NET_15, NET_30, or DUE_ON_RECEIPT")
    credits_multiplier: float = Field(1.0, ge=1.0, description="1.0 = 1 credit per USD, >1 for enterprise bonus")
    notes: Optional[str] = Field(None, example="Annual high-compute GPU allocation lease contract.")


class RecordPaymentRequest(BaseModel):
    wire_confirmation_number: str = Field(..., example="FEDWIRE-20260917-CHAS-99812")
    amount_received: float = Field(..., ge=0.01)
    performing_officer: str = Field(..., example="treasury-ops@apexsovereign.ai")
    auto_provision_credits: bool = Field(True, description="Immediately increment tenant balance upon clearance")
    notes: Optional[str] = Field(None, example="Cleared via Fedwire Chase commercial incoming feed.")


class ProvisionCreditsRequest(BaseModel):
    performing_officer: str = Field(..., example="cfo-approval@apexsovereign.ai")
    reason: str = Field(..., example="Manual executive approval for early compute onboarding before wire settlement.")
    override_credit_amount: Optional[float] = Field(None, ge=1.0)


class InvoiceResponse(BaseModel):
    id: str
    invoice_number: str
    tenant_id: str
    organization_name: str
    contact_email: str
    billing_address: str
    subtotal_amount: float
    tax_amount: float
    total_amount: float
    currency: str
    payment_terms: str
    status: str
    wire_instructions: Dict[str, str]
    reference_code: str
    credits_to_provision: float
    credits_provisioned: bool
    wire_confirmation_number: Optional[str]
    issued_at: str
    due_at: str
    paid_at: Optional[str]
    notes: Optional[str]


# ---------------------------------------------------------------------------
# FastAPI Router
# ---------------------------------------------------------------------------
invoicing_router = APIRouter(prefix="/invoices", tags=["Enterprise Invoicing"])


def serialize_invoice(inv: EnterpriseInvoice) -> Dict[str, Any]:
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "tenant_id": inv.tenant_id,
        "organization_name": inv.organization_name,
        "contact_email": inv.contact_email,
        "billing_address": inv.billing_address,
        "subtotal_amount": float(inv.subtotal_amount),
        "tax_amount": float(inv.tax_amount),
        "total_amount": float(inv.total_amount),
        "currency": inv.currency,
        "payment_terms": inv.payment_terms,
        "status": inv.status,
        "wire_instructions": {
            "bank_name": inv.bank_name,
            "beneficiary_name": inv.beneficiary_name,
            "routing_aba": inv.wire_routing_number,
            "account_last4": f"****{inv.wire_account_last4}",
            "swift_bic": inv.swift_bic,
            "memo_reference": inv.reference_code,
            "instructions": f"Include Reference Code '{inv.reference_code}' on wire payment line 72 / memo to ensure instant credit settlement.",
        },
        "reference_code": inv.reference_code,
        "credits_to_provision": float(inv.credits_to_provision),
        "credits_provisioned": inv.credits_provisioned,
        "wire_confirmation_number": inv.wire_confirmation_number,
        "issued_at": inv.issued_at.isoformat() if inv.issued_at else None,
        "due_at": inv.due_at.isoformat() if inv.due_at else None,
        "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
        "notes": inv.notes,
    }


@invoicing_router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
def create_enterprise_invoice(req: InvoiceCreateRequest, db: Session = Depends(get_db)):
    """
    Generates an official institutional Wire / ACH invoice with Net-15/Net-30 payment terms,
    unique wire memo reference code, and banking coordinates.
    """
    total_amount = round(req.subtotal_amount + req.tax_amount, 2)
    credits_to_provision = round(req.subtotal_amount * req.credits_multiplier, 4)
    due_date = calculate_due_date(req.payment_terms)

    # Ensure tenant exists in database
    user = db.query(User).filter(User.tenant_id == req.tenant_id).first()
    if not user:
        user = User(
            tenant_id=req.tenant_id,
            email=req.contact_email,
            credits_balance=0.0000,
        )
        db.add(user)
        db.flush()

    invoice = EnterpriseInvoice(
        invoice_number=generate_invoice_number(),
        tenant_id=req.tenant_id,
        organization_name=req.organization_name,
        contact_email=req.contact_email,
        billing_address=req.billing_address,
        subtotal_amount=req.subtotal_amount,
        tax_amount=req.tax_amount,
        total_amount=total_amount,
        currency="USD",
        payment_terms=req.payment_terms.upper(),
        status="ISSUED",
        reference_code=generate_wire_reference_code(),
        credits_to_provision=credits_to_provision,
        credits_provisioned=False,
        due_at=due_date,
        notes=req.notes,
    )

    db.add(invoice)
    db.flush()

    # Create immutable audit entry
    audit = InvoiceAuditLedger(
        invoice_id=invoice.id,
        action="INVOICE_CREATED",
        performed_by="SYSTEM_INVOICE_ENGINE",
        notes=f"Created {req.payment_terms} invoice {invoice.invoice_number} for ${total_amount:,.2f} USD.",
        metadata_json=f'{{"tenant_id": "{req.tenant_id}", "total": {total_amount}}}'
    )
    db.add(audit)
    db.commit()
    db.refresh(invoice)

    record_invoice_event(status="ISSUED", payment_terms=req.payment_terms)

    return {
        "status": "SUCCESS",
        "message": f"Enterprise invoice {invoice.invoice_number} generated successfully.",
        "invoice": serialize_invoice(invoice),
    }


@invoicing_router.get("", response_model=Dict[str, Any])
def list_invoices(
    tenant_id: Optional[str] = Query(None, description="Filter by tenant ID"),
    invoice_status: Optional[str] = Query(None, description="Filter by status (ISSUED, PAID, OVERDUE, VOIDED)"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Lists corporate wire invoices with filtering and pagination."""
    query = db.query(EnterpriseInvoice)
    if tenant_id:
        query = query.filter(EnterpriseInvoice.tenant_id == tenant_id)
    if invoice_status:
        query = query.filter(EnterpriseInvoice.status == invoice_status.upper())

    invoices = query.order_by(desc(EnterpriseInvoice.created_at)).limit(limit).all()

    return {
        "count": len(invoices),
        "invoices": [serialize_invoice(inv) for inv in invoices],
    }


@invoicing_router.get("/{invoice_identifier}", response_model=Dict[str, Any])
def get_invoice(invoice_identifier: str, db: Session = Depends(get_db)):
    """Retrieves an invoice by UUID or human-readable invoice_number."""
    invoice = db.query(EnterpriseInvoice).filter(
        (EnterpriseInvoice.id == invoice_identifier) | 
        (EnterpriseInvoice.invoice_number == invoice_identifier) |
        (EnterpriseInvoice.reference_code == invoice_identifier)
    ).first()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Enterprise invoice '{invoice_identifier}' not found."
        )

    # Check for overdue status dynamically
    now = datetime.now(timezone.utc)
    if invoice.status == "ISSUED" and invoice.due_at.replace(tzinfo=timezone.utc) < now:
        invoice.status = "OVERDUE"
        db.commit()

    return {
        "invoice": serialize_invoice(invoice),
    }


@invoicing_router.post("/{invoice_id}/record-payment", response_model=Dict[str, Any])
def record_wire_payment(
    invoice_id: str,
    req: RecordPaymentRequest,
    db: Session = Depends(get_db),
):
    """
    Settles an enterprise invoice upon receipt of verified Fedwire/ACH transfer.
    Atomically updates invoice status to PAID and provisions compute balance into tenant account.
    """
    invoice = db.query(EnterpriseInvoice).filter(
        (EnterpriseInvoice.id == invoice_id) | (EnterpriseInvoice.invoice_number == invoice_id)
    ).first()

    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Invoice '{invoice_id}' not found.")

    if invoice.status == "PAID":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invoice '{invoice.invoice_number}' is already settled.")

    now = datetime.now(timezone.utc)
    invoice.status = "PAID"
    invoice.paid_at = now
    invoice.wire_confirmation_number = req.wire_confirmation_number
    invoice.cleared_amount = req.amount_received

    # Credit Provisioning
    credits_provisioned = 0.0
    if req.auto_provision_credits and not invoice.credits_provisioned:
        user = db.query(User).filter(User.tenant_id == invoice.tenant_id).first()
        if not user:
            user = User(tenant_id=invoice.tenant_id, email=invoice.contact_email, credits_balance=0.0000)
            db.add(user)
            db.flush()

        credit_delta = float(invoice.credits_to_provision)
        user.credits_balance = float(user.credits_balance) + credit_delta
        invoice.credits_provisioned = True
        credits_provisioned = credit_delta

    # Audit Trail
    audit = InvoiceAuditLedger(
        invoice_id=invoice.id,
        action="WIRE_PAYMENT_CONFIRMED",
        performed_by=req.performing_officer,
        notes=f"Wire cleared: {req.wire_confirmation_number}. Amount: ${req.amount_received:,.2f}. Credits provisioned: {credits_provisioned:,.2f}",
        metadata_json=f'{{"cleared_amount": {req.amount_received}, "confirmation": "{req.wire_confirmation_number}"}}'
    )
    db.add(audit)
    db.commit()
    db.refresh(invoice)

    record_invoice_event(status="PAID", payment_terms=invoice.payment_terms)

    return {
        "status": "SUCCESS",
        "message": f"Payment recorded for invoice {invoice.invoice_number}. Credits provisioned: {credits_provisioned:,.2f}",
        "invoice": serialize_invoice(invoice),
    }


@invoicing_router.post("/{invoice_id}/provision-credits", response_model=Dict[str, Any])
def provision_invoice_credits_manually(
    invoice_id: str,
    req: ProvisionCreditsRequest,
    db: Session = Depends(get_db),
):
    """
    Dedicated officer hook to manually authorize or override compute credits provisioning
    for strategic accounts prior to full bank clearing.
    """
    invoice = db.query(EnterpriseInvoice).filter(
        (EnterpriseInvoice.id == invoice_id) | (EnterpriseInvoice.invoice_number == invoice_id)
    ).first()

    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Invoice '{invoice_id}' not found.")

    amount_to_grant = req.override_credit_amount or float(invoice.credits_to_provision)

    user = db.query(User).filter(User.tenant_id == invoice.tenant_id).first()
    if not user:
        user = User(tenant_id=invoice.tenant_id, email=invoice.contact_email, credits_balance=0.0000)
        db.add(user)
        db.flush()

    user.credits_balance = float(user.credits_balance) + amount_to_grant
    invoice.credits_provisioned = True

    audit = InvoiceAuditLedger(
        invoice_id=invoice.id,
        action="CREDITS_PROVISIONED_MANUAL",
        performed_by=req.performing_officer,
        notes=f"Manual credit authorization: +{amount_to_grant:,.2f} credits. Reason: {req.reason}",
        metadata_json=f'{{"granted_credits": {amount_to_grant}, "reason": "{req.reason}"}}'
    )
    db.add(audit)
    db.commit()
    db.refresh(invoice)

    return {
        "status": "SUCCESS",
        "message": f"Successfully granted {amount_to_grant:,.2f} compute credits to tenant '{invoice.tenant_id}'.",
        "current_balance": float(user.credits_balance),
        "invoice": serialize_invoice(invoice),
    }


@invoicing_router.post("/{invoice_id}/void", response_model=Dict[str, Any])
def void_invoice(
    invoice_id: str,
    reason: str = Query(..., description="Justification for voiding invoice"),
    performing_officer: str = Query(..., description="Officer identifier"),
    db: Session = Depends(get_db),
):
    """Voids an uncollected or superseded enterprise invoice."""
    invoice = db.query(EnterpriseInvoice).filter(
        (EnterpriseInvoice.id == invoice_id) | (EnterpriseInvoice.invoice_number == invoice_id)
    ).first()

    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Invoice '{invoice_id}' not found.")

    if invoice.status == "PAID":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot void an invoice that is already marked PAID.")

    invoice.status = "VOIDED"
    audit = InvoiceAuditLedger(
        invoice_id=invoice.id,
        action="INVOICE_VOIDED",
        performed_by=performing_officer,
        notes=f"Invoice voided. Reason: {reason}",
    )
    db.add(audit)
    db.commit()

    record_invoice_event(status="VOIDED", payment_terms=invoice.payment_terms)

    return {
        "status": "SUCCESS",
        "message": f"Invoice {invoice.invoice_number} has been voided.",
        "invoice": serialize_invoice(invoice),
    }
