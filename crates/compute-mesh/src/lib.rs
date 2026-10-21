//! Universal Heterogeneous Compute Router & Virtual GPU Engine
//!
//! Provides dynamic hardware normalization, multi-cloud spot price arbitration,
//! serverless AI job dispatching, sub-10ms automated failover, and execution telemetry.

pub mod aggregator;
pub mod router;
pub mod scheduler;

pub use aggregator::{
    ComputeInstanceNode, ComputeRoutingTable, GpuArchitecture, GpuProvider,
    ProviderType, RoutingWeights, WorkloadRequirement,
};
pub use router::{create_router, AppState};
pub use scheduler::{
    ClusterTelemetrySnapshot, JobExecutionReport, JobRequest, JobStatus,
    WarmModelRegistry, WorkloadScheduler, WorkloadType,
};
