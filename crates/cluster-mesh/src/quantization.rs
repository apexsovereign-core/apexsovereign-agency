//! Blackwell B200 Dynamic Precision Controller & 192GB HBM3e KV Cache Optimizer
//!
//! Controls 2nd-generation Transformer Engine FP4 / FP8 / FP16 dynamic precision switching
//! and manages zero-copy paged attention memory allocation across 192GB HBM3e pools with
//! strict multi-tenant quotas and OOM panic prevention.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{info, warn};

pub const B200_HBM3E_CAPACITY_GB: f64 = 192.0;
pub const KV_CACHE_PAGE_SIZE_TOKENS: usize = 16;
pub const BYTES_PER_TOKEN_FP16: usize = 64;   // Typical hidden size KV state
pub const BYTES_PER_TOKEN_FP8: usize = 32;
pub const BYTES_PER_TOKEN_FP4: usize = 16;
pub const DEFAULT_KV_CACHE_POOL_GB: f64 = 120.0; // Reserved KV cache pool from 192GB HBM3e

#[derive(Error, Debug)]
pub enum MemoryError {
    #[error("Tenant '{tenant_id}' exceeded allocated KV cache quota: current {current_gb:.2} GB, quota {quota_gb:.2} GB")]
    QuotaExceeded {
        tenant_id: String,
        current_gb: f64,
        quota_gb: f64,
    },
    #[error("Global HBM3e KV Cache out of memory: requested {requested_blocks} blocks, available {available_blocks} blocks")]
    OutOfMemory {
        requested_blocks: usize,
        available_blocks: usize,
    },
    #[error("Stream session '{session_id}' not found")]
    SessionNotFound { session_id: String },
    #[error("Precision mode '{0:?}' invalid for current hardware state")]
    InvalidPrecisionState(PrecisionMode),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PrecisionMode {
    /// 4-bit floating point (2nd-Gen Transformer Engine - 20 PFLOPS compute dense)
    Fp4E2M1,
    /// 8-bit floating point (E4M3 for forward activations/weights)
    Fp8E4M3,
    /// 8-bit floating point (E5M2 for backward gradients / high dynamic range)
    Fp8E5M2,
    /// 16-bit half precision floating point
    Fp16,
    /// 16-bit brain floating point
    Bf16,
}

impl PrecisionMode {
    pub fn bytes_per_token(&self) -> usize {
        match self {
            PrecisionMode::Fp4E2M1 => BYTES_PER_TOKEN_FP4,
            PrecisionMode::Fp8E4M3 | PrecisionMode::Fp8E5M2 => BYTES_PER_TOKEN_FP8,
            PrecisionMode::Fp16 | PrecisionMode::Bf16 => BYTES_PER_TOKEN_FP16,
        }
    }

