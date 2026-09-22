"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Autonomous Lead Qualification, AI Inbound Chat Processing & CRM Autopilot
Author: Chief Autonomous Operations Architect

Features:
1. Real-Time Inbound Chat Agent & Lead Scorer (Rule-Based & Neural Valuation).
2. Autonomous CRM Sync (PostgreSQL Institutional Contacts & Leads Pipeline).
3. Dynamic Ingestion -> Scoping -> Email Notification Autopilot.
4. Auto-Provisioning of Trial/Pilot Sandbox Tenant Partitions.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import logging
import secrets
import uuid
from typing import Any, Dict, List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from asyncpg.connection import Connection

from backend.app.api.deps import get_db_tx
from backend.app.services.email_service import get_email_service
from backend.app.services.ledger_service import LedgerService

logger = logging.getLogger("apexsovereign.lead_engine")
router = APIRouter(prefix="/leads", tags=["Autonomous Lead Qualification & CRM"])


class InboundChatAgentRequest(BaseModel):
    session_id: str = Field(..., description="Unique web visitor or agent session identifier")
    user_message: str = Field(..., min_length=1, max_length=2000)
    company_name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_name: Optional[str] = None
    budget_range: Optional[str] = None
    compute_needs: Optional[str] = None
    conversation_history: List[Dict[str, str]] = Field(default_factory=list)


class InboundChatAgentResponse(BaseModel):
    session_id: str
    agent_reply: str
    lead_score: int  # 0 to 100
    qualification_tier: Literal["SOVEREIGN_HOT", "ENTERPRISE_QUALIFIED", "EXPLORATORY", "NURTURE"]
    recommended_plan: str
    suggested_actions: List[str]
    captured_lead_id: Optional[str] = None
    crm_synced: bool
    email_dispatched: bool


class AutonomousCRMLead(BaseModel):
    id: str
    company_name: str
    contact_name: str
    contact_email: str
    lead_score: int
    qualification_tier: str
    estimated_monthly_value_usd: float
    automation_requirements: List[str]
    status: Literal["NEW", "QUALIFIED", "SCOPED", "CLOSED_WON", "NURTURE"]
    tenant_id: Optional[str] = None
    crm_metadata: Dict[str, Any]
    created_at: str


class LeadQualificationEngine:
    """
    Evaluates enterprise buying signals, compute intensity, and automation urgency.
    Calculates dynamic lead scoring from 0 to 100 with actionable next steps.
    """

    @staticmethod
    def score_conversation(
        message: str,
        email: Optional[str],
        company: Optional[str],
        budget: Optional[str],
        compute: Optional[str],
    ) -> tuple[int, Literal["SOVEREIGN_HOT", "ENTERPRISE_QUALIFIED", "EXPLORATORY", "NURTURE"], str, float]:
        score = 25  # Base interest
        text_lower = message.lower()

        # Check for high-intent keywords
        high_intent_kw = ["h100", "cluster", "gpu", "enterprise", "soc2", "compliance", "billing", "api", "migration", "production", "scale", "paypal", "retainer", "wire"]
        for kw in high_intent_kw:
            if kw in text_lower:
                score += 8

        # Check corporate email validity
        if email:
            score += 15
            domain = email.split("@")[-1].lower()
            free_providers = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"]
            if domain not in free_providers:
                score += 15  # Verified corporate B2B domain

        if company:
            score += 10

        if budget:
            budget_str = budget.lower()
            if any(b in budget_str for b in ["100k", "50k", "250k", "500k", "million"]):
                score += 25
            elif "10k" in budget_str or "25k" in budget_str:
                score += 15

        if compute:
            score += 10

        # Cap score between 0 and 100
        final_score = min(100, score)

        if final_score >= 80:
            tier = "SOVEREIGN_HOT"
            plan = "Planetary Sovereign Enterprise ($499/mo + $85k Retainer)"
            est_value = 85000.00
        elif final_score >= 60:
            tier = "ENTERPRISE_QUALIFIED"
            plan = "Enterprise Pro ($99/mo + Fast-Track Pilot)"
            est_value = 25000.00
        elif final_score >= 40:
            tier = "EXPLORATORY"
            plan = "Starter Autonomous ($29/mo)"
            est_value = 1500.00
        else:
            tier = "NURTURE"
            plan = "Free Developer Evaluation"
            est_value = 0.00

        return final_score, tier, plan, est_value


