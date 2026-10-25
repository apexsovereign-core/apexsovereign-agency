// ============================================================================
// ApexSovereign.ai - SOVEREIGN CORE CRATE ROOT
// File: crates/sovereign-core/src/lib.rs
// ============================================================================

pub mod config;
pub mod ffi;
pub mod tee;

pub use ffi::{
    GeneratedTokenEvent, NativeInferenceRequest, NativeTensorRtEngine, PinnedHostMemory,
    TensorRtError,
};
pub use tee::{
    SnpAttestationReport, TdxAttestationQuote, TeeAttestationEngine, TeeAttestationError,
    TeeAuditReceipt, TeePlatform,
};
