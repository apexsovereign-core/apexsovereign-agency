//! Heterogeneous GPU Aggregator Engine
//!
//! Normalizes disparate cloud and on-premise accelerator architectures (NVIDIA B200, H100,
//! A100, L40S) into unified Virtual Compute Units (VCUs), tracks dynamic spot pricing,
//! monitors real-time vRAM headroom, and provides lock-free routing selection.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use arc_swap::ArcSwap;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, error, info, warn};

#[derive(Error, Debug)]
pub enum AggregatorError {
    #[error("Provider '{0}' communication error: {1}")]
    ProviderError(String, String),

    #[error("No compatible compute node available for requirement: vRAM {0}MB, precision {1}")]
    NoFeasibleInstance(u64, String),

    #[error("Instance not found: {0}")]
    InstanceNotFound(String),

    #[error("Internal aggregation lock failure")]
    LockFailure,
}

/// Normalized GPU Architecture Specification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GpuArchitecture {
    NvidiaB200,
    NvidiaH100,
    NvidiaA100,
    NvidiaL40S,
    CustomBareMetal,
}

impl GpuArchitecture {
    /// Nominal Virtual Compute Unit (VCU) multiplier relative to baseline (A100 = 1.5 VCU)
    pub fn base_vcu_multiplier(&self) -> f64 {
        match self {
            GpuArchitecture::NvidiaB200 => 4.5,
            GpuArchitecture::NvidiaH100 => 3.0,
            GpuArchitecture::NvidiaA100 => 1.5,
            GpuArchitecture::NvidiaL40S => 1.2,
            GpuArchitecture::CustomBareMetal => 1.8,
        }
    }

    /// Native total device memory in Megabytes (MB)
    pub fn default_vram_mb(&self) -> u64 {
        match self {
            GpuArchitecture::NvidiaB200 => 192 * 1024, // 192 GB HBM3e
            GpuArchitecture::NvidiaH100 => 80 * 1024,  // 80 GB HBM3
            GpuArchitecture::NvidiaA100 => 80 * 1024,  // 80 GB HBM2e
            GpuArchitecture::NvidiaL40S => 48 * 1024,  // 48 GB GDDR6
            GpuArchitecture::CustomBareMetal => 96 * 1024, // 96 GB Unified
        }
    }

    /// Supported numerical precisions
    pub fn supported_precisions(&self) -> &'static [&'static str] {
        match self {
            GpuArchitecture::NvidiaB200 => &["FP8", "FP16", "BF16", "INT8", "INT4"],
            GpuArchitecture::NvidiaH100 => &["FP8", "FP16", "BF16", "INT8", "INT4"],
            GpuArchitecture::NvidiaA100 => &["FP16", "BF16", "INT8", "INT4", "FP32"],
            GpuArchitecture::NvidiaL40S => &["FP8", "FP16", "BF16", "INT8", "INT4"],
            GpuArchitecture::CustomBareMetal => &["FP16", "BF16", "INT8", "FP32"],
        }
    }
}

/// Cloud Provider Provider Type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ProviderType {
    Aws,
    Gcp,
    Azure,
    LambdaLabs,
    RunPod,
    OnPremBareMetal,
}

impl std::fmt::Display for ProviderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                ProviderType::Aws => "AWS",
                ProviderType::Gcp => "GCP",
                ProviderType::Azure => "AZURE",
                ProviderType::LambdaLabs => "LAMBDA",
                ProviderType::RunPod => "RUNPOD",
                ProviderType::OnPremBareMetal => "BARE_METAL",
            }
        )
    }
}

/// Unified Normalized Compute Instance Node State
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputeInstanceNode {
    pub instance_id: String,
    pub provider: ProviderType,
    pub region: String,
    pub architecture: GpuArchitecture,
    pub gpu_count: u32,
    pub total_vram_mb: u64,
    pub available_vram_mb: u64,
    pub total_vcu: f64,
    pub spot_price_hourly: f64,
    pub on_demand_price_hourly: f64,
    pub p99_latency_ms: f64,
    pub network_bandwidth_gbps: f64,
    pub endpoint_url: String,
    pub is_healthy: bool,
    pub active_leases: u32,
    pub last_updated: DateTime<Utc>,
}

