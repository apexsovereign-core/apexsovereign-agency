import csv
import logging
from typing import List, Optional
from pydantic import BaseModel, EmailStr

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Investor(BaseModel):
    name: str
    email: EmailStr
    firm: str
    personalization_note: Optional[str] = "Loved your recent investments in AI automation."

def send_outbound_campaign(csv_file_path: str = "investors.csv", dry_run: bool = True) -> dict:
    """
    Reads an investor list from a CSV file and simulates or executes outbound campaigns.
    If dry_run=True, it logs mock emails safely to the console without needing an API key.
    """
    investors = []
    
    # Attempt to load from CSV, fallback to a sample investor if file doesn't exist yet
    try:
        with open(csv_file_path, mode="r", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            for row in reader:
                investors.append(Investor(
                    name=row.get("name"),
                    email=row.get("email"),
                    firm=row.get("firm"),
                    personalization_note=row.get("note", "Excited by your AI portfolio thesis.")
                ))
    except FileNotFoundError:
        logger.warning(f"⚠️ CSV file '{csv_file_path}' not found. Using sample fallback data for testing.")
        investors.append(
            Investor(
                name="Alex Smith", 
                email="alex@sampleventure.com", 
                firm="Apex Ventures", 
                personalization_note="Noticed your focus on high-ticket B2B automation."
            )
        )

    sent_count = 0
    for inv in investors:
        subject = f"Scaling ApexSovereign.ai — AI Infrastructure for {inv.firm}"
        body = (
            f"Hi {inv.name},\n\n"
            f"{inv.personalization_note}\n\n"
            f"At ApexSovereign.ai, we are deploying institutional-grade FastAPI outbound automation engines.\n"
            f"Would love to share how we are scaling agency revenue.\n\n"
            f"Best regards,\nApexSovereign Team"
        )
        
        if dry_run:
            logger.info(f"\n[DRY RUN SIMULATION] -----------------------------------------")
            logger.info(f"To: {inv.name} <{inv.email}> | Firm: {inv.firm}")
            logger.info(f"Subject: {subject}")
            logger.info(f"Message:\n{body}")
            logger.info(f"--------------------------------------------------------------\n")
            sent_count += 1
        else:
            # TODO: Integrate live Resend or SMTP sender here once you get an API key
            pass

    return {
        "status": "success",
        "mode": "dry_run" if dry_run else "live",
        "total_processed": sent_count
    }
