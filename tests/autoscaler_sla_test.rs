// ============================================================================
// ApexSovereign.ai - PREDICTIVE AUTO-SCALER & SLA HARNESS INTEGRATION TEST
// File: tests/autoscaler_sla_test.rs
// Implements:
//   1. Multi-tier request injection simulating a 5x traffic spike over 30s.
//   2. Holt-Winters 60s lookahead forecast and preemptive scale event dispatch.
//   3. Automated shedding of standard/spot tier when predicted saturation >= 92%.
//   4. Enterprise bypass verification guaranteeing 0% packet loss & sub-25ms latency.
// ============================================================================

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::{Duration, Instant};
    use chrono::Utc;
    use tokio::sync::{mpsc, oneshot};

    // Note: When compiled within Cargo workspace or standalone test harness
    use autoscaler::predictor::{
        HoltWintersConfig, MetricSample, PredictiveEngine, PreemptiveScaleEvent,
    };
    use autoscaler::sla::{
        DispatchedExecution, SlaArbitrator, SlaRejectionReason, SlaRequest, SlaTier,
    };

    #[tokio::test]
    async fn test_holt_winters_forecast_and_preemptive_scaling() {
        let (scale_tx, mut scale_rx) = mpsc::channel::<PreemptiveScaleEvent>(32);

        let config = HoltWintersConfig {
            alpha: 0.35,
            beta: 0.15,
            gamma: 0.25,
            season_length: 60,
            forecast_horizon_sec: 60,
            saturation_threshold: 0.80,
            emergency_shed_threshold: 0.92,
            tokens_per_vcu_sec: 450.0,
        };

        let engine = PredictiveEngine::new(config, scale_tx);

        // Baseline steady-state: 10 VCU capacity, 1,800 tokens/sec (~40% saturation)
        let total_vcu = 10;
        for i in 0..30 {
            let sample = MetricSample {
                timestamp: Utc::now(),
                request_rate: 20.0,
                token_generation_rate: 1800.0 + (i as f64 * 5.0),
                active_vcu_allocated: 4,
                cluster_capacity_vcu: total_vcu,
                vram_usage_gb: 320.0,
                nvlink_bandwidth_util: 0.25,
            };
            let forecast = engine.ingest_metric(sample).await;
            assert!(!forecast.scaling_action_required);
        }

        // Simulate a rapid 5x traffic spike starting over 15 seconds
        // Generating up to 9,000 tokens/sec
        let mut triggered_preemptive_scale = false;
        let mut last_forecast_opt = None;

        for step in 1..=15 {
            let ramped_rate = 1800.0 + (step as f64 * 480.0); // Ramping to 9,000 tokens/sec
            let sample = MetricSample {
                timestamp: Utc::now(),
                request_rate: 20.0 + (step as f64 * 10.0),
                token_generation_rate: ramped_rate,
                active_vcu_allocated: (ramped_rate / 450.0).ceil() as u32,
                cluster_capacity_vcu: total_vcu,
                vram_usage_gb: 320.0 + (step as f64 * 30.0),
                nvlink_bandwidth_util: 0.25 + (step as f64 * 0.04),
            };

            let forecast = engine.ingest_metric(sample).await;
            last_forecast_opt = Some(forecast.clone());

            if forecast.scaling_action_required {
                triggered_preemptive_scale = true;
            }
        }

        assert!(triggered_preemptive_scale, "Predictive scaler must trigger before capacity exhaustion");

        // Verify scale event received over channel
        let scale_event = scale_rx.recv().await.expect("Preemptive scale event must be dispatched");
        assert!(scale_event.target_capacity_vcu > total_vcu);
        assert!(scale_event.forecasted_saturation >= 0.80);
    }

    #[tokio::test]
    async fn test_sla_arbitration_and_emergency_shedding() {
        let arbitrator = SlaArbitrator::new();

        // 1. Submit Enterprise requests: Must immediately succeed via fast-path bypass
        let (ent_tx, ent_rx) = oneshot::channel();
        let ent_req = SlaRequest {
            request_id: "req-ent-001".to_string(),
            tenant_id: "tenant-enterprise-acme".to_string(),
            tier: SlaTier::Enterprise,
            token_budget: 2048,
            created_at: Instant::now(),
            enqueued_timestamp: Utc::now(),
            response_tx: ent_tx,
        };

        arbitrator.submit_request(ent_req);
        let ent_res = ent_rx.await.expect("Enterprise response channel closed");
        assert!(ent_res.is_ok(), "Enterprise tier must never be rejected");
        let dispatch = ent_res.unwrap();
        assert_eq!(dispatch.tier, SlaTier::Enterprise);
        assert!(dispatch.queue_wait_ms < 25.0);

        // 2. Set cluster saturation to 95% (Breaching 92% emergency threshold)
        arbitrator.update_predicted_saturation(0.95);

        // Standard tier request should be immediately shed
        let (std_tx, std_rx) = oneshot::channel();
        let std_req = SlaRequest {
            request_id: "req-std-002".to_string(),
            tenant_id: "tenant-spot-batch".to_string(),
            tier: SlaTier::Standard,
            token_budget: 1024,
            created_at: Instant::now(),
            enqueued_timestamp: Utc::now(),
            response_tx: std_tx,
        };

        arbitrator.submit_request(std_req);
        let std_res = std_rx.await.expect("Standard response channel closed");
        assert!(std_res.is_err(), "Standard tier must be shed when saturation >= 92%");

        match std_res.unwrap_err() {
            SlaRejectionReason::EmergencyClusterShedding { predicted_saturation_pct, tier } => {
                assert_eq!(tier, SlaTier::Standard);
                assert!(predicted_saturation_pct >= 92.0);
            }
            other => panic!("Unexpected rejection reason: {:?}", other),
        }

        // 3. Enterprise request during emergency saturation MUST still succeed
        let (ent2_tx, ent2_rx) = oneshot::channel();
        let ent2_req = SlaRequest {
            request_id: "req-ent-003".to_string(),
            tenant_id: "tenant-enterprise-globex".to_string(),
            tier: SlaTier::Enterprise,
            token_budget: 4096,
            created_at: Instant::now(),
            enqueued_timestamp: Utc::now(),
            response_tx: ent2_tx,
        };

        arbitrator.submit_request(ent2_req);
        let ent2_res = ent2_rx.await.expect("Enterprise response channel closed");
        assert!(ent2_res.is_ok(), "Enterprise tier must bypass emergency shedding completely");

        let telem = arbitrator.telemetry();
        assert_eq!(telem.enterprise_dispatched_total, 2);
        assert_eq!(telem.standard_shed_total, 1);
        assert!(telem.enterprise_bypass_active);
    }
}
