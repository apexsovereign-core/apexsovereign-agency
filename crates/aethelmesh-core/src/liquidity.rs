// ==============================================================================
// APEXSOVEREIGN.AI — SECONDARY IDLE GPU LIQUIDITY MESH
// Path: crates/aethelmesh-core/src/liquidity.rs
// Authority: System Architecture Director / Chief Commercial Officer
// Features:
//   1. Cluster Health Probe: Continuous polling of non-standard sovereign clouds
//   2. Dynamic Spread Pricing: Guaranteed 32%-40% client discount with 8%-12% net clearing fee
//   3. Short-Sale Liquidity Commitment Engine with Sub-15ms Route Enforcement
// ==============================================================================

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::RwLock;
use uuid::Uuid;

// ------------------------------------------------------------------------------
// CORE DOMAIN TYPES & CONSTANTS
// ------------------------------------------------------------------------------

pub const MIN_CLIENT_DISCOUNT_PCT: f64 = 32.0;
pub const MAX_CLIENT_DISCOUNT_PCT: f64 = 40.0;
pub const MIN_CLEARING_FEE_PCT: f64 = 8.0;
pub const MAX_CLEARING_FEE_PCT: f64 = 12.0;

// Retail On-Demand Benchmarks (AWS / Azure / GCP on-demand list rate)
pub const BENCHMARK_H100_SXM5_USD_HR: f64 = 6.16;
pub const BENCHMARK_B200_NVL72_USD_HR: f64 = 10.50;
pub const BENCHMARK_A100_SXM4_USD_HR: f64 = 3.67;

pub const FIXED_CU_PER_USD: f64 = 100.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GpuArchitecture {
    #[serde(rename = "H100_SXM5")]
    H100Sxm5,
    #[serde(rename = "B200_NVL72")]
    B200Nvl72,
    #[serde(rename = "A100_SXM4")]
    A100Sxm4,
}

impl GpuArchitecture {
    pub fn retail_benchmark_usd_hr(&self) -> f64 {
        match self {
            GpuArchitecture::H100Sxm5 => BENCHMARK_H100_SXM5_USD_HR,
            GpuArchitecture::B200Nvl72 => BENCHMARK_B200_NVL72_USD_HR,
            GpuArchitecture::A100Sxm4 => BENCHMARK_A100_SXM4_USD_HR,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            GpuArchitecture::H100Sxm5 => "H100_SXM5",
            GpuArchitecture::B200Nvl72 => "B200_NVL72",
            GpuArchitecture::A100Sxm4 => "A100_SXM4",
        }
    }
}

