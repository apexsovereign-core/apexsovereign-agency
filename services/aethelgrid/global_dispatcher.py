#!/usr/bin/env python3
# ==============================================================================
# APEXSOVEREIGN.AI — PLANETARY ENERGY GRID DISPATCH & SMR CONTROLLER
# Path: services/aethelgrid/global_dispatcher.py
# Strategy: 5+ Planetary Energy Zones, Real-Time Frequency Stabilization & Zero-Carbon Routing
# Dispatch: Industrial AI Compute Arbitrage vs. AuraPharm IP Molecular Synthesis
# ==============================================================================

import os
import sys
import time
import asyncio
import logging
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [AETHELGRID_PLANETARY] %(message)s"
)

app = FastAPI(
    title="AethelGrid Planetary Energy Dispatcher",
    version="1.0.0"
)

AURAPHARM_ENDPOINT = os.getenv("AURAPHARM_ENDPOINT", "http://127.0.0.1:8001/api/v1/jobs/submit")
TARGET_GRID_FREQUENCY_HZ = 50.0  # Or 60.0 depending on continental grid
FREQUENCY_DEVIATION_TOLERANCE_HZ = 0.05
SPOT_ARBITRAGE_FLOOR_USD = 1.85

# 5 Global Planetary Energy Zones
GLOBAL_ENERGY_ZONES: Dict[str, Dict[str, Any]] = {
    "NORDIC_HYDRO": {
        "zone_name": "Nordic Hydro & Geothermal Corridor",
        "region_code": "eu-north-1",
        "power_source": "Hydroelectric / Basalt Geothermal",
        "nameplate_capacity_mw": 120.0,
        "current_lmp_usd_mwh": 18.20,
        "carbon_intensity_g_kwh": 12.0,
        "grid_frequency_hz": 50.01,
        "curtailed_excess_mw": 34.5,
        "green_certificate_token": "REC-NORDIC-2026-991A",
        "active_dispatch_state": "MAX_COMMERCIAL_COMPUTE"
    },
    "US_WEST_SMR": {
        "zone_name": "US-West Small Modular Reactor Park",
        "region_code": "us-west-smr",
        "power_source": "45MW Westinghouse eVinci SMR",
        "nameplate_capacity_mw": 45.0,
        "current_lmp_usd_mwh": 26.50,
        "carbon_intensity_g_kwh": 0.0,
        "grid_frequency_hz": 59.98,
        "curtailed_excess_mw": 14.0,
        "green_certificate_token": "REC-SMR-USWEST-440B",
        "active_dispatch_state": "DIVERTED_TO_AURAPHARM"
    },
    "PJM_EAST_GRID": {
        "zone_name": "Appalachian Stranded Nuclear / Coal Transition",
        "region_code": "us-east-pjm",
        "power_source": "Stranded Nuclear Off-take",
        "nameplate_capacity_mw": 85.0,
        "current_lmp_usd_mwh": 31.40,
        "carbon_intensity_g_kwh": 18.0,
        "grid_frequency_hz": 60.02,
        "curtailed_excess_mw": 8.0,
        "green_certificate_token": "REC-PJM-STRANDED-118C",
        "active_dispatch_state": "COMMERCIAL_ARBITRAGE"
    },
    "APAC_HYDRO": {
        "zone_name": "Asia-Pacific Mountain Run-of-River Hydro",
        "region_code": "ap-southeast-hydro",
        "power_source": "Glacial Run-of-River Hydro",
        "nameplate_capacity_mw": 90.0,
        "current_lmp_usd_mwh": 15.80,
        "carbon_intensity_g_kwh": 8.0,
        "grid_frequency_hz": 50.00,
        "curtailed_excess_mw": 42.0,
        "green_certificate_token": "REC-APAC-HYDRO-772D",
        "active_dispatch_state": "DIVERTED_TO_AURAPHARM"
    },
    "LATAM_GEOTHERMAL": {
        "zone_name": "Central American Volcanic Geothermal Trench",
        "region_code": "latam-geo-01",
        "power_source": "Superheated Volcanic Brine",
        "nameplate_capacity_mw": 60.0,
        "current_lmp_usd_mwh": 19.50,
        "carbon_intensity_g_kwh": 4.0,
        "grid_frequency_hz": 60.01,
        "curtailed_excess_mw": 21.5,
        "green_certificate_token": "REC-LATAM-GEO-331E",
        "active_dispatch_state": "MAX_COMMERCIAL_COMPUTE"
    }
}

ACTIVE_DISPATCH_EVENTS: List[Dict[str, Any]] = []


class ZoneAllocationRequest(BaseModel):
    zone_id: str
    target_mw: float
    requestor: str