    pub fn throughput_multiplier(&self) -> f64 {
        match self {
            PrecisionMode::Fp4E2M1 => 4.0, // 4x speedup relative to FP16
            PrecisionMode::Fp8E4M3 | PrecisionMode::Fp8E5M2 => 2.5,
            PrecisionMode::Fp16 | PrecisionMode::Bf16 => 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransformerEngineConfig {
    pub active_precision: PrecisionMode,
    pub target_tokens_per_sec_threshold: f64,
    pub accuracy_tolerance_loss_threshold: f64,
    pub max_gpu_temp_celsius_threshold: f32,
    pub fp4_supported: bool,
    pub fp8_gemm_accumulate_fp32: bool,
    pub dynamic_scaling_factor: f32,
    pub last_switch_timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PagedKvBlock {
    pub block_id: usize,
    pub physical_gpu_id: String,
    pub page_size_tokens: usize,
    pub byte_size: usize,
    pub is_free: bool,
    pub allocated_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamKvSession {
    pub session_id: String,
    pub tenant_id: String,
    pub model_id: String,
    pub prompt_tokens: usize,
    pub generated_tokens: usize,
    pub allocated_blocks: Vec<usize>,
    pub precision: PrecisionMode,
    pub created_at: DateTime<Utc>,
    pub last_active_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantMemoryQuota {
    pub tenant_id: String,
    pub max_kv_cache_gb: f64,
    pub current_kv_cache_gb: f64,
    pub active_sessions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KvPoolMetrics {
    pub total_pool_gb: f64,
    pub allocated_pool_gb: f64,
    pub available_pool_gb: f64,
    pub total_blocks: usize,
    pub free_blocks: usize,
    pub active_sessions_count: usize,
    pub current_precision: PrecisionMode,
    pub evictions_count: u64,
    pub total_tokens_cached: u64,
}

pub struct DynamicQuantizationController {
    te_config: RwLock<TransformerEngineConfig>,
    quotas: RwLock<HashMap<String, TenantMemoryQuota>>,
    sessions: RwLock<HashMap<String, StreamKvSession>>,
    blocks: RwLock<Vec<PagedKvBlock>>,
    free_block_indices: RwLock<Vec<usize>>,
    total_evictions: AtomicU64,
    total_tokens_cached: AtomicU64,
    pool_capacity_gb: f64,
}

impl DynamicQuantizationController {
    pub fn new(pool_capacity_gb: f64) -> Self {
        let initial_precision = PrecisionMode::Fp8E4M3;
        let bytes_per_block = KV_CACHE_PAGE_SIZE_TOKENS * initial_precision.bytes_per_token();
        let total_bytes = (pool_capacity_gb * 1024.0 * 1024.0 * 1024.0) as usize;
        let total_blocks = total_bytes / bytes_per_block;

        let mut blocks = Vec::with_capacity(total_blocks);
        let mut free_indices = Vec::with_capacity(total_blocks);

        for i in 0..total_blocks {
            blocks.push(PagedKvBlock {
                block_id: i,
                physical_gpu_id: "b200-hbm3e-primary".to_string(),
                page_size_tokens: KV_CACHE_PAGE_SIZE_TOKENS,
                byte_size: bytes_per_block,
                is_free: true,
                allocated_session_id: None,
            });
            free_indices.push(i);
        }

        info!(
            pool_gb = %pool_capacity_gb,
            total_blocks = %total_blocks,
            block_size_bytes = %bytes_per_block,
            "Initialized 192GB HBM3e Paged Attention KV Cache Pool"
        );

        Self {
            te_config: RwLock::new(TransformerEngineConfig {
                active_precision: initial_precision,
                target_tokens_per_sec_threshold: 450.0,
                accuracy_tolerance_loss_threshold: 0.015,
                max_gpu_temp_celsius_threshold: 82.0,
                fp4_supported: true,
                fp8_gemm_accumulate_fp32: true,
                dynamic_scaling_factor: 1.0,
                last_switch_timestamp: Utc::now(),
            }),
            quotas: RwLock::new(HashMap::new()),
            sessions: RwLock::new(HashMap::new()),
            blocks: RwLock::new(blocks),
            free_block_indices: RwLock::new(free_indices),
            total_evictions: AtomicU64::new(0),
            total_tokens_cached: AtomicU64::new(0),
            pool_capacity_gb,
        }
    }

    /// Set or update tenant memory quota
    pub fn set_tenant_quota(&self, tenant_id: &str, max_kv_cache_gb: f64) {
        let mut quotas = self.quotas.write();
        quotas.insert(
            tenant_id.to_string(),
            TenantMemoryQuota {
                tenant_id: tenant_id.to_string(),
                max_kv_cache_gb,
                current_kv_cache_gb: 0.0,
                active_sessions: 0,
            },
        );
    }

    /// Evaluates current operational telemetry and dynamically shifts Transformer Engine precision
    /// E.g. switches to FP4 for extreme throughput demands, or falls back to FP8/FP16 if temperature rises
    pub fn evaluate_and_switch_precision(
        &self,
        current_tokens_per_sec: f64,
        gpu_temperature_c: f32,
        interconnect_throttled: bool,
    ) -> (PrecisionMode, PrecisionMode) {
        let mut te = self.te_config.write();
        let previous = te.active_precision;

        let new_precision = if gpu_temperature_c > te.max_gpu_temp_celsius_threshold || interconnect_throttled {
            // Sudden thermal surge or link throttling: fall back to FP8 to stabilize power/noise
            if previous == PrecisionMode::Fp4E2M1 {
                warn!(
                    temp = %gpu_temperature_c,
                    throttled = %interconnect_throttled,
                    "Thermal or link throttle detected: falling back Transformer Engine from FP4 to FP8"
                );
                PrecisionMode::Fp8E4M3
            } else {
                previous
            }
        } else if current_tokens_per_sec > te.target_tokens_per_sec_threshold && te.fp4_supported {
            // High throughput demand under safe thermal envelope: switch to 2nd-Gen FP4
            if previous != PrecisionMode::Fp4E2M1 {
                info!(
                    throughput = %current_tokens_per_sec,
                    "High throughput demand: switching Transformer Engine to 2nd-Gen Blackwell FP4"
                );
                PrecisionMode::Fp4E2M1
            } else {
                previous
            }
        } else {
            // Balanced default operating precision
            PrecisionMode::Fp8E4M3
        };

        if new_precision != previous {
            te.active_precision = new_precision;
            te.last_switch_timestamp = Utc::now();
        }

        (previous, new_precision)
    }

    /// Allocates KV cache pages for a new or continuing inference stream
    pub fn allocate_stream_kv_session(
        &self,
        session_id: &str,
        tenant_id: &str,
        model_id: &str,
        total_tokens: usize,
    ) -> Result<usize, MemoryError> {
        let precision = self.te_config.read().active_precision;
        let bytes_per_token = precision.bytes_per_token();
        let required_bytes = total_tokens * bytes_per_token;
        let required_gb = required_bytes as f64 / (1024.0 * 1024.0 * 1024.0);

        // Check Tenant Quota
        {
            let mut quotas = self.quotas.write();
            let quota = quotas.entry(tenant_id.to_string()).or_insert_with(|| TenantMemoryQuota {
                tenant_id: tenant_id.to_string(),
                max_kv_cache_gb: 32.0, // Default 32GB per tenant quota
                current_kv_cache_gb: 0.0,
                active_sessions: 0,
            });

            if quota.current_kv_cache_gb + required_gb > quota.max_kv_cache_gb {
                return Err(MemoryError::QuotaExceeded {
                    tenant_id: tenant_id.to_string(),
                    current_gb: quota.current_kv_cache_gb,
                    quota_gb: quota.max_kv_cache_gb,
                });
            }

            quota.current_kv_cache_gb += required_gb;
            quota.active_sessions += 1;
        }

        // PagedAttention Block Allocation
        let blocks_needed = (total_tokens + KV_CACHE_PAGE_SIZE_TOKENS - 1) / KV_CACHE_PAGE_SIZE_TOKENS;
        let mut free_indices = self.free_block_indices.write();

        if free_indices.len() < blocks_needed {
            return Err(MemoryError::OutOfMemory {
                requested_blocks: blocks_needed,
                available_blocks: free_indices.len(),
            });
        }

        let allocated_indices: Vec<usize> = free_indices.drain(0..blocks_needed).collect();

        // Mark blocks as allocated
        {
            let mut blocks = self.blocks.write();
            for &idx in &allocated_indices {
                if let Some(block) = blocks.get_mut(idx) {
                    block.is_free = false;
                    block.allocated_session_id = Some(session_id.to_string());
                }
            }
        }

        // Record stream session
        {
            let mut sessions = self.sessions.write();
            sessions.insert(
                session_id.to_string(),
                StreamKvSession {
                    session_id: session_id.to_string(),
                    tenant_id: tenant_id.to_string(),
                    model_id: model_id.to_string(),
                    prompt_tokens: total_tokens,
                    generated_tokens: 0,
                    allocated_blocks: allocated_indices,
                    precision,
                    created_at: Utc::now(),
                    last_active_at: Utc::now(),
                },
            );
        }

        self.total_tokens_cached.fetch_add(total_tokens as u64, Ordering::Relaxed);
        Ok(blocks_needed)
    }

    /// Appends new generated tokens to a session, allocating new blocks if page boundaries are crossed
    pub fn append_tokens_to_session(&self, session_id: &str, new_tokens: usize) -> Result<usize, MemoryError> {
        let mut sessions = self.sessions.write();
        let session = sessions.get_mut(session_id).ok_or_else(|| MemoryError::SessionNotFound {
            session_id: session_id.to_string(),
        })?;

        let old_total = session.prompt_tokens + session.generated_tokens;
        let new_total = old_total + new_tokens;
        let old_blocks = (old_total + KV_CACHE_PAGE_SIZE_TOKENS - 1) / KV_CACHE_PAGE_SIZE_TOKENS;
        let new_blocks = (new_total + KV_CACHE_PAGE_SIZE_TOKENS - 1) / KV_CACHE_PAGE_SIZE_TOKENS;

        if new_blocks > old_blocks {
            let additional_needed = new_blocks - old_blocks;
            let mut free_indices = self.free_block_indices.write();

            if free_indices.len() < additional_needed {
                return Err(MemoryError::OutOfMemory {
                    requested_blocks: additional_needed,
                    available_blocks: free_indices.len(),
                });
            }

            let new_allocated: Vec<usize> = free_indices.drain(0..additional_needed).collect();
            {
                let mut blocks = self.blocks.write();
                for &idx in &new_allocated {
                    if let Some(block) = blocks.get_mut(idx) {
                        block.is_free = false;
                        block.allocated_session_id = Some(session_id.to_string());
                    }
                }
            }
            session.allocated_blocks.extend(new_allocated);
        }

        session.generated_tokens += new_tokens;
        session.last_active_at = Utc::now();
        self.total_tokens_cached.fetch_add(new_tokens as u64, Ordering::Relaxed);

        Ok(session.allocated_blocks.len())
    }

    /// Releases session KV cache blocks back into the free pool
    pub fn release_session(&self, session_id: &str) -> Result<(), MemoryError> {
        let session = {
            let mut sessions = self.sessions.write();
            sessions.remove(session_id).ok_or_else(|| MemoryError::SessionNotFound {
                session_id: session_id.to_string(),
            })?
        };

        // Return blocks to free list
        {
            let mut blocks = self.blocks.write();
            let mut free_indices = self.free_block_indices.write();
            for &idx in &session.allocated_blocks {
                if let Some(block) = blocks.get_mut(idx) {
                    block.is_free = true;
                    block.allocated_session_id = None;
                    free_indices.push(idx);
                }
            }
        }

        // Decrement tenant quota usage
        {
            let mut quotas = self.quotas.write();
            if let Some(quota) = quotas.get_mut(&session.tenant_id) {
                let total_tokens = session.prompt_tokens + session.generated_tokens;
                let used_gb = (total_tokens * session.precision.bytes_per_token()) as f64 / (1024.0 * 1024.0 * 1024.0);
                quota.current_kv_cache_gb = (quota.current_kv_cache_gb - used_gb).max(0.0);
                quota.active_sessions = quota.active_sessions.saturating_sub(1);
            }
        }

        Ok(())
    }

    /// Returns comprehensive KV memory pool metrics
    pub fn get_metrics(&self) -> KvPoolMetrics {
        let te = self.te_config.read();
        let blocks = self.blocks.read();
        let free_indices = self.free_block_indices.read();
        let sessions = self.sessions.read();

        let total_blocks = blocks.len();
        let free_blocks = free_indices.len();
        let allocated_blocks = total_blocks - free_blocks;

        let block_bytes = KV_CACHE_PAGE_SIZE_TOKENS * te.active_precision.bytes_per_token();
        let allocated_gb = (allocated_blocks * block_bytes) as f64 / (1024.0 * 1024.0 * 1024.0);
        let available_gb = (self.pool_capacity_gb - allocated_gb).max(0.0);

        KvPoolMetrics {
            total_pool_gb: self.pool_capacity_gb,
            allocated_pool_gb: allocated_gb,
            available_pool_gb: available_gb,
            total_blocks,
            free_blocks,
            active_sessions_count: sessions.len(),
            current_precision: te.active_precision,
            evictions_count: self.total_evictions.load(Ordering::Relaxed),
            total_tokens_cached: self.total_tokens_cached.load(Ordering::Relaxed),
        }
    }
}
