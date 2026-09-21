use axum::{routing::get, Router};
use std::sync::Arc;
use crate::state::AppState;

mod health;

pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health::health_check))
        .with_state(state)
}
