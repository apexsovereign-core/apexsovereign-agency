// ============================================================================
// ApexSovereign.ai - TENANT CORE & CRYPTOGRAPHIC API FEDERATION CRATE
// Module: crates/tenant-core/src/lib.rs
// ============================================================================

pub mod auth;
pub mod onboarding;

pub use auth::{
    ApiKeyClaims, ApiKeyScope, AuthenticatedSession, AuthError, CryptographicKeyManager,
    SlaTier, API_KEY_PREFIX,
};
pub use onboarding::{
    AutonomousTenantOrchestrator, OnboardTenantRequest, OnboardingError, QuotaCheckResult,
    TenantProfile, TenantQuotaState, CU_PER_USD,
};
