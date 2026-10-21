// ============================================================================
// ApexSovereign.ai - HIGH-FREQUENCY SETTLEMENT DISPATCHER & HMAC ENGINE
// Crate: crates/settlement-mesh/src/dispatcher.rs
// Implements: Sub-50ms Supabase RPC calling, HMAC-SHA256 authenticated webhook
//             delivery with replay protection (nonce/timestamp), exponential backoff.
// ============================================================================

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use hmac::{Hmac, Mac};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use tokio::sync::mpsc;
use tokio::time::sleep;
use tracing::{error, info, warn};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

#[derive(Error, Debug)]
pub enum SettlementError {
    #[error("Supabase RPC error: {0}")]
    RpcFailure(String),
    #[error("Webhook delivery failed after max retries: {0}")]
    WebhookExhausted(String),
    #[error("Cryptographic signing error: {0}")]
    CryptoError(String),
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Compute session usage telemetry event queued for settlement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputeUsageBatch {
    pub tenant_id: Uuid,
    pub session_id: String,
    pub hardware_tier: String, // "B200", "H100_SXM5", "H200", "L40S"
    pub provider_id: String,   // "aws", "gcp", "lambda", "runpod"
    pub duration_seconds: f64,
    pub timestamp_ms: u64,
    pub webhook_target_url: Option<String>,
}

/// Settled receipt returned by atomic Supabase RPC
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementReceipt {
    pub status: String,
    pub journal_id: Uuid,
    pub tenant_id: Uuid,
    pub session_id: String,
    pub hardware_tier: String,
    pub cu_deducted: f64,
    pub usd_equivalent: f64,
    pub remaining_available_cu: f64,
    pub timestamp: String,
}

/// Outbound HMAC-authenticated webhook payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookPayload {
    pub event_id: Uuid,
    pub event_type: String, // "settlement.completed"
    pub timestamp: u64,
    pub nonce: u64,
    pub payload_hash: String,
    pub data: SettlementReceipt,
}

/// Engine state and configuration
pub struct SettlementDispatcher {
    http_client: reqwest::Client,
    supabase_url: String,
    supabase_service_key: String,
    webhook_signing_secret: Vec<u8>,
    max_retries: u32,
    base_backoff_ms: u64,
}

impl SettlementDispatcher {
    pub fn new(
        supabase_url: String,
        supabase_service_key: String,
        webhook_signing_secret: Vec<u8>,
    ) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(5000))
            .pool_max_idle_per_host(50)
            .tcp_nodelay(true)
            .build()
            .expect("Failed to create high-performance HTTP client");

        Self {
            http_client: client,
            supabase_url,
            supabase_service_key,
            webhook_signing_secret,
            max_retries: 5,
            base_backoff_ms: 50,
        }
    }

    /// Generates a deterministic SHA-256 payload hash to enforce idempotency
    pub fn compute_idempotency_hash(
        tenant_id: &Uuid,
        session_id: &str,
        hardware_tier: &str,
        provider_id: &str,
        duration: f64,
        nonce: u64,
    ) -> String {
        let raw = format!(
            "{}:{}:{}:{}:{:.6}:{}",
            tenant_id, session_id, hardware_tier, provider_id, duration, nonce
        );
        let mut hasher = Sha256::new();
        hasher.update(raw.as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Dispatches compute settlement atomically to Supabase RPC
    pub async fn process_settlement(
        &self,
        batch: &ComputeUsageBatch,
    ) -> Result<SettlementReceipt, SettlementError> {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64;

        let payload_hash = Self::compute_idempotency_hash(
            &batch.tenant_id,
            &batch.session_id,
            &batch.hardware_tier,
            &batch.provider_id,
            batch.duration_seconds,
            nonce,
        );

        let rpc_endpoint = format!("{}/rest/v1/rpc/rpc_process_compute_settlement", self.supabase_url);

        let rpc_params = serde_json::json!({
            "p_tenant_id": batch.tenant_id,
            "p_session_id": batch.session_id,
            "p_hardware_tier": batch.hardware_tier,
            "p_provider_id": batch.provider_id,
            "p_duration_seconds": batch.duration_seconds,
            "p_nonce": nonce,
            "p_payload_hash": payload_hash,
        });

        let mut headers = HeaderMap::new();
        headers.insert(
            "apikey",
            HeaderValue::from_str(&self.supabase_service_key).map_err(|e| SettlementError::RpcFailure(e.to_string()))?,
        );
        headers.insert(
            "Authorization",
            HeaderValue::from_str(&format!("Bearer {}", self.supabase_service_key))
                .map_err(|e| SettlementError::RpcFailure(e.to_string()))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let start_time = tokio::time::Instant::now();
        let response = self
            .http_client
            .post(&rpc_endpoint)
            .headers(headers)
            .json(&rpc_params)
            .send()
            .await?;

        let elapsed = start_time.elapsed();
        info!(
            "Supabase RPC settlement executed in {:?} for session={}",
            elapsed, batch.session_id
        );

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("RPC call failed: {}", error_text);
            return Err(SettlementError::RpcFailure(error_text));
        }

        let receipt: SettlementReceipt = response.json().await?;
        Ok(receipt)
    }

    /// Sign payload with HMAC-SHA256
    pub fn sign_hmac(&self, message: &[u8]) -> Result<String, SettlementError> {
        let mut mac = HmacSha256::new_from_slice(&self.webhook_signing_secret)
            .map_err(|e| SettlementError::CryptoError(e.to_string()))?;
        mac.update(message);
        let result = mac.finalize();
        Ok(hex::encode(result.into_bytes()))
    }

    /// Dispatches an HMAC-authenticated webhook to third-party endpoints with jittered exponential backoff
    pub async fn dispatch_webhook(
        &self,
        endpoint_url: &str,
        receipt: SettlementReceipt,
    ) -> Result<(), SettlementError> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let nonce = rand::random::<u64>();
        let event_id = Uuid::new_v4();

        // Compute payload hash
        let data_json = serde_json::to_string(&receipt)?;
        let mut hasher = Sha256::new();
        hasher.update(data_json.as_bytes());
        let payload_hash = hex::encode(hasher.finalize());

        let webhook_payload = WebhookPayload {
            event_id,
            event_type: "settlement.completed".to_string(),
            timestamp,
            nonce,
            payload_hash: payload_hash.clone(),
            data: receipt,
        };

        let serialized_body = serde_json::to_string(&webhook_payload)?;

        // Signature signed over: "t={timestamp},n={nonce},p={payload_hash},b={body}"
        let signature_payload = format!(
            "t={},n={},p={},b={}",
            timestamp, nonce, payload_hash, serialized_body
        );
        let signature = self.sign_hmac(signature_payload.as_bytes())?;

        let mut backoff = self.base_backoff_ms;

        for attempt in 1..=self.max_retries {
            let request = self
                .http_client
                .post(endpoint_url)
                .header(CONTENT_TYPE, "application/json")
                .header("X-Apex-Signature", format!("sha256={}", signature))
                .header("X-Apex-Timestamp", timestamp.to_string())
                .header("X-Apex-Nonce", nonce.to_string())
                .header("X-Apex-Event-ID", event_id.to_string())
                .body(serialized_body.clone());

            match request.send().await {
                Ok(resp) if resp.status().is_success() => {
                    info!(
                        "Webhook dispatched successfully to {} on attempt {}",
                        endpoint_url, attempt
                    );
                    return Ok(());
                }
                Ok(resp) => {
                    warn!(
                        "Webhook target {} responded with HTTP {} (attempt {}/{})",
                        endpoint_url,
                        resp.status(),
                        attempt,
                        self.max_retries
                    );
                }
                Err(err) => {
                    warn!(
                        "Webhook transport error to {} (attempt {}/{}): {}",
                        endpoint_url, attempt, self.max_retries, err
                    );
                }
            }

            if attempt < self.max_retries {
                let jitter = (rand::random::<u64>() % 20) + 5;
                sleep(Duration::from_millis(backoff + jitter)).await;
                backoff *= 2;
            }
        }

        Err(SettlementError::WebhookExhausted(format!(
            "Webhook delivery failed after {} attempts",
            self.max_retries
        )))
    }
}

