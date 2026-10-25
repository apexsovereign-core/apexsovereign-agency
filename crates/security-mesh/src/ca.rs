//! Automated In-Memory X.509 Certificate Authority & Zero-Trust Leaf Signer
//!
//! Provides automated cryptographic issuance of short-lived (24-hour TTL) service identity
//! certificates, SAN validation restricted to `*.internal.apexsovereign.ai`, and zero-downtime
//! background rotation channels via Tokio watch broadcast streams.

use std::sync::Arc;
use std::time::Duration;
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use rcgen::{
    BasicConstraints, Certificate, CertificateParams, DistinguishedName, DnType,
    IsCa, KeyPair, KeyUsagePurpose, SanType,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::watch;
use tracing::{error, info, warn};

pub const MESH_INTERNAL_DOMAIN_SUFFIX: &str = ".internal.apexsovereign.ai";
pub const DEFAULT_LEAF_TTL_HOURS: i64 = 24;
pub const ROTATION_BUFFER_FRACTION: f64 = 0.5; // Rotate when 50% of validity expires

#[derive(Error, Debug)]
pub enum CaError {
    #[error("Failed to generate cryptographic key pair: {0}")]
    KeyGenerationFailed(String),

    #[error("Failed to issue X.509 certificate: {0}")]
    CertificateIssuanceFailed(String),

    #[error("Invalid Subject Alternative Name '{0}': must end with '{1}'")]
    InvalidSanPattern(String, String),

    #[error("Certificate serialization error: {0}")]
    SerializationError(String),

    #[error("Clock or time conversion error: {0}")]
    TimeError(String),
}

/// In-memory active certificate bundle containing the certificate chain and private key.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CertificateBundle {
    pub service_id: String,
    pub san: String,
    pub cert_pem: String,
    pub key_pem: String,
    pub ca_cert_pem: String,
    pub issued_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub serial_number: String,
}

impl CertificateBundle {
    /// Checks whether the certificate is within its valid operational lifespan.
    pub fn is_valid_now(&self) -> bool {
        let now = Utc::now();
        now >= self.issued_at && now < self.expires_at
    }

    /// Calculates remaining seconds before expiration.
    pub fn remaining_seconds(&self) -> i64 {
        let now = Utc::now();
        (self.expires_at - now).num_seconds().max(0)
    }
}

/// Root Certificate Authority for ApexSovereign Zero-Trust Service Mesh.
pub struct RootCertificateAuthority {
    pub ca_cert_pem: String,
    pub ca_cert_der: Vec<u8>,
    ca_key_pair: Arc<KeyPair>,
    ca_params: CertificateParams,
}

impl RootCertificateAuthority {
    /// Generates a new in-memory self-signed Root CA.
    pub fn new(org_name: &str, common_name: &str, validity_days: u32) -> Result<Self, CaError> {
        let mut params = CertificateParams::default();
        let mut dn = DistinguishedName::new();
        dn.push(DnType::OrganizationName, org_name);
        dn.push(DnType::OrganizationalUnitName, "ApexSovereign Security Mesh");
        dn.push(DnType::CommonName, common_name);
        dn.push(DnType::CountryName, "CH");

        params.distinguished_name = dn;
        params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        params.key_usages = vec![
            KeyUsagePurpose::KeyCertSign,
            KeyUsagePurpose::CrlSign,
            KeyUsagePurpose::DigitalSignature,
        ];

        let not_before = Utc::now();
        let not_after = not_before + ChronoDuration::days(validity_days as i64);

        params.not_before = not_before.into();
        params.not_after = not_after.into();

        let key_pair = KeyPair::generate()
            .map_err(|e| CaError::KeyGenerationFailed(e.to_string()))?;

        let ca_cert = params
            .self_signed(&key_pair)
            .map_err(|e| CaError::CertificateIssuanceFailed(e.to_string()))?;

        let ca_cert_pem = ca_cert.pem();
        let ca_cert_der = ca_cert.der().to_vec();

        info!(
            common_name = %common_name,
            valid_days = validity_days,
            "Initialized in-memory Root Certificate Authority for zero-trust mesh"
        );

        Ok(Self {
            ca_cert_pem,
            ca_cert_der,
            ca_key_pair: Arc::new(key_pair),
            ca_params: params,
        })
    }

    /// Validates that the requested SAN belongs strictly to the internal mesh namespace.
    pub fn validate_san(&self, san: &str) -> Result<(), CaError> {
        if !san.ends_with(MESH_INTERNAL_DOMAIN_SUFFIX) && san != "localhost" {
            return Err(CaError::InvalidSanPattern(
                san.to_string(),
                MESH_INTERNAL_DOMAIN_SUFFIX.to_string(),
            ));
        }
        Ok(())
    }

