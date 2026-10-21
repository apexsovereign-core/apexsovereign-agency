// ============================================================================
// ApexSovereign.ai - CRYPTOGRAPHIC API KEY ISSUER & FEDERATION
// Module: crates/tenant-core/src/auth.rs
// Implements:
//   1. Ed25519-signed asymmetric API key generation (`sk_live_...`).
//   2. Sub-millisecond O(1) in-memory cryptographic signature verification.
//   3. Thread-safe revocation cache and tenant blacklist enforcement.
//   4. Fine-grained scope authorization and SLA tier capability verification.
//   5. SHA-256 key fingerprinting for zero-knowledge database audit storage.
// ============================================================================

use std::collections::HashSet;
use std::fmt;
use std::sync::Arc;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::Utc;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use parking_lot::RwLock;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

pub const API_KEY_PREFIX: &str = "sk_live_";
pub const DEFAULT_KEY_VALIDITY_DAYS: i64 = 365;

/// Service Level Agreement (SLA) Tiers for multi-tenant prioritization
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SlaTier {
    Enterprise,
    Professional,
    Standard,
    Free,
}

impl SlaTier {
    pub fn default_rate_limit_tps(&self) -> u32 {
        match self {
            SlaTier::Enterprise => 2500,
            SlaTier::Professional => 500,
            SlaTier::Standard => 100,
            SlaTier::Free => 20,
        }
    }

    pub fn default_max_concurrent_vcu(&self) -> u32 {
        match self {
            SlaTier::Enterprise => 64,
            SlaTier::Professional => 16,
            SlaTier::Standard => 4,
            SlaTier::Free => 1,
        }
    }

    pub fn target_latency_ms(&self) -> f64 {
        match self {
            SlaTier::Enterprise => 25.0,
            SlaTier::Professional => 75.0,
            SlaTier::Standard => 150.0,
            SlaTier::Free => 300.0,
        }
    }
}

impl fmt::Display for SlaTier {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SlaTier::Enterprise => write!(f, "enterprise"),
            SlaTier::Professional => write!(f, "professional"),
            SlaTier::Standard => write!(f, "standard"),
            SlaTier::Free => write!(f, "free"),
        }
    }
}

/// Granular permissions scopes supported across the ApexSovereign compute mesh
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiKeyScope {
    ComputeInference,
    ModelFineTune,
    ClusterArbitrage,
    LedgerRead,
    LedgerWrite,
    TenantAdmin,
}

impl fmt::Display for ApiKeyScope {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ApiKeyScope::ComputeInference => write!(f, "compute:inference"),
            ApiKeyScope::ModelFineTune => write!(f, "model:finetune"),
            ApiKeyScope::ClusterArbitrage => write!(f, "cluster:arbitrage"),
            ApiKeyScope::LedgerRead => write!(f, "ledger:read"),
            ApiKeyScope::LedgerWrite => write!(f, "ledger:write"),
            ApiKeyScope::TenantAdmin => write!(f, "tenant:admin"),
        }
    }
}

/// Cryptographically signed payload embedded inside the sovereign API key
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyClaims {
    pub key_id: Uuid,
    pub tenant_id: Uuid,
    pub tenant_slug: String,
    pub tier: SlaTier,
    pub scopes: Vec<ApiKeyScope>,
    pub issued_at: i64,
    pub expires_at: Option<i64>,
    pub rate_limit_tps: u32,
    pub max_concurrent_vcu: u32,
    pub cluster_affinity: Option<String>,
}

/// Cryptographic authentication errors
#[derive(Debug, Error)]
pub enum AuthError {
    #[error("Missing Authorization header")]
    MissingHeader,

    #[error("Malformed Authorization header structure: {0}")]
    MalformedHeader(String),

    #[error("API token prefix is invalid; expected 'sk_live_'")]
    InvalidPrefix,

    #[error("Failed to decode token segments: {0}")]
    DecodeError(String),

    #[error("Cryptographic signature mismatch; token signature is invalid")]
    InvalidSignature,

    #[error("API token expired at timestamp {0}")]
    TokenExpired(i64),

    #[error("API token has been revoked by tenant admin or sovereign operator")]
    TokenRevoked,

    #[error("Tenant organization '{0}' has been suspended or deprovisioned")]
    TenantSuspended(String),

    #[error("Insufficient permissions: requested '{required}' but key only grants {granted:?}")]
    InsufficientScope {
        required: String,
        granted: Vec<ApiKeyScope>,
    },

