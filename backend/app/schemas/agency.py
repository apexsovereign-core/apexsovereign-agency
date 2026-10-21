"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: AI Automation Agency (AAA) & Institutional Clearance Schemas
Author: Principal Systems Architect
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, EmailStr, Field


IndustryType = Literal[
    "FINTECH",
    "HEALTHCARE",
    "LEGAL",
    "DEFENSE_AEROSPACE",
    "ENTERPRISE_SAAS",
    "LOGISTICS_SUPPLY_CHAIN",
    "ENERGY_INFRASTRUCTURE",
    "OTHER",
]

BudgetTier = Literal[
    "TIER_1_PILOT",             # $25,000 - $50,000
    "TIER_2_ENTERPRISE_CORE",    # $100,000 - $250,000
    "TIER_3_PLANETARY_SOVEREIGN" # $500,000+
]

UrgencyLevel = Literal["IMMEDIATE", "WITHIN_30_DAYS", "QUARTERLY_STRATEGIC"]


class TransformationRequestCreate(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=255)
    contact_name: str = Field(..., min_length=2, max_length=128)
    contact_email: EmailStr = Field(..., description="Corporate email for formal scoping delivery")
    industry: IndustryType = Field(default="FINTECH")
    company_size: str = Field(default="200-1000", description="Employee count band")
    current_stack: List[str] = Field(default_factory=lambda: ["Autonomous Neural Mesh", "PostgreSQL", "Decentralized Matrix"])
    automation_objectives: List[str] = Field(..., min_length=1)
    estimated_monthly_compute_hours: float = Field(default=120.0, ge=1.0)
    budget_tier: BudgetTier = Field(default="TIER_2_ENTERPRISE_CORE")
    urgency: UrgencyLevel = Field(default="IMMEDIATE")
    tenant_id: Optional[str] = None


class ScopedProposalResponse(BaseModel):
    proposal_id: str
    company_name: str
    recommended_tier: str
    executive_summary: str
    architecture_milestones: List[Dict[str, Any]]
    estimated_roi_multiplier: float
    projected_hours_saved_monthly: int
    implementation_fee_usd: float
    monthly_retainer_usd: float
    compute_credits_included: float
    cryptographic_quote_hash: str
    valid_until: str
    smart_invoice_id: str


class SmartInvoiceResponse(BaseModel):
    invoice_id: str
    invoice_number: str
    proposal_id: str
    company_name: str
    implementation_fee_usd: float
    monthly_retainer_usd: float
    total_due_usd: float
    payment_status: Literal["PENDING_SETTLEMENT", "SETTLED", "RETAINER_ACTIVE"]
    paypal_checkout_url: str
    wire_routing_info: Dict[str, str]
    created_at: str


class ProvisionPipelineRequest(BaseModel):
    proposal_id: str = Field(..., description="Approved scoped proposal ID")
    tenant_id: str = Field(..., description="Tenant UUID")
    corporate_webhook_url: Optional[str] = Field(None, description="Enterprise webhook endpoint")
    service_level_agreement: Literal[
        "STANDARD_99_9", "MISSION_CRITICAL_99_99", "SOVEREIGN_AIRGAPPED_99_999"
    ] = "MISSION_CRITICAL_99_99"


class ProvisionPipelineResult(BaseModel):
    provisioning_id: str
    tenant_id: str
    status: str
    active_workflows: List[str]
    dedicated_agent_cluster: str
    retainer_contract_id: str
    sla_tier: str
    corporate_webhook_status: str
    created_at: str


class WaitlistSubmissionRequest(BaseModel):
    organization_name: str = Field(..., min_length=2, max_length=255)
    work_email: EmailStr = Field(...)
    contact_name: str = Field(..., min_length=2, max_length=128)
    requested_compute_capacity: str = Field(default="8x NVIDIA H100 SXM5 80GB")
    use_case: str = Field(..., min_length=10)
    deposit_committed_usd: float = Field(default=5000.0, ge=0.0)


class WaitlistSubmissionResponse(BaseModel):
    waitlist_id: str
    organization_name: str
    work_email: str
    priority_tier: str
    queue_position: int
    estimated_clearance_days: int
    deposit_status: str
    clearance_status: str
    created_at: str


class ClearanceTokenRequest(BaseModel):
    waitlist_id: str = Field(...)
    admin_passcode: Optional[str] = Field(None, description="Root clearance passcode if admin-cleared")
    deposit_transaction_id: Optional[str] = Field(None, description="PayPal/Wire transaction ID for deposit")


class ClearanceTokenResponse(BaseModel):
    clearance_id: str
    organization_name: str
    tenant_id: str
    hmac_clearance_token: str
    pqc_lattice_signature: str
    allocated_credits: float
    sla_rank: str
    issued_at: str
    expires_at: str
