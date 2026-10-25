//! Blackwell B200 NVLink Cluster Arbitrage & Distributed Inference Engine
//!
//! Exposes NVLink 5 topology discovery, dynamic FP4/FP8 quantization control,
//! 192GB HBM3e zero-copy paged attention KV caching, and 1F1B micro-batch pipeline execution.

pub mod nvlink;
pub mod quantization;
pub mod pipeline;