    #[error("Cryptographic subsystem internal error: {0}")]
    InternalError(String),
}

/// Result of successful sub-millisecond edge authentication
#[derive(Debug, Clone)]
pub struct AuthenticatedSession {
    pub claims: ApiKeyClaims,
    pub key_fingerprint: String,
    pub verification_latency_micros: u64,
}

/// Central cryptographic key issuer and edge federation validator
#[derive(Clone)]
pub struct CryptographicKeyManager {
    signing_key: Arc<SigningKey>,
    verifying_key: VerifyingKey,
    revoked_key_ids: Arc<RwLock<HashSet<Uuid>>>,
    blacklisted_tenants: Arc<RwLock<HashSet<Uuid>>>,
}

impl CryptographicKeyManager {
    /// Initialise key manager with a newly generated Ed25519 keypair
    pub fn new_random() -> Self {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key = signing_key.verifying_key();

        Self {
            signing_key: Arc::new(signing_key),
            verifying_key,
            revoked_key_ids: Arc::new(RwLock::new(HashSet::new())),
            blacklisted_tenants: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    /// Initialise key manager from an existing 32-byte Ed25519 private seed
    pub fn from_seed(seed: &[u8; 32]) -> Self {
        let signing_key = SigningKey::from_bytes(seed);
        let verifying_key = signing_key.verifying_key();

        Self {
            signing_key: Arc::new(signing_key),
            verifying_key,
            revoked_key_ids: Arc::new(RwLock::new(HashSet::new())),
            blacklisted_tenants: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    /// Retrieve the public verifying key in hex format
    pub fn public_key_hex(&self) -> String {
        hex::encode(self.verifying_key.as_bytes())
    }

    /// Retrieve the public verifying key bytes
    pub fn public_key_bytes(&self) -> [u8; 32] {
        self.verifying_key.to_bytes()
    }

    /// Issue a cryptographically signed API key for a specified tenant
    pub fn issue_api_key(
        &self,
        tenant_id: Uuid,
        tenant_slug: &str,
        tier: SlaTier,
        scopes: Vec<ApiKeyScope>,
        validity_days: Option<i64>,
        cluster_affinity: Option<String>,
    ) -> Result<(String, ApiKeyClaims), AuthError> {
        let key_id = Uuid::new_v4();
        let now = Utc::now().timestamp();
        let expires_at = validity_days.map(|days| now + (days * 86400));

        let claims = ApiKeyClaims {
            key_id,
            tenant_id,
            tenant_slug: tenant_slug.to_string(),
            tier,
            scopes,
            issued_at: now,
            expires_at,
            rate_limit_tps: tier.default_rate_limit_tps(),
            max_concurrent_vcu: tier.default_max_concurrent_vcu(),
            cluster_affinity,
        };

        let claims_json = serde_json::to_vec(&claims)
            .map_err(|e| AuthError::InternalError(format!("Failed to serialize claims: {}", e)))?;

        let claims_b64 = URL_SAFE_NO_PAD.encode(&claims_json);

        // Sign the raw binary JSON payload using the master Ed25519 signing key
        let signature = self.signing_key.sign(claims_json.as_slice());
        let signature_b64 = URL_SAFE_NO_PAD.encode(signature.to_bytes());

        let raw_token = format!("{}{}.{}", API_KEY_PREFIX, claims_b64, signature_b64);

        Ok((raw_token, claims))
    }

    /// Validate an incoming HTTP Authorization header string in O(1) time
    /// Expected format: `Bearer sk_live_<payload>.<signature>` or raw `sk_live_<payload>.<signature>`
    pub fn validate_authorization_header(
        &self,
        header_val: &str,
        required_scope: Option<ApiKeyScope>,
    ) -> Result<AuthenticatedSession, AuthError> {
        let start_time = std::time::Instant::now();

        let token_str = if let Some(stripped) = header_val.strip_prefix("Bearer ") {
            stripped.trim()
        } else {
            header_val.trim()
        };

        if token_str.is_empty() {
            return Err(AuthError::MissingHeader);
        }

        let session = self.verify_api_key(token_str, required_scope)?;
        let latency_micros = start_time.elapsed().as_micros() as u64;

        Ok(AuthenticatedSession {
            claims: session.claims,
            key_fingerprint: session.key_fingerprint,
            verification_latency_micros: latency_micros,
        })
    }

    /// Low-level O(1) Ed25519 verification without network roundtrips
    pub fn verify_api_key(
        &self,
        token: &str,
        required_scope: Option<ApiKeyScope>,
    ) -> Result<AuthenticatedSession, AuthError> {
        let start_time = std::time::Instant::now();

        if !token.starts_with(API_KEY_PREFIX) {
            return Err(AuthError::InvalidPrefix);
        }

        let raw_body = &token[API_KEY_PREFIX.len()..];
        let parts: Vec<&str> = raw_body.split('.').collect();
        if parts.len() != 2 {
            return Err(AuthError::MalformedHeader(
                "Token must consist of payload and signature segments".to_string(),
            ));
        }

        let payload_b64 = parts[0];
        let sig_b64 = parts[1];

        // 1. Decode payload bytes
        let payload_bytes = URL_SAFE_NO_PAD
            .decode(payload_b64)
            .map_err(|e| AuthError::DecodeError(format!("Invalid base64 payload: {}", e)))?;

        // 2. Decode signature bytes
        let sig_bytes = URL_SAFE_NO_PAD
            .decode(sig_b64)
            .map_err(|e| AuthError::DecodeError(format!("Invalid base64 signature: {}", e)))?;

        if sig_bytes.len() != 64 {
            return Err(AuthError::InvalidSignature);
        }

        let mut sig_arr = [0u8; 64];
        sig_arr.copy_from_slice(&sig_bytes);
        let signature = Signature::from_bytes(&sig_arr);

        // 3. O(1) Ed25519 signature verification against public verifying key
        self.verifying_key
            .verify(&payload_bytes, &signature)
            .map_err(|_| AuthError::InvalidSignature)?;

        // 4. Deserialize claims
        let claims: ApiKeyClaims = serde_json::from_slice(&payload_bytes)
            .map_err(|e| AuthError::DecodeError(format!("Invalid JSON payload: {}", e)))?;

        // 5. O(1) In-memory revocation cache check
        {
            let revoked = self.revoked_key_ids.read();
            if revoked.contains(&claims.key_id) {
                return Err(AuthError::TokenRevoked);
            }
        }

        // 6. O(1) In-memory tenant blacklist check
        {
            let blacklisted = self.blacklisted_tenants.read();
            if blacklisted.contains(&claims.tenant_id) {
                return Err(AuthError::TenantSuspended(claims.tenant_slug));
            }
        }

        // 7. Check expiration
        let now = Utc::now().timestamp();
        if let Some(exp) = claims.expires_at {
            if now > exp {
                return Err(AuthError::TokenExpired(exp));
            }
        }

        // 8. Verify required permission scope if specified
        if let Some(req_scope) = required_scope {
            if !claims.scopes.contains(&req_scope) && !claims.scopes.contains(&ApiKeyScope::TenantAdmin) {
                return Err(AuthError::InsufficientScope {
                    required: req_scope.to_string(),
                    granted: claims.scopes.clone(),
                });
            }
        }

        let fingerprint = Self::compute_fingerprint(token);
        let latency_micros = start_time.elapsed().as_micros() as u64;

        Ok(AuthenticatedSession {
            claims,
            key_fingerprint: fingerprint,
            verification_latency_micros: latency_micros,
        })
    }

    /// Revoke an API key by ID (propagates instantly in-memory across the local node)
    pub fn revoke_key(&self, key_id: Uuid) {
        let mut revoked = self.revoked_key_ids.write();
        revoked.insert(key_id);
    }

    /// Check if a key ID is currently revoked
    pub fn is_key_revoked(&self, key_id: &Uuid) -> bool {
        self.revoked_key_ids.read().contains(key_id)
    }

    /// Blacklist or suspend an entire tenant organization
    pub fn blacklist_tenant(&self, tenant_id: Uuid) {
        let mut blacklisted = self.blacklisted_tenants.write();
        blacklisted.insert(tenant_id);
    }

    /// Lift tenant suspension
    pub fn unblacklist_tenant(&self, tenant_id: &Uuid) {
        let mut blacklisted = self.blacklisted_tenants.write();
        blacklisted.remove(tenant_id);
    }

    /// Compute deterministic SHA-256 fingerprint for database lookup and audit logging
    pub fn compute_fingerprint(token: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Extract safe non-sensitive prefix for display (e.g., `sk_live_abc123...`)
    pub fn extract_display_prefix(token: &str) -> String {
        if token.len() <= 16 {
            token.to_string()
        } else {
            format!("{}...", &token[..16])
        }
    }
}