impl ComputeInstanceNode {
    pub fn cost_per_vcu_hour(&self) -> f64 {
        if self.total_vcu <= 0.0 {
            return f64::MAX;
        }
        self.spot_price_hourly / self.total_vcu
    }
}

/// Workload Allocation Request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadRequirement {
    pub workload_id: String,
    pub tenant_id: String,
    pub required_vram_mb: u64,
    pub required_precision: String,
    pub max_acceptable_latency_ms: f64,
    pub priority: u32,
    pub preferred_providers: Vec<ProviderType>,
    pub max_budget_hourly: Option<f64>,
}

/// Multi-Objective Routing Weights
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingWeights {
    pub weight_cost: f64,
    pub weight_latency: f64,
    pub weight_vram: f64,
    pub weight_affinity: f64,
}

impl Default for RoutingWeights {
    fn default() -> Self {
        Self {
            weight_cost: 0.40,
            weight_latency: 0.35,
            weight_vram: 0.15,
            weight_affinity: 0.10,
        }
    }
}

/// Trait defining a normalized cloud or bare-metal GPU provider API
#[async_trait]
pub trait GpuProvider: Send + Sync {
    fn provider_type(&self) -> ProviderType;
    async fn fetch_instances(&self) -> Result<Vec<ComputeInstanceNode>, AggregatorError>;
    async fn health_check(&self) -> Result<bool, AggregatorError>;
}

/// Concrete Multi-Cloud Provider Connector Simulator / Adapter
pub struct CloudProviderAdapter {
    provider_type: ProviderType,
    region: String,
    simulated_instances: Vec<ComputeInstanceNode>,
}

impl CloudProviderAdapter {
    pub fn new(
        provider_type: ProviderType,
        region: String,
        simulated_instances: Vec<ComputeInstanceNode>,
    ) -> Self {
        Self {
            provider_type,
            region,
            simulated_instances,
        }
    }
}

#[async_trait]
impl GpuProvider for CloudProviderAdapter {
    fn provider_type(&self) -> ProviderType {
        self.provider_type
    }

    async fn fetch_instances(&self) -> Result<Vec<ComputeInstanceNode>, AggregatorError> {
        // Returns the latest registered state with realistic updated timestamps
        let mut instances = self.simulated_instances.clone();
        for inst in &mut instances {
            inst.last_updated = Utc::now();
        }
        Ok(instances)
    }

    async fn health_check(&self) -> Result<bool, AggregatorError> {
        Ok(true)
    }
}

/// In-Memory Lock-Free Aggregated Routing Table
#[derive(Clone)]
pub struct ComputeRoutingTable {
    instances: ArcSwap<Vec<ComputeInstanceNode>>,
    weights: ArcSwap<RoutingWeights>,
}

impl ComputeRoutingTable {
    pub fn new() -> Self {
        Self {
            instances: ArcSwap::from_pointee(Vec::new()),
            weights: ArcSwap::from_pointee(RoutingWeights::default()),
        }
    }

    pub fn update_instances(&self, new_instances: Vec<ComputeInstanceNode>) {
        self.instances.store(Arc::new(new_instances));
    }

    pub fn set_weights(&self, weights: RoutingWeights) {
        self.weights.store(Arc::new(weights));
    }

    pub fn get_instances(&self) -> Arc<Vec<ComputeInstanceNode>> {
        self.instances.load_full()
    }

