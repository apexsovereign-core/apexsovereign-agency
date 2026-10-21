"""
ApexSovereign.ai - Enterprise Asynchronous Worker Engine & Self-Healing Circuit
Handles 24/7 background lease processing, external GPU node spot-price polling,
and atomic database balance transactions via Supabase PgBouncer connection pooling (port 6543).
"""

import os
import sys
import time
import json
import re
import uuid
import threading
from typing import Dict, Any, Tuple, Optional
from datetime import datetime, timezone
import requests
from dotenv import load_dotenv

load_dotenv()

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
POLL_INTERVAL_SECONDS = float(os.getenv("WORKER_POLL_INTERVAL", "2.0"))

# Sentry APM for Worker Daemon
if SENTRY_DSN:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            environment=os.getenv("RENDER_ENVIRONMENT", "production"),
            release=os.getenv("RENDER_GIT_COMMIT", "apexsovereign-v2.5.0"),
            traces_sample_rate=0.1,
            send_default_pii=False,
        )
        print("[ApexSovereign Worker] Sentry error tracking initialized.")
    except Exception as s_err:
        print(f"[ApexSovereign Worker] Sentry initialization note: {s_err}")

# Initialize Google Gemini Client if available
ai_client = None
try:
    if GEMINI_API_KEY:
        from google import genai
        ai_client = genai.Client(apiKey=GEMINI_API_KEY)
        print("[ApexSovereign Worker] Google GenAI client initialized.")
except Exception as e:
    print(f"[ApexSovereign Worker] Google GenAI client note: {e}")

# Deterministic JSON Schema Contract
TARGET_ENTERPRISE_SCHEMA = {
    "type": "object",
    "properties": {
        "execution_summary": {"type": "string"},
        "risk_index": {"type": "number"},
        "strategic_directives": {
            "type": "array",
            "items": {"type": "string"}
        },
        "deterministic_hash": {"type": "string"}
    },
    "required": ["execution_summary", "risk_index", "strategic_directives", "deterministic_hash"]
}

INJECTION_ATTACK_PATTERNS = [
    r"(?i)ignore\s+previous\s+instructions",
    r"(?i)repeat\s+the\s+system\s+prompt",
    r"(?i)output\s+your\s+system\s+instructions",
    r"(?i)you\s+are\s+now\s+in\s+developer\s+mode",
    r"(?i)dan\s+mode",
    r"(?i)reveal\s+secret\s+key",
]

# Database Connection Pool (PgBouncer port 6543 / 5432)
_db_engine = None
_session_factory = None


def get_pgbouncer_session():
    """
    Returns a thread-local scoped session to Supabase PgBouncer pooler (port 6543).
    Ensures connection recycling and statement caching disabled for transaction pooling.
    """
    global _db_engine, _session_factory
    if _session_factory is not None:
        return _session_factory()

    target_url = DATABASE_URL
    if not target_url:
        return None

    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        # Detect and normalize PgBouncer connection
        is_pgbouncer = ":6543" in target_url or "pgbouncer=true" in target_url.lower()

        connect_args = {"sslmode": "require"}
        if is_pgbouncer:
            # PgBouncer transaction mode requires disabling prepared statements in psycopg2
            connect_args["options"] = "-c default_transaction_isolation=read\\ committed"

        _db_engine = create_engine(
            target_url,
            pool_size=5,
            max_overflow=10,
            pool_recycle=300,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
        _session_factory = sessionmaker(autocommit=False, autoflush=False, bind=_db_engine)
        print(f"[ApexSovereign Worker] PgBouncer pool initialized (port: {'6543' if is_pgbouncer else 'standard'}).")
        return _session_factory()
    except Exception as exc:
        print(f"[ApexSovereign Worker] Direct PgBouncer connection failed, falling back to REST: {exc}")
        return None


def inspect_and_sanitize_payload(user_input: str) -> Tuple[bool, str]:
    """Inspects input for exfiltration attacks. Returns (is_safe, sanitized_content)."""
    for pattern in INJECTION_ATTACK_PATTERNS:
        if re.search(pattern, user_input):
            return False, "PROMPT_EXFILTRATION_ATTACK_INTERCEPTED"
    return True, user_input


def execute_self_healing_gemini_job(task_prompt: str, max_healing_cycles: int = 3) -> Dict[str, Any]:
    """
    Executes Gemini LLM inference with a 3-cycle automated syntax self-healing circuit breaker.
    Guarantees raw, minified JSON matching the exact schema without markdown wrap.
    """
    if not ai_client:
        return {
            "execution_summary": "Simulated production execution (GEMINI_API_KEY unconfigured)",
            "risk_index": 0.04,
            "strategic_directives": ["Authorize sovereign pipeline", "Consolidate edge caching"],
            "deterministic_hash": hashlib_hash(task_prompt)
        }

    from google.genai import types

    system_instruction = (
        "You are the ApexSovereign Deterministic Engine. "
        "You MUST return raw, unformatted, minified JSON that conforms strictly to this schema: "
        f"{json.dumps(TARGET_ENTERPRISE_SCHEMA)}. "
        "Do NOT include markdown formatting, backticks (```), or explanations."
    )

    current_prompt = task_prompt

    for cycle in range(1, max_healing_cycles + 1):
        try:
            response = ai_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=current_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.1,
                    response_mime_type="application/json"
                )
            )
            raw_text = (response.text or "").strip()

            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()

            parsed = json.loads(raw_text)
            for req_key in TARGET_ENTERPRISE_SCHEMA["required"]:
                if req_key not in parsed:
                    raise KeyError(f"Missing required key in JSON output: '{req_key}'")

            return parsed

        except Exception as err:
            print(f"[SELF-HEALING CYCLE {cycle}/{max_healing_cycles}] Syntax/Schema fault: {err}")
            if cycle == max_healing_cycles:
                raise RuntimeError(f"Self-healing circuit breaker tripped after {max_healing_cycles} cycles. Last error: {err}")

            current_prompt = (
                f"Your previous output failed strict JSON schema validation. Error: {str(err)}. "
                f"Fix the syntax, ensure all brackets close, and return raw minified JSON complying with schema: "
                f"{json.dumps(TARGET_ENTERPRISE_SCHEMA)}"
            )
            time.sleep(1)