    /// Issues a short-lived (24-hour default) leaf X.509 certificate for a service identity.
    pub fn issue_leaf_certificate(
        &self,
        service_id: &str,
        san: &str,
        ttl_hours: i64,
    ) -> Result<CertificateBundle, CaError> {
        self.validate_san(san)?;

        let mut params = CertificateParams::default();
        let mut dn = DistinguishedName::new();
        dn.push(DnType::OrganizationName, "ApexSovereign Holdings");
        dn.push(DnType::OrganizationalUnitName, "Autonomous Mesh Workload");
        dn.push(DnType::CommonName, service_id);
        params.distinguished_name = dn;

        params.subject_alt_names = vec![
            SanType::DnsName(san.to_string()),
            SanType::DnsName(format!("{}.internal.apexsovereign.ai", service_id)),
        ];

        params.is_ca = IsCa::ExplicitNoCa;
        params.key_usages = vec![
            KeyUsagePurpose::DigitalSignature,
            KeyUsagePurpose::KeyEncipherment,
        ];

        let not_before = Utc::now();
        let not_after = not_before + ChronoDuration::hours(ttl_hours);

        params.not_before = not_before.into();
        params.not_after = not_after.into();

        let leaf_key_pair = KeyPair::generate()
            .map_err(|e| CaError::KeyGenerationFailed(e.to_string()))?;

        // Re-construct CA cert context for signing
        let ca_cert = self
            .ca_params
            .self_signed(&self.ca_key_pair)
            .map_err(|e| CaError::CertificateIssuanceFailed(e.to_string()))?;

        let signed_leaf = params
            .signed_by(&leaf_key_pair, &ca_cert, &self.ca_key_pair)
            .map_err(|e| CaError::CertificateIssuanceFailed(e.to_string()))?;

        let bundle = CertificateBundle {
            service_id: service_id.to_string(),
            san: san.to_string(),
            cert_pem: signed_leaf.pem(),
            key_pem: leaf_key_pair.serialize_pem(),
            ca_cert_pem: self.ca_cert_pem.clone(),
            issued_at: not_before,
            expires_at: not_after,
            serial_number: uuid::Uuid::new_v4().to_string(),
        };

        info!(
            service_id = %service_id,
            san = %san,
            serial = %bundle.serial_number,
            ttl_hours = ttl_hours,
            "Signed sovereign leaf x509 certificate"
        );

        Ok(bundle)
    }
}

/// Automated Background Certificate Rotation Manager.
/// Uses a Tokio watch broadcast channel to rotate short-lived certificates seamlessly
/// without terminating active TLS handshakes or restarting servers.
pub struct CertificateRotationManager {
    ca: Arc<RootCertificateAuthority>,
    service_id: String,
    san: String,
    ttl_hours: i64,
    tx: watch::Sender<Arc<CertificateBundle>>,
    rx: watch::Receiver<Arc<CertificateBundle>>,
}

impl CertificateRotationManager {
    /// Initializes rotation manager and issues the genesis leaf certificate.
    pub fn new(
        ca: Arc<RootCertificateAuthority>,
        service_id: &str,
        san: &str,
        ttl_hours: i64,
    ) -> Result<Self, CaError> {
        let initial_cert = ca.issue_leaf_certificate(service_id, san, ttl_hours)?;
        let initial_arc = Arc::new(initial_cert);
        let (tx, rx) = watch::channel(initial_arc);

        Ok(Self {
            ca,
            service_id: service_id.to_string(),
            san: san.to_string(),
            ttl_hours,
            tx,
            rx,
        })
    }

    /// Obtains a subscriber receiver for the current and future rotated certificates.
    pub fn subscribe(&self) -> watch::Receiver<Arc<CertificateBundle>> {
        self.rx.clone()
    }

    /// Returns the currently active certificate bundle.
    pub fn current_bundle(&self) -> Arc<CertificateBundle> {
        self.rx.borrow().clone()
    }

    /// Starts the background rotation loop in a Tokio task.
    pub fn start_rotation_loop(self: Arc<Self>) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            info!(
                service = %self.service_id,
                san = %self.san,
                "Started automated X.509 rotation daemon"
            );

            loop {
                let current = self.current_bundle();
                let remaining_secs = current.remaining_seconds();
                let total_lifetime_secs = (self.ttl_hours * 3600) as f64;
                let sleep_secs = ((remaining_secs as f64) * ROTATION_BUFFER_FRACTION).max(5.0);

                tokio::time::sleep(Duration::from_secs(sleep_secs as u64)).await;

                info!(
                    service = %self.service_id,
                    remaining_secs = remaining_secs,
                    "Rotating short-lived x509 leaf certificate"
                );

                match self.ca.issue_leaf_certificate(
                    &self.service_id,
                    &self.san,
                    self.ttl_hours,
                ) {
                    Ok(new_bundle) => {
                        let new_arc = Arc::new(new_bundle);
                        if let Err(e) = self.tx.send(new_arc) {
                            warn!("No active receivers listening to certificate rotation: {}", e);
                        } else {
                            info!(
                                service = %self.service_id,
                                "Successfully published refreshed certificate bundle via watch channel"
                            );
                        }
                    }
                    Err(e) => {
                        error!(
                            service = %self.service_id,
                            error = %e,
                            "Failed to issue rotated certificate, retrying next cycle"
                        );
                    }
                }
            }
        })
    }
}
