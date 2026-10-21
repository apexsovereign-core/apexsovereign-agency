# ==============================================================================
# APEXSOVEREIGN.AI — ENTERPRISE PYTHON CLIENT SDK
# Path: sdk/python/apexsovereign/client.py
# High-Performance Asynchronous Client for Sovereign Compute & Settlement
# ==============================================================================

import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, Any, Optional
try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger("apexsovereign")


class ApexSovereignError(Exception):
    """Base exception for ApexSovereign client errors."""
    def __init__(self, message: str, status_code: Optional[int] = None, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details or {}


class InsufficientCreditError(ApexSovereignError):
    """Raised when tenant compute units are exhausted (HTTP 402)."""
    pass


class RateLimitError(ApexSovereignError):
    """Raised when tier throughput limits are exceeded (HTTP 429)."""
    pass


@dataclass
class ArbitrageRouteResponse:
    status: str
    selected_node_id: str
    target_region: str
    spot_price_usd_hr: float = 0.0
    retail_benchmark_usd_hr: float = 0.0
    net_arbitrage_savings_pct: float = 0.0
    estimated_latency_ms: int = 0
    grid_lmp_usd_mwh: float = 0.0
    routing_decision: str = ""
    execution_duration_micros: int = 0
    raw_payload: Optional[Dict[str, Any]] = None


@dataclass
class CreditBalanceResponse:
    tenant_id: str
    balance_cu: float
    locked_cu: float
    usd_equivalent: float
    is_frozen: bool


@dataclass
class MolecularProofResponse:
    asset_id: str
    target_protein_id: str
    sequence_hash: str
    predicted_plddt_score: float
    jws_token: str
    timestamp: float
    status: str


class ApexSovereignClient:
    """Enterprise client for interacting with the ApexSovereign compute mesh and ledgers."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.apexsovereign.ai",
        max_retries: int = 4,
        backoff_factor: float = 0.5,
        timeout_seconds: float = 10.0,
    ):
        if not api_key:
            raise ValueError("api_key must be provided.")
        if not api_key.startswith(("apk_live_", "apk_test_")):
            raise ValueError("Invalid API key format. Expected apk_live_ or apk_test_ prefix.")

        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self.timeout = timeout_seconds

        self._headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "ApexSovereign-Python-SDK/1.0.0",
        }
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self._client = httpx.AsyncClient(
            headers=self._headers,
            timeout=self.timeout,
            limits=httpx.Limits(max_keepalive_connections=50, max_connections=200),
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._client:
            await self._client.aclose()
            self._client = None

    def _get_client(self) -> Any:
        if httpx is None:
            raise ImportError("httpx is required to use ApexSovereignClient. Install via: pip install httpx")
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                headers=self._headers,
                timeout=self.timeout,
                limits=httpx.Limits(max_keepalive_connections=50, max_connections=200),
            )
        return self._client

    async def _request_with_retry(self, method: str, path: str, json_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        client = self._get_client()
        url = f"{self.base_url}{path}"
        last_exception = None

        for attempt in range(self.max_retries + 1):
            try:
                response = await client.request(method=method, url=url, json=json_data)

                if response.status_code in (200, 201):
                    return response.json()

                if response.status_code == 402:
                    error_data = response.json()
                    raise InsufficientCreditError(
                        message=error_data.get("message", "Payment Required: Balance exhausted."),
                        status_code=402,
                        details=error_data,
                    )

                if response.status_code == 429:
                    error_data = response.json()
                    raise RateLimitError(
                        message=error_data.get("message", "Rate limit exceeded."),
                        status_code=429,
                        details=error_data,
                    )

                if response.status_code in (502, 503, 504) and attempt < self.max_retries:
                    delay = self.backoff_factor * (2 ** attempt)
                    logger.warning(f"Transient HTTP {response.status_code} received. Retrying in {delay:.2f}s...")
                    await asyncio.sleep(delay)
                    continue

                error_data = response.json() if "application/json" in response.headers.get("content-type", "") else {"text": response.text}
                raise ApexSovereignError(
                    message=f"Request failed with HTTP {response.status_code}: {error_data}",
                    status_code=response.status_code,
                    details=error_data,
                )

            except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout) as err:
                last_exception = err
                if attempt < self.max_retries:
                    delay = self.backoff_factor * (2 ** attempt)
                    logger.warning(f"Network error ({err}). Retrying in {delay:.2f}s...")
                    await asyncio.sleep(delay)
                else:
                    raise ApexSovereignError(f"Network request exhausted all retries: {err}")

        raise ApexSovereignError(f"Request failed: {last_exception}")

    async def route_compute(
        self,
        architecture: str = "H100_SXM5",
        gpu_count: int = 8,
        max_latency_ms: int = 15,
        max_cost_usd_hr: Optional[float] = None,
    ) -> ArbitrageRouteResponse:
        """Evaluates lowest-cost GPU spot node satisfying latency and architecture constraints."""
        payload: Dict[str, Any] = {
            "architecture": architecture,
            "gpu_count": gpu_count,
            "max_acceptable_latency_ms": max_latency_ms,
        }
        if max_cost_usd_hr is not None:
            payload["max_cost_budget_usd_hr"] = max_cost_usd_hr

        data = await self._request_with_retry("POST", "/v1/arbitrage/route", payload)
        return ArbitrageRouteResponse(
            status=data.get("status", "UNKNOWN"),
            selected_node_id=data.get("selected_node_id", ""),
            target_region=data.get("target_region", ""),
            spot_price_usd_hr=float(data.get("spot_price_usd_hr", 0.0)),
            retail_benchmark_usd_hr=float(data.get("retail_benchmark_usd_hr", 0.0)),
            net_arbitrage_savings_pct=float(data.get("net_arbitrage_savings_pct", 0.0)),
            estimated_latency_ms=int(data.get("estimated_latency_ms", 0)),
            grid_lmp_usd_mwh=float(data.get("grid_lmp_usd_mwh", 0.0)),
            routing_decision=data.get("routing_decision", ""),
            execution_duration_micros=int(data.get("execution_duration_micros", 0)),
            raw_payload=data,
        )

    async def get_credit_balance(self) -> CreditBalanceResponse:
        """Queries the current ledger balance and USD equivalent from AethelPay."""
        data = await self._request_with_retry("GET", "/v1/billing/balance")
        cu_bal = float(data.get("balance_cu", 0.0))
        return CreditBalanceResponse(
            tenant_id=data.get("tenant_id", ""),
            balance_cu=cu_bal,
            locked_cu=float(data.get("locked_cu", 0.0)),
            usd_equivalent=round(cu_bal / 100.0, 4),
            is_frozen=bool(data.get("is_frozen", False)),
        )

    async def submit_molecular_job(
        self,
        protein_id: str,
        sequence: str,
        target_affinity_nm: float = 0.42,
        simulation_seed: int = 42091,
        cluster_origin: str = "auto",
    ) -> MolecularProofResponse:
        """Submits candidate molecule to AuraPharm ED25519 tokenization and verification pipeline."""
        payload = {
            "target_protein_id": protein_id,
            "amino_acid_sequence": sequence,
            "target_affinity_nm": target_affinity_nm,
            "simulation_seed": simulation_seed,
            "cluster_origin": cluster_origin,
        }
        data = await self._request_with_retry("POST", "/v1/biopharma/submit", payload)
        return MolecularProofResponse(
            asset_id=data.get("asset_id", ""),
            target_protein_id=data.get("target_protein_id", ""),
            sequence_hash=data.get("sequence_hash", ""),
            predicted_plddt_score=float(data.get("predicted_plddt_score", 0.0)),
            jws_token=data.get("jws_token", ""),
            timestamp=float(data.get("timestamp", 0.0)),
            status=data.get("status", "SUBMITTED"),
        )

    async def close(self):
        """Closes underlying HTTP connection pool."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
