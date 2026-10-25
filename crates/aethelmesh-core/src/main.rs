use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::{
    error_handling::HandleErrorLayer,
    http::StatusCode,
    routing::{get, post},
    BoxError, Router,
};
use tower::ServiceBuilder;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod energy_bridge;
mod router;
pub mod liquidity;

use energy_bridge::EnergyMonitor;
use router::{evaluate_mesh_route, AppState};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let energy_monitor = Arc::new(EnergyMonitor::new());
    let state = Arc::new(AppState::new(energy_monitor.clone()));
    let liquidity_state = Arc::new(liquidity::LiquidityMeshState::default());

    // Background task to poll real-time grid energy pricing every 10 seconds
    let monitor_clone = energy_monitor.clone();
    tokio::spawn(async move {
        monitor_clone.run_polling_loop(Duration::from_secs(10)).await;
    });

    // Background task to poll secondary cluster idle liquidity every 15 seconds
    let liquidity_probe_clone = liquidity_state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(15));
        loop {
            interval.tick().await;
            liquidity_probe_clone.run_cluster_health_probes().await;
        }
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Rate limiting: 500 requests per 1-second burst window with buffer
    let rate_limit_layer = ServiceBuilder::new()
        .layer(HandleErrorLayer::new(|err: BoxError| async move {
            (
                StatusCode::TOO_MANY_REQUESTS,
                format!("RATE_LIMIT_EXCEEDED: Execution throttle active ({err})"),
            )
        }))
        .buffer(1024)
        .rate_limit(500, Duration::from_secs(1));

    let liquidity_router = liquidity::create_liquidity_router(liquidity_state);

    let app = Router::new()
        .route("/healthz", get(health_check))
        .route("/api/v1/mesh/route", post(evaluate_mesh_route))
        .route("/api/v1/mesh/energy", get(energy_bridge::get_energy_telemetry))
        .merge(liquidity_router)
        .layer(TraceLayer::new_for_http())
        .layer(rate_limit_layer)
        .layer(cors)
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("[AETHELMESH_CORE] High-speed sovereign router listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "status": "HEALTHY",
        "engine": "AethelMesh Axum Execution Core v0.3.0",
        "target_latency": "<18ms",
        "pricing_reserve_floor": 1.85
    }))
}
