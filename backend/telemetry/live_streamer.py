import asyncio
import json
import logging
import os
import random
from typing import Set, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, status

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [TELEMETRY-STREAMER] %(message)s")

app = FastAPI(title="ApexSovereign Live Telemetry Streamer", version="3.0.0")

# Counter-Strike Defense: Enforce connection limits and handshake auth
MAX_ACTIVE_CONNECTIONS = int(os.getenv("MAX_TELEMETRY_WS_CONNECTIONS", "100"))
HEARTBEAT_TIMEOUT_SECONDS = float(os.getenv("TELEMETRY_HEARTBEAT_TIMEOUT", "15.0"))
EXPECTED_AUTH_TOKEN = os.getenv("SOVEREIGN_TELEMETRY_TOKEN", "apex_sec_mesh_stream_2026")

class TelemetryConnectionManager:
    def __init__(self, max_connections: int = MAX_ACTIVE_CONNECTIONS):
        self.active_connections: Set[WebSocket] = set()
        self.max_connections = max_connections

    async def connect(self, websocket: WebSocket, token: Optional[str] = None) -> bool:
        # Prevent connection flood / slow-loris file descriptor exhaustion
        if len(self.active_connections) >= self.max_connections:
            logging.warning(f"[WS-DEFENSE] Max connection limit reached ({self.max_connections}). Rejecting client.")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="RateLimitExceeded")
            return False

        # Verify bearer handshake token if authentication is enabled
        if EXPECTED_AUTH_TOKEN and token != EXPECTED_AUTH_TOKEN:
            # Allow fallback if no strict token configured in dev mode, but flag invalid credentials
            if os.getenv("ENVIRONMENT") == "production":
                logging.warning(f"[WS-DEFENSE] Unauthorized telemetry handshake attempt rejected.")
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="InvalidHandshakeToken")
                return False

        await websocket.accept()
        self.active_connections.add(websocket)
        logging.info(f"[WS] Operator client connected. Active connections: {len(self.active_connections)}/{self.max_connections}")
        return True

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logging.info(f"[WS] Operator client disconnected. Active connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        payload = json.dumps(message)
        dead_connections = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_text(payload)
            except Exception as e:
                logging.warning(f"[WS] Broadcast error for client: {e}")
                dead_connections.add(connection)
        for dead in dead_connections:
            self.disconnect(dead)

manager = TelemetryConnectionManager(max_connections=MAX_ACTIVE_CONNECTIONS)

async def generate_telemetry_stream():
    """Continuously generates live sovereign telemetry packets."""
    while True:
        await asyncio.sleep(1.0)
        if not manager.active_connections:
            continue

        telemetry_packet = {
            "timestamp": asyncio.get_event_loop().time(),
            "tier_status": "TIER_3_AUTONOMOUS",
            "active_nodes": {
                "lambda_labs": {"gpu": "H100", "latency_ms": round(random.uniform(11.2, 14.5), 2), "load_pct": round(random.uniform(78.0, 95.5), 1)},
                "runpod": {"gpu": "H100", "latency_ms": round(random.uniform(14.0, 17.8), 2), "load_pct": round(random.uniform(65.0, 88.2), 1)},
                "vast_ai": {"gpu": "B200", "latency_ms": round(random.uniform(13.1, 16.9), 2), "load_pct": round(random.uniform(82.0, 99.1), 1)}
            },
            "financials": {
                "hourly_burn_rate_usd": 142.50,
                "current_arbitrage_margin_pct": 38.5,
                "treasury_escrow_pool_usd": 52450.00,
                "capacity_reserve_cu": 14200.0
            },
            "ebpf_metrics": {
                "packets_processed_sec": random.randint(125000, 189000),
                "dropped_packets": 0,
                "p99_latency_ms": 14.8
            }
        }
        await manager.broadcast(telemetry_packet)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(generate_telemetry_stream())

@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    connected = await manager.connect(websocket, token=token)
    if not connected:
        return
    try:
        while True:
            # Strict heartbeat timeout defense against Slow-Loris hanging sockets
            data = await asyncio.wait_for(websocket.receive_text(), timeout=HEARTBEAT_TIMEOUT_SECONDS)
            if data == "PING":
                await websocket.send_text("PONG")
    except (asyncio.TimeoutError, WebSocketDisconnect):
        manager.disconnect(websocket)
    except Exception as e:
        logging.error(f"[WS] Connection error: {e}")
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9100)
