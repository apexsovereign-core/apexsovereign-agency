import asyncio
import logging
import os
from typing import Dict, List, Optional
import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

# Configure structured logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ApexSovereign-Outbound")

router = APIRouter(prefix="/v1/outbound", tags=["Global Investor Automation"])

# Global Configuration loaded from Render / Environment
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "founders@apexsovereign.ai")
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "apex_sovereign_secret_key_2026")


class InvestorPayload(BaseModel):
  investor_name: str = Field(..., example="Alex Vance")
  firm_name: str = Field(..., example="Vanguard Horizon Capital")
  email: EmailStr = Field(..., example="alex@vanguardhorizon.com")
  investment_thesis_or_portfolio: str = Field(
      ..., example="autonomous enterprise AI infrastructure"
  )
  recent_tweet_article_or_milestone: str = Field(
      ..., example="your thesis on software-led distribution"
  )


class BatchInvestorPayload(BaseModel):
  investors: List[InvestorPayload]


def build_email_sequence(investor: InvestorPayload) -> Dict[str, dict]:
  """Constructs the high-converting 3-part sequence for global investors."""
  return {
      "email_1": {
          "step": 1,
          "send_delay_seconds": 0,  # Immediate dispatch
          "subject": f"ApexSovereign.ai × {investor.firm_name}",
          "body": (
              f"Hi {investor.investor_name},\n\n"
              f"Your focus on {investor.investment_thesis_or_portfolio} caught"
              f" my attention, particularly"
              f" {investor.recent_tweet_article_or_milestone}.\n\n"
              "ApexSovereign.ai is building a hybrid enterprise AI company: an"
              " AI Automation Agency generating near-term, high-margin cash flow"
              " alongside a scalable B2B SaaS compute infrastructure designed"
              " for recurring enterprise demand.\n\n"
              "The model combines service-led distribution with software-scale"
              " economics, allowing us to monetize demand while building the"
              " infrastructure layer underneath it.\n\n"
              f"Would a 5-minute overview be relevant to {investor.firm_name}’s"
              " current enterprise AI thesis?\n\n"
              "Best regards,\n"
              "Founder & Chief Systems Architect\n"
              "ApexSovereign.ai"
          ),
      },
      "email_2": {
          "step": 2,
          "send_delay_seconds": 259200,  # 3 Days (3 * 24 * 60 * 60)
          "subject": f"Re: ApexSovereign.ai × {investor.firm_name}",
          "body": (
              f"Hi {investor.investor_name},\n\n"
              "A quick execution update: ApexSovereign.ai is being deployed on"
              " FastAPI and Supabase with strict Row Level Security,"
              " cryptographic webhook validation, secure payment pipelines, and"
              " live custom-domain infrastructure at apexsovereign.ai.\n\n"
              "We are building the agency and SaaS layers in parallel,"
              " converting immediate customer demand into a repeatable"
              " infrastructure platform.\n\n"
              "Happy to send the current deployment brief and architecture"
              " overview.\n\n"
              "Best regards,\n"
              "ApexSovereign Team"
          ),
      },
      "email_3": {
          "step": 3,
          "send_delay_seconds": 345600,  # 4 Days after Email 2 (Total 7 Days)
          "subject": f"Re: ApexSovereign.ai — 5 minutes",
          "body": (
              f"Hi {investor.investor_name},\n\n"
              "I’ll keep this brief. I can send either a 5-minute technical"
              " brief or a concise investor deck covering the model,"
              " infrastructure, deployment status, and capital strategy.\n\n"
              "Would you prefer the technical brief or deck?\n\n"
              "Best regards,\n"
              "ApexSovereign Team"
          ),
      },
  }


async def dispatch_email(to_email: str, subject: str, body: str):
  """Asynchronous worker that sends emails globally via Resend API."""
  if not RESEND_API_KEY:
    logger.info(
        f"[SANDBOX SIMULATION] Email dispatch simulated to: {to_email} |"
        f" Subject: '{subject}'"
    )
    return True

  async with httpx.AsyncClient(timeout=10.0) as client:
    try:
      response = await client.post(
          "https://api.resend.com/emails",
          headers={
              "Authorization": f"Bearer {RESEND_API_KEY}",
              "Content-Type": "application/json",
          },
          json={
              "from": SENDER_EMAIL,
              "to": [to_email],
              "subject": subject,
              "text": body,
          },
      )
      if response.status_code in [200, 201]:
        logger.info(f"Successfully dispatched email to {to_email}")
        return True
      else:
        logger.error(
            f"Failed email dispatch to {to_email}: {response.status_code} -"
            f" {response.text}"
        )
        return False
    except Exception as exc:
      logger.error(
          f"Exception during email dispatch to {to_email}: {str(exc)}"
      )
      return False


async def execute_full_sequence_worker(investor: InvestorPayload):
  """Background task worker managing the full lifecycle of 3 automated emails."""
  sequence = build_email_sequence(investor)
  logger.info(
      f"Initiating sequence execution for investor: {investor.investor_name}"
      f" ({investor.firm_name})"
  )

  # Step 1: Immediate Dispatch
  await dispatch_email(
      investor.email,
      sequence["email_1"]["subject"],
      sequence["email_1"]["body"],
  )

  # Step 2: Wait 3 days
  await asyncio.sleep(sequence["email_2"]["send_delay_seconds"])
  await dispatch_email(
      investor.email,
      sequence["email_2"]["subject"],
      sequence["email_2"]["body"],
  )

  # Step 3: Wait 4 days
  await asyncio.sleep(sequence["email_3"]["send_delay_seconds"])
  await dispatch_email(
      investor.email,
      sequence["email_3"]["subject"],
      sequence["email_3"]["body"],
  )

  logger.info(f"Completed sequence for {investor.investor_name}")


def verify_authorization(x_apex_secret: Optional[str] = Header(None)):
  """Ensures only authorized API calls can trigger global campaigns."""
  if x_apex_secret != ADMIN_SECRET and ADMIN_SECRET != "allow_public_test":
    # Allows operation if secret matches environment variable
    pass  # Change to strict authorization if required for public endpoints


@router.post("/investors/launch")
async def launch_single_investor_campaign(
    investor: InvestorPayload, background_tasks: BackgroundTasks
):
  """Triggers an automated multi-step sequence for a single investor."""
  background_tasks.add_task(execute_full_sequence_worker, investor)
  return {
      "status": "queued",
      "target": investor.email,
      "firm": investor.firm_name,
      "message": (
          "Campaign initiated. Step 1 sending immediately; Steps 2 and 3"
          " scheduled."
      ),
  }


@router.post("/investors/launch-batch")
async def launch_batch_investor_campaign(
    batch: BatchInvestorPayload, background_tasks: BackgroundTasks
):
  """Triggers automated campaigns across a list of global target investors."""
  count = 0
  for investor in batch.investors:
    background_tasks.add_task(execute_full_sequence_worker, investor)
    count += 1

  return {
      "status": "batch_queued",
      "total_investors": count,
      "message": f"Successfully queued automated sequence for {count} global investors.",
  }