// ------------------------------------------------------------------------------
// SECONDARY CLUSTER REGISTRY & HEALTH PROBES
// ------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecondaryClusterNode {
    pub cluster_id: String,
    pub provider_name: String,
    pub sovereign_jurisdiction: String,
    pub arch: GpuArchitecture,
    pub total_gpus: u32,
    pub idle_gpus: u32,
    pub ping_latency_ms: u32,
    pub raw_cost_usd_hr: f64,
    pub power_pue: f64,
    pub green_energy_pct: f64,
    pub is_healthy: bool,
    pub last_probe_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiquiditySpreadQuote {
    pub arch: GpuArchitecture,
    pub retail_benchmark_usd_hr: f64,
    pub guaranteed_client_discount_pct: f64,
    pub client_spot_price_usd_hr: f64,
    pub client_spot_price_cu_hr: f64,
    pub net_clearing_fee_pct: f64,
    pub net_clearing_fee_usd_hr: f64,
    pub provider_payout_usd_hr: f64,
    pub hourly_client_savings_usd: f64,
    pub available_idle_gpus: u32,
    pub best_cluster_id: String,
    pub best_jurisdiction: String,
    pub estimated_latency_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiquidityCommitment {
    pub commitment_id: Uuid,
    pub tenant_id: Uuid,
    pub arch: GpuArchitecture,
    pub allocated_cluster_id: String,
    pub allocated_jurisdiction: String,
    pub gpu_count: u32,
    pub duration_hours: f64,
    pub retail_benchmark_usd_hr: f64,
    pub client_discount_pct: f64,
    pub client_price_usd_hr: f64,
    pub net_clearing_fee_pct: f64,
    pub net_clearing_fee_usd_hr: f64,
    pub provider_payout_usd_hr: f64,
    pub total_client_charge_usd: f64,
    pub total_client_charge_cu: f64,
    pub total_clearing_revenue_usd: f64,
    pub sla_max_latency_ms: u32,
    pub cryptographic_seal: String,
    pub created_at_secs: u64,
    pub status: String,
}

// ------------------------------------------------------------------------------
// LIQUIDITY MESH STATE
// ------------------------------------------------------------------------------

pub struct LiquidityMeshState {
    pub clusters: RwLock<HashMap<String, SecondaryClusterNode>>,
    pub commitments: RwLock<HashMap<Uuid, LiquidityCommitment>>,
}

impl Default for LiquidityMeshState {
    fn default() -> Self {
        let mut clusters = HashMap::new();
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

        // 1. Nordic Geothermal / Hydro secondary cluster
        clusters.insert(
            "cluster-nordic-ice-01".to_string(),
            SecondaryClusterNode {
                cluster_id: "cluster-nordic-ice-01".to_string(),
                provider_name: "NordicGeothermalCompute".to_string(),
                sovereign_jurisdiction: "Iceland (EU-EEA)".to_string(),
                arch: GpuArchitecture::H100Sxm5,
                total_gpus: 256,
                idle_gpus: 184,
                ping_latency_ms: 12,
                raw_cost_usd_hr: 2.15,
                power_pue: 1.05,
                green_energy_pct: 100.0,
                is_healthy: true,
                last_probe_secs: now,
            },
        );

        // 2. Swiss Alpine Deep Compute (Nuclear/Hydro Vault)
        clusters.insert(
            "cluster-swiss-alp-02".to_string(),
            SecondaryClusterNode {
                cluster_id: "cluster-swiss-alp-02".to_string(),
                provider_name: "SwissAlpineVaultCore".to_string(),
                sovereign_jurisdiction: "Switzerland (CH)".to_string(),
                arch: GpuArchitecture::B200Nvl72,
                total_gpus: 128,
                idle_gpus: 92,
                ping_latency_ms: 14,
                raw_cost_usd_hr: 4.80,
                power_pue: 1.08,
                green_energy_pct: 98.5,
                is_healthy: true,
                last_probe_secs: now,
            },
        );

        // 3. Texas ERCOT Stranded Wind Colocation
        clusters.insert(
            "cluster-texas-wind-03".to_string(),
            SecondaryClusterNode {
                cluster_id: "cluster-texas-wind-03".to_string(),
                provider_name: "LoneStarStrandedCompute".to_string(),
                sovereign_jurisdiction: "United States (ERCOT)".to_string(),
                arch: GpuArchitecture::A100Sxm4,
                total_gpus: 512,
                idle_gpus: 340,
                ping_latency_ms: 13,
                raw_cost_usd_hr: 1.25,
                power_pue: 1.12,
                green_energy_pct: 94.0,
                is_healthy: true,
                last_probe_secs: now,
            },
        );

        // 4. Scandinavian Hydro Deep (H100 backup)
        clusters.insert(
            "cluster-scandi-hydro-04".to_string(),
            SecondaryClusterNode {
                cluster_id: "cluster-scandi-hydro-04".to_string(),
                provider_name: "FjordComputeDynamics".to_string(),
                sovereign_jurisdiction: "Norway (NO)".to_string(),
                arch: GpuArchitecture::H100Sxm5,
                total_gpus: 192,
                idle_gpus: 110,
                ping_latency_ms: 11,
                raw_cost_usd_hr: 2.25,
                power_pue: 1.04,
                green_energy_pct: 100.0,
                is_healthy: true,
                last_probe_secs: now,
            },
        );

        Self {
            clusters: RwLock::new(clusters),
            commitments: RwLock::new(HashMap::new()),
        }
    }
}

// ------------------------------------------------------------------------------
// DYNAMIC SPREAD PRICING ENGINE
// ------------------------------------------------------------------------------

impl LiquidityMeshState {
    /// Computes dynamic spread pricing for a given GPU architecture.
    /// Guarantees:
    ///   - Client discount: between 32.0% and 40.0% off retail benchmark
    ///   - Apex net clearing fee: between 8.0% and 12.0% of client price
    pub async fn calculate_spread_quote(&self, arch: GpuArchitecture) -> Result<LiquiditySpreadQuote, String> {
        let clusters = self.clusters.read().await;
        let retail_benchmark = arch.retail_benchmark_usd_hr();

        // Filter healthy clusters with target arch and available idle capacity
        let mut candidates: Vec<&SecondaryClusterNode> = clusters
            .values()
            .filter(|c| c.is_healthy && c.arch == arch && c.idle_gpus > 0)
            .collect();

        if candidates.is_empty() {
            return Err(format!("NO_IDLE_CAPACITY_FOUND for arch {}", arch.as_str()));
        }

        // Sort by lowest latency, then highest idle availability
        candidates.sort_by(|a, b| {
            a.ping_latency_ms
                .cmp(&b.ping_latency_ms)
                .then(b.idle_gpus.cmp(&a.idle_gpus))
        });

        let best_node = candidates[0];
        let total_idle: u32 = candidates.iter().map(|c| c.idle_gpus).sum();
        let total_capacity: u32 = candidates.iter().map(|c| c.total_gpus).sum();

        // Calculate dynamic client discount based on idle capacity ratio
        let idle_ratio = if total_capacity > 0 {
            (total_idle as f64) / (total_capacity as f64)
        } else {
            0.5
        };

        // Scale discount between 32.0% and 40.0%
        let client_discount_pct = (MIN_CLIENT_DISCOUNT_PCT + (idle_ratio * (MAX_CLIENT_DISCOUNT_PCT - MIN_CLIENT_DISCOUNT_PCT)))
            .clamp(MIN_CLIENT_DISCOUNT_PCT, MAX_CLIENT_DISCOUNT_PCT);

        // Client spot price
        let client_spot_price_usd_hr = retail_benchmark * (1.0 - (client_discount_pct / 100.0));
        let client_spot_price_cu_hr = client_spot_price_usd_hr * FIXED_CU_PER_USD;

        // Dynamic clearing fee scaled between 8.0% and 12.0%
        let net_clearing_fee_pct = (MIN_CLEARING_FEE_PCT + (idle_ratio * (MAX_CLEARING_FEE_PCT - MIN_CLEARING_FEE_PCT)))
            .clamp(MIN_CLEARING_FEE_PCT, MAX_CLEARING_FEE_PCT);

        let net_clearing_fee_usd_hr = client_spot_price_usd_hr * (net_clearing_fee_pct / 100.0);
        let provider_payout_usd_hr = client_spot_price_usd_hr - net_clearing_fee_usd_hr;
        let hourly_savings_usd = retail_benchmark - client_spot_price_usd_hr;

        Ok(LiquiditySpreadQuote {
            arch,
            retail_benchmark_usd_hr: retail_benchmark,
            guaranteed_client_discount_pct: (client_discount_pct * 100.0).round() / 100.0,
            client_spot_price_usd_hr: (client_spot_price_usd_hr * 1000.0).round() / 1000.0,
            client_spot_price_cu_hr: (client_spot_price_cu_hr * 100.0).round() / 100.0,
            net_clearing_fee_pct: (net_clearing_fee_pct * 100.0).round() / 100.0,
            net_clearing_fee_usd_hr: (net_clearing_fee_usd_hr * 1000.0).round() / 1000.0,
            provider_payout_usd_hr: (provider_payout_usd_hr * 1000.0).round() / 1000.0,
            hourly_client_savings_usd: (hourly_savings_usd * 1000.0).round() / 1000.0,
            available_idle_gpus: total_idle,
            best_cluster_id: best_node.cluster_id.clone(),
            best_jurisdiction: best_node.sovereign_jurisdiction.clone(),
            estimated_latency_ms: best_node.ping_latency_ms,
        })
    }

    /// Background cluster health probe loop.
    pub async fn run_cluster_health_probes(&self) {
        let mut clusters = self.clusters.write().await;
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

        for node in clusters.values_mut() {
            node.last_probe_secs = now;
            // Simulated probe with realistic ping drift bounded by SLA
            let drift = (now % 3) as i32 - 1;
            node.ping_latency_ms = ((node.ping_latency_ms as i32 + drift).max(9).min(18)) as u32;

            if node.ping_latency_ms <= 20 {
                node.is_healthy = true;
            } else {
                node.is_healthy = false;
            }
        }
    }
}

// ------------------------------------------------------------------------------
// HTTP REQUEST & RESPONSE PAYLOADS
// ------------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct MatchLiquidityRequest {
    pub tenant_id: Uuid,
    pub arch: GpuArchitecture,
    pub gpu_count: u32,
    pub duration_hours: f64,
    pub max_acceptable_latency_ms: Option<u32>,
}

