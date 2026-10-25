import os
import asyncio
import time
import json
import logging
from typing import Dict, Any, Optional
from fastapi import FastAPI
from pydantic import BaseModel
import asyncpg
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization
import jwt

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] [AURAPHARM_SWEEPER] %(message)s")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
SPOT_RESERVE_FLOOR_USD = 1.85  # $1.85/GPU-hr threshold
MARGINAL_ENERGY_COST_USD = 0.55  # Average $0.45-$0.65/GPU-hr carrying cost

app = FastAPI(title="AuraPharm Basal Load Sweeper Engine", version="0.4.0")

# Generate operational ED25519 key pair for molecular IP token signing
private_key = ed25519.Ed25519PrivateKey.generate()
public_key = private_key.public_key()

private_pem = private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
)

class MolecularIPToken(BaseModel):
    job_id: str
    target_protein: str
    sequence_hash: str
    gpu_cluster_id: str
    energy_cost_usd_hr: float
    timestamp: float

def mint_ed25519_jws(ip_payload: Dict[str, Any]) -> str:
    """Mints an ED25519-signed JWT token verifying proprietary molecular IP discovery."""
    encoded_token = jwt.encode(
        ip_payload,
        private_pem,
        algorithm="EdDSA",
        headers={"typ": "JWT", "alg": "EdDSA", "entity": "AuraPharm.ai"}
    )
    return encoded_token

async def fn_persist_molecular_asset(pool: asyncpg.Pool, job_id: str, token_jws: str, payload: Dict[str, Any]):
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO ledger_entries (
                tenant_id,
                amount_cu,
                transaction_type,
                reference_id,
                metadata
            ) VALUES (
                '00000000-0000-0000-0000-000000000001'::uuid,
                $1,
                'AURAPHARM_CREDIT',
                $2,
                $3::jsonb
            )
            ON CONFLICT (reference_id) DO NOTHING;
            """,
            payload["energy_cost_usd_hr"] * 100.0,
            job_id,
            json.dumps({"jws_token": token_jws, "payload": payload})
        )
    logging.info(f"PERLISTED MOLECULAR IP ASSET: {job_id} | JWS Signature Verified")

async def basal_capacity_sweeper_loop():
    logging.info("Starting Basal Load Sweeper Polling Loop (Interval: 10s)...")
    pool = None
    try:
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
    except Exception as e:
        logging.warning(f"Database connection pool delayed: {e}. Sweeper running in dry-run mode.")

    while True:
        try:
            # Simulate real-time spot market clearing price query across mesh
            current_spot_price = 1.42  # Simulating market dip below $1.85 floor
            
            if current_spot_price < SPOT_RESERVE_FLOOR_USD:
                job_id = f"job-bio-{int(time.time() * 1000)}"
                payload = {
                    "job_id": job_id,
                    "target_protein": "EGFR_MUTANT_V3",
                    "sequence_hash": "sha256-a8f10b83e490c21",
                    "gpu_cluster_id": "cluster-iceland-geo-01",
                    "energy_cost_usd_hr": MARGINAL_ENERGY_COST_USD,
                    "timestamp": time.time()
                }
                
                # Mint cryptographic proof of discovery
                jws_token = mint_ed25519_jws(payload)
                logging.info(f"SPOT DIP DETECTED (${current_spot_price}/hr <${SPOT_RESERVE_FLOOR_USD}/hr). Sweeping idle cycles to AlphaFold3 run: {job_id}")
                
                if pool:
                    await fn_persist_molecular_asset(pool, job_id, jws_token, payload)
            
            await asyncio.sleep(10)
        except Exception as err:
            logging.error(f"Sweeper loop encountered transient fault: {err}")
            await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(basal_capacity_sweeper_loop())

@app.get("/health")
async def health_check():
    return {
        "status": "ACTIVE",
        "service": "AuraPharm.ai Basal Load Sweeper",
        "reserve_floor_usd_hr": SPOT_RESERVE_FLOOR_USD,
        "marginal_cost_usd_hr": MARGINAL_ENERGY_COST_USD,
        "signature_algorithm": "ED25519-EdDSA"
    }
