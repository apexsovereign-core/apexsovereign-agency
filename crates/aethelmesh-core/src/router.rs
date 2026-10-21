// ==============================================================================
// APEXSOVEREIGN.AI: AETHELMESH COMPUTE ROUTER & ARBITRAGE DISPATCH CORE
// Path: crates/aethelmesh-core/src/router.rs
// Execution SLA: Sub-15ms latency ceiling, spot market filtering across GPU nodes
// ==============================================================================

use std::sync::Arc;
use std::time::Instant;
use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::energy_bridge::EnergyMonitor;

pub const SPOT_PRICE_FLOOR_USD_HR: f64 = 1.85;
pub const MAX_LATENCY_SLO_MS: u32 = 15;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuClusterNode {
    pub node_id: String,
    pub provider: String,
    pub region: String,
    pub architecture: String,
    pub spot_price_usd_hr: f64,
    pub ping_latency_ms: u32,
    pub available_gpus: u32,
    pub power_zone_id: String,
    pub is_healthy: bool,
    pub last_heartbeat_timestamp: u64,
}

#[derive(Clone)]
pub struct MeshState {
    pub energy_monitor: Arc<EnergyMonitor>,
    pub nodes: Arc<RwLock<Vec<GpuClusterNode>>>,
}

pub type AppState = MeshState;

impl MeshState {
    pub fn new(energy_monitor: Arc<EnergyMonitor>) -> Self {
        let initial_nodes = vec![
            GpuClusterNode {
                node_id: "node-nordic-h100-01".to_string(),
                provider: "NordicHydroCompute".to_string(),
                region: "eu-north-ice".to_string(),
                architecture: "H100_SXM5".to_string(),
                spot_price_usd_hr: 1.45,
                ping_latency_ms: 11,
                available_gpus: 64,
                power_zone_id: "ICELAND_GEO_01".to_string(),
                is_healthy: true,
                last_heartbeat_timestamp: 1775580000,
            },
            GpuClusterNode {
                node_id: "node-se-h100-02".to_string(),
                provider: "ScandinavianHydroCore".to_string(),
                region: "eu-north-swe".to_string(),
                architecture: "H100_SXM5".to_string(),
                spot_price_usd_hr: 1.72,
                ping_latency_ms: 14,
                available_gpus: 32,
                power_zone_id: "NORDIC_HYDRO_02".to_string(),
                is_healthy: true,
                last_heartbeat_timestamp: 1775580000,
            },
            GpuClusterNode {
                node_id: "node-us-b200-03".to_string(),
                provider: "AethelGridEnergyPark".to_string(),
                region: "us-west-smr".to_string(),
                architecture: "B200_NVL72".to_string(),
                spot_price_usd_hr: 2.75,
                ping_latency_ms: 8,
                available_gpus: 48,
                power_zone_id: "US_WEST_SMR_01".to_string(),
                is_healthy: true,
                last_heartbeat_timestamp: 1775580000,
            },
            GpuClusterNode {
                node_id: "node-us-a100-04".to_string(),
                provider: "AppalachianStrandedGrid".to_string(),
                region: "us-east-pjm".to_string(),
                architecture: "A100_SXM4".to_string(),
                spot_price_usd_hr: 1.18,
                ping_latency_ms: 6,
                available_gpus: 128,
                power_zone_id: "PJM_EAST_GRID".to_string(),
                is_healthy: true,
                last_heartbeat_timestamp: 1775580000,
            },
        ];

        Self {
            energy_monitor,
            nodes: Arc::new(RwLock::new(initial_nodes)),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ArbitrageRouteRequest {
    #[serde(alias = "gpu_architecture")]
    pub architecture: String,
    #[serde(alias = "gpu_count")]
    pub gpu_count: u32,
    #[serde(alias = "max_acceptable_latency_ms")]
    pub max_acceptable_latency_ms: Option<u32>,
    #[serde(alias = "max_cost_limit_usd_hr", alias = "max_cost_budget_usd_hr")]
    pub max_cost_budget_usd_hr: Option<f64>,
}

pub type MeshRoutingRequest = ArbitrageRouteRequest;

#[derive(Debug, Serialize)]
pub struct ArbitrageRouteResponse {
    pub status: String,
    pub selected_node_id: String,
    pub provider: String,
    pub target_region: String,
    pub spot_price_usd_hr: f64,
    pub retail_benchmark_usd_hr: f64,
    pub net_arbitrage_savings_pct: f64,
    pub estimated_latency_ms: u32,
    pub grid_lmp_usd_mwh: f64,
    pub routing_decision: String,
    pub execution_duration_micros: u128,
}

pub type MeshRoutingResponse = ArbitrageRouteResponse;

pub async fn evaluate_mesh_route(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ArbitrageRouteRequest>,
) -> Result<Json<ArbitrageRouteResponse>, (StatusCode, Json<serde_json::Value>)> {
    let timer_start = Instant::now();
    let latency_ceiling = payload.max_acceptable_latency_ms.unwrap_or(MAX_LATENCY_SLO_MS);

    let nodes_guard = state.nodes.read().await;

    // 1. Filter valid nodes meeting architectural constraints, capacity, health, and latency ceiling
    let candidate_nodes: Vec<&GpuClusterNode> = nodes_guard
        .iter()
        .filter(|node| {
            node.is_healthy
                && node.architecture.eq_ignore_ascii_case(&payload.architecture)
                && node.available_gpus >= payload.gpu_count
                && node.ping_latency_ms <= latency_ceiling
        })
        .collect();

    if candidate_nodes.is_empty() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": "ROUTING_FAILED",
                "message": "No GPU nodes meet architecture, capacity, and latency threshold."
            })),
        ));
    }

    // 2. Select optimal node with lowest spot price
    let selected_node = candidate_nodes
        .into_iter()
        .min_by(|a, b| a.spot_price_usd_hr.partial_cmp(&b.spot_price_usd_hr).unwrap())
        .unwrap();

    let retail_reference_rate = match payload.architecture.to_uppercase().as_str() {
        "B200_NVL72" => 6.80,
        "H100_SXM5" => 4.10,
        "A100_SXM4" => 2.45,
        _ => 2.20,
    };

    let savings_pct = ((retail_reference_rate - selected_node.spot_price_usd_hr) / retail_reference_rate) * 100.0;

    // Fetch corresponding grid LMP from energy monitor
    let zones_guard = state.energy_monitor.zones.read().await;
    let lmp = zones_guard
        .iter()
        .find(|z| z.zone_id == selected_node.power_zone_id)
        .map(|z| z.lmp_usd_per_mwh)
        .unwrap_or(32.50);

    let elapsed_micros = timer_start.elapsed().as_micros();

    let decision = if selected_node.spot_price_usd_hr <= SPOT_PRICE_FLOOR_USD_HR {
        "SOVEREIGN_OPTIMAL_DISPATCH"
    } else {
        "STANDARD_COMMERCIAL_ROUTE"
    };

    Ok(Json(ArbitrageRouteResponse {
        status: "ROUTE_CONFIRMED".to_string(),
        selected_node_id: selected_node.node_id.clone(),
        provider: selected_node.provider.clone(),
        target_region: selected_node.region.clone(),
        spot_price_usd_hr: selected_node.spot_price_usd_hr,
        retail_benchmark_usd_hr: retail_reference_rate,
        net_arbitrage_savings_pct: (savings_pct * 10.0).round() / 10.0,
        estimated_latency_ms: selected_node.ping_latency_ms,
        grid_lmp_usd_mwh: lmp,
        routing_decision: decision.to_string(),
        execution_duration_micros: elapsed_micros,
    }))
}
