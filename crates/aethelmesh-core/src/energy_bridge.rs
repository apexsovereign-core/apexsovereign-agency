use std::sync::Arc;
use std::time::Duration;
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridZoneTelemetry {
    pub zone_id: String,
    pub region: String,
    pub lmp_usd_per_mwh: f64,
    pub thermal_headroom_celsius: f64,
    pub is_curtailed_renewable: bool,
    pub updated_at_epoch_ms: u64,
}

pub struct EnergyMonitor {
    pub zones: Arc<RwLock<Vec<GridZoneTelemetry>>>,
}

impl EnergyMonitor {
    pub fn new() -> Self {
        let initial_zones = vec![
            GridZoneTelemetry {
                zone_id: "ICELAND_GEO_01".to_string(),
                region: "eu-north-ice".to_string(),
                lmp_usd_per_mwh: 22.40,
                thermal_headroom_celsius: 28.5,
                is_curtailed_renewable: true,
                updated_at_epoch_ms: chrono::Utc::now().timestamp_millis() as u64,
            },
            GridZoneTelemetry {
                zone_id: "NORDIC_HYDRO_02".to_string(),
                region: "eu-north-swe".to_string(),
                lmp_usd_per_mwh: 28.10,
                thermal_headroom_celsius: 24.0,
                is_curtailed_renewable: true,
                updated_at_epoch_ms: chrono::Utc::now().timestamp_millis() as u64,
            },
            GridZoneTelemetry {
                zone_id: "US_WEST_SMR_01".to_string(),
                region: "us-west-smr".to_string(),
                lmp_usd_per_mwh: 34.80,
                thermal_headroom_celsius: 19.2,
                is_curtailed_renewable: false,
                updated_at_epoch_ms: chrono::Utc::now().timestamp_millis() as u64,
            },
            GridZoneTelemetry {
                zone_id: "PJM_EAST_GRID".to_string(),
                region: "us-east-pjm".to_string(),
                lmp_usd_per_mwh: 58.70,
                thermal_headroom_celsius: 14.5,
                is_curtailed_renewable: false,
                updated_at_epoch_ms: chrono::Utc::now().timestamp_millis() as u64,
            },
        ];

        Self {
            zones: Arc::new(RwLock::new(initial_zones)),
        }
    }

    pub async fn run_polling_loop(&self, interval: Duration) {
        let mut ticker = tokio::time::interval(interval);
        loop {
            ticker.tick().await;
            let now = chrono::Utc::now().timestamp_millis() as u64;

            let mut zones = self.zones.write().await;
            for zone in zones.iter_mut() {
                // Simulate real-time micro-fluctuations in wholesale power LMP
                let jitter = ((now % 7) as f64 - 3.0) * 0.45;
                zone.lmp_usd_per_mwh = (zone.lmp_usd_per_mwh + jitter).max(12.0);
                zone.updated_at_epoch_ms = now;
            }
        }
    }

    pub async fn get_lowest_energy_zone(&self) -> Option<GridZoneTelemetry> {
        let zones = self.zones.read().await;
        zones.iter().min_by(|a, b| a.lmp_usd_per_mwh.partial_cmp(&b.lmp_usd_per_mwh).unwrap()).cloned()
    }
}

pub async fn get_energy_telemetry(
    State(state): State<Arc<crate::router::AppState>>,
) -> Json<Vec<GridZoneTelemetry>> {
    let zones = state.energy_monitor.zones.read().await;
    Json(zones.clone())
}
