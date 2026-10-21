// ============================================================================
// ApexSovereign.ai - TIER 4 RETAIL FRACTIONAL GPU SHARING & MICRO-BILLING TEST
// File: tests/retail_mesh_test.rs
// Implements:
//   1. NVIDIA H100 MIG and L40S MPS fractional partitioning tests.
//   2. Atomic lock-free pre-paid micro-credit balance debit verification.
//   3. Exact sub-5ms zero-balance cold-kill termination enforcement.
//   4. Insolvency protection: non-negative balance invariant checks.
//   5. Cluster capacity exhaustion backpressure.
// ============================================================================

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    use retail_mesh::microbilling::{BillingError, MicroBillingEngine, MICRO_CREDITS_PER_USD};
    use retail_mesh::mig::{
        FractionalGpuManager, FractionalProfile, GpuModel, PhysicalGpu, SliceState,
    };
    use uuid::Uuid;

    fn setup_test_mesh() -> (Arc<FractionalGpuManager>, Arc<MicroBillingEngine>) {
        let temp_cgroup = std::env::temp_dir().join(format!("apex_cgroup_test_{}", Uuid::new_v4()));
        let gpu_mgr = Arc::new(FractionalGpuManager::new(temp_cgroup));

        // Register H100 and L40S physical enterprise GPUs
        let h100 = PhysicalGpu::new(
            "gpu-h100-node01-0".to_string(),
            "node-us-east-01".to_string(),
            GpuModel::NvidiaH100Sxm5,
            "0000:0f:00.0".to_string(),
        );

        let l40s = PhysicalGpu::new(
            "gpu-l40s-node01-1".to_string(),
            "node-us-east-01".to_string(),
            GpuModel::NvidiaL40S,
            "0000:1f:00.0".to_string(),
        );

        gpu_mgr.register_physical_gpu(h100);
        gpu_mgr.register_physical_gpu(l40s);

        let billing = Arc::new(MicroBillingEngine::new(
            Arc::clone(&gpu_mgr),
            "".to_string(),
            "".to_string(),
        ));

        (gpu_mgr, billing)
    }

    #[tokio::test]
    async fn test_fractional_mig_and_mps_partitioning() {
        let (gpu_mgr, _) = setup_test_mesh();
        let tenant_id = Uuid::new_v4();

        // 1. Provision 1g.10gb on H100
        let slice1 = gpu_mgr
            .provision_slice(tenant_id, FractionalProfile::Mig1g10gb, Duration::from_secs(3600))
            .expect("H100 1g.10gb partition must succeed");

        assert_eq!(slice1.vram_mb, 10_240);
        assert_eq!(slice1.state, SliceState::Active);

        let envs = slice1.export_cuda_environment();
        assert!(envs.contains_key("CUDA_VISIBLE_DEVICES"));
        assert_eq!(envs.get("CUDA_MPS_PINNED_DEVICE_MEM_LIMIT").unwrap(), "0=10240M");

        // 2. Provision mps.1/8 on L40S
        let slice2 = gpu_mgr
            .provision_slice(tenant_id, FractionalProfile::MpsEighth, Duration::from_secs(3600))
            .expect("MPS 1/8 partition must succeed");

        assert_eq!(slice2.vram_mb, 49_152 / 8);
        assert_eq!(slice2.mps_thread_pct, 12);
    }

    #[tokio::test]
    async fn test_atomic_prepaid_micro_debit() {
        let (gpu_mgr, billing) = setup_test_mesh();
        let tenant_id = Uuid::new_v4();

        // Onboard with $5.00 pre-paid = 5,000,000 micro-credits
        let wallet = billing.onboard_wallet(tenant_id, 5.00);
        assert_eq!(wallet.balance(), 5 * MICRO_CREDITS_PER_USD);
        assert_eq!(wallet.balance_usd(), 5.00);

        // Atomic debit 10,000 µC ($0.01)
        let rem = wallet
            .try_atomic_debit(10_000)
            .expect("Debit must succeed");
        assert_eq!(rem, 4_990_000);

        // Top up $2.50
        let new_bal = billing.deposit_credits(&tenant_id, 2.50).expect("Top-up must succeed");
        assert_eq!(new_bal, 7_490_000);
    }

    #[tokio::test]
    async fn test_sub_5ms_zero_balance_cold_kill_enforcement() {
        let (gpu_mgr, billing) = setup_test_mesh();
        let tenant_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();

        // Onboard with small deposit: $0.000500 = 500 micro-credits
        let wallet = billing.onboard_wallet(tenant_id, 0.0005);
        assert_eq!(wallet.balance(), 500);

        // Provision slice
        let slice = gpu_mgr
            .provision_slice(tenant_id, FractionalProfile::MpsEighth, Duration::from_secs(60))
            .expect("Slice allocation failed");

        // Metering call requiring 600 micro-credits (depletes wallet)
        let kill_start = Instant::now();
        let result = billing
            .process_compute_metering(
                tenant_id,
                session_id,
                slice.slice_id,
                &FractionalProfile::MpsEighth,
                200, // 200 tokens * 2 µC = 400 µC + time
                2.0, // 2.0s * 120 µC = 240 µC -> Total 640 µC > 500 µC
            )
            .await;

        let kill_latency_ms = kill_start.elapsed().as_secs_f64() * 1000.0;

        // Verify cold-kill triggered and returned InsufficientBalance error
        assert!(result.is_err());
        match result {
            Err(BillingError::InsufficientBalance { .. }) => {}
            other => panic!("Expected InsufficientBalance error, got {:?}", other),
        }

        // Verify sub-5ms SLA guarantee
        println!("Sub-5ms Cold-Kill Execution Latency: {:.3} ms", kill_latency_ms);
        assert!(
            kill_latency_ms <= 5.0,
            "Cold kill exceeded 5ms SLA limit! Took {:.3}ms",
            kill_latency_ms
        );

        // Verify slice state is now Evicted
        let refreshed_slice = gpu_mgr.get_slice(slice.slice_id).unwrap();
        assert_eq!(refreshed_slice.state, SliceState::Evicted);

        // Verify wallet is frozen and non-negative
        assert!(wallet.balance() >= 0, "Wallet balance went negative!");
    }

    #[tokio::test]
    async fn test_cluster_capacity_exhaustion() {
        let (gpu_mgr, _) = setup_test_mesh();
        let tenant_id = Uuid::new_v4();

        // Exhaust H100 capacity by taking full 7g.80gb partition
        let slice = gpu_mgr
            .provision_slice(tenant_id, FractionalProfile::Mig7g80gb, Duration::from_secs(3600))
            .expect("Full 7g.80gb partition must fit on H100");

        assert_eq!(slice.vram_mb, 81_920);

        // Second large allocation on H100 must fail over or reject
        let second = gpu_mgr.provision_slice(tenant_id, FractionalProfile::Mig7g80gb, Duration::from_secs(3600));
        assert!(second.is_err(), "Second 7g.80gb partition must fail when capacity exhausted");
    }
}
