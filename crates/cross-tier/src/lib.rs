// ============================================================================
// ApexSovereign.ai - CROSS-TIER DYNAMIC ARBITRAGE & RESOURCE ISOLATION CRATE
// Module: crates/cross-tier/src/lib.rs
// ============================================================================

pub mod isolation;
pub mod scheduler;

pub use isolation::{
    HardwareIsolationEngine, HardwareTelemetrySnapshot, IsolationError, TierCgroupProfile,
};
pub use scheduler::{
    ComputeTier, CrossTierScheduler, PreemptionTelemetryEvent, ScheduledTask, SchedulerError,
    SchedulerMetrics, WorkloadCheckpoint, WorkloadState, MAX_PREEMPTION_LATENCY_MS,
};
