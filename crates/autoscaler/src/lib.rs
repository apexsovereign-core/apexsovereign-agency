// ============================================================================
// ApexSovereign.ai - AUTOSCALER CRATE ROOT
// Module: crates/autoscaler/src/lib.rs
// ============================================================================

pub mod predictor;
pub mod sla;

pub use predictor::{
    CapacityForecast, HoltWintersConfig, HoltWintersState, MetricRingBuffer, MetricSample,
    PredictiveEngine, PreemptiveScaleEvent,
};

pub use sla::{
    DispatchedExecution, SlaArbitrator, SlaQueueTelemetry, SlaRejectionReason, SlaRequest, SlaTier,
};
