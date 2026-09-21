use axum::{extract::State, response::IntoResponse, Json};
use serde::Serialize;
use std::sync::Arc;
use crate::state::AppState;

#[derive(Serialize)]
pub struct HealthStatus {
    pub status: &'static str,
    pub platform: String,
    pub environment: String,
}

pub async fn health_check(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(HealthStatus {
        status: "healthy",
        platform: state.platform_name.clone(),
        environment: state.env.clone(),
    })
}
