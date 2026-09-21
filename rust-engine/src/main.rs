use axum::{
    routing::{get, post},
    http::StatusCode,
    Json, Router,
};
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() {
    // Build the Axum router with telemetry ingestion and static frontend fallback
    let app = Router::new()
        .route("/api/v1/telemetry/ingest", post(ingest_gpu_feed))
        .fallback_service(
            ServeDir::new("static")
                .not_found_service(ServeDir::new("static/index.html"))
        );

    // Bind to Render's required PORT or default to 3000
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{}", port);
    
    println!("Neural mesh engine running on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// Temporary handler stub for GPU telemetry ingestion
async fn ingest_gpu_feed(Json(payload): Json<serde_json::Value>) -> StatusCode {
    // Process telemetry payload here
    StatusCode::OK
}