async def dispatch_aurapharm_curtailment(zone_id: str, mw_amount: float):
    """Signals AuraPharm molecular simulation engine to absorb curtailed clean megawatts."""
    async with httpx.AsyncClient(timeout=4.0) as client:
        try:
            payload = {
                "allocated_power_mw": mw_amount,
                "zone_origin": zone_id,
                "equivalent_gpus": int((mw_amount * 1000) / 0.7),
                "timestamp": time.time(),
                "priority": "HIGH_CURTAILMENT_ABSORPTION"
            }
            resp = await client.post(AURAPHARM_ENDPOINT, json=payload)
            logging.info(f"[PLANETARY_DISPATCH] Diverted {mw_amount:.1f} MW in {zone_id} to AuraPharm (Status: {resp.status_code})")
        except Exception as err:
            logging.warning(f"[PLANETARY_DISPATCH] AuraPharm dispatch warning: {err}")


async def planetary_frequency_and_arbitrage_optimizer():
    """Real-time optimization loop adjusting global MW flows based on frequency and LMP."""
    logging.info("Starting Planetary Energy Optimization Loop across 5 Global Zones...")
    while True:
        try:
            for zone_id, zone in GLOBAL_ENERGY_ZONES.items():
                freq_delta = abs(zone["grid_frequency_hz"] - (50.0 if "NORDIC" in zone_id or "APAC" in zone_id else 60.0))

                # Grid Stabilization Rule: If grid frequency drops (grid stress), curtail industrial load
                if freq_delta > FREQUENCY_DEVIATION_TOLERANCE_HZ:
                    zone["active_dispatch_state"] = "GRID_FREQUENCY_STABILIZATION"
                    zone["curtailed_excess_mw"] = zone["nameplate_capacity_mw"] * 0.50
                    await dispatch_aurapharm_curtailment(zone_id, zone["curtailed_excess_mw"])
                elif zone["current_lmp_usd_mwh"] < 20.0 or zone["curtailed_excess_mw"] > 15.0:
                    # Marginal cost optimization: Divert cheap excess energy to AuraPharm molecular synthesis
                    zone["active_dispatch_state"] = "DIVERTED_TO_AURAPHARM"
                    await dispatch_aurapharm_curtailment(zone_id, zone["curtailed_excess_mw"])
                else:
                    zone["active_dispatch_state"] = "MAX_COMMERCIAL_COMPUTE"

            await asyncio.sleep(10.0)
        except Exception as exc:
            logging.error(f"[PLANETARY_OPTIMIZER] Exception: {exc}")
            await asyncio.sleep(3.0)


@app.on_event("startup")
async def on_startup():
    asyncio.create_task(planetary_frequency_and_arbitrage_optimizer())


@app.get("/api/v1/grid/planetary-overview")
async def get_planetary_overview():
    total_mw = sum(z["nameplate_capacity_mw"] for z in GLOBAL_ENERGY_ZONES.values())
    total_curtailed = sum(z["curtailed_excess_mw"] for z in GLOBAL_ENERGY_ZONES.values())
    avg_carbon = sum(z["carbon_intensity_g_kwh"] for z in GLOBAL_ENERGY_ZONES.values()) / len(GLOBAL_ENERGY_ZONES)

    return {
        "status": "OPERATIONAL",
        "total_planetary_capacity_mw": total_mw,
        "total_curtailed_clean_mw": total_curtailed,
        "average_carbon_intensity_g_kwh": round(avg_carbon, 2),
        "active_zones_count": len(GLOBAL_ENERGY_ZONES),
        "zones": GLOBAL_ENERGY_ZONES
    }


@app.post("/api/v1/grid/zone/override")
async def override_zone_allocation(req: ZoneAllocationRequest):
    if req.zone_id not in GLOBAL_ENERGY_ZONES:
        raise HTTPException(status_code=404, detail="Zone not recognized")

    zone = GLOBAL_ENERGY_ZONES[req.zone_id]
    zone["curtailed_excess_mw"] = req.target_mw
    zone["active_dispatch_state"] = f"MANUAL_OVERRIDE_{req.requestor.upper()}"

    event = {
        "zone_id": req.zone_id,
        "target_mw": req.target_mw,
        "requestor": req.requestor,
        "timestamp": time.time()
    }
    ACTIVE_DISPATCH_EVENTS.append(event)
    return {"status": "OVERRIDE_APPLIED", "event": event}


@app.get("/health")
async def health():
    return {
        "status": "HEALTHY",
        "service": "AethelGrid Planetary Dispatcher",
        "monitored_continents": ["Europe", "North America", "Asia-Pacific", "Latin America"]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
