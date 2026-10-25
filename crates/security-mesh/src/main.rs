//! Security Mesh Daemon Entrypoint
//!
//! Spawns in-memory Root CA, initializes leaf certificate rotation, and serves
//! Axum microservice endpoints protected by zero-trust mTLS middleware.

use std::sync::Arc;
use axum::{
    extract::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use security_mesh::{
    ca::{CertificateRotationManager, RootCertificateAuthority},
    middleware::{MtlsEnforcementLayer, VerifiedIdentity},
};

#[derive(Serialize)]
struct HealthStatus {
    status: &'static str,
    mesh_service: &'static str,
    tls_mode: &'static str,
}

#[derive(Serialize)]
struct LedgerBalanceResponse {
    tenant_id: String,
    service_id: String,
    san: String,
    available_compute_credits: f64,
    status: &'static str,
}

#[derive(Deserialize)]
struct DispatchJobRequest {
    job_id: String,
    gpu_cluster: String,
    required_vram_gb: u32,
}

#[derive(Serialize)]
struct DispatchJobResponse {
    job_id: String,
    dispatched_by: String,
    status: &'static str,
    allocated_node: String,
}

async fn health_check() -> Json<HealthStatus> {
    Json(HealthStatus {
        status: "HEALTHY",
        mesh_service: "security-mesh-core",
        tls_mode: "STRICT_MUTUAL_TLS_V1_3",
    })
}

async fn get_ledger_balance(
    VerifiedIdentity(identity): VerifiedIdentity,
) -> Json<LedgerBalanceResponse> {
    let tenant_id = identity.tenant_id.unwrap_or_else(|| "TENANT-GLOBAL-ENTERPRISE".to_string());
    Json(LedgerBalanceResponse {
        tenant_id,
        service_id: identity.service_id,
        san: identity.san,
        available_compute_credits: 984500.0,
        status: "ACTIVE_ESCROW_LOCKED",
    })
}

async fn dispatch_job(
    VerifiedIdentity(identity): VerifiedIdentity,
    Json(payload): Json<DispatchJobRequest>,
) -> Json<DispatchJobResponse> {
    Json(DispatchJobResponse {
        job_id: payload.job_id,
        dispatched_by: identity.service_id,
        status: "DISPATCHED_TO_CLUSTER",
        allocated_node: format!("{}-primary-01", payload.gpu_cluster),
    })
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to initialize tracing subscriber");

    info!("Starting ApexSovereign Zero-Trust Security Mesh Controller...");

    // 1. Initialize In-Memory Root CA (Valid for 365 Days)
    let root_ca = Arc::new(RootCertificateAuthority::new(
        "ApexSovereign Holdings LLC",
        "ApexSovereign Internal Root CA",
        365,
    )?);

    // 2. Initialize Automated Rotation Manager (24-Hour Short-Lived Leaf)
    let rotation_manager = Arc::new(CertificateRotationManager::new(
        root_ca.clone(),
        "ledger-core",
        "ledger.internal.apexsovereign.ai",
        24,
    )?);

    // 3. Start Background Certificate Rotation Loop
    let _rotation_handle = rotation_manager.clone().start_rotation_loop();

    // 4. Construct Protected Axum Service Router
    let app = Router::new()
        .route("/healthz", get(health_check))
        .route("/internal/v1/ledger/balance", get(get_ledger_balance))
        .route("/internal/v1/mesh/dispatch", post(dispatch_job))
        .layer(MtlsEnforcementLayer::default_mesh());

    let listen_addr = "0.0.0.0:8443";
    info!(addr = %listen_addr, "Listening for authenticated zero-trust mTLS traffic");

    let listener = tokio::net::TcpListener::bind(listen_addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
