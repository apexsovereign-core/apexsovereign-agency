#!/usr/bin/env python3
# ==============================================================================
# APEXSOVEREIGN HOLDINGS — AETHELGRID DYNAMICS: ENERGY ALLOCATION ENGINE
# Path: services/aethelgrid/energy_allocator.py
# Real-Time Stranded Energy / SMR Dispatch & Molecular Workload Diversion
# Floor Trigger: Spot Price < $1.85/GPU-hr -> Automatically Divert Excess MW
# ==============================================================================

import os
import time
import asyncio
import logging
from typing import Dict, Any
from fastapi import FastAPI, status
from pydantic import BaseModel
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [AETHELGRID_DYNAMICS] %(message)s"
)

app = FastAPI(
    title="AethelGrid Dynamics Energy Allocator",
    version="1.0.0"
)

DATABASE_URL = os.getenv("DATABASE_URL")
AURAPHARM_ENDPOINT = os.getenv("AURAPHARM_ENDPOINT", "http://127.0.0.1:8001/api/v1/jobs/submit")
SPOT_ARBITRAGE_THRESHOLD_USD = 1.85
SMR_NAMEPLATE_CAPACITY_MW = 45.0
PUE_COEFFICIENT = 1.08

CURRENT_TELEMETRY: Dict[str, Any] = {
    "timestamp": time.time(),
    "grid_lmp_usd_mwh": 28.50,
    "smr_generation_mw": SMR_NAMEPLATE_CAPACITY_MW,
    "commercial_compute_mw": 25.0,
    "aurapharm_diverted_mw": 20.0,
    "clearing_spot_price_gpu_hr": 1.62,
    "allocation_state": "DIVERTED_TO_AURAPHARM"
}

class EnergyTelemetrySnapshot(BaseModel):
    timestamp: float
    grid_lmp_usd_mwh: float
    smr_generation_mw: float
    commercial_compute_mw: float
    aurapharm_diverted_mw: float
    clearing_spot_price_gpu_hr: float
    allocation_state: str

async def fetch_wholesale_grid_lmp() -> float:
    return 31.80

async def fetch_mesh_spot_price() -> float:
    return 1.62

async def trigger_aurapharm_workload_absorption(mw_diverted: float):
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            payload = {
                "allocated_power_mw": mw_diverted,
                "equivalent_gpus": int((mw_diverted * 1000) / 0.7),
                "source": "AETHELGRID_STRANDED_SMR",
                "timestamp": time.time()
            }
            resp = await client.post(AURAPHARM_ENDPOINT, json=payload)
            if resp.status_code in (200, 201, 202):
                logging.info(f"Dispatched {mw_diverted:.2f} MW surplus capacity to AuraPharm.ai.")
            else:
                logging.warning(f"AuraPharm endpoint returned code {resp.status_code}: {resp.text}")
        except Exception as err:
            logging.error(f"Failed to communicate with AuraPharm.ai: {err}")

async def energy_arbitrage_loop():
    logging.info("Starting AethelGrid Dynamics Energy Optimization Loop (Interval: 10s)...")
    while True:
        try:
            grid_lmp = await fetch_wholesale_grid_lmp()
            spot_price = await fetch_mesh_spot_price()

            if spot_price < SPOT_ARBITRAGE_THRESHOLD_USD:
                commercial_mw = 25.0
                diverted_mw = SMR_NAMEPLATE_CAPACITY_MW - commercial_mw
                state = "DIVERTED_TO_AURAPHARM"
                await trigger_aurapharm_workload_absorption(diverted_mw)
            else:
                commercial_mw = SMR_NAMEPLATE_CAPACITY_MW
                diverted_mw = 0.0
                state = "FULL_COMMERCIAL_ARBITRAGE"

            CURRENT_TELEMETRY.update({
                "timestamp": time.time(),
                "grid_lmp_usd_mwh": grid_lmp,
                "smr_generation_mw": SMR_NAMEPLATE_CAPACITY_MW,
                "commercial_compute_mw": commercial_mw,
                "aurapharm_diverted_mw": diverted_mw,
                "clearing_spot_price_gpu_hr": spot_price,
                "allocation_state": state
            })

            await asyncio.sleep(10)
        except Exception as exc:
            logging.error(f"Energy allocator loop error: {exc}")
            await asyncio.sleep(5)

@app.on_event("startup")
async def on_startup():
    asyncio.create_task(energy_arbitrage_loop())

@app.get("/api/v1/grid/telemetry", response_model=EnergyTelemetrySnapshot)
async def get_grid_telemetry():
    return EnergyTelemetrySnapshot(**CURRENT_TELEMETRY)

@app.get("/health")
async def health():
    return {
        "status": "HEALTHY",
        "service": "AethelGrid Dynamics Energy Allocator",
        "smr_capacity_mw": SMR_NAMEPLATE_CAPACITY_MW,
        "arbitrage_threshold_usd": SPOT_ARBITRAGE_THRESHOLD_USD
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
