#!/usr/bin/env python3
# scripts/github_sync.py
"""
ApexSovereign Holdings - Direct GitHub REST API Synchronization Engine
Pushes production code deliverables directly to ApexSovereign/enterprise-core
using standard libraries (urllib.request, json, base64) with SHA-verified commits.
"""

import os
import sys
import json
import base64
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [GITHUB_SYNC] %(message)s")
logger = logging.getLogger("github_sync")

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
if not GITHUB_TOKEN:
    logger.critical("FATAL: Environment variable 'GITHUB_TOKEN' is missing. Terminating sync.")
    sys.exit(1)

TARGET_OWNER = os.getenv("GITHUB_OWNER", "ApexSovereign")
TARGET_REPO = os.getenv("GITHUB_REPO", "enterprise-core")
TARGET_BRANCH = os.getenv("GITHUB_BRANCH", "main")
API_BASE_URL = f"https://api.github.com/repos/{TARGET_OWNER}/{TARGET_REPO}/contents"

DEFAULT_HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ApexSovereign-Sync-Engine/1.0"
}

FILES_TO_SYNC: List[str] = [
    "crates/aethelmesh/src/ebpf_sentinel.rs",
    "crates/aethelmesh-core/Cargo.toml",
    "crates/aethelmesh-core/src/state.rs",
    "crates/aethelmesh-core/src/arbitrage.rs",
    "crates/aethelmesh-core/src/main.rs",
    "aethelmesh-core/Cargo.toml",
    "aethelmesh-core/src/main.rs",
    "aethelmesh-core/src/router.rs",
    "services/aurapharm/basal_load_sweeper.py",
    "services/aurapharm/requirements.txt",
    "services/settlement/main.py",
    "services/governance/circuit_breaker.py",
    "services/gateway-express/package.json",
    "services/gateway-express/src/index.ts",
    "services/provisioning-fastapi/requirements.txt",
    "services/provisioning-fastapi/main.py",
    "supabase/migrations/20260930_initial_schema.sql",
    "supabase/migrations/20260930_insolvency_protection_rpc.sql",
    "supabase/migrations/20260930_phase3_atomic_settlement.sql",
    "workflows/n8n/apexsovereign_provisioning_workflow.json",
    ".github/workflows/production_sentinels_ci.yml"
]


def get_existing_file_sha(file_path: str) -> Optional[str]:
    url = f"{API_BASE_URL}/{file_path}?ref={TARGET_BRANCH}"
    req = urllib.request.Request(url, headers=DEFAULT_HEADERS, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                return data.get("sha")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        logger.error(f"HTTP error querying existing file '{file_path}': {e.code} - {e.reason}")
    except Exception as exc:
        logger.error(f"Unexpected error querying file metadata for '{file_path}': {exc}")

    return None


def commit_file_to_github(file_path: str, commit_message: str) -> bool:
    if not os.path.exists(file_path):
        logger.error(f"Local file '{file_path}' does not exist on disk. Skipping.")
        return False

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    b64_content = base64.b64encode(file_bytes).decode("utf-8")
    existing_sha = get_existing_file_sha(file_path)

    payload: Dict[str, Any] = {
        "message": commit_message,
        "content": b64_content,
        "branch": TARGET_BRANCH
    }
    if existing_sha:
        payload["sha"] = existing_sha

    data_bytes = json.dumps(payload).encode("utf-8")
    url = f"{API_BASE_URL}/{file_path}"
    req = urllib.request.Request(url, data=data_bytes, headers={**DEFAULT_HEADERS, "Content-Type": "application/json"}, method="PUT")

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status in [200, 201]:
                logger.info(f"SUCCESS: Pushed '{file_path}' to {TARGET_OWNER}/{TARGET_REPO}@{TARGET_BRANCH} (HTTP {response.status}).")
                return True
            else:
                logger.warning(f"Unexpected response status {response.status} for '{file_path}'.")
                return False
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8") if e.fp else ""
        logger.error(f"FAILURE: HTTP {e.code} pushing '{file_path}': {e.reason} - {err_body}")
        return False
    except Exception as exc:
        logger.error(f"FAILURE: Unexpected error pushing '{file_path}': {exc}")
        return False


def run_synchronization():
    logger.info("================================================================================")
    logger.info(f"APEXSOVEREIGN HOLDINGS - GITHUB REST API SYNCHRONIZATION")
    logger.info(f"Target: {TARGET_OWNER}/{TARGET_REPO} | Branch: {TARGET_BRANCH}")
    logger.info("================================================================================")

    success_count = 0
    for relative_path in FILES_TO_SYNC:
        msg = f"feat(sentinel): synchronize production deliverable {relative_path}"
        if commit_file_to_github(relative_path, msg):
            success_count += 1

    logger.info(f"Synchronization completed. {success_count}/{len(FILES_TO_SYNC)} files successfully pushed.")
    if success_count != len(FILES_TO_SYNC):
        sys.exit(1)


if __name__ == "__main__":
    run_synchronization()
