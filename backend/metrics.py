"""
ApexSovereign.ai - Prometheus Metrics & Telemetry Exporter
Provides standard Prometheus exposition format (/metrics) for Grafana/Prometheus
monitoring, tracking latency percentiles, active compute transactions, and webhook counts.
"""

import time
import threading
from typing import Dict, Any, Tuple
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# In-memory thread-safe metrics storage
_lock = threading.Lock()

# Metric Registries
_http_requests_total: Dict[Tuple[str, str, int], int] = {}
_http_request_durations: Dict[Tuple[str, str], list] = {}
_active_compute_transactions: int = 0
_webhook_processing_total: Dict[Tuple[str, str], int] = {}
_gpu_spot_nodes_available: Dict[Tuple[str, str, str], int] = {}
_invoices_total: Dict[Tuple[str, str], int] = {}

# Histogram default latency buckets in seconds
LATENCY_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)


def record_http_request(method: str, path: str, status_code: int, duration_seconds: float):
    """Records an incoming HTTP request execution duration and status code."""
    # Normalize path to avoid high-cardinality label explosion
    normalized_path = path
    if path.startswith("/compute/tenant/"):
        normalized_path = "/compute/tenant/{id}/balance"
    elif path.startswith("/compute/leases/") and path.endswith("/release"):
        normalized_path = "/compute/leases/{job_id}/release"
    elif path.startswith("/invoices/") and "/record-payment" in path:
        normalized_path = "/invoices/{id}/record-payment"
    elif path.startswith("/invoices/") and "/provision-credits" in path:
        normalized_path = "/invoices/{id}/provision-credits"
    elif path.startswith("/invoices/") and len(path.split("/")) > 2:
        normalized_path = "/invoices/{id}"

    key = (method, normalized_path, status_code)
    dur_key = (method, normalized_path)

    with _lock:
        _http_requests_total[key] = _http_requests_total.get(key, 0) + 1
        if dur_key not in _http_request_durations:
            _http_request_durations[dur_key] = []
        # Keep last 500 samples per endpoint for running summary
        if len(_http_request_durations[dur_key]) >= 500:
            _http_request_durations[dur_key].pop(0)
        _http_request_durations[dur_key].append(duration_seconds)


def set_active_compute_transactions(delta: int = 0, absolute: int = None):
    """Updates the gauge for active in-flight compute leases and jobs."""
    global _active_compute_transactions
    with _lock:
        if absolute is not None:
            _active_compute_transactions = max(0, absolute)
        else:
            _active_compute_transactions = max(0, _active_compute_transactions + delta)


def record_webhook_event(source: str, status: str):
    """Tracks webhook outcomes: received, verified, failed, duplicate."""
    key = (source, status)
    with _lock:
        _webhook_processing_total[key] = _webhook_processing_total.get(key, 0) + 1


def record_gpu_spot_nodes(tier: str, provider: str, region: str, count: int):
    """Updates available bare-metal GPU spot nodes in the broker pool."""
    key = (tier, provider, region)
    with _lock:
        _gpu_spot_nodes_available[key] = max(0, count)


def record_invoice_event(status: str, payment_terms: str):
    """Tracks corporate invoice lifecycle events."""
    key = (status, payment_terms)
    with _lock:
        _invoices_total[key] = _invoices_total.get(key, 0) + 1


