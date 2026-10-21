use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GpuArch {
    H100SXM5,
    B200NVL72,
    A100SXM4,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSpotQuote {
    pub provider_name: String,
    pub region: String,
    pub arch: GpuArch,
    pub list_price_hr: f64,
    pub spot_price_hr: f64,
    pub available_nodes: u32,
    pub ping_latency_ms: u32,
}

pub struct MeshState {
    pub quotes: RwLock<HashMap<GpuArch, Vec<ProviderSpotQuote>>>,
    pub request_counter: AtomicU64,
    pub arbitrage_settlements: AtomicU64,
}

impl Default for MeshState {
    fn default() -> Self {
        let mut initial_quotes = HashMap::new();

        // Baseline pricing reflecting real enterprise benchmarks (CoreWeave, Lambda, AWS)
        initial_quotes.insert(
            GpuArch::H100SXM5,
            vec![
                ProviderSpotQuote {
                    provider_name: "CoreWeave".to_string(),
                    region: "us-east-1".to_string(),
                    arch: GpuArch::H100SXM5,
                    list_price_hr: 6.16,
                    spot_price_hr: 4.25,
                    available_nodes: 64,
                    ping_latency_ms: 12,
                },
                ProviderSpotQuote {
                    provider_name: "LambdaLabs".to_string(),
                    region: "us-west-2".to_string(),
                    arch: GpuArch::H100SXM5,
                    list_price_hr: 3.29,
                    spot_price_hr: 2.89,
                    available_nodes: 32,
                    ping_latency_ms: 15,
                },
                ProviderSpotQuote {
                    provider_name: "LocalColoIceland".to_string(),
                    region: "eu-north-ice01".to_string(),
                    arch: GpuArch::H100SXM5,
                    list_price_hr: 3.10,
                    spot_price_hr: 1.85,
                    available_nodes: 128,
                    ping_latency_ms: 9,
                },
            ],
        );

        initial_quotes.insert(
            GpuArch::B200NVL72,
            vec![
                ProviderSpotQuote {
                    provider_name: "PublicCloudAlpha".to_string(),
                    region: "us-central-1".to_string(),
                    arch: GpuArch::B200NVL72,
                    list_price_hr: 8.50,
                    spot_price_hr: 5.95,
                    available_nodes: 16,
                    ping_latency_ms: 14,
                },
                ProviderSpotQuote {
                    provider_name: "SovereignNordicHydro".to_string(),
                    region: "eu-west-hydro".to_string(),
                    arch: GpuArch::B200NVL72,
                    list_price_hr: 7.20,
                    spot_price_hr: 3.80,
                    available_nodes: 48,
                    ping_latency_ms: 8,
                },
            ],
        );

        initial_quotes.insert(
            GpuArch::A100SXM4,
            vec![
                ProviderSpotQuote {
                    provider_name: "PublicCloudTier1".to_string(),
                    region: "us-east-2".to_string(),
                    arch: GpuArch::A100SXM4,
                    list_price_hr: 2.45,
                    spot_price_hr: 1.80,
                    available_nodes: 96,
                    ping_latency_ms: 11,
                },
                ProviderSpotQuote {
                    provider_name: "LocalColoWest".to_string(),
                    region: "us-west-smr".to_string(),
                    arch: GpuArch::A100SXM4,
                    list_price_hr: 2.10,
                    spot_price_hr: 1.15,
                    available_nodes: 140,
                    ping_latency_ms: 6,
                },
            ],
        );

        Self {
            quotes: RwLock::new(initial_quotes),
            request_counter: AtomicU64::new(0),
            arbitrage_settlements: AtomicU64::new(0),
        }
    }
}