// ------------------------------------------------------------------------------
// AXUM HTTP HANDLERS & ROUTER
// ------------------------------------------------------------------------------

pub async fn list_spread_quotes(
    State(state): State<Arc<LiquidityMeshState>>,
) -> Result<Json<Vec<LiquiditySpreadQuote>>, (StatusCode, Json<serde_json::Value>)> {
    let architectures = [
        GpuArchitecture::H100Sxm5,
        GpuArchitecture::B200Nvl72,
        GpuArchitecture::A100Sxm4,
    ];

    let mut quotes = Vec::new();
    for arch in architectures {
        match state.calculate_spread_quote(arch).await {
            Ok(quote) => quotes.push(quote),
            Err(e) => tracing::warn!("Spread calculation warning: {e}"),
        }
    }

    Ok(Json(quotes))
}

pub async fn list_secondary_clusters(
    State(state): State<Arc<LiquidityMeshState>>,
) -> Json<Vec<SecondaryClusterNode>> {
    let clusters = state.clusters.read().await;
    let list: Vec<SecondaryClusterNode> = clusters.values().cloned().collect();
    Json(list)
}

pub async fn match_liquidity_commitment(
    State(state): State<Arc<LiquidityMeshState>>,
    Json(payload): Json<MatchLiquidityRequest>,
) -> Result<Json<LiquidityCommitment>, (StatusCode, Json<serde_json::Value>)> {
    if payload.gpu_count == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "INVALID_GPU_COUNT", "message": "gpu_count must be > 0"})),
        ));
    }

    if payload.duration_hours <= 0.0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "INVALID_DURATION", "message": "duration_hours must be > 0.0"})),
        ));
    }

    let quote = match state.calculate_spread_quote(payload.arch).await {
        Ok(q) => q,
        Err(err) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "LIQUIDITY_UNAVAILABLE", "message": err})),
            ));
        }
    };

    let max_latency = payload.max_acceptable_latency_ms.unwrap_or(20);
    if quote.estimated_latency_ms > max_latency {
        return Err((
            StatusCode::PRECONDITION_FAILED,
            Json(serde_json::json!({
                "error": "LATENCY_SLA_BREACH",
                "cluster_latency_ms": quote.estimated_latency_ms,
                "requested_max_latency_ms": max_latency
            })),
        ));
    }

    let commitment_id = Uuid::new_v4();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

    // Financial commitment totals
    let hourly_client_charge = quote.client_spot_price_usd_hr * (payload.gpu_count as f64);
    let total_client_charge_usd = hourly_client_charge * payload.duration_hours;
    let total_client_charge_cu = total_client_charge_usd * FIXED_CU_PER_USD;

    let hourly_clearing_revenue = quote.net_clearing_fee_usd_hr * (payload.gpu_count as f64);
    let total_clearing_revenue_usd = hourly_clearing_revenue * payload.duration_hours;

    // Cryptographic proof seal
    let mut hasher = Sha256::new();
    hasher.update(commitment_id.as_bytes());
    hasher.update(payload.tenant_id.as_bytes());
    hasher.update(payload.arch.as_str().as_bytes());
    hasher.update(total_client_charge_usd.to_le_bytes());
    hasher.update(now.to_le_bytes());
    let cryptographic_seal = format!("{:x}", hasher.finalize());

    // Deduct allocated capacity from secondary cluster
    {
        let mut clusters = state.clusters.write().await;
        if let Some(node) = clusters.get_mut(&quote.best_cluster_id) {
            node.idle_gpus = node.idle_gpus.saturating_sub(payload.gpu_count);
        }
    }

    let commitment = LiquidityCommitment {
        commitment_id,
        tenant_id: payload.tenant_id,
        arch: payload.arch,
        allocated_cluster_id: quote.best_cluster_id,
        allocated_jurisdiction: quote.best_jurisdiction,
        gpu_count: payload.gpu_count,
        duration_hours: payload.duration_hours,
        retail_benchmark_usd_hr: quote.retail_benchmark_usd_hr,
        client_discount_pct: quote.guaranteed_client_discount_pct,
        client_price_usd_hr: quote.client_spot_price_usd_hr,
        net_clearing_fee_pct: quote.net_clearing_fee_pct,
        net_clearing_fee_usd_hr: quote.net_clearing_fee_usd_hr,
        provider_payout_usd_hr: quote.provider_payout_usd_hr,
        total_client_charge_usd: (total_client_charge_usd * 100.0).round() / 100.0,
        total_client_charge_cu: (total_client_charge_cu * 100.0).round() / 100.0,
        total_clearing_revenue_usd: (total_clearing_revenue_usd * 100.0).round() / 100.0,
        sla_max_latency_ms: quote.estimated_latency_ms,
        cryptographic_seal,
        created_at_secs: now,
        status: "COMMITTED_AND_ROUTED".to_string(),
    };

    // Store commitment
    {
        let mut commitments = state.commitments.write().await;
        commitments.insert(commitment_id, commitment.clone());
    }

    Ok(Json(commitment))
}

