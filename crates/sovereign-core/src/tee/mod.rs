// ============================================================================
// ApexSovereign.ai - HARDWARE TEE ATTESTATION ROOT
// File: crates/sovereign-core/src/tee/mod.rs
// ============================================================================

pub mod attestation;

pub use attestation::{
    SnpAttestationReport, TdxAttestationQuote, TeeAttestationEngine, TeeAttestationError,
    TeeAuditReceipt, TeePlatform,
};
