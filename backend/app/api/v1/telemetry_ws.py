"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Real-Time WebSocket Telemetry Gateway
Security Clearance: GPU BARE-METAL UTILIZATION & NODE HEALTH STREAMING
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import random
import time
from typing import Dict, List, Optional, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("apexsovereign.telemetry_ws")

router = APIRouter(tags=["GPU Telemetry WebSockets"])

# Active cluster nodes inventory
CLUSTER_NODES_SPEC = [
    {
        "node_id": "us-east-h100-cluster-01",
        "region": "us-east (Ashburn, VA)",
        "model": "8x NVIDIA H100 80GB SXM5",
        "gpu_count": 8,
        "mem_total": 640.0,
        "base_util": 84.5,
        "base_temp": 61.0,
        "power_limit": 700.0,
        "base_power": 580.0,
        "base_spot": 1.94,
        "interconnect": 3200,
    },
    {
        "node_id": "eu-central-h100-cluster-02",
        "region": "eu-central (Frankfurt, DE)",
        "model": "8x NVIDIA H100 80GB SXM5",
        "gpu_count": 8,
        "mem_total": 640.0,
        "base_util": 91.2,
        "base_temp": 64.5,
        "power_limit": 700.0,
        "base_power": 645.0,
        "base_spot": 2.15,
        "interconnect": 3200,
    },
    {
        "node_id": "nordic-hydro-b200-cluster-01",
        "region": "eu-north (Luleå, SE)",
        "model": "4x NVIDIA B200 NVL72 192GB",
        "gpu_count": 4,
        "mem_total": 768.0,
        "base_util": 72.8,
        "base_temp": 54.0,
        "power_limit": 1000.0,
        "base_power": 780.0,
        "base_spot": 2.85,
        "interconnect": 7200,
    },
    {
        "node_id": "us-west-l40s-inference-01",
        "region": "us-west (Oregon)",
        "model": "8x NVIDIA L40S 48GB PCIe",
        "gpu_count": 8,
        "mem_total": 384.0,
        "base_util": 66.4,
        "base_temp": 52.0,
        "power_limit": 350.0,
        "base_power": 240.0,
        "base_spot": 0.89,
        "interconnect": 800,
    },
    {
        "node_id": "ap-northeast-a100-partition-03",
        "region": "ap-northeast (Tokyo, JP)",
        "model": "8x NVIDIA A100 80GB SXM4",
        "gpu_count": 8,
        "mem_total": 640.0,
        "base_util": 78.9,
        "base_temp": 58.0,
        "power_limit": 400.0,
        "base_power": 320.0,
        "base_spot": 1.42,
        "interconnect": 1600,
    },
]


def generate_node_metrics(tick: int) -> List[Dict]:
    """
    Generates dynamic, realistic telemetry for all bare-metal nodes.
    Applies small sine perturbations to model live training epoch workloads.
    """
    results = []
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    for idx, spec in enumerate(CLUSTER_NODES_SPEC):
        # Sine wave drift + subtle jitter
        drift = math.sin((tick + idx * 3) * 0.15) * 6.0
        jitter = random.uniform(-1.5, 1.5)
        util = max(15.0, min(99.5, spec["base_util"] + drift + jitter))

        temp_drift = math.sin((tick + idx * 2) * 0.1) * 3.0
        temp = max(42.0, min(82.0, spec["base_temp"] + temp_drift + random.uniform(-0.5, 0.5)))

        mem_ratio = (util / 100.0) * 0.92 + random.uniform(-0.02, 0.02)
        mem_used = round(max(10.0, min(spec["mem_total"] * 0.98, spec["mem_total"] * mem_ratio)), 1)

        power_ratio = (util / 100.0) * 0.85 + 0.15
        power = round(spec["power_limit"] * power_ratio + random.uniform(-8.0, 8.0), 1)

        # Health status evaluation
        if temp > 80.0:
            health = "THROTTLED"
        elif util > 96.0:
            health = "DEGRADED"
        else:
            health = "OPTIMAL"

        active_leases = max(1, int(spec["gpu_count"] * (util / 100.0)))
        spot_rate = round(spec["base_spot"] * (0.95 + (util / 200.0)), 2)

        results.append({
            "nodeId": spec["node_id"],
            "datacenterRegion": spec["region"],
            "gpuModel": spec["model"],
            "gpuCount": spec["gpu_count"],
            "utilizationPct": round(util, 1),
            "memoryUsedGb": mem_used,
            "memoryTotalGb": spec["mem_total"],
            "temperatureC": round(temp, 1),
            "powerDrawWatts": power,
            "powerLimitWatts": spec["power_limit"],
            "healthStatus": health,
            "activeLeasesCount": active_leases,
            "arbitrageSpotRatePerHour": spot_rate,
            "interconnectBandwidthGbps": spec["interconnect"],
            "fanSpeedPct": min(100, int(temp * 1.15)),
            "timestamp": now_iso,
        })

    return results


