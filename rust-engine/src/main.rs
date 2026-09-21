use axum::{
    extract::Json,
    http::StatusCode,
    routing::post,
    Router,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::net::SocketAddr;
use tracing::info;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RawGpuNodeFeed<'a> {
    pub provider_id: &'a str,
    pub datacenter_region: &'a str,
    pub gpu_model: &'a str,
    pub vram_gb: u16,
    pub interconnect_gbps: u32,
    pub spot_price_cents_per_hr: u32,
    pub on_demand_price_cents_per_hr: u32,
    pub available_instances: u32,
    pub spot_preemption_risk_pct: f32,
    pub pci_bus_id: Option<&'a str>,
}

async fn ingest_gpu_feed(
    Json(_payload): Json<RawGpuNodeFeed<'_>>,
) -> Result<StatusCode, StatusCode> {
    Ok(StatusCode::ACCEPTED)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().init();

    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .expect("PORT must be a valid number");

    let app = Router::new()
        .route("/api/v1/telemetry/ingest", post(ingest_gpu_feed));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
