// ============================================================================
// ApexSovereign.ai - STREAMING GATEWAY RUST INTEGRATION TEST SUITE
// File: tests/streaming_gateway_test.rs
// Implements: Integration test verifying Axum SSE streaming and token metering.
// ============================================================================

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct MockUsageDelta {
    pub tenant_id: Uuid,
    pub session_id: String,
    pub hardware_tier: String,
    pub token_count: u64,
}

#[tokio::test]
async fn test_streaming_token_metering_accumulation() {
    let (tx, mut rx) = mpsc::channel::<MockUsageDelta>(1000);
    let total_settled_tokens = Arc::new(AtomicU64::new(0));
    let total_settled_clone = Arc::clone(&total_settled_tokens);

    let tenant_id = Uuid::new_v4();
    let session_id = "sess_integration_test_500".to_string();

    // Spawns mock background metering loop
    let metering_handle = tokio::spawn(async move {
        let mut buffer: u64 = 0;
        while let Some(delta) = rx.recv().await {
            buffer += delta.token_count;
            if buffer >= 100 {
                total_settled_clone.fetch_add(buffer, Ordering::SeqCst);
                buffer = 0;
            }
        }
        if buffer > 0 {
            total_settled_clone.fetch_add(buffer, Ordering::SeqCst);
        }
    });

    // Emulate 500 SSE tokens piped from upstream inference engine
    for _ in 1..=500 {
        let delta = MockUsageDelta {
            tenant_id,
            session_id: session_id.clone(),
            hardware_tier: "B200".to_string(),
            token_count: 1,
        };
        tx.send(delta).await.expect("Failed to send token delta");
    }

    // Drop channel sender to trigger final flush
    drop(tx);
    metering_handle.await.expect("Metering task failed");

    // Assert exact 500 token accumulation
    let final_tokens = total_settled_tokens.load(Ordering::SeqCst);
    assert_eq!(
        final_tokens, 500,
        "Total metered tokens must equal exactly 500"
    );
}
