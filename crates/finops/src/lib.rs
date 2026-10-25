// ============================================================================
// ApexSovereign.ai - FINOPS CRATE ROOT
// Module: crates/finops/src/lib.rs
// ============================================================================

pub mod optimizer;
pub mod scraper;

pub use optimizer::{
    MarginOptimizerConfig, MarginOptimizerDaemon, MarginOptimizationState,
    NodeCostYieldMetrics, ProviderType, RoutingDecision,
    MINIMUM_TARGET_MARGIN, EMERGENCY_MARGIN_CEILING,
};
pub use scraper::{
    DcgmTelemetryScraper, GpuTelemetrySample, NodeHealthScore,
    TelemetryScraperConfig,
};