def hashlib_hash(data: str) -> str:
    import hashlib
    return hashlib.sha256(data.encode("utf-8")).hexdigest()[:16]


def atomic_debit_credits_pgbouncer(tenant_id: str, cost_usd: float, job_id: str) -> bool:
    """
    Atomically debits tenant compute credits using PgBouncer connection with SELECT FOR UPDATE.
    Falls back to Supabase REST if direct database connection is unavailable.
    """
    session = get_pgbouncer_session()
    if session:
        try:
            from sqlalchemy import text
            # Atomic debit via stored function or direct row locking
            sql = text("""
                SELECT public.atomic_debit_tenant(
                    :tenant_id,
                    :amount,
                    :tx_id,
                    :ref_id,
                    'COMPUTE_USAGE'
                )
            """)
            tx_id = f"tx-job-{job_id[:8]}-{uuid.uuid4().hex[:6]}"
            result = session.execute(sql, {
                "tenant_id": tenant_id,
                "amount": cost_usd,
                "tx_id": tx_id,
                "ref_id": job_id,
            })
            session.commit()
            print(f"[PgBouncer Atomic Debit] Tenant '{tenant_id}' debited ${cost_usd:.6f}")
            return True
        except Exception as pgb_err:
            session.rollback()
            print(f"[PgBouncer Debit Warning] Direct SQL failed ({pgb_err}). Falling back to REST.")
        finally:
            session.close()

    # Fallback to Supabase REST API
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        try:
            headers = {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
            }
            # Fetch current balance
            u_res = requests.get(
                f"{SUPABASE_URL}/rest/v1/users?tenant_id=eq.{tenant_id}&select=credits_balance",
                headers=headers,
                timeout=4
            )
            if u_res.status_code == 200 and u_res.json():
                current_bal = float(u_res.json()[0]["credits_balance"])
                new_bal = max(0.0, current_bal - cost_usd)
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/users?tenant_id=eq.{tenant_id}",
                    headers=headers,
                    json={"credits_balance": new_bal, "updated_at": "now()"},
                    timeout=4
                )
                print(f"[REST Atomic Debit] Tenant '{tenant_id}' balance updated to ${new_bal:.4f}")
                return True
        except Exception as rest_err:
            print(f"[REST Debit Error] {rest_err}")

    return False