def calculate_cluster_summary(nodes: List[Dict]) -> Dict:
    total_gpus = sum(n["gpuCount"] for n in nodes)
    avg_util = sum(n["utilizationPct"] * n["gpuCount"] for n in nodes) / max(1, total_gpus)
    mem_used = sum(n["memoryUsedGb"] for n in nodes)
    mem_total = sum(n["memoryTotalGb"] for n in nodes)
    total_power = sum(n["powerDrawWatts"] for n in nodes)
    active_leases = sum(n["activeLeasesCount"] for n in nodes)

    return {
        "totalGpusOnline": total_gpus,
        "totalGpusActive": int(total_gpus * (avg_util / 100.0)),
        "averageUtilizationPct": round(avg_util, 1),
        "totalMemoryUsedGb": round(mem_used, 1),
        "totalMemoryCapacityGb": round(mem_total, 1),
        "totalPowerWatts": round(total_power, 1),
        "effectiveSpotRateSavingsPct": 46.8,
        "activeWorkloadsCount": active_leases,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


class TelemetryConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info("Client connected to GPU Telemetry WebSocket. Active clients: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info("Client disconnected from GPU Telemetry WebSocket. Active clients: %d", len(self.active_connections))

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning("Error sending WebSocket telemetry: %s", e)
                self.active_connections.discard(connection)


manager = TelemetryConnectionManager()


@router.websocket("/ws/gpu-metrics")
@router.websocket("/api/v1/ws/gpu-metrics")
async def gpu_metrics_websocket_endpoint(websocket: WebSocket):
    """
    Real-time streaming WebSocket endpoint for GPU cluster utilization & health telemetry.
    Streams at 1000ms intervals by default, responding to client PINGs and configuration frames.
    """
    await manager.connect(websocket)
    tick = 0
    tick_interval = 1.0  # seconds

    try:
        # 1. Send initial state frame
        initial_nodes = generate_node_metrics(tick)
        initial_summary = calculate_cluster_summary(initial_nodes)
        await websocket.send_json({
            "type": "INITIAL_STATE",
            "clusterSummary": initial_summary,
            "nodes": initial_nodes,
            "sequenceId": tick,
            "serverTimestamp": time.time(),
        })

        # 2. Main telemetry push loop + non-blocking client receiver
        while True:
            # Check for client messages with a short timeout
            try:
                client_msg = await asyncio.wait_for(websocket.receive_text(), timeout=tick_interval)
                try:
                    payload = json.loads(client_msg)
                    msg_type = payload.get("type", "")
                    if msg_type == "PING":
                        await websocket.send_json({
                            "type": "HEARTBEAT_ACK",
                            "clientTimestamp": payload.get("timestamp"),
                            "serverTimestamp": time.time(),
                        })
                    elif msg_type == "SET_TICK_RATE":
                        new_rate = float(payload.get("intervalMs", 1000)) / 1000.0
                        tick_interval = max(0.2, min(5.0, new_rate))
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                # Interval elapsed, time to push next telemetry frame
                pass

            tick += 1
            nodes = generate_node_metrics(tick)
            summary = calculate_cluster_summary(nodes)

            await websocket.send_json({
                "type": "METRICS_UPDATE",
                "clusterSummary": summary,
                "nodes": nodes,
                "sequenceId": tick,
                "serverTimestamp": time.time(),
            })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        logger.error("Unexpected telemetry WebSocket failure: %s", exc)
        manager.disconnect(websocket)
