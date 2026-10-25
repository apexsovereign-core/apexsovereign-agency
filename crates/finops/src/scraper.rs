// ============================================================================
// ApexSovereign.ai - REAL-TIME DCGM TELEMETRY SCRAPER SIDECAR
// Module: crates/finops/src/scraper.rs
// Implements:
//   1. DCGM (Data Center GPU Manager) metrics ingestion from Prometheus / HTTP endpoints.
//   2. High-frequency parsing of GPU temperature, power draw (Watts), and vRAM usage.
//   3. Hardware health score synthesis and instant propagation to the Central Router.
// ============================================================================

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info, warn};

pub const DEFAULT_DCGM_ENDPOINT: &str = "http://127.0.0.1:9400/metrics";
pub const MAX_SAFE_GPU_TEMP_CELSIUS: f64 = 84.0;
pub const THROTTLE_GPU_TEMP_CELSIUS: f64 = 88.0;
pub const MAX_SAFE_POWER_DRAW_WATTS: f64 = 700.0; // B200 / H100 TDP ceiling
pub const MAX_SAFE_VRAM_UTILIZATION: f64 = 0.95;  // 95% threshold

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuTelemetrySample {
    pub gpu_index: u32,
    pub gpu_uuid: String,
    pub model: String,
    pub temperature_celsius: f64,
    pub power_draw_watts: f64,
    pub vram_used_bytes: u64,
    pub vram_total_bytes: u64,
    pub vram_utilization_ratio: f64,
    pub sm_utilization_ratio: f64,
    pub is_throttling: bool,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeHealthScore {
    pub node_id: String,
    pub composite_health_score: f64, // 0.0 (Failed/Critical) to 1.0 (Optimal)
    pub is_schedulable: bool,
    pub active_gpus: usize,
    pub throttling_gpus: usize,
    pub avg_temperature_celsius: f64,
    pub total_power_draw_watts: f64,
    pub max_vram_utilization: f64,
    pub degradation_reason: Option<String>,
    pub updated_at: DateTime<Utc>,
}

pub struct TelemetryScraperConfig {
    pub node_id: String,
    pub dcgm_metrics_url: String,
    pub scrape_interval: Duration,
    pub router_telemetry_webhook_url: Option<String>,
}

impl Default for TelemetryScraperConfig {
    fn default() -> Self {
        Self {
            node_id: std::env::var("NODE_ID").unwrap_or_else(|_| "node-baremetal-b200-01".to_string()),
            dcgm_metrics_url: std::env::var("DCGM_METRICS_URL").unwrap_or_else(|_| DEFAULT_DCGM_ENDPOINT.to_string()),
            scrape_interval: Duration::from_secs(5),
            router_telemetry_webhook_url: std::env::var("ROUTER_TELEMETRY_ENDPOINT").ok(),
        }
    }
}

pub struct DcgmTelemetryScraper {
    pub config: TelemetryScraperConfig,
    pub latest_telemetry: Arc<RwLock<HashMap<u32, GpuTelemetrySample>>>,
    pub latest_health: Arc<RwLock<Option<NodeHealthScore>>>,
    client: reqwest::Client,
}

impl DcgmTelemetryScraper {
    pub fn new(config: TelemetryScraperConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap_or_default();

        Self {
            config,
            latest_telemetry: Arc::new(RwLock::new(HashMap::new())),
            latest_health: Arc::new(RwLock::new(None)),
            client,
        }
    }

    /// Parses raw Prometheus line-format DCGM metrics into structured samples.
    pub fn parse_dcgm_metrics(raw_text: &str) -> Vec<GpuTelemetrySample> {
        let mut gpus: HashMap<u32, GpuTelemetrySample> = HashMap::new();
        let now = Utc::now();

        for line in raw_text.lines() {
            let line = line.trim();
            if line.starts_with('#') || line.is_empty() {
                continue;
            }

            // DCGM Prometheus format e.g.:
            // DCGM_FI_DEV_GPU_TEMP{gpu="0",UUID="GPU-12345",modelName="NVIDIA B200"} 64.0
            // DCGM_FI_DEV_POWER_USAGE{gpu="0",UUID="GPU-12345",modelName="NVIDIA B200"} 412.5
            // DCGM_FI_DEV_FB_USED{gpu="0",UUID="GPU-12345",modelName="NVIDIA B200"} 128450560000
            // DCGM_FI_DEV_FB_TOTAL{gpu="0",UUID="GPU-12345",modelName="NVIDIA B200"} 193273528320
            // DCGM_FI_DEV_GPU_UTIL{gpu="0",UUID="GPU-12345",modelName="NVIDIA B200"} 88.0

            if let Some((metric_def, value_str)) = line.split_once(' ') {
                let value = value_str.trim().parse::<f64>().unwrap_or(0.0);
                
                let (metric_name, labels_part) = match metric_def.split_once('{') {
                    Some((name, rest)) => (name.trim(), rest.trim_end_matches('}')),
                    None => continue,
                };

                let mut gpu_idx: u32 = 0;
                let mut uuid = "GPU-UNKNOWN".to_string();
                let mut model = "NVIDIA-ACCELERATOR".to_string();

                for pair in labels_part.split(',') {
                    if let Some((k, v)) = pair.split_once('=') {
                        let val_clean = v.trim().trim_matches('"');
                        match k.trim() {
                            "gpu" => gpu_idx = val_clean.parse::<u32>().unwrap_or(0),
                            "UUID" => uuid = val_clean.to_string(),
                            "modelName" => model = val_clean.to_string(),
                            _ => {}
                        }
                    }
                }

                let entry = gpus.entry(gpu_idx).or_insert_with(|| GpuTelemetrySample {
                    gpu_index: gpu_idx,
                    gpu_uuid: uuid.clone(),
                    model: model.clone(),
                    temperature_celsius: 45.0,
                    power_draw_watts: 150.0,
                    vram_used_bytes: 0,
                    vram_total_bytes: 193273528320, // 180GB Blackwell Default
                    vram_utilization_ratio: 0.0,
                    sm_utilization_ratio: 0.0,
                    is_throttling: false,
                    timestamp: now,
                });

                match metric_name {
                    "DCGM_FI_DEV_GPU_TEMP" => {
                        entry.temperature_celsius = value;
                        if value >= THROTTLE_GPU_TEMP_CELSIUS {
                            entry.is_throttling = true;
                        }
                    }
                    "DCGM_FI_DEV_POWER_USAGE" => {
                        entry.power_draw_watts = value;
                    }
                    "DCGM_FI_DEV_FB_USED" => {
                        entry.vram_used_bytes = value as u64;
                    }
                    "DCGM_FI_DEV_FB_TOTAL" => {
                        entry.vram_total_bytes = value as u64;
                    }
                    "DCGM_FI_DEV_GPU_UTIL" => {
                        entry.sm_utilization_ratio = value / 100.0;
                    }
                    _ => {}
                }
            }
        }

        // Compute ratios post-aggregation
        for gpu in gpus.values_mut() {
            if gpu.vram_total_bytes > 0 {
                gpu.vram_utilization_ratio = gpu.vram_used_bytes as f64 / gpu.vram_total_bytes as f64;
            }
        }

        gpus.into_values().collect()
    }

    /// Evaluates hardware telemetry and derives a composite health score [0.0, 1.0].
    pub fn evaluate_node_health(node_id: &str, samples: &[GpuTelemetrySample]) -> NodeHealthScore {
        if samples.is_empty() {
            return NodeHealthScore {
                node_id: node_id.to_string(),
                composite_health_score: 0.0,
                is_schedulable: false,
                active_gpus: 0,
                throttling_gpus: 0,
                avg_temperature_celsius: 0.0,
                total_power_draw_watts: 0.0,
                max_vram_utilization: 0.0,
                degradation_reason: Some("No GPU telemetry samples collected from DCGM exporter".to_string()),
                updated_at: Utc::now(),
            };
        }

        let mut total_temp = 0.0;
        let mut total_power = 0.0;
        let mut max_vram_ratio: f64 = 0.0;
        let mut throttling_count = 0;

        for s in samples {
            total_temp += s.temperature_celsius;
            total_power += s.power_draw_watts;
            if s.vram_utilization_ratio > max_vram_ratio {
                max_vram_ratio = s.vram_utilization_ratio;
            }
            if s.is_throttling || s.temperature_celsius >= THROTTLE_GPU_TEMP_CELSIUS {
                throttling_count += 1;
            }
        }

        let avg_temp = total_temp / samples.len() as f64;
        let mut health_score: f64 = 1.0;
        let mut degradation_reasons = Vec::new();

        // Temperature penalty
        if avg_temp > MAX_SAFE_GPU_TEMP_CELSIUS {
            let penalty = (avg_temp - MAX_SAFE_GPU_TEMP_CELSIUS) * 0.08;
            health_score -= penalty;
            degradation_reasons.push(format!("High average temp ({:.1}°C)", avg_temp));
        }

        // vRAM Exhaustion penalty
        if max_vram_ratio > MAX_SAFE_VRAM_UTILIZATION {
            health_score -= 0.35;
            degradation_reasons.push(format!("vRAM near exhaustion ({:.1}%)", max_vram_ratio * 100.0));
        }

        // Throttling penalty
        if throttling_count > 0 {
            health_score -= 0.50 * (throttling_count as f64 / samples.len() as f64);
            degradation_reasons.push(format!("{} GPU(s) thermal throttling", throttling_count));
        }

        let final_score = health_score.clamp(0.0, 1.0);
        let is_schedulable = final_score >= 0.20 && max_vram_ratio < 0.99 && throttling_count == 0;

        NodeHealthScore {
            node_id: node_id.to_string(),
            composite_health_score: final_score,
            is_schedulable,
            active_gpus: samples.len(),
            throttling_gpus: throttling_count,
            avg_temperature_celsius: avg_temp,
            total_power_draw_watts: total_power,
            max_vram_utilization: max_vram_ratio,
            degradation_reason: if degradation_reasons.is_empty() {
                None
            } else {
                Some(degradation_reasons.join("; "))
            },
            updated_at: Utc::now(),
        }
    }

    /// Performs one scrape cycle from DCGM and updates internal state
    pub async fn scrape_cycle(&self) -> Result<NodeHealthScore, String> {
        let resp = self.client.get(&self.config.dcgm_metrics_url).send().await
            .map_err(|e| format!("DCGM HTTP connection failed: {}", e))?;

        let body = resp.text().await
            .map_err(|e| format!("Failed to read DCGM response text: {}", e))?;

        let samples = Self::parse_dcgm_metrics(&body);
        let health = Self::evaluate_node_health(&self.config.node_id, &samples);

        {
            let mut tele_lock = self.latest_telemetry.write();
            for s in &samples {
                tele_lock.insert(s.gpu_index, s.clone());
            }
        }

        {
            let mut health_lock = self.latest_health.write();
            *health_lock = Some(health.clone());
        }

        if let Some(ref webhook_url) = self.config.router_telemetry_webhook_url {
            let _ = self.client.post(webhook_url).json(&health).send().await;
        }

        Ok(health)
    }

    /// Spawns the telemetry worker loop
    pub fn spawn_scraper_worker(self: Arc<Self>) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            info!("Starting DCGM Telemetry Scraper Sidecar for node: {}", self.config.node_id);
            let mut interval = tokio::time::interval(self.config.scrape_interval);

            loop {
                interval.tick().await;
                match self.scrape_cycle().await {
                    Ok(score) => {
                        debug!(
                            "Node {} DCGM health score: {:.2} (Schedulable: {}, Temp: {:.1}°C, Power: {:.0}W)",
                            score.node_id, score.composite_health_score, score.is_schedulable,
                            score.avg_temperature_celsius, score.total_power_draw_watts
                        );
                    }
                    Err(e) => {
                        warn!("DCGM scraper cycle error for {}: {}", self.config.node_id, e);
                    }
                }
            }
        })
    }
}
