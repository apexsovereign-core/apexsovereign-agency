//! Axum REST & High-Throughput Dispatch API Layer
//!
//! Exposes institutional compute dispatch endpoints, cluster topology introspection,
//! dynamic scoring weights mutation, and real-time operational telemetry.

use std::sync::Arc;
use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tracing::{error, info};
use uuid::Uuid;

use crate::aggregator::{ComputeInstanceNode, RoutingWeights};
use crate::scheduler::{
    ClusterTelemetrySnapshot, JobExecutionReport, JobRequest, WorkloadScheduler, WorkloadType,
};

#[derive(Clone)]
pub struct AppState {
    pub scheduler: Arc<WorkloadScheduler>,
    pub routing_table: Arc<crate::aggregator::ComputeRoutingTable>,
}

#[derive(Debug, Deserialize)]
pub struct DispatchPayload {
    pub tenant_id: String,
    pub model_id: String,
    pub required_vram_mb: u64,
    pub precision: String,
    pub prompt_tokens: u32,
    pub max_output_tokens: u32,
    #[serde(default = "default_priority")]
    pub priority: u32,
    #[serde(default = "default_sla")]
    pub max_sla_ms: u64,
}

fn default_priority() -> u32 {
    50
}

fn default_sla() -> u64 {
    2000
}

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub timestamp: String,
    pub data: Option<T>,
    pub error: Option<String>,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health_handler))
        .route("/v1/compute/dispatch", post(dispatch_workload_handler))
        .route("/v1/compute/nodes", get(list_compute_nodes_handler))
        .route("/v1/compute/telemetry", get(get_telemetry_handler))
        .route("/v1/compute/weights", post(update_weights_handler))
        .with_state(state)
}

async fn health_handler() -> impl IntoResponse {
    (StatusCode::OK, Json(serde_json::json!({
        "status": "healthy",
        "service": "compute-mesh-router",
        "timestamp": Utc::now().to_rfc3339()
    })))
}

async fn dispatch_workload_handler(
    State(state): State<AppState>,
    Json(payload): Json<DispatchPayload>,
) -> impl IntoResponse {
    let job_id = format!("job_{}", Uuid::new_v4());

    let job_request = JobRequest {
        job_id,
        tenant_id: payload.tenant_id,
        workload_type: WorkloadType::Inference,
        model_id: payload.model_id,
        required_vram_mb: payload.required_vram_mb,
        precision: payload.precision,
        prompt_tokens: payload.prompt_tokens,
        max_output_tokens: payload.max_output_tokens,
        priority: payload.priority,
        max_sla_ms: payload.max_sla_ms,
        payload_bytes: Vec::new(),
        created_at: Utc::now(),
    };

    match state.scheduler.dispatch_workload(job_request).await {
        Ok(report) => (
            StatusCode::OK,
            Json(ApiResponse {
                success: true,
                timestamp: Utc::now().to_rfc3339(),
                data: Some(report),
                error: None,
            }),
        ),
        Err(e) => {
            error!("Dispatch failed: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ApiResponse {
                    success: false,
                    timestamp: Utc::now().to_rfc3339(),
                    data: None::<JobExecutionReport>,
                    error: Some(e.to_string()),
                }),
            )
        }
    }
}

async fn list_compute_nodes_handler(State(state): State<AppState>) -> impl IntoResponse {
    let nodes = state.routing_table.get_instances();
    (
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            timestamp: Utc::now().to_rfc3339(),
            data: Some(nodes.as_ref().clone()),
            error: None,
        }),
    )
}

async fn get_telemetry_handler(State(state): State<AppState>) -> impl IntoResponse {
    let snapshot = state.scheduler.telemetry_snapshot();
    (
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            timestamp: Utc::now().to_rfc3339(),
            data: Some(snapshot),
            error: None,
        }),
    )
}

async fn update_weights_handler(
    State(state): State<AppState>,
    Json(weights): Json<RoutingWeights>,
) -> impl IntoResponse {
    state.routing_table.set_weights(weights);
    info!("Updated dynamic routing table weights");
    (
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            timestamp: Utc::now().to_rfc3339(),
            data: Some("Routing weights successfully calibrated"),
            error: None,
        }),
    )
}
