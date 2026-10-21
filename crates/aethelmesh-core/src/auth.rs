// ==============================================================================
// APEXSOVEREIGN.AI: ENTERPRISE API KEY & TOKEN MINTING ENGINE
// Path: crates/aethelmesh-core/src/auth.rs
// Security: HMAC-SHA256 Signed Tokens (apk_live_ / apk_test_)
// Enforcement: Tiered Token Bucket Rate Limiting & Zero-Credit Short-Circuit
// ==============================================================================

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{header, request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tokio::sync::RwLock;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClientTier {
    Starter,    // 10 req/s
    Enterprise, // 500 req/s
}

impl ClientTier {
    pub fn capacity(&self) -> u32 {
        match self {
            ClientTier::Starter => 10,
            ClientTier::Enterprise => 500,
        }
    }

    pub fn refill_rate_per_sec(&self) -> f64 {
        match self {
            ClientTier::Starter => 10.0,
            ClientTier::Enterprise => 500.0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct TokenBucket {
    pub tokens: f64,
    pub max_capacity: f64,
    pub refill_rate_per_sec: f64,
    pub last_refill_instant: Instant,
}

impl TokenBucket {
    pub fn new(tier: ClientTier) -> Self {
        let cap = tier.capacity() as f64;
        let rate = tier.refill_rate_per_sec();
        Self {
            tokens: cap,
            max_capacity: cap,
            refill_rate_per_sec: rate,
            last_refill_instant: Instant::now(),
        }
    }

    pub fn try_consume(&mut self) -> bool {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill_instant).as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.refill_rate_per_sec).min(self.max_capacity);
        self.last_refill_instant = now;

        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedTenantAuth {
    pub tenant_id: Uuid,
    pub tier: ClientTier,
    pub credit_balance_cu: f64,
    pub is_live: bool,
    pub cached_at: u64,
}

#[derive(Clone)]
pub struct AuthManager {
    secret_seed: Vec<u8>,
    cache: Arc<RwLock<HashMap<String, CachedTenantAuth>>>,
    rate_limiters: Arc<RwLock<HashMap<Uuid, TokenBucket>>>,
}

impl AuthManager {
    pub fn new(secret_seed: &[u8]) -> Self {
        Self {
            secret_seed: secret_seed.to_vec(),
            cache: Arc::new(RwLock::new(HashMap::new())),
            rate_limiters: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Generates a signed, verifiable enterprise API key
    pub fn generate_api_key(&self, tenant_id: Uuid, is_live: bool) -> Result<String, String> {
        let mut random_bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut random_bytes);
        let random_hex = hex::encode(random_bytes);

        let prefix = if is_live { "apk_live_" } else { "apk_test_" };
        let payload = format!("{}:{}", tenant_id, random_hex);

        let mut mac = HmacSha256::new_from_slice(&self.secret_seed)
            .map_err(|e| format!("HMAC initialization failed: {e}"))?;
        mac.update(payload.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());

        Ok(format!("{}{}_{}", prefix, payload, &signature[..16]))
    }

    /// Verifies the structural signature of an API key
    pub fn verify_signature(&self, key: &str) -> Option<(Uuid, bool)> {
        let (prefix, rest) = if let Some(stripped) = key.strip_prefix("apk_live_") {
            ("apk_live_", stripped)
        } else if let Some(stripped) = key.strip_prefix("apk_test_") {
            ("apk_test_", stripped)
        } else {
            return None;
        };

        let parts: Vec<&str> = rest.split('_').collect();
        if parts.len() != 2 {
            return None;
        }

        let payload = parts[0];
        let provided_sig = parts[1];

        let mut mac = HmacSha256::new_from_slice(&self.secret_seed).ok()?;
        mac.update(payload.as_bytes());
        let full_sig = hex::encode(mac.finalize().into_bytes());

        if &full_sig[..16] != provided_sig {
            return None;
        }

        let payload_parts: Vec<&str> = payload.split(':').collect();
        if payload_parts.is_empty() {
            return None;
        }

        let tenant_id = Uuid::parse_str(payload_parts[0]).ok()?;
        let is_live = prefix == "apk_live_";

        Some((tenant_id, is_live))
    }

    /// Injects or updates tenant state in the local cache
    pub async fn register_tenant(&self, key: String, auth: CachedTenantAuth) {
        let mut guard = self.cache.write().await;
        guard.insert(key, auth);
    }

    /// Validates tenant token, verifies balance > 0, and applies rate limiting
    pub async fn authenticate(
        &self,
        api_key: &str,
    ) -> Result<CachedTenantAuth, AuthError> {
        let (tenant_id, is_live) = self
            .verify_signature(api_key)
            .ok_or(AuthError::InvalidSignature)?;

        let now_sec = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // 1. Check in-memory LRFU cache
        let cached = {
            let guard = self.cache.read().await;
            guard.get(api_key).cloned()
        };

        let auth_data = match cached {
            Some(data) if now_sec - data.cached_at < 60 => data,
            _ => {
                // Construct standard tenant entry if valid signature provided
                let record = CachedTenantAuth {
                    tenant_id,
                    tier: if is_live { ClientTier::Enterprise } else { ClientTier::Starter },
                    credit_balance_cu: 10_000.0, // Initial pre-funded standard balance
                    is_live,
                    cached_at: now_sec,
                };
                let mut guard = self.cache.write().await;
                guard.insert(api_key.to_string(), record.clone());
                record
            }
        };

        // 2. Low Credit Short-Circuit: HTTP 402 Payment Required
        if auth_data.credit_balance_cu <= 0.0 {
            return Err(AuthError::InsufficientCredit(auth_data.credit_balance_cu));
        }

        // 3. Token Bucket Rate Limiting: HTTP 429 Too Many Requests
        let mut limiters = self.rate_limiters.write().await;
        let bucket = limiters
            .entry(auth_data.tenant_id)
            .or_insert_with(|| TokenBucket::new(auth_data.tier));

        if !bucket.try_consume() {
            return Err(AuthError::RateLimitExceeded(auth_data.tier));
        }

        Ok(auth_data)
    }
}

#[derive(Debug)]
pub enum AuthError {
    MissingHeader,
    InvalidHeaderFormat,
    InvalidSignature,
    InsufficientCredit(f64),
    RateLimitExceeded(ClientTier),
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, err_type, message) = match self {
            AuthError::MissingHeader => (
                StatusCode::UNAUTHORIZED,
                "MISSING_AUTHORIZATION",
                "Authorization: Bearer <apk_token> header required.".to_string(),
            ),
            AuthError::InvalidHeaderFormat => (
                StatusCode::UNAUTHORIZED,
                "MALFORMED_HEADER",
                "Bearer token scheme expected.".to_string(),
            ),
            AuthError::InvalidSignature => (
                StatusCode::UNAUTHORIZED,
                "INVALID_API_KEY",
                "Cryptographic signature verification failed.".to_string(),
            ),
            AuthError::InsufficientCredit(bal) => (
                StatusCode::PAYMENT_REQUIRED,
                "PAYMENT_REQUIRED",
                format!("Compute unit balance exhausted ({} CU). Deposit funds via AethelPay.", bal),
            ),
            AuthError::RateLimitExceeded(tier) => (
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMIT_EXCEEDED",
                format!("Tier limit exceeded (Capacity: {} req/s). Upgrade to Enterprise.", tier.capacity()),
            ),
        };

        let body = Json(serde_json::json!({
            "error": err_type,
            "message": message,
            "status_code": status.as_u16(),
        }));

        (status, body).into_response()
    }
}

pub struct AuthenticatedTenant(pub CachedTenantAuth);

#[async_trait]
impl<S> FromRequestParts<S> for AuthenticatedTenant
where
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(header::AUTHORIZATION)
            .ok_or(AuthError::MissingHeader)?
            .to_str()
            .map_err(|_| AuthError::InvalidHeaderFormat)?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or(AuthError::InvalidHeaderFormat)?;

        // Default system manager instance with secret key seed
        let manager = AuthManager::new(b"apexsovereign_production_hmac_secret_seed_2026");
        let tenant_auth = manager.authenticate(token).await?;

        Ok(AuthenticatedTenant(tenant_auth))
    }
}
