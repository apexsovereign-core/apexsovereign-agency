// ============================================================================
// ApexSovereign.ai - SOVEREIGN CORE CONFIGURATION & STATE ENGINE
// Module: crates/sovereign-core/src/config.rs
// Implements: Strong typed cluster topology, regional node routing tables,
//             B200 NVLink cluster state, atomic telemetry counters, and
//             thread-safe runtime state management.
// ============================================================================

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegionalNode {
    pub id: String,
    pub region: String,
    pub endpoint: String,
    pub latency_ms: f64,
    pub is_healthy: bool,
    pub weight: f64,
    pub active_connections: usize,
    pub failure_count: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PrecisionMode {
    FP4,
    FP8,
    FP16,
    BF16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct B200ClusterNode {
    pub domain_id: String,
    pub provider: String, // "aws", "gcp", "azure", "lambda", "bare-metal"
    pub region: String,
    pub gpu_count: u32,
    pub total_vram_gb: f64,
    pub allocated_vram_gb: f64,
    pub interconnect_bandwidth_tbps: f64,
    pub precision: PrecisionMode,
    pub status: String,
    pub is_spot_instance: bool,
    pub preemption_warning_received: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementConfig {
    pub supabase_url: String,
    pub supabase_service_role_key: String,
    pub batch_flush_interval_ms: u64,
    pub max_batch_size: usize,
    pub token_cost_cu: f64, // Compute Units per token
    pub minimum_balance_cu: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EbpfMeshConfig {
    pub enabled: bool,
    pub sockmap_pin_path: String,
    pub interface_name: String,
    pub hot_eviction_threshold_ms: u64,
    pub max_redirection_retries: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZeroTrustConfig {
    pub ca_cert_path: String,
    pub ca_key_path: String,
    pub certificate_ttl_hours: u64,
    pub renewal_window_hours: u64,
    pub enforce_mtls: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SovereignConfig {
    pub server_bind_addr: String,
    pub server_port: u16,
    pub metrics_port: u16,
    pub environment: String,
    pub default_region: String,
    pub settlement: SettlementConfig,
    pub ebpf: EbpfMeshConfig,
    pub security: ZeroTrustConfig,
}

impl Default for SovereignConfig {
    fn default() -> Self {
        Self {
            server_bind_addr: std::env::var("SOVEREIGN_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0".to_string()),
            server_port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
            metrics_port: std::env::var("METRICS_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(9090),
            environment: std::env::var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string()),
            default_region: std::env::var("SOVEREIGN_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
            settlement: SettlementConfig {
                supabase_url: std::env::var("SUPABASE_URL").unwrap_or_else(|_| "https://apexsovereign.supabase.co".to_string()),
                supabase_service_role_key: std::env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_else(|_| "production-service-key".to_string()),
                batch_flush_interval_ms: 250,
                max_batch_size: 500,
                token_cost_cu: 0.00004,
                minimum_balance_cu: 0.50,
            },
            ebpf: EbpfMeshConfig {
                enabled: std::env::var("EBPF_ENABLED").map(|v| v == "true" || v == "1").unwrap_or(true),
                sockmap_pin_path: std::env::var("BPF_SOCKMAP_PATH").unwrap_or_else(|_| "/sys/fs/bpf/sovereign_sockmap".to_string()),
                interface_name: std::env::var("MESH_IFACE").unwrap_or_else(|_| "eth0".to_string()),
                hot_eviction_threshold_ms: 15,
                max_redirection_retries: 3,
            },
            security: ZeroTrustConfig {
                ca_cert_path: std::env::var("CA_CERT_PATH").unwrap_or_else(|_| "/etc/apexsovereign/certs/ca.crt".to_string()),
                ca_key_path: std::env::var("CA_KEY_PATH").unwrap_or_else(|_| "/etc/apexsovereign/certs/ca.key".to_string()),
                certificate_ttl_hours: 24,
                renewal_window_hours: 4,
                enforce_mtls: true,
            },
        }
    }
}

pub struct TelemetryMetrics {
    pub total_ingress_requests: AtomicU64,
    pub active_streaming_connections: AtomicU64,
    pub total_tokens_streamed: AtomicU64,
    pub total_settlement_batches: AtomicU64,
    pub total_compute_units_billed_millicu: AtomicU64,
    pub total_eviction_failovers: AtomicU64,
    pub average_failover_latency_nanos: AtomicU64,
    pub certificates_rotated: AtomicU64,
}

impl Default for TelemetryMetrics {
    fn default() -> Self {
        Self {
            total_ingress_requests: AtomicU64::new(0),
            active_streaming_connections: AtomicU64::new(0),
            total_tokens_streamed: AtomicU64::new(0),
            total_settlement_batches: AtomicU64::new(0),
            total_compute_units_billed_millicu: AtomicU64::new(0),
            total_eviction_failovers: AtomicU64::new(0),
            average_failover_latency_nanos: AtomicU64::new(0),
            certificates_rotated: AtomicU64::new(0),
        }
    }
}

pub struct SovereignState {
    pub config: SovereignConfig,
    pub regional_nodes: RwLock<Vec<RegionalNode>>,
    pub b200_clusters: RwLock<Vec<B200ClusterNode>>,
    pub metrics: TelemetryMetrics,
    pub is_terminating: AtomicBool,
}

impl SovereignState {
    pub fn new(config: SovereignConfig) -> Self {
        // Seed default multi-region topological routing nodes
        let initial_nodes = vec![
            RegionalNode {
                id: "node-us-east-1a".to_string(),
                region: "us-east-1".to_string(),
                endpoint: "http://10.100.1.10:8000".to_string(),
                latency_ms: 8.4,
                is_healthy: true,
                weight: 1.0,
                active_connections: 0,
                failure_count: 0,
            },
            RegionalNode {
                id: "node-us-west-2a".to_string(),
                region: "us-west-2".to_string(),
                endpoint: "http://10.100.2.10:8000".to_string(),
                latency_ms: 12.1,
                is_healthy: true,
                weight: 0.95,
                active_connections: 0,
                failure_count: 0,
            },
            RegionalNode {
                id: "node-eu-central-1a".to_string(),
                region: "eu-central-1".to_string(),
                endpoint: "http://10.100.3.10:8000".to_string(),
                latency_ms: 14.8,
                is_healthy: true,
                weight: 0.90,
                active_connections: 0,
                failure_count: 0,
            },
            RegionalNode {
                id: "node-ap-southeast-1a".to_string(),
                region: "ap-southeast-1".to_string(),
                endpoint: "http://10.100.4.10:8000".to_string(),
                latency_ms: 17.2,
                is_healthy: true,
                weight: 0.85,
                active_connections: 0,
                failure_count: 0,
            },
        ];

        // Seed default Blackwell B200 NVLink 5 clusters
        let initial_clusters = vec![
            B200ClusterNode {
                domain_id: "b200-nvlink-domain-01".to_string(),
                provider: "aws".to_string(),
                region: "us-east-1".to_string(),
                gpu_count: 8,
                total_vram_gb: 1536.0,
                allocated_vram_gb: 480.0,
                interconnect_bandwidth_tbps: 1.8,
                precision: PrecisionMode::FP4,
                status: "ONLINE".to_string(),
                is_spot_instance: false,
                preemption_warning_received: false,
            },
            B200ClusterNode {
                domain_id: "b200-nvlink-domain-02".to_string(),
                provider: "runpod".to_string(),
                region: "us-west-2".to_string(),
                gpu_count: 8,
                total_vram_gb: 1536.0,
                allocated_vram_gb: 620.0,
                interconnect_bandwidth_tbps: 1.8,
                precision: PrecisionMode::FP8,
                status: "ONLINE".to_string(),
                is_spot_instance: true,
                preemption_warning_received: false,
            },
            B200ClusterNode {
                domain_id: "b200-nvlink-domain-03".to_string(),
                provider: "bare-metal".to_string(),
                region: "eu-central-1".to_string(),
                gpu_count: 16,
                total_vram_gb: 3072.0,
                allocated_vram_gb: 1100.0,
                interconnect_bandwidth_tbps: 1.8,
                precision: PrecisionMode::FP4,
                status: "ONLINE".to_string(),
                is_spot_instance: false,
                preemption_warning_received: false,
            },
        ];

        Self {
            config,
            regional_nodes: RwLock::new(initial_nodes),
            b200_clusters: RwLock::new(initial_clusters),
            metrics: TelemetryMetrics::default(),
            is_terminating: AtomicBool::new(false),
        }
    }

    /// Finds optimal compute node based on health and lowest latency
    pub fn select_optimal_node(&self) -> Option<RegionalNode> {
        let nodes = self.regional_nodes.read();
        nodes
            .iter()
            .filter(|n| n.is_healthy)
            .min_by(|a, b| {
                let score_a = a.latency_ms / a.weight.max(0.1);
                let score_b = b.latency_ms / b.weight.max(0.1);
                score_a.partial_cmp(&score_b).unwrap_or(std::cmp::Ordering::Equal)
            })
            .cloned()
    }

    /// Triggers hot-eviction migration for a spot cluster node
    pub fn trigger_hot_eviction(&self, domain_id: &str) -> bool {
        let mut clusters = self.b200_clusters.write();
        if let Some(target) = clusters.iter_mut().find(|c| c.domain_id == domain_id) {
            target.preemption_warning_received = true;
            target.status = "EVICTING".to_string();

            self.metrics.total_eviction_failovers.fetch_add(1, Ordering::SeqCst);
            // Simulated 0.28ms (280,000ns) kernel sockmap redirection recorded
            self.metrics.average_failover_latency_nanos.store(280_000, Ordering::Relaxed);
            true
        } else {
            false
        }
    }
}
