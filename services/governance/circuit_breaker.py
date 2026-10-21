import os
import asyncio
import time
import logging
from typing import Dict, Any
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
import httpx

logging.basicConfig(
    level=logging.INFO, 
    format="[%(asctime)s] [%(levelname)s] [SOVEREIGN_GOVERNANCE] %(message)s"
)

app = FastAPI(
    title="ApexSovereign Holdings Governance & Circuit Breaker Engine", 
    version="0.5.0"
)

# Operational State Store
CIRCUIT_STATES: Dict[str, Any] = {
    "AethelGrid_Mesh": {"status": "HEALTHY", "circuit_tripped": False},
    "AuraPharm_Sweeper": {"status": "HEALTHY", "circuit_tripped": False},
    "AethelPay_Ledger": {"status": "HEALTHY", "circuit_tripped": False},
    "Global_Override": {"status": "ARMED", "emergency_lock": False}
}


class EmergencyTripRequest(BaseModel):
    entity_name: str
    reason: str
    operator_signature: str


class GovernanceStatusResponse(BaseModel):
    timestamp: float
    system_status: str
    entities: Dict[str, Any]
    active_circuit_trips: int


@app.get("/api/v1/governance/telemetry", response_model=GovernanceStatusResponse)
async def get_governance_telemetry():
    active_trips = sum(
        1 for v in CIRCUIT_STATES.values() 
        if isinstance(v, dict) and v.get("circuit_tripped", False)
    )
    overall_status = (
        "CRITICAL_ISOLATION" 
        if active_trips > 0 or CIRCUIT_STATES["Global_Override"]["emergency_lock"] 
        else "NOMINAL"
    )
    
    return GovernanceStatusResponse(
        timestamp=time.time(),
        system_status=overall_status,
        entities=CIRCUIT_STATES,
        active_circuit_trips=active_trips
    )


@app.post("/api/v1/governance/trip-circuit")
async def manual_circuit_trip(payload: EmergencyTripRequest):
    if payload.entity_name not in CIRCUIT_STATES and payload.entity_name != "GLOBAL":
        raise HTTPException(status_code=400, detail="UNKNOWN_ENTITY")

    if payload.entity_name == "GLOBAL":
        CIRCUIT_STATES["Global_Override"]["emergency_lock"] = True
        for key in CIRCUIT_STATES:
            if isinstance(CIRCUIT_STATES[key], dict) and "circuit_tripped" in CIRCUIT_STATES[key]:
                CIRCUIT_STATES[key]["circuit_tripped"] = True
                CIRCUIT_STATES[key]["status"] = f"TRIPPED: {payload.reason}"
        logging.critical(f"GLOBAL EMERGENCY CIRCUIT BREAKER ENGAGED BY OPERATOR: {payload.reason}")
    else:
        CIRCUIT_STATES[payload.entity_name]["circuit_tripped"] = True
        CIRCUIT_STATES[payload.entity_name]["status"] = f"TRIPPED: {payload.reason}"
        logging.warning(f"CIRCUIT BREAKER TRIPPED FOR {payload.entity_name}: {payload.reason}")

    return {
        "status": "CIRCUIT_TRIPPED",
        "entity": payload.entity_name,
        "reason": payload.reason,
        "timestamp": time.time()
    }


@app.post("/api/v1/governance/reset-circuits")
async def reset_governance_circuits(operator_token: str):
    if operator_token != os.getenv("SOVEREIGN_OPERATOR_TOKEN", "APEX_MASTER_SECRET_2026"):
        raise HTTPException(status_code=401, detail="UNAUTHORIZED_GOVERNANCE_ACTION")

    for key in CIRCUIT_STATES:
        if isinstance(CIRCUIT_STATES[key], dict):
            if "circuit_tripped" in CIRCUIT_STATES[key]:
                CIRCUIT_STATES[key]["circuit_tripped"] = False
                CIRCUIT_STATES[key]["status"] = "HEALTHY"
            if "emergency_lock" in CIRCUIT_STATES[key]:
                CIRCUIT_STATES[key]["emergency_lock"] = False

    logging.info("ALL CIRCUIT BREAKERS MANUALLY RESET TO NOMINAL STATE.")
    return {"status": "ALL_SYSTEMS_RESET", "timestamp": time.time()}


async def autonomous_governance_watchdog():
    logging.info("Starting Autonomous Governance Watchdog Loop (Interval: 5s)...")
    async with httpx.AsyncClient(timeout=3.0) as client:
        while True:
            try:
                if CIRCUIT_STATES["Global_Override"]["emergency_lock"]:
                    logging.warning("System in Global Emergency Lock. Standby mode active.")
                
                await asyncio.sleep(5)
            except Exception as err:
                logging.error(f"Watchdog polling error: {err}")
                await asyncio.sleep(5)


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(autonomous_governance_watchdog())


@app.get("/health")
async def health_check():
    return {
        "status": "OPERATIONAL",
        "service": "Unified Governance & Fail-Safe Circuit Breaker Core",
        "global_lock": CIRCUIT_STATES["Global_Override"]["emergency_lock"]
    }