@router.post(
    "/agent/chat",
    response_model=InboundChatAgentResponse,
    summary="Inbound Autonomous Chat Agent & Real-Time Lead Scoring",
    description="Processes user inquiries, calculates B2B lead scores, updates CRM, and triggers email notifications on autopilot.",
)
async def process_inbound_chat(
    payload: InboundChatAgentRequest,
    conn: Connection = Depends(get_db_tx),
) -> InboundChatAgentResponse:
    score, tier, rec_plan, est_value = LeadQualificationEngine.score_conversation(
        message=payload.user_message,
        email=str(payload.contact_email) if payload.contact_email else None,
        company=payload.company_name,
        budget=payload.budget_range,
        compute=payload.compute_needs,
    )

    # Autonomous dialogue generation
    contact_greeting = f" {payload.contact_name}" if payload.contact_name else ""
    if tier == "SOVEREIGN_HOT":
        reply = (
            f"Greetings{contact_greeting}. ApexSovereign's Autonomous Operations engine has prioritized your account "
            f"under {tier}. We can immediately reserve dedicated compute clusters with isolated PostgreSQL tenant "
            f"partitions and cryptographic HMAC lease signing. Our systems recommend the {rec_plan}."
        )
    elif tier == "ENTERPRISE_QUALIFIED":
        reply = (
            f"Thank you for contacting ApexSovereign{contact_greeting}. Your enterprise profile qualifies for our "
            f"{rec_plan}. We have allocated sandbox compute credits for immediate evaluation with zero human onboarding delays."
        )
    else:
        reply = (
            f"Welcome to ApexSovereign.ai. We operate an autonomous compute broker and Work OS. You can test our "
            f"algorithms directly via the portal or subscribe instantly via PayPal for immediate compute token allocation."
        )

    suggested_actions = [
        "Review Sovereign Pricing & Compute Quotas",
        "Inspect Architectural Zero-Trust Whitepaper",
        "Initialize Live PayPal Checkout",
    ]
    if tier in ("SOVEREIGN_HOT", "ENTERPRISE_QUALIFIED"):
        suggested_actions.insert(0, "Schedule Sovereign Fast-Track Scoping Call")

    captured_lead_id: Optional[str] = None
    crm_synced = False
    email_sent = False

    # Sync to CRM table if contact email was supplied
    if payload.contact_email:
        captured_lead_id = f"lead_{secrets.token_hex(6)}"
        company = payload.company_name or "Enterprise Inbound"
        name = payload.contact_name or "Institutional Contact"

        try:
            insert_query = """
                INSERT INTO enterprise_transformation_requests (
                    company_name, contact_name, contact_email,
                    industry, company_size, current_stack, automation_objectives,
                    estimated_monthly_compute_hours, budget_tier, urgency, status
                )
                VALUES ($1, $2, $3, 'ENTERPRISE_SAAS', '200-1000', '["PostgreSQL", "FastAPI"]'::jsonb,
                        $4::jsonb, 100.0, 'TIER_2_ENTERPRISE_CORE', 'IMMEDIATE', 'QUALIFIED')
                ON CONFLICT DO NOTHING;
            """
            await conn.execute(
                insert_query,
                company,
                name,
                str(payload.contact_email),
                json.dumps([payload.user_message[:200]]),
            )
            crm_synced = True
        except Exception as exc:
            logger.warning("CRM table sync note: %s", exc)

        # Trigger Automated Email Delivery Autopilot
        email_svc = get_email_service()
        try:
            if tier in ("SOVEREIGN_HOT", "ENTERPRISE_QUALIFIED"):
                await email_svc.dispatch_lead_proposal(
                    to_email=str(payload.contact_email),
                    company_name=company,
                    contact_name=name,
                    proposal_id=f"PROP-{secrets.token_hex(4).upper()}",
                    recommended_tier=rec_plan,
                    implementation_fee=est_value,
                    monthly_retainer=est_value * 0.20,
                    roi_multiplier=4.8,
                    hours_saved_monthly=350,
                )
                email_sent = True
        except Exception as email_exc:
            logger.error("Failed to dispatch autonomous lead email: %s", email_exc)

    return InboundChatAgentResponse(
        session_id=payload.session_id,
        agent_reply=reply,
        lead_score=score,
        qualification_tier=tier,
        recommended_plan=rec_plan,
        suggested_actions=suggested_actions,
        captured_lead_id=captured_lead_id,
        crm_synced=crm_synced,
        email_dispatched=email_sent,
    )


@router.post(
    "/provision-trial",
    summary="Autonomous Instant Trial Provisioning with Supabase Ledger Sync",
    description="Provisions an isolated tenant partition with free evaluation credits without human touch.",
)
async def provision_instant_trial(
    email: EmailStr,
    company: str,
    name: str,
    conn: Connection = Depends(get_db_tx),
) -> Dict[str, Any]:
    tenant_id = f"tenant_trial_{secrets.token_hex(4)}"
    api_key = f"sk_demo_apex_{secrets.token_hex(16)}"
    credits = 1000.0  # 1,000 complimentary compute units

    # Commit trial tenant under atomic PostgreSQL transaction
    tenant_query = """
        INSERT INTO tenants (id, name, credit_balance, plan_tier, status, created_at)
        VALUES ($1, $2, $3, 'starter', 'active', NOW())
        ON CONFLICT (id) DO UPDATE SET credit_balance = tenants.credit_balance + $3;
    """
    await conn.execute(tenant_query, tenant_id, company, credits)

    # Dispatch Welcome Email via Resend/SMTP
    email_svc = get_email_service()
    dispatch_res = await email_svc.dispatch_welcome_sequence(
        to_email=str(email),
        full_name=name,
        tenant_id=tenant_id,
        api_key_preview=f"{api_key[:12]}...{api_key[-4:]}",
        plan_name="Starter Trial",
        compute_credits=credits,
    )

    return {
        "status": "PROVISIONED",
        "tenant_id": tenant_id,
        "company": company,
        "credits_allocated": credits,
        "api_key": api_key,
        "email_delivery": {
            "success": dispatch_res.success,
            "provider": dispatch_res.provider,
            "message_id": dispatch_res.message_id,
        },
    }
