use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GpuNode {
    pub provider: String,
    pub gpu_model: String,
    pub spot_price_hourly: f64,
    pub latency_ms: f64,
    pub available: bool,
    pub endpoint_url: String,
}

#[derive(Clone)]
pub struct AppState {
    pub nodes: Arc<RwLock<Vec<GpuNode>>>,
}

#[derive(Serialize, Deserialize)]
pub struct RouteRequest {
    pub gpu_model: String,
    pub max_latency_ms: f64,
}

#[derive(Serialize, Deserialize)]
pub struct RouteResponse {
    pub selected_node: GpuNode,
    pub arbitrage_savings_pct: f64,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    // Initial spot nodes pool across providers
    let initial_nodes = vec![
        GpuNode {
            provider: "LambdaLabs".to_string(),
            gpu_model: "H100".to_string(),
            spot_price_hourly: 2.49,
            latency_ms: 12.4,
            available: true,
            endpoint_url: "https://us-east.lambdalabs.com/node/h100-01".to_string(),
        },
        GpuNode {
            provider: "RunPod".to_string(),
            gpu_model: "H100".to_string(),
            spot_price_hourly: 1.89,
            latency_ms: 16.1,
            available: true,
            endpoint_url: "https://api.runpod.io/v2/h100-spot-04".to_string(),
        },
        GpuNode {
            provider: "VastAI".to_string(),
            gpu_model: "B200".to_string(),
            spot_price_hourly: 3.10,
            latency_ms: 14.8,
            available: true,
            endpoint_url: "https://vast.ai/host/b200-spot-12".to_string(),
        },
    ];

    let state = AppState {
        nodes: Arc::new(RwLock::new(initial_nodes)),
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/route", post(route_compute_request))
        .route("/api/v1/nodes", get(list_nodes))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    println!("[AXUM-ROUTER] Sovereign Compute Routing Mesh listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, "SOVEREIGN_ROUTER_ONLINE")
}

async fn list_nodes(State(state): State<AppState>) -> impl IntoResponse {
    let nodes = state.nodes.read().await;
    Json(nodes.clone())
}

async fn route_compute_request(
    State(state): State<AppState>,
    Json(payload): Json<RouteRequest>,
) -> Result<impl IntoResponse, (StatusCode, &'static str)> {
    let nodes = state.nodes.read().await;

    // Arbitrage selection algorithm: Lowest spot price subject to latency < 18ms
    let best_node = nodes
        .iter()
        .filter(|n| n.available && n.gpu_model == payload.gpu_model && n.latency_ms <= payload.max_latency_ms)
        .min_by(|a, b| a.spot_price_hourly.partial_cmp(&b.spot_price_hourly).unwrap());

    match best_node {
        Some(node) => {
            let baseline_market_rate = match payload.gpu_model.as_str() {
                "B200" => 5.20,
                "H100" => 3.20,
                _ => 2.00,
            };
            let savings = ((baseline_market_rate - node.spot_price_hourly) / baseline_market_rate) * 100.0;

            Ok(Json(RouteResponse {
                selected_node: node.clone(),
                arbitrage_savings_pct: savings,
            }))
        }
        None => Err((StatusCode::SERVICE_UNAVAILABLE, "No GPU nodes available meeting sub-18ms SLA")),
    }
}