    /// Selects the optimal compute node using multi-objective scoring
    pub fn select_optimal_node(
        &self,
        req: &WorkloadRequirement,
    ) -> Result<ComputeInstanceNode, AggregatorError> {
        let current_instances = self.instances.load();
        let weights = self.weights.load();

        let mut candidate_scores: Vec<(f64, ComputeInstanceNode)> = Vec::new();

        for inst in current_instances.iter() {
            // 1. Health check
            if !inst.is_healthy {
                continue;
            }

            // 2. vRAM capacity filter
            if inst.available_vram_mb < req.required_vram_mb {
                continue;
            }

            // 3. Precision support filter
            let supported = inst.architecture.supported_precisions();
            let req_prec_upper = req.required_precision.to_uppercase();
            if !supported.contains(&req_prec_upper.as_str()) {
                continue;
            }

            // 4. Maximum latency constraint filter
            if inst.p99_latency_ms > req.max_acceptable_latency_ms {
                continue;
            }

            // 5. Budget constraint filter
            if let Some(max_budget) = req.max_budget_hourly {
                if inst.spot_price_hourly > max_budget {
                    continue;
                }
            }

            // Multi-objective scoring computation
            // S_cost: Inversely proportional to cost per VCU-hour
            let cost_per_vcu = inst.cost_per_vcu_hour().max(0.01);
            let s_cost = (10.0 / cost_per_vcu).min(100.0);

            // S_latency: Inversely proportional to P99 latency
            let p99 = inst.p99_latency_ms.max(1.0);
            let s_latency = (1000.0 / p99).min(100.0);

            // S_vram: Proportional to remaining headroom ratio
            let vram_ratio = (inst.available_vram_mb as f64) / (req.required_vram_mb as f64);
            let s_vram = (vram_ratio * 20.0).min(100.0);

            // S_affinity: Provider preference bonus
            let s_affinity = if req.preferred_providers.is_empty()
                || req.preferred_providers.contains(&inst.provider)
            {
                100.0
            } else {
                20.0
            };

            let total_score = (weights.weight_cost * s_cost)
                + (weights.weight_latency * s_latency)
                + (weights.weight_vram * s_vram)
                + (weights.weight_affinity * s_affinity);

            candidate_scores.push((total_score, inst.clone()));
        }

        if candidate_scores.is_empty() {
            return Err(AggregatorError::NoFeasibleInstance(
                req.required_vram_mb,
                req.required_precision.clone(),
            ));
        }

        // Sort descending by highest score
        candidate_scores.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        let best_node = candidate_scores[0].1.clone();
        debug!(
            "Selected optimal instance {} [{}] score={:.2}",
            best_node.instance_id, best_node.provider, candidate_scores[0].0
        );

        Ok(best_node)
    }
}

/// Global Heterogeneous GPU Aggregator Daemon
pub struct GpuAggregatorEngine {
    providers: Vec<Arc<dyn GpuProvider>>,
    routing_table: Arc<ComputeRoutingTable>,
    poll_interval: Duration,
}

impl GpuAggregatorEngine {
    pub fn new(poll_interval: Duration) -> Self {
        Self {
            providers: Vec::new(),
            routing_table: Arc::new(ComputeRoutingTable::new()),
            poll_interval,
        }
    }

    pub fn register_provider(&mut self, provider: Arc<dyn GpuProvider>) {
        self.providers.push(provider);
    }

    pub fn routing_table(&self) -> Arc<ComputeRoutingTable> {
        Arc::clone(&self.routing_table)
    }

    /// Background polling loop synchronizing live multi-cloud instances
    pub async fn start_polling_loop(self: Arc<Self>) {
        info!(
            "Starting GPU Aggregator Engine polling daemon (interval: {:?})",
            self.poll_interval
        );
        let mut ticker = tokio::time::interval(self.poll_interval);

        loop {
            ticker.tick().await;
            let mut gathered_instances = Vec::new();

            for provider in &self.providers {
                match provider.fetch_instances().await {
                    Ok(instances) => {
                        gathered_instances.extend(instances);
                    }
                    Err(e) => {
                        warn!("Provider {:?} fetch failed: {}", provider.provider_type(), e);
                    }
                }
            }

            if !gathered_instances.is_empty() {
                debug!(
                    "Aggregator refreshed {} compute instances across providers",
                    gathered_instances.len()
                );
                self.routing_table.update_instances(gathered_instances);
            }
        }
    }
}
