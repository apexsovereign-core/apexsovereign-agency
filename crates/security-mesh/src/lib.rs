//! ApexSovereign Zero-Trust Mutual TLS (mTLS) Security Mesh
//!
//! Provides automated X.509 Certificate Authority issuance, 24-hour leaf rotation,
//! Axum / Tower mTLS verification middleware, and connection-pooled RPC clients.

pub mod ca;
pub mod client;
pub mod middleware;

pub use ca::{
    CaError, CertificateBundle, CertificateRotationManager, RootCertificateAuthority,
    DEFAULT_LEAF_TTL_HOURS, MESH_INTERNAL_DOMAIN_SUFFIX,
};
pub use client::{MeshClientError, MeshRpcClient};
pub use middleware::{
    MtlsEnforcementLayer, MtlsEnforcementService, VerifiedIdentity, VerifiedMeshIdentity,
    HEADER_CLIENT_CERT_FINGERPRINT, HEADER_CLIENT_CERT_SAN, HEADER_MESH_SERVICE_ID,
    HEADER_MESH_TENANT_CONTEXT, HEADER_MTLS_VERIFIED,
};
