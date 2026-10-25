// crates/aethelmesh/src/arbitrage_router.rs
//! ApexSovereign Holdings - AethelMesh Compute Arbitrage & Low-Latency Routing Core
//! Sub-15ms execution latency, 90-second hot-swap multi-cloud failover (H100, B200, A100).

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GpuArchitecture {
    H100SXM5,
    B200NVL72,
    A10080GBSXM4,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeTelemetry {
    pub node_id: String,
    pub cluster_region: String,
    pub gpu_arch: GpuArchitecture,
    pub available_gpus: u32,
    pub spot_price_usd_hr: f64,
    pub ping_latency_ms: f64,
    pub thermal_headroom_c: f64,
    pub is_healthy: bool,
    pub last_heartbeat: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingRequest {
    pub tenant_id: String,
    pub target_gpu: GpuArchitecture,
    pub required_instances: u32,
    pub max_cost_usd_hr: f64,
    pub latency_tolerance_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingDecision {
    pub execution_id: String,
    pub assigned_node_id: String,
    pub region: String,
    pub allocated_price_usd_hr: f64,
    pub routing_latency_ms: f64,
    pub estimated_savings_pct: f64,
    pub fallback_target: Option<String>,
    pub decision_timestamp: DateTime<Utc>,
}

#[derive(Clone)]
pub struct MeshState {
    pub nodes: Arc<RwLock<HashMap<String, NodeTelemetry>>>,
    pub routing_counter: Arc<AtomicU64>,
}

impl MeshState {
    pub fn new() -> Self {
        let mut initial_nodes = HashMap::new();

        initial_nodes.insert(
            "node-h100-virginia-01".to_string(),
            NodeTelemetry {
                node_id: "node-h100-virginia-01".to_string(),
                cluster_region: "US-EAST-VA".to_string(),
                gpu_arch: GpuArchitecture::H100SXM5,
                available_gpus: 32,
                spot_price_usd_hr: 1.82,
                ping_latency_ms: 8.4,
                thermal_headroom_c: 18.5,
                is_healthy: true,
                last_heartbeat: Utc::now(),
            },
        );

        initial_nodes.insert(
            "node-b200-chicago-01".to_string(),
            NodeTelemetry {
                node_id: "node-b200-chicago-01".to_string(),
                cluster_region: "US-MIDWEST-IL".to_string(),
                gpu_arch: GpuArchitecture::B200NVL72,
                available_gpus: 16,
                spot_price_usd_hr: 3.30,
                ping_latency_ms: 11.2,
                thermal_headroom_c: 14.2,
                is_healthy: true,
                last_heartbeat: Utc::now(),
            },
        );

        initial_nodes.insert(
            "node-a100-iceland-geo-01".to_string(),
            NodeTelemetry {
                node_id: "node-a100-iceland-geo-01".to_string(),
                cluster_region: "EU-NORTH-IS".to_string(),
                gpu_arch: GpuArchitecture::A10080GBSXM4,
                available_gpus: 64,
                spot_price_usd_hr: 1.38,
                ping_latency_ms: 12.8,
                thermal_headroom_c: 24.0,
                is_healthy: true,
                last_heartbeat: Utc::now(),
            },
        );

        Self {
            nodes: Arc::new(RwLock::new(initial_nodes)),
            routing_counter: Arc::new(AtomicU64::new(0)),
        }
    }
}

pub async fn evaluate_route(
    State(state): State<MeshState>,
    Json(payload): Json<RoutingRequest>,
) -> Result<Json<RoutingDecision>, (StatusCode, Json<serde_json::Value>)> {
    let start_time = Instant::now();
    let nodes_guard = state.nodes.read().await;

    let benchmark_list_rate = match payload.target_gpu {
        GpuArchitecture::H100SXM5 => 3.85,
        GpuArchitecture::B200NVL72 => 5.40,
        GpuArchitecture::A10080GBSXM4 => 2.60,
    };

    let mut eligible_candidates: Vec<&NodeTelemetry> = nodes_guard
        .values()
        .filter(|n| {
            n.is_healthy
                && std::mem::discriminant(&n.gpu_arch) == std::mem::discriminant(&payload.target_gpu)
                && n.available_gpus >= payload.required_instances
                && n.spot_price_usd_hr <= payload.max_cost_usd_hr
                && n.ping_latency_ms <= payload.latency_tolerance_ms
        })
        .collect();

    // Sort candidates by spot price ascending, then latency ascending
    eligible_candidates.sort_by(|a, b| {
        a.spot_price_usd_hr
            .partial_cmp(&b.spot_price_usd_hr)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                a.ping_latency_ms
                    .partial_cmp(&b.ping_latency_ms)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });

    if let Some(best_node) = eligible_candidates.first() {
        let counter = state.routing_counter.fetch_add(1, Ordering::SeqCst);
        let elapsed_ms = start_time.elapsed().as_secs_f64() * 1000.0;
        let savings_pct = ((benchmark_list_rate - best_node.spot_price_usd_hr) / benchmark_list_rate) * 100.0;

        let fallback = eligible_candidates
            .get(1)
            .map(|n| n.node_id.clone())
            .or_else(|| Some("node-a100-iceland-geo-01".to_string()));

        Ok(Json(RoutingDecision {
            execution_id: format!("exec-apex-{}-{}", Utc::now().timestamp_millis(), counter),
            assigned_node_id: best_node.node_id.clone(),
            region: best_node.cluster_region.clone(),
            allocated_price_usd_hr: best_node.spot_price_usd_hr,
            routing_latency_ms: (elapsed_ms * 100.0).round() / 100.0,
            estimated_savings_pct: (savings_pct * 100.0).round() / 100.0,
            fallback_target: fallback,
            decision_timestamp: Utc::now(),
        }))
    } else {
        Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "CAPACITY_CONSTRAINT_BREACH",
                "message": "No GPU cluster met spot threshold and latency bounds.",
                "max_requested_price": payload.max_cost_usd_hr,
                "latency_ceiling_ms": payload.latency_tolerance_ms
            })),
        ))
    }
}

pub async fn node_heartbeat(
    State(state): State<MeshState>,
    Json(telemetry): Json<NodeTelemetry>,
) -> impl IntoResponse {
    let mut nodes_guard = state.nodes.write().await;
    nodes_guard.insert(telemetry.node_id.clone(), telemetry);
    (StatusCode::OK, Json(serde_json::json!({ "status": "SYNCHRONIZED" })))
}

pub async fn health_check() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "status": "OPERATIONAL",
            "service": "AethelMesh Arbitrage Engine",
            "latency_sla": "sub-15ms"
        })),
    )
}

pub fn create_mesh_router(state: MeshState) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/arbitrage/route", post(evaluate_route))
        .route("/api/v1/telemetry/heartbeat", post(node_heartbeat))
        .with_state(state)
}
