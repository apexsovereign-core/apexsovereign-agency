"""Security and observability middleware for the enterprise agent API."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid
from typing import Any, Awaitable, Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from observability import telemetry


REDACTED_FIELDS = {"authorization", "api_key", "access_token", "refresh_token", "password", "secret"}


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: "[REDACTED]" if key.lower() in REDACTED_FIELDS else redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def verify_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not raw_body or not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    supplied = signature.removeprefix("sha256=")
    return hmac.compare_digest(expected, supplied)


class AgentSecurityMiddleware(BaseHTTPMiddleware):
    """Adds request IDs and enforces tenant/idempotency headers on mutating agent calls."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Any]]) -> Any:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        started = time.perf_counter()
        path = request.url.path
        requires_scope = path.startswith("/agent-platform") and request.method in {"POST", "PUT", "PATCH", "DELETE"}
        if requires_scope:
            if not request.headers.get("X-Tenant-ID"):
                return JSONResponse(status_code=400, content={"error": "tenant_scope_required", "request_id": request_id})
            if not request.headers.get("X-Idempotency-Key"):
                return JSONResponse(status_code=400, content={"error": "idempotency_key_required", "request_id": request_id})
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time-Ms"] = str(round((time.perf_counter() - started) * 1000, 3))
        return response


class ApexTrustLayerMiddleware(BaseHTTPMiddleware):
    """Perimeter authentication and latency telemetry for agent requests."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Any]]) -> Any:
        started = time.perf_counter()
        if request.url.path.startswith("/agent-platform"):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer ") or len(auth_header.removeprefix("Bearer ").strip()) < 16:
                return JSONResponse(status_code=401, content={"error": "trust_layer_access_denied", "detail": "Bearer authorization is required"})
        response = await call_next(request)
        response.headers["X-Apex-Trust-Layer"] = "Active"
        response.headers["X-Execution-Latency-Ms"] = str(round((time.perf_counter() - started) * 1000, 2))
        return response


class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Any]]) -> Any:
        trace_id = request.headers.get("X-Trace-ID") or telemetry.start_trace(method=request.method, path=request.url.path)
        request.state.trace_id = trace_id
        try:
            response = await call_next(request)
            telemetry.finish_trace(trace_id, status=str(response.status_code))
        except Exception as exc:
            telemetry.finish_trace(trace_id, status="500", error=str(exc))
            raise
        response.headers["X-Trace-ID"] = trace_id
        return response


def audit_context(request: Request, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "request_id": getattr(request.state, "request_id", "unknown"),
        "tenant_id": request.headers.get("X-Tenant-ID"),
        "method": request.method,
        "path": request.url.path,
        "payload": redact(payload or {}),
        "environment": os.getenv("ENVIRONMENT", "production"),
    }
