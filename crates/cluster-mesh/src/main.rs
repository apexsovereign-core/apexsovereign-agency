//! Blackwell B200 NVLink Cluster Daemon Entrypoint
//!
//! Spawns the topology manager, populates multi-node B200 pods, initializes
//! the 192GB HBM3e KV cache allocator, and mounts the high-throughput Axum API.

use std::net::SocketAddr;
use std::sync::Arc;
use chrono::Utc;
use tokio::net::TcpListener;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use cluster_mesh::nvlink::{
    B200GpuNode, InterconnectLink, InterconnectType, LinkStatus, NvlinkTopologyManager,
};
use cluster_mesh::quantization::DynamicQuantizationController;
use cluster_mesh::pipeline::{build_cluster_router, PipelineCoordinatorState};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .with_target(false)
        .finish();
    let _ = tracing::subscriber::set_global_default(subscriber);

    info!("Initializing ApexSovereign Blackwell B200 NVLink Cluster Arbitrage Engine...");

    let topology_manager = Arc::new(NvlinkTopologyManager::new());
    let quantization_controller = Arc::new(DynamicQuantizationController::new(192.0));

    // Seed 16 B200 GPUs across 2 pods (Pod-A Bare Metal DGX, Pod-B Cloud Pod)
    info!("Seeding multi-node B200 GPU topology...");
    for i in 0..16 {
        let is_pod_a = i < 8;
        let pod_id = if is_pod_a { "dgx-b200-pod-01" } else { "cloud-b200-pod-02" };
        let node_id = if is_pod_a { "node-alpha-bm" } else { "node-beta-cloud" };

        topology_manager.register_gpu_node(B200GpuNode {
            gpu_id: format!("b200-gpu-{:02}", i),
            node_id: node_id.to_string(),
            pod_id: pod_id.to_string(),
            numa_node: (i % 2) as u32,
            pcie_address: format!("0000:{:02x}:00.0", 0x10 + i),
            total_hbm3e_gb: 192.0,
            allocated_hbm3e_gb: 0.0,
            nvlink_active_ports: 18,
            is_bare_metal: is_pod_a,
            current_temperature_c: 62.0 + (i as f32 * 0.8),
            tensor_parallel_rank: None,
            pipeline_parallel_rank: None,
        });
    }

    // Register full-mesh NVLink 5 links intra-node and RoCEv2 inter-node
    info!("Mapping NVLink 5 (1.8 TB/s) fabric and RoCEv2 inter-pod interconnects...");
    for i in 0..16 {
        for j in 0..16 {
            if i == j {
                continue;
            }
            let is_intra_node = (i / 8) == (j / 8);
            let link = InterconnectLink {
                link_id: format!("link-b200-gpu-{:02}-to-b200-gpu-{:02}", i, j),
                source_gpu_id: format!("b200-gpu-{:02}", i),
                target_gpu_id: format!("b200-gpu-{:02}", j),
                interconnect_type: if is_intra_node {
                    InterconnectType::Nvlink5Direct
                } else {
                    InterconnectType::Rocev2Rdma
                },
                max_bandwidth_tb_s: if is_intra_node { 1.8 } else { 0.4 },
                current_bandwidth_tb_s: if is_intra_node { 1.8 } else { 0.4 },
                packet_loss_rate: 0.0001,
                p99_latency_micros: if is_intra_node { 140 } else { 2200 },
                status: LinkStatus::Healthy,
                last_health_check: Utc::now(),
            };
            topology_manager.register_interconnect_link(link);
        }
    }

    // Allocate default Tensor Parallelism for flagship model (Llama-3.1-405B)
    info!("Allocating initial Tensor Parallelism for Llama-3.1-405B (TP=8, PP=2)...");
    let _ = topology_manager.allocate_tensor_parallelism("meta/llama-3.1-405b", 810.0, 8, 2);

    let state = Arc::new(PipelineCoordinatorState::new(
        topology_manager,
        quantization_controller,
    ));

    let app = build_cluster_router(state);

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8095".to_string())
        .parse()
        .unwrap_or(8095);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!(listen_addr = %addr, "B200 NVLink Cluster Engine listening for distributed inference requests");

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