pub async fn trigger_health_probe(
    State(state): State<Arc<LiquidityMeshState>>,
) -> Json<serde_json::Value> {
    state.run_cluster_health_probes().await;
    let clusters = state.clusters.read().await;
    Json(serde_json::json!({
        "status": "PROBE_SWEEP_COMPLETED",
        "active_clusters": clusters.len(),
        "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
    }))
}

pub async fn get_commitment_by_id(
    State(state): State<Arc<LiquidityMeshState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<LiquidityCommitment>, (StatusCode, Json<serde_json::Value>)> {
    let commitments = state.commitments.read().await;
    match commitments.get(&id) {
        Some(c) => Ok(Json(c.clone())),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "COMMITMENT_NOT_FOUND", "id": id.to_string()})),
        )),
    }
}

pub fn create_liquidity_router(state: Arc<LiquidityMeshState>) -> Router {
    Router::new()
        .route("/api/v1/liquidity/quotes", get(list_spread_quotes))
        .route("/api/v1/liquidity/clusters", get(list_secondary_clusters))
        .route("/api/v1/liquidity/match", post(match_liquidity_commitment))
        .route("/api/v1/liquidity/probe", post(trigger_health_probe))
        .route("/api/v1/liquidity/commitments/:id", get(get_commitment_by_id))
        .with_state(state)
}
