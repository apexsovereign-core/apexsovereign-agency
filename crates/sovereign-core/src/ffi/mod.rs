// ============================================================================
// ApexSovereign.ai - HARDWARE C-FFI BINDINGS ROOT
// File: crates/sovereign-core/src/ffi/mod.rs
// ============================================================================

pub mod tensorrt;

pub use tensorrt::{
    GeneratedTokenEvent, NativeInferenceRequest, NativeTensorRtEngine, PinnedHostMemory,
    TensorRtError,
};
