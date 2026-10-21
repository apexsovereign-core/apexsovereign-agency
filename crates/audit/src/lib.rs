//! ApexSovereign.ai - Autonomous Compliance & Cryptographic Audit Engine
//! Root Library (`crates/audit/src/lib.rs`)
//!
//! Exposes cryptographic Merkle root generators, continuous ledger invariance guards,
//! and institutional compliance attestation engines.

pub mod attestation;
pub mod invariance;
pub mod merkle;

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::info;
use uuid::Uuid;

pub use attestation::{
    AttestationEngine, ComplianceAttestationReceipt, ComplianceStandard, MerkleInclusionProof,
};
pub use invariance::{
    InvarianceAuditReport, InvarianceAuditor, InvarianceAuditorConfig,
};
pub use merkle::{
    CompleteMerkleTree, LedgerTransactionLeaf, MerkleRootGenerator, MerkleStateBlockReceipt,
};

/// High-level unified supervisor orchestrating all autonomous audit subsystems.
pub struct SovereignAuditSupervisor {
    pub auditor: Arc<InvarianceAuditor>,
    pub attestation_engine: Arc<AttestationEngine>,
    pub root_generator: Arc<MerkleRootGenerator>,
    pub is_running: Arc<RwLock<bool>>,
}

impl SovereignAuditSupervisor {
    /// Instantiates supervisor with production configuration defaults.
    pub fn new(
        auditor_config: InvarianceAuditorConfig,
        jurisdiction: Option<&str>,
    ) -> Self {
        let auditor = Arc::new(InvarianceAuditor::new(auditor_config, None));
        let attestation_engine = Arc::new(AttestationEngine::new(None, jurisdiction));
        let root_generator = Arc::new(MerkleRootGenerator::new(None));

        Self {
            auditor,
            attestation_engine,
            root_generator,
            is_running: Arc::new(RwLock::new(false)),
        }
    }

    /// Launches all autonomous audit background loops concurrently.
    pub async fn start(&self) {
        *self.is_running.write().await = true;
        info!("Sovereign Audit Supervisor engaged across all cryptographic subsystems.");

        let auditor_clone = Arc::clone(&self.auditor);
        tokio::spawn(async move {
            auditor_clone.run_daemon().await;
        });
    }

    /// Generates an on-demand verified compliance attestation block.
    pub async fn issue_ad_hoc_attestation(
        &self,
        standard: ComplianceStandard,
    ) -> Result<ComplianceAttestationReceipt, String> {
        let latest_report = self
            .auditor
            .get_latest_report()
            .await
            .ok_or_else(|| "No completed invariance audit report available".to_string())?;

        let block_receipt = self.root_generator.get_latest_block_receipt().await;
        let root_hash = block_receipt
            .map(|r| r.root_hash_hex)
            .unwrap_or_else(|| latest_report.state_checksum.clone());

        let receipt = self.attestation_engine.issue_attestation(
            latest_report.audit_id,
            standard,
            &root_hash,
            1,
            latest_report.entries_audited_count,
            latest_report.total_debits_cu,
            latest_report.is_invariance_preserved,
            365,
        );

        Ok(receipt)
    }
}
