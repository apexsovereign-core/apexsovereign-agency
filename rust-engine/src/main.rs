use axum::{
    extract::Json,
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::net::SocketAddr;

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

// Explicitly load and serve the storefront HTML file
async fn serve_storefront() -> impl IntoResponse {
    // Fallback HTML if the file isn't found at runtime
    let html_content = std::fs::read_to_string("static/index.html")
        .unwrap_or_else(|_| "<h1>Apex Sovereign Storefront Loading...</h1>".to_string());
    Html(html_content)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().init();

    let app = Router::new()
        .route("/", get(serve_storefront))
        .route("/api/v1/telemetry/ingest", post(ingest_gpu_feed));

    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .expect("PORT must be a valid number");

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
