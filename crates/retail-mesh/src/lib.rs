// ============================================================================
// ApexSovereign.ai - TIER 4 RETAIL FRACTIONAL GPU SHARING & MICRO-BILLING CRATE
// Module: crates/retail-mesh/src/lib.rs
// ============================================================================

pub mod microbilling;
pub mod mig;
pub mod router;

pub use microbilling::{
    BillingError, MicroBillingEngine, MicroTransactionRecord, TenantWallet,
    MAX_COLD_KILL_LATENCY_MS, MICRO_CREDITS_PER_USD,
};
pub use mig::{
    EvictionReport, FractionalGpuManager, FractionalProfile, GpuModel, GpuSlice, MigError,
    PhysicalGpu, SliceState,
};
pub use router::{
    create_retail_router, BalanceResponse, DispatchComputeRequest, DispatchComputeResponse,
    LeaseSliceRequest, LeaseSliceResponse, OnboardRetailRequest, OnboardRetailResponse,
    RetailAppState, TopupRequest, TopupResponse,
};