def generate_prometheus_metrics_text() -> str:
    """
    Generates standard Prometheus text-format exposition (version 0.0.4).
    Compatible with Prometheus server scrapers, VictoriaMetrics, and Grafana Agent.
    """
    lines = []

    # 1. HTTP Requests Total
    lines.append("# HELP apexsovereign_http_requests_total Total number of HTTP requests processed.")
    lines.append("# TYPE apexsovereign_http_requests_total counter")
    with _lock:
        for (method, path, status), count in _http_requests_total.items():
            lines.append(f'apexsovereign_http_requests_total{{method="{method}",path="{path}",status="{status}"}} {count}')

    # 2. HTTP Request Duration Seconds (Histogram format)
    lines.append("# HELP apexsovereign_http_request_duration_seconds HTTP request execution latency in seconds.")
    lines.append("# TYPE apexsovereign_http_request_duration_seconds histogram")
    with _lock:
        for (method, path), samples in _http_request_durations.items():
            count = len(samples)
            total_sum = sum(samples)
            for bucket in LATENCY_BUCKETS:
                bucket_count = sum(1 for s in samples if s <= bucket)
                lines.append(f'apexsovereign_http_request_duration_seconds_bucket{{method="{method}",path="{path}",le="{bucket}"}} {bucket_count}')
            lines.append(f'apexsovereign_http_request_duration_seconds_bucket{{method="{method}",path="{path}",le="+Inf"}} {count}')
            lines.append(f'apexsovereign_http_request_duration_seconds_sum{{method="{method}",path="{path}"}} {total_sum:.6f}')
            lines.append(f'apexsovereign_http_request_duration_seconds_count{{method="{method}",path="{path}"}} {count}')

    # 3. Active Compute Transactions (Gauge)
    lines.append("# HELP apexsovereign_active_compute_transactions Number of concurrent active compute transactions.")
    lines.append("# TYPE apexsovereign_active_compute_transactions gauge")
    lines.append(f"apexsovereign_active_compute_transactions {_active_compute_transactions}")

    # 4. Webhook Processing Total
    lines.append("# HELP apexsovereign_webhook_processing_total Cryptographic billing webhook processing totals.")
    lines.append("# TYPE apexsovereign_webhook_processing_total counter")
    with _lock:
        for (source, status), count in _webhook_processing_total.items():
            lines.append(f'apexsovereign_webhook_processing_total{{source="{source}",status="{status}"}} {count}')

    # 5. GPU Spot Nodes Available (Gauge)
    lines.append("# HELP apexsovereign_gpu_spot_nodes_available Discovered GPU spot nodes available in broker inventory.")
    lines.append("# TYPE apexsovereign_gpu_spot_nodes_available gauge")
    with _lock:
        for (tier, provider, region), count in _gpu_spot_nodes_available.items():
            lines.append(f'apexsovereign_gpu_spot_nodes_available{{tier="{tier}",provider="{provider}",region="{region}"}} {count}')

    # 6. Corporate Invoices Total
    lines.append("# HELP apexsovereign_invoices_total Corporate Wire/ACH invoices by status.")
    lines.append("# TYPE apexsovereign_invoices_total counter")
    with _lock:
        for (status, payment_terms), count in _invoices_total.items():
            lines.append(f'apexsovereign_invoices_total{{status="{status}",payment_terms="{payment_terms}"}} {count}')

    lines.append("")  # Trailing newline required by Prometheus RFC
    return "\n".join(lines)


class PrometheusMetricsMiddleware(BaseHTTPMiddleware):
    """
    FastAPI / Starlette Middleware that intercepts all requests,
    times their duration, increments transaction gauges, and logs metrics.
    """

    async def dispatch(self, request: Request, call_next):
        # Exclude /metrics from tracking to prevent self-sampling loop
        if request.url.path == "/metrics":
            return await call_next(request)

        # Track compute lease activity on lease dispatch endpoints
        is_compute_action = "/compute/dispatch" in request.url.path
        if is_compute_action:
            set_active_compute_transactions(delta=1)

        start_time = time.time()
        try:
            response = await call_next(request)
            duration = time.time() - start_time
            record_http_request(
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_seconds=duration,
            )
            return response
        except Exception as exc:
            duration = time.time() - start_time
            record_http_request(
                method=request.method,
                path=request.url.path,
                status_code=500,
                duration_seconds=duration,
            )
            raise exc
        finally:
            if is_compute_action:
                set_active_compute_transactions(delta=-1)
