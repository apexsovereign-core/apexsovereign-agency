# services/aurapharm-sweeper/main.py
"""
ApexSovereign Holdings - AuraPharm Autonomous Sweeper Service
FastAPI entrypoint and background worker manager for off-peak GPU capacity harvesting.
"""

import asyncio
from fastapi import FastAPI
from sweeper import BasalSweeperEngine, SPOT_RESERVE_FLOOR_USD, CARRYING_COST_PER_GPU_HR

app = FastAPI(
    title="AuraPharm Autonomous Basal Sweeper Core",
    version="1.0.0"
)

sweeper_engine = BasalSweeperEngine()


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(sweeper_engine.execute_sweep_cycle())


@app.get("/health")
async def health_check():
    return {
        "status": "OPERATIONAL",
        "service": "AuraPharm Autonomous Basal Sweeper",
        "sweeping_active": sweeper_engine.is_sweeping_active,
        "spot_floor_usd_hr": SPOT_RESERVE_FLOOR_USD,
        "carrying_cost_usd_hr": CARRYING_COST_PER_GPU_HR,
        "public_verification_key": sweeper_engine.signer.get_public_key_hex()
    }


@app.get("/api/v1/aurapharm/status")
async def get_sweeper_status():
    return {
        "is_sweeping_active": sweeper_engine.is_sweeping_active,
        "cryptographic_algorithm": "ED25519-EdDSA",
        "target_workload": "AlphaFold3 / Molecular Docking V4"
    }
