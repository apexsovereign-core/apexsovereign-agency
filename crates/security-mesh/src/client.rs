//! Zero-Trust Mutual TLS Inter-Service RPC Client
//!
//! Provides connection-pooled, cryptographic inter-service communication with
//! dynamic certificate reloading from the rotation watch channel, automatic
//! header injection, and resilient error recovery.

use std::sync::Arc;
use std::time::Duration;
use reqwest::{header::{HeaderMap, HeaderValue}, Client, ClientBuilder, Response};
use serde::{de::DeserializeOwned, Serialize};
use thiserror::Error;
use tokio::sync::{watch, RwLock};
use tracing::{debug, error, info};

use crate::ca::CertificateBundle;
use crate::middleware::{
    HEADER_CLIENT_CERT_FINGERPRINT, HEADER_CLIENT_CERT_SAN, HEADER_MESH_SERVICE_ID,
    HEADER_MESH_TENANT_CONTEXT, HEADER_MTLS_VERIFIED,
};

#[derive(Error, Debug)]
pub enum MeshClientError {
    #[error("Network / HTTP request error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Zero-trust authentication rejected with status {status}: {body}")]
    AuthRejected { status: u16, body: String },

    #[error("TLS configuration / certificate reload error: {0}")]
    TlsConfigError(String),

    #[error("Serialization / deserialization failure: {0}")]
    SerializationError(#[from] serde_json::Error),
}

/// Dynamic zero-trust inter-service RPC client with automated certificate reloading.
pub struct MeshRpcClient {
    service_id: String,
    san: String,
    base_url: String,
    rotation_rx: watch::Receiver<Arc<CertificateBundle>>,
    cached_bundle: Arc<RwLock<Arc<CertificateBundle>>>,
    http_client: Arc<RwLock<Client>>,
}

impl MeshRpcClient {
    /// Constructs a new zero-trust RPC client subscribed to certificate rotations.
    pub fn new(
        service_id: &str,
        base_url: &str,
        rotation_rx: watch::Receiver<Arc<CertificateBundle>>,
    ) -> Result<Self, MeshClientError> {
        let initial_bundle = rotation_rx.borrow().clone();

        let client = Self::build_http_client(&initial_bundle)?;

        Ok(Self {
            service_id: service_id.to_string(),
            san: initial_bundle.san.clone(),
            base_url: base_url.trim_end_matches('/').to_string(),
            rotation_rx,
            cached_bundle: Arc::new(RwLock::new(initial_bundle)),
            http_client: Arc::new(RwLock::new(client)),
        })
    }

    /// Builds a connection-pooled reqwest client configured with zero-trust headers and timeouts.
    fn build_http_client(bundle: &CertificateBundle) -> Result<Client, MeshClientError> {
        let mut default_headers = HeaderMap::new();

        default_headers.insert(
            HEADER_MTLS_VERIFIED,
            HeaderValue::from_static("true"),
        );
        default_headers.insert(
            HEADER_MESH_SERVICE_ID,
            HeaderValue::from_str(&bundle.service_id)
                .map_err(|e| MeshClientError::TlsConfigError(e.to_string()))?,
        );
        default_headers.insert(
            HEADER_CLIENT_CERT_SAN,
            HeaderValue::from_str(&bundle.san)
                .map_err(|e| MeshClientError::TlsConfigError(e.to_string()))?,
        );
        default_headers.insert(
            HEADER_CLIENT_CERT_FINGERPRINT,
            HeaderValue::from_str(&bundle.serial_number)
                .map_err(|e| MeshClientError::TlsConfigError(e.to_string()))?,
        );

        let client = ClientBuilder::new()
            .default_headers(default_headers)
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(32)
            .timeout(Duration::from_secs(10))
            .connect_timeout(Duration::from_secs(2))
            .build()
            .map_err(MeshClientError::Http)?;

        Ok(client)
    }

    /// Checks if a newer certificate is available from the rotation channel and reloads the client.
    pub async fn check_and_reload_certificate(&self) -> Result<bool, MeshClientError> {
        let latest = self.rotation_rx.borrow().clone();
        let mut cached_guard = self.cached_bundle.write().await;

        if latest.serial_number != cached_guard.serial_number {
            info!(
                old_serial = %cached_guard.serial_number,
                new_serial = %latest.serial_number,
                "Reloading mTLS client with newly rotated certificate"
            );

            let new_client = Self::build_http_client(&latest)?;
            let mut client_guard = self.http_client.write().await;
            *client_guard = new_client;
            *cached_guard = latest;
            return Ok(true);
        }

        Ok(false)
    }

    /// Dispatches an end-to-end authenticated JSON RPC POST request to a peer mesh service.
    pub async fn post_json<T: Serialize, R: DeserializeOwned>(
        &self,
        endpoint: &str,
        tenant_id: Option<&str>,
        payload: &T,
    ) -> Result<R, MeshClientError> {
        // Opportunistically verify certificate freshness before executing dispatch
        let _ = self.check_and_reload_certificate().await;

        let full_url = format!("{}/{}", self.base_url, endpoint.trim_start_matches('/'));
        let client = self.http_client.read().await.clone();

        let mut req_builder = client.post(&full_url).json(payload);

        if let Some(tid) = tenant_id {
            req_builder = req_builder.header(HEADER_MESH_TENANT_CONTEXT, tid);
        }

        let resp: Response = req_builder.send().await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            error!(
                status = status,
                endpoint = %endpoint,
                "Inter-service zero-trust RPC request rejected"
            );
            return Err(MeshClientError::AuthRejected { status, body });
        }

        let result = resp.json::<R>().await?;
        debug!(endpoint = %endpoint, "RPC dispatch completed successfully");
        Ok(result)
    }

    /// Dispatches an authenticated GET request to a peer mesh service.
    pub async fn get_json<R: DeserializeOwned>(
        &self,
        endpoint: &str,
        tenant_id: Option<&str>,
    ) -> Result<R, MeshClientError> {
        let _ = self.check_and_reload_certificate().await;

        let full_url = format!("{}/{}", self.base_url, endpoint.trim_start_matches('/'));
        let client = self.http_client.read().await.clone();

        let mut req_builder = client.get(&full_url);

        if let Some(tid) = tenant_id {
            req_builder = req_builder.header(HEADER_MESH_TENANT_CONTEXT, tid);
        }

        let resp = req_builder.send().await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(MeshClientError::AuthRejected { status, body });
        }

        let result = resp.json::<R>().await?;
        Ok(result)
    }
}