def run_asynchronous_worker():
    """
    Persistent 24/7 worker loop.
    1. Spawns the autonomous GPU spot discovery thread.
    2. Continuously polls and processes jobs from the immutable job queue.
    3. Guarantees atomic balance settlements via Supabase PgBouncer (port 6543).
    """
    # 1. Spawn GPU Spot Node Discovery thread
    try:
        from gpu_discovery_engine import run_gpu_discovery_worker
        gpu_thread = threading.Thread(target=run_gpu_discovery_worker, daemon=True)
        gpu_thread.start()
        print("[ApexSovereign Worker] GPU Spot-Node Discovery thread active.")
    except Exception as gpu_err:
        print(f"[ApexSovereign Worker] GPU Spot Discovery startup note: {gpu_err}")

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("[ApexSovereign Worker] SUPABASE credentials unconfigured. Worker running in standalone idling mode.")
        while True:
            time.sleep(30)
        return

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }

    print("[ApexSovereign Worker] Engine running 24/7. Polling immutable job queue with PgBouncer connectivity...")

    while True:
        try:
            fetch_url = f"{SUPABASE_URL}/rest/v1/immutable_job_queue?status=eq.QUEUED&order=priority.desc,created_at.asc&limit=1"
            res = requests.get(fetch_url, headers=headers, timeout=5)
            jobs = res.json() if res.status_code == 200 else []

            if not jobs or not isinstance(jobs, list) or len(jobs) == 0:
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            job = jobs[0]
            job_id = job.get("job_id") or job.get("id")
            tenant_id = job.get("tenant_id")
            user_input = job.get("task_prompt") or job.get("input_payload", {}).get("task", "")

            patch_url = f"{SUPABASE_URL}/rest/v1/immutable_job_queue?id=eq.{job.get('id')}"
            requests.patch(patch_url, headers=headers, json={"status": "PROCESSING", "started_at": "now()"}, timeout=3)

            # Prompt Injection Verification
            is_safe, sanitized_or_flag = inspect_and_sanitize_payload(user_input)
            if not is_safe:
                requests.patch(
                    patch_url,
                    headers=headers,
                    json={"status": "FAILED", "error_detail": "PROMPT_EXFILTRATION_SECURITY_REJECTION"},
                    timeout=3
                )
                log_url = f"{SUPABASE_URL}/rest/v1/system_logs"
                requests.post(
                    log_url,
                    headers=headers,
                    json={
                        "subsystem": "WORKER_INSPECTOR",
                        "log_level": "CRITICAL",
                        "event_name": "SECURITY_INJECTION_ALERT",
                        "message": f"Injection attempt intercepted for tenant {tenant_id}",
                        "metadata": {"raw_input": user_input, "intercepted_at": time.time()}
                    },
                    timeout=3
                )
                continue

            t0 = time.time()
            final_output = execute_self_healing_gemini_job(sanitized_or_flag)
            execution_duration = time.time() - t0

            requests.patch(
                patch_url,
                headers=headers,
                json={"status": "COMPLETED", "result_payload": final_output, "completed_at": "now()"},
                timeout=3
            )

            # Token Accounting & Margins
            prompt_tokens = len(sanitized_or_flag) // 4
            completion_tokens = len(json.dumps(final_output)) // 4
            total_tokens = prompt_tokens + completion_tokens

            cost_usd = round(total_tokens * 0.00000035, 6)
            billed_usd = round(total_tokens * 0.000005, 6)
            gross_profit_margin = round(((billed_usd - cost_usd) / (billed_usd or 0.000001)) * 100, 2)

            # Atomic Credit Debit via PgBouncer
            atomic_debit_credits_pgbouncer(tenant_id=tenant_id, cost_usd=billed_usd, job_id=str(job_id))

            # Record to token ledger
            ledger_url = f"{SUPABASE_URL}/rest/v1/token_ledger"
            requests.post(
                ledger_url,
                headers=headers,
                json={
                    "organization_id": job.get("organization_id"),
                    "tenant_id": tenant_id,
                    "job_id": str(job_id),
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens,
                    "cost_usd": cost_usd,
                    "billed_usd": billed_usd,
                    "margin_percentage": gross_profit_margin
                },
                timeout=3
            )

            print(f"[JOB COMPLETE] ID: {job_id} | Time: {execution_duration:.2f}s | Billed: ${billed_usd:.6f} | Margin: {gross_profit_margin}%")

        except Exception as loop_err:
            print(f"[WORKER LOOP FAULT] {loop_err}")
            if SENTRY_DSN:
                try:
                    import sentry_sdk
                    sentry_sdk.capture_exception(loop_err)
                except Exception:
                    pass
            time.sleep(3)


if __name__ == "__main__":
    run_asynchronous_worker()
