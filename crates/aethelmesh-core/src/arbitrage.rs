use crate::state::{GpuArch, MeshState, ProviderSpotQuote};
use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Instant;

#[derive(Debug, Deserialize)]
pub struct ArbitrageRouteRequest {
    pub arch: GpuArch,
    pub gpu_count_required: u32,
    pub max_acceptable_latency_ms: u32,
    pub max_cost_budget_usd: f64,
}

#[derive(Debug, Serialize)]
pub struct ArbitrageRouteResponse {
    pub selected_provider: String,
    pub region: String,
    pub benchmark_list_rate_hr: f64,
    pub apex_arbitrage_rate_hr: f64,
    pub savings_percentage: f64,
    pub estimated_latency_ms: u32,
    pub execution_budget_cu_hr: f64,
    pub routing_overhead_ms: f64,
    pub action: String,
}

pub async fn compute_optimal_arbitrage_route(
    State(state): State<Arc<MeshState>>,
    Json(payload): Json<ArbitrageRouteRequest>,
) -> Result<Json<ArbitrageRouteResponse>, (StatusCode, Json<serde_json::Value>)> {
    let t_start = Instant::now();

    if payload.gpu_count_required == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "INVALID_GPU_COUNT", "message": "gpu_count_required must be > 0"})),
        ));
    }

    state.request_counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    let quotes_guard = state.quotes.read().await;
    let available_providers = match quotes_guard.get(&payload.arch) {
        Some(list) if !list.is_empty() => list,
        _ => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "NO_NODES_AVAILABLE", "arch": format!("{:?}", payload.arch)})),
            ));
        }
    };

    // Filter by nodes with required capacity and under max acceptable latency
    let valid_quotes: Vec<&ProviderSpotQuote> = available_providers
        .iter()
        .filter(|q| q.available_nodes >= payload.gpu_count_required && q.ping_latency_ms <= payload.max_acceptable_latency_ms)
        .collect();

    if valid_quotes.is_empty() {
        return Err((
            StatusCode::PRECONDITION_FAILED,
            Json(serde_json::json!({
                "error": "CONSTRAINTS_UNSATISFIED",
                "reason": "No single cluster satisfies both required count and latency envelope"
            })),
        ));
    }

    // Select the lowest spot cost provider
    let best_quote = valid_quotes
        .into_iter()
        .min_by(|a, b| a.spot_price_hr.partial_cmp(&b.spot_price_hr).unwrap())
        .unwrap();

    // ApexSovereign pricing model: 36% discount off public benchmark list rate
    let benchmark_list = best_quote.list_price_hr;
    let apex_client_rate = (benchmark_list * 0.64).max(best_quote.spot_price_hr * 1.15); // Guaranteed minimum 15% broker spread
    let total_hourly_cost = apex_client_rate * (payload.gpu_count_required as f64);

    if total_hourly_cost > payload.max_cost_budget_usd {
        return Err((
            StatusCode::EXPECTATION_FAILED,
            Json(serde_json::json!({
                "error": "BUDGET_EXCEEDED",
                "lowest_hourly_cost_usd": total_hourly_cost,
                "offered_budget_usd": payload.max_cost_budget_usd
            })),
        ));
    }

    let savings_pct = ((benchmark_list - apex_client_rate) / benchmark_list) * 100.0;
    let elapsed_overhead = t_start.elapsed().as_secs_f64() * 1000.0;

    state.arbitrage_settlements.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    Ok(Json(ArbitrageRouteResponse {
        selected_provider: best_quote.provider_name.clone(),
        region: best_quote.region.clone(),
        benchmark_list_rate_hr: benchmark_list,
        apex_arbitrage_rate_hr: (apex_client_rate * 100.0).round() / 100.0,
        savings_percentage: (savings_pct * 10.0).round() / 10.0,
        estimated_latency_ms: best_quote.ping_latency_ms,
        execution_budget_cu_hr: (total_hourly_cost * 100.0).round() / 100.0, // $1.00 = 100 CU
        routing_overhead_ms: (elapsed_overhead * 1000.0).round() / 1000.0,
        action: "DISPATCH_PROVISIONING_TOKEN".to_string(),
    }))
}
