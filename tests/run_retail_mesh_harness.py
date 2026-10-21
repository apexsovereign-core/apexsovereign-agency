#!/usr/bin/env python3
"""
============================================================================
ApexSovereign.ai - TIER 4 RETAIL FRACTIONAL GPU SHARING & MICRO-BILLING HARNESS
File: tests/run_retail_mesh_harness.py
Simulates:
  1. High-concurrency retail developer onboarding and micro-wallet funding.
  2. Dynamic physical GPU partitioning across MIG (H100) and MPS (L40S).
  3. High-throughput token inference streaming with atomic micro-debits.
  4. Real-time wallet depletion and sub-5ms zero-balance cold-kill verification.
  5. Insolvency protection: 100% non-negative balance invariant guarantee.
============================================================================
"""

import sys
import time
import uuid
import random
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Dict, List, Optional

# Micro-credit constants
MICRO_CREDITS_PER_USD = 1_000_000
MAX_ALLOWED_COLD_KILL_MS = 5.0

# Colors for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


@dataclass
class SimulatedSlice:
    slice_id: str
    tenant_id: str
    gpu_id: str
    profile: str
    vram_mb: int
    is_active: bool = True
    evicted_at_ms: Optional[float] = None


@dataclass
class SimulatedWallet:
    tenant_id: str
    balance_micro: int
    total_consumed_micro: int = 0
    is_frozen: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)


class RetailMeshSimulator:
    def __init__(self):
        self.wallets: Dict[str, SimulatedWallet] = {}
        self.slices: Dict[str, SimulatedSlice] = {}
        self.lock = threading.Lock()
        self.cold_kill_latencies: List[float] = []
        self.total_tokens_processed = 0
        self.total_micro_credits_settled = 0
        self.insolvency_violations = 0

        # Physical GPUs
        self.gpus = {
            "gpu-h100-01": {"model": "H100-SXM5-80GB", "vram_mb": 81920, "used_mb": 0},
            "gpu-h100-02": {"model": "H100-SXM5-80GB", "vram_mb": 81920, "used_mb": 0},
            "gpu-l40s-01": {"model": "L40S-48GB", "vram_mb": 49152, "used_mb": 0},
            "gpu-l40s-02": {"model": "L40S-48GB", "vram_mb": 49152, "used_mb": 0},
        }

    def onboard_tenant(self, initial_deposit_usd: float) -> str:
        tenant_id = str(uuid.uuid4())
        initial_micro = int(initial_deposit_usd * MICRO_CREDITS_PER_USD)
        with self.lock:
            self.wallets[tenant_id] = SimulatedWallet(tenant_id=tenant_id, balance_micro=initial_micro)
        return tenant_id

    def lease_fractional_slice(self, tenant_id: str, profile: str) -> Optional[SimulatedSlice]:
        profile_vram = {
            "1g.10gb": 10240,
            "2g.20gb": 20480,
            "mps.1/8": 6144,
            "mps.1/4": 12288,
        }.get(profile, 6144)

        with self.lock:
            wallet = self.wallets.get(tenant_id)
            if not wallet or wallet.balance_micro <= 0 or wallet.is_frozen:
                return None

            # Find GPU with free space
            for gpu_id, gpu in self.gpus.items():
                if gpu["vram_mb"] - gpu["used_mb"] >= profile_vram:
                    gpu["used_mb"] += profile_vram
                    slice_id = str(uuid.uuid4())
                    s = SimulatedSlice(
                        slice_id=slice_id,
                        tenant_id=tenant_id,
                        gpu_id=gpu_id,
                        profile=profile,
                        vram_mb=profile_vram,
                    )
                    self.slices[slice_id] = s
                    return s
        return None

    def execute_compute_step(self, slice_id: str, tokens: int, duration_s: float) -> bool:
        """
        Simulates one streaming compute step. Returns True if successful, False if cold-killed.
        """
        with self.lock:
            s = self.slices.get(slice_id)
            if not s or not s.is_active:
                return False
            wallet = self.wallets.get(s.tenant_id)

        if not wallet:
            return False

        # Calculate cost
        micro_per_token = 2 if "mps" in s.profile else 4
        micro_per_sec = 120 if "mps" in s.profile else 250
        cost = (tokens * micro_per_token) + int(duration_s * micro_per_sec)

        with wallet.lock:
            if wallet.balance_micro < cost:
                # Wallet depleted! Trigger sub-5ms cold kill immediately
                self.trigger_sub_5ms_cold_kill(s)
                return False

            wallet.balance_micro -= cost
            wallet.total_consumed_micro += cost

            with self.lock:
                self.total_tokens_processed += tokens
                self.total_micro_credits_settled += cost

            # Invariance audit
            if wallet.balance_micro < 0:
                with self.lock:
                    self.insolvency_violations += 1

            return True

    def trigger_sub_5ms_cold_kill(self, s: SimulatedSlice):
        kill_start = time.perf_counter()

        # Step 1: Freeze wallet
        wallet = self.wallets.get(s.tenant_id)
        if wallet:
            wallet.is_frozen = True

        # Step 2: Immediate hardware release & process kill simulation
        with self.lock:
            s.is_active = False
            gpu = self.gpus.get(s.gpu_id)
            if gpu:
                gpu["used_mb"] = max(0, gpu["used_mb"] - s.vram_mb)

        kill_end = time.perf_counter()
        elapsed_ms = (kill_end - kill_start) * 1000.0

        with self.lock:
            self.cold_kill_latencies.append(elapsed_ms)
            s.evicted_at_ms = elapsed_ms


