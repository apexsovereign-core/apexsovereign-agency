use axum::{
    extract::Json,
    http::StatusCode,
    routing::post,
    Router,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::net::SocketAddr;
use tower_http::services::ServeDir;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RawGpuNodeFeed {
    pub provider_id: String,
    pub datacenter_region: String,
    pub gpu_model: String,
    pub vram_gb: u16,
    pub interconnect_gbps: u32,
    pub spot_price_cents_per_hr: u32,
    pub on_demand_price_cents_per_hr: u32,
    pub available_instances: u32,
    pub spot_preemption_risk_pct: f32,
    pub pci_bus_id: Option<String>,
}

async fn ingest_gpu_feed(
    Json(_payload): Json<RawGpuNodeFeed>,
) -> Result<StatusCode, StatusCode> {
    Ok(StatusCode::ACCEPTED)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().init();

    // 1. Define API routes and fall back to serving static files from the "static" directory
    let app = Router::new()
        .route("/api/v1/telemetry/ingest", post(ingest_gpu_feed))
        .fallback_service(ServeDir::new("static"));

    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .expect("PORT must be a valid number");

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