/// Worker loop listening on mpsc queue
pub async fn start_settlement_worker(
    dispatcher: Arc<SettlementDispatcher>,
    mut rx: mpsc::Receiver<ComputeUsageBatch>,
) {
    info!("Starting Settlement Dispatcher worker thread...");
    while let Some(batch) = rx.recv().await {
        let disp = Arc::clone(&dispatcher);
        tokio::spawn(async move {
            match disp.process_settlement(&batch).await {
                Ok(receipt) => {
                    info!(
                        "Settlement committed: Session={} CU_Deducted={} Available_CU={}",
                        receipt.session_id, receipt.cu_deducted, receipt.remaining_available_cu
                    );

                    if let Some(target_url) = batch.webhook_target_url {
                        if let Err(err) = disp.dispatch_webhook(&target_url, receipt).await {
                            error!("Failed to deliver webhook notification: {}", err);
                        }
                    }
                }
                Err(err) => {
                    error!(
                        "Settlement failed for session {}: {}",
                        batch.session_id, err
                    );
                }
            }
        });
    }
}

#[tokio::main]
pub async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let supabase_url = std::env::var("SUPABASE_URL").unwrap_or_else(|_| "https://mock.supabase.co".into());
    let supabase_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_else(|_| "service-key-mock".into());
    let webhook_secret = std::env::var("WEBHOOK_SECRET")
        .unwrap_or_else(|_| "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".into())
        .into_bytes();

    let dispatcher = Arc::new(SettlementDispatcher::new(
        supabase_url,
        supabase_key,
        webhook_secret,
    ));

    let (tx, rx) = mpsc::channel::<ComputeUsageBatch>(1000);

    let worker_handle = tokio::spawn(start_settlement_worker(dispatcher.clone(), rx));

    // Example queue ingestion
    let sample = ComputeUsageBatch {
        tenant_id: Uuid::new_v4(),
        session_id: "sess_b200_arbitrage_001".to_string(),
        hardware_tier: "B200".to_string(),
        provider_id: "lambda".to_string(),
        duration_seconds: 120.0,
        timestamp_ms: SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis() as u64,
        webhook_target_url: Some("https://api.apexsovereign.ai/webhooks/settlement".to_string()),
    };

    tx.send(sample).await?;
    info!("Sample batch submitted to settlement queue.");

    // Keep service active
    let _ = tokio::signal::ctrl_c().await;
    drop(tx);
    let _ = worker_handle.await;

    Ok(())
}