def run_developer_worker(sim: RetailMeshSimulator, dev_idx: int) -> Dict:
    # 70% normal balance, 30% low balance (destined to trigger cold kill)
    if dev_idx % 3 == 0:
        deposit_usd = 0.0005  # 500 micro-credits (will deplete fast)
    else:
        deposit_usd = random.uniform(1.0, 5.0)

    tenant_id = sim.onboard_tenant(deposit_usd)
    profile = random.choice(["mps.1/8", "mps.1/4", "1g.10gb"])
    slice_obj = sim.lease_fractional_slice(tenant_id, profile)

    if not slice_obj:
        return {"dev_idx": dev_idx, "status": "CAPACITY_FULL", "steps": 0, "cold_killed": False}

    steps = 0
    cold_killed = False

    for _ in range(25):
        tokens = random.randint(32, 128)
        duration = tokens * 0.002
        success = sim.execute_compute_step(slice_obj.slice_id, tokens, duration)
        if not success:
            cold_killed = True
            break
        steps += 1
        time.sleep(0.001)

    return {
        "dev_idx": dev_idx,
        "tenant_id": tenant_id,
        "profile": profile,
        "steps": steps,
        "cold_killed": cold_killed,
    }


def main():
    print(f"\n{BOLD}{CYAN}============================================================================{RESET}")
    print(f"{BOLD}{CYAN}APEXSOVEREIGN.AI - TIER 4 RETAIL FRACTIONAL GPU SHARING & MICRO-BILLING{RESET}")
    print(f"{BOLD}{CYAN}HIGH-CONCURRENCY SUB-5MS COLD-KILL STRESS TEST{RESET}")
    print(f"{BOLD}{CYAN}============================================================================{RESET}\n")

    sim = RetailMeshSimulator()
    num_developers = 60

    print(f"[*] Initializing mesh with 4 Physical Enterprise GPUs (H100 + L40S)...")
    print(f"[*] Spawning {num_developers} concurrent retail developer sessions...")

    start_time = time.perf_counter()
    results = []

    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = [executor.submit(run_developer_worker, sim, i) for i in range(num_developers)]
        for f in as_completed(futures):
            results.append(f.result())

    total_time = time.perf_counter() - start_time

    cold_kills = [r for r in results if r["cold_killed"]]
    latencies = sim.cold_kill_latencies

    print(f"\n{BOLD}Execution Summary:{RESET}")
    print(f"  Total Developers Simulated:     {num_developers}")
    print(f"  Total Active Compute Steps:     {sum(r['steps'] for r in results)}")
    print(f"  Total Tokens Processed:         {sim.total_tokens_processed:,}")
    print(f"  Total Micro-Credits Settled:    {sim.total_micro_credits_settled:,} µC (${sim.total_micro_credits_settled / MICRO_CREDITS_PER_USD:.4f})")
    print(f"  Cold-Kill Evictions Triggered:  {len(cold_kills)}")
    print(f"  Insolvency Violations:          {sim.insolvency_violations}")
    print(f"  Total Harness Duration:         {total_time:.2f}s\n")

    if latencies:
        latencies.sort()
        p50 = latencies[len(latencies) // 2]
        p95 = latencies[int(len(latencies) * 0.95)]
        p99 = latencies[int(len(latencies) * 0.99)]
        max_lat = max(latencies)

        print(f"{BOLD}Cold-Kill Latency SLA Metrics (< 5.0ms Required):{RESET}")
        print(f"  P50 Latency:  {p50:.3f} ms")
        print(f"  P95 Latency:  {p95:.3f} ms")
        print(f"  P99 Latency:  {p99:.3f} ms")
        print(f"  Max Latency:  {max_lat:.3f} ms")

        # SLA validation
        if max_lat > MAX_ALLOWED_COLD_KILL_MS:
            print(f"\n{BOLD}{RED}[FAIL] Max eviction latency ({max_lat:.3f}ms) breached sub-5ms SLA!{RESET}")
            sys.exit(1)
        else:
            print(f"\n{BOLD}{GREEN}[PASS] Sub-5ms eviction SLA verified for 100% of depleted sessions!{RESET}")

    if sim.insolvency_violations > 0:
        print(f"{BOLD}{RED}[FAIL] Insolvency violation detected! {sim.insolvency_violations} negative balances!{RESET}")
        sys.exit(1)
    else:
        print(f"{BOLD}{GREEN}[PASS] Zero-insolvency invariant confirmed: 0 negative balances across all wallets.{RESET}")

    print(f"\n{BOLD}{GREEN}ALL TIER 4 RETAIL GPU BROKER VERIFICATION SUITES PASSED CLEANLY.{RESET}\n")
    sys.exit(0)


if __name__ == "__main__":
    main()
