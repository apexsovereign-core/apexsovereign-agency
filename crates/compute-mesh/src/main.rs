//! Compute Mesh Daemon Entrypoint
//!
//! Initializes heterogeneous multi-cloud GPU providers, spawns background aggregator,
//! mounts the high-throughput Axum router, and serves live compute dispatch requests on port 8090.

use std::sync::Arc;
use std::time::Duration;
use chrono::Utc;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use compute_mesh::aggregator::{
    CloudProviderAdapter, ComputeInstanceNode, GpuAggregatorEngine, GpuArchitecture,
    GpuProvider, ProviderType,
};
use compute_mesh::router::{create_router, AppState};
use compute_mesh::scheduler::WorkloadScheduler;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .with_target(false)
        .finish();
    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to initialize tracing subscriber");

    info!("Initializing ApexSovereign Universal Heterogeneous Compute Router");

    let mut aggregator = GpuAggregatorEngine::new(Duration::from_secs(5));

    // Seed Multi-Cloud Heterogeneous Fleet
    // 1. AWS Cloud Provider
    let aws_instances = vec![
        ComputeInstanceNode {
            instance_id: "aws-p5-8xlarge-01".to_string(),
            provider: ProviderType::Aws,
            region: "us-east-1".to_string(),
            architecture: GpuArchitecture::NvidiaH100,
            gpu_count: 8,
            total_vram_mb: 640 * 1024,
            available_vram_mb: 580 * 1024,
            total_vcu: 24.0, // 8 * 3.0
            spot_price_hourly: 24.50,
            on_demand_price_hourly: 39.80,
            p99_latency_ms: 18.2,
            network_bandwidth_gbps: 3200.0,
            endpoint_url: "http://127.0.0.1:9001".to_string(),
            is_healthy: true,
            active_leases: 2,
            last_updated: Utc::now(),
        },
    ];
    aggregator.register_provider(Arc::new(CloudProviderAdapter::new(
        ProviderType::Aws,
        "us-east-1".to_string(),
        aws_instances,
    )));

    // 2. GCP Cloud Provider
    let gcp_instances = vec![
        ComputeInstanceNode {
            instance_id: "gcp-a3-highgpu-8g-01".to_string(),
            provider: ProviderType::Gcp,
            region: "us-central1".to_string(),
            architecture: GpuArchitecture::NvidiaH100,
            gpu_count: 8,
            total_vram_mb: 640 * 1024,
            available_vram_mb: 480 * 1024,
            total_vcu: 24.0,
            spot_price_hourly: 26.00,
            on_demand_price_hourly: 41.20,
            p99_latency_ms: 22.4,
            network_bandwidth_gbps: 3200.0,
            endpoint_url: "http://127.0.0.1:9002".to_string(),
            is_healthy: true,
            active_leases: 4,
            last_updated: Utc::now(),
        },
        ComputeInstanceNode {
            instance_id: "gcp-a2-ultragpu-8g-02".to_string(),
            provider: ProviderType::Gcp,
            region: "us-central1".to_string(),
            architecture: GpuArchitecture::NvidiaA100,
            gpu_count: 8,
            total_vram_mb: 640 * 1024,
            available_vram_mb: 600 * 1024,
            total_vcu: 12.0, // 8 * 1.5
            spot_price_hourly: 12.80,
            on_demand_price_hourly: 29.50,
            p99_latency_ms: 24.8,
            network_bandwidth_gbps: 800.0,
            endpoint_url: "http://127.0.0.1:9003".to_string(),
            is_healthy: true,
            active_leases: 1,
            last_updated: Utc::now(),
        },
    ];
    aggregator.register_provider(Arc::new(CloudProviderAdapter::new(
        ProviderType::Gcp,
        "us-central1".to_string(),
        gcp_instances,
    )));

    // 3. Lambda Labs Provider (Next-Gen B200)
    let lambda_instances = vec![
        ComputeInstanceNode {
            instance_id: "lambda-b200-cluster-01".to_string(),
            provider: ProviderType::LambdaLabs,
            region: "us-west-1".to_string(),
            architecture: GpuArchitecture::NvidiaB200,
            gpu_count: 8,
            total_vram_mb: 1536 * 1024,
            available_vram_mb: 1400 * 1024,
            total_vcu: 36.0, // 8 * 4.5
            spot_price_hourly: 36.00,
            on_demand_price_hourly: 48.00,
            p99_latency_ms: 31.5,
            network_bandwidth_gbps: 3200.0,
            endpoint_url: "http://127.0.0.1:9004".to_string(),
            is_healthy: true,
            active_leases: 3,
            last_updated: Utc::now(),
        },
    ];
    aggregator.register_provider(Arc::new(CloudProviderAdapter::new(
        ProviderType::LambdaLabs,
        "us-west-1".to_string(),
        lambda_instances,
    )));

    // 4. RunPod Provider (L40S Cost-Optimized)
    let runpod_instances = vec![
        ComputeInstanceNode {
            instance_id: "runpod-l40s-dual-01".to_string(),
            provider: ProviderType::RunPod,
            region: "eu-central-1".to_string(),
            architecture: GpuArchitecture::NvidiaL40S,
            gpu_count: 2,
            total_vram_mb: 96 * 1024,
            available_vram_mb: 88 * 1024,
            total_vcu: 2.4, // 2 * 1.2
            spot_price_hourly: 1.90,
            on_demand_price_hourly: 2.80,
            p99_latency_ms: 45.0,
            network_bandwidth_gbps: 100.0,
            endpoint_url: "http://127.0.0.1:9005".to_string(),
            is_healthy: true,
            active_leases: 0,
            last_updated: Utc::now(),
        },
    ];
    aggregator.register_provider(Arc::new(CloudProviderAdapter::new(
        ProviderType::RunPod,
        "eu-central-1".to_string(),
        runpod_instances,
    )));

    // 5. On-Premise Sovereign Bare-Metal
    let baremetal_instances = vec![
        ComputeInstanceNode {
            instance_id: "baremetal-ashburn-node-01".to_string(),
            provider: ProviderType::OnPremBareMetal,
            region: "ashburn-dc01".to_string(),
            architecture: GpuArchitecture::NvidiaH100,
            gpu_count: 8,
            total_vram_mb: 640 * 1024,
            available_vram_mb: 610 * 1024,
            total_vcu: 24.0,
            spot_price_hourly: 9.50, // Sovereign cost basis
            on_demand_price_hourly: 9.50,
            p99_latency_ms: 6.8, // Ultra-low sub-10ms latency
            network_bandwidth_gbps: 3200.0,
            endpoint_url: "http://127.0.0.1:9006".to_string(),
            is_healthy: true,
            active_leases: 1,
            last_updated: Utc::now(),
        },
    ];
    aggregator.register_provider(Arc::new(CloudProviderAdapter::new(
        ProviderType::OnPremBareMetal,
        "ashburn-dc01".to_string(),
        baremetal_instances,
    )));

    let routing_table = aggregator.routing_table();
    let aggregator_arc = Arc::new(aggregator);

    // Initial manual instance population
    let initial_fleet = vec![
        aws_instances[0].clone(),
        gcp_instances[0].clone(),
        gcp_instances[1].clone(),
        lambda_instances[0].clone(),
        runpod_instances[0].clone(),
        baremetal_instances[0].clone(),
    ];
    routing_table.update_instances(initial_fleet);

    // Spawn polling daemon
    tokio::spawn(aggregator_arc.start_polling_loop());

    // Initialize Scheduler with 60-second warm cache window
    let scheduler = Arc::new(WorkloadScheduler::new(
        Arc::clone(&routing_table),
        Duration::from_secs(60),
    ));

    let app_state = AppState {
        scheduler,
        routing_table,
    };

    let router = create_router(app_state);

    let bind_addr = "0.0.0.0:8090";
    info!("Compute Mesh listening on http://{}", bind_addr);

    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    axum::serve(listener, router).await?;

    Ok(())
}
