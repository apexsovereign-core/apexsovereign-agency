//! ApexSovereign.ai - Autonomous Compliance & Cryptographic Audit Engine
//! Module 3: Compliance Proof & Attestation Engine (`crates/audit/src/attestation.rs`)
//!
//! Provides cryptographically signed compliance attestations and zero-knowledge/Merkle inclusion
//! verification proofs for institutional auditing (SOC 2 Type II, ISO 27001, FedRAMP High, Sovereign Ledger).

use std::sync::Arc;
use chrono::{DateTime, Duration, Utc};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use ring::digest::{Context, SHA256};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};
use uuid::Uuid;

use crate::merkle::{CompleteMerkleTree, LedgerTransactionLeaf};

/// Recognized compliance and governance standards supported by the attestation engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ComplianceStandard {
    Soc2TypeIi,
    Iso27001,
    FedrampHigh,
    GdprFinancialArt32,
    SovereignLedgerConsensus,
}

impl std::fmt::Display for ComplianceStandard {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Soc2TypeIi => write!(f, "SOC_2_TYPE_II"),
            Self::Iso27001 => write!(f, "ISO_27001"),
            Self::FedrampHigh => write!(f, "FEDRAMP_HIGH"),
            Self::GdprFinancialArt32 => write!(f, "GDPR_FINANCIAL_ART32"),
            Self::SovereignLedgerConsensus => write!(f, "SOVEREIGN_LEDGER_CONSENSUS"),
        }
    }
}

/// Sibling node in a Merkle inclusion proof.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MerkleProofNode {
    pub is_right_sibling: bool,
    pub sibling_hash_hex: String,
}

/// Cryptographic Merkle inclusion proof for a single ledger transaction.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MerkleInclusionProof {
    pub leaf_tx_id: String,
    pub leaf_hash_hex: String,
    pub root_hash_hex: String,
    pub path: Vec<MerkleProofNode>,
}

/// Signed compliance attestation receipt issued to institutional auditors.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceAttestationReceipt {
    pub receipt_id: Uuid,
    pub audit_id: Uuid,
    pub compliance_standard: ComplianceStandard,
    pub merkle_state_root: String,
    pub transaction_block_index: u64,
    pub transaction_count: usize,
    pub total_volume_cu: f64,
    pub invariance_preserved: bool,
    pub issued_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub auditor_jurisdiction: String,
    pub signer_public_key_hex: String,
    pub signature_hex: String,
}

/// Core attestation engine handling cryptographic key pairs and proof generation.
pub struct AttestationEngine {
    signing_key: SigningKey,
    verifying_key: VerifyingKey,
    auditor_jurisdiction: String,
}

impl AttestationEngine {
    /// Initializes the engine with an ephemeral or pre-configured Ed25519 signing key.
    pub fn new(signing_key_bytes: Option<&[u8; 32]>, jurisdiction: Option<&str>) -> Self {
        let signing_key = match signing_key_bytes {
            Some(bytes) => SigningKey::from_bytes(bytes),
            None => {
                let mut rng = rand::rngs::OsRng;
                SigningKey::generate(&mut rng)
            }
        };
        let verifying_key = signing_key.verifying_key();
        let auditor_jurisdiction = jurisdiction.unwrap_or("ApexSovereign Sovereign Autonomous Trust (Global)").to_string();

        Self {
            signing_key,
            verifying_key,
            auditor_jurisdiction,
        }
    }

    /// Returns the public key of the attestation signer in hex format.
    pub fn public_key_hex(&self) -> String {
        hex::encode(self.verifying_key.as_bytes())
    }

    /// Constructs and cryptographically signs a compliance attestation receipt.
    pub fn issue_attestation(
        &self,
        audit_id: Uuid,
        standard: ComplianceStandard,
        merkle_state_root: &str,
        transaction_block_index: u64,
        transaction_count: usize,
        total_volume_cu: f64,
        invariance_preserved: bool,
        validity_days: i64,
    ) -> ComplianceAttestationReceipt {
        let receipt_id = Uuid::new_v4();
        let issued_at = Utc::now();
        let expires_at = issued_at + Duration::days(validity_days);

        // Construct canonical message representation for signature
        let canonical_bytes = Self::canonical_payload_bytes(
            &receipt_id,
            &audit_id,
            standard,
            merkle_state_root,
            transaction_block_index,
            transaction_count,
            total_volume_cu,
            invariance_preserved,
            &issued_at,
            &expires_at,
        );

        let signature = self.signing_key.sign(&canonical_bytes);
        let signature_hex = hex::encode(signature.to_bytes());
        let signer_public_key_hex = self.public_key_hex();

        ComplianceAttestationReceipt {
            receipt_id,
            audit_id,
            compliance_standard: standard,
            merkle_state_root: merkle_state_root.to_string(),
            transaction_block_index,
            transaction_count,
            total_volume_cu,
            invariance_preserved,
            issued_at,
            expires_at,
            auditor_jurisdiction: self.auditor_jurisdiction.clone(),
            signer_public_key_hex,
            signature_hex,
        }
    }

    /// Verifies the Ed25519 digital signature of an attestation receipt.
    pub fn verify_receipt_signature(receipt: &ComplianceAttestationReceipt) -> bool {
        let public_key_bytes = match hex::decode(&receipt.signer_public_key_hex) {
            Ok(bytes) => bytes,
            Err(_) => return false,
        };

        if public_key_bytes.len() != 32 {
            return false;
        }

        let mut key_arr = [0u8; 32];
        key_arr.copy_from_slice(&public_key_bytes);
        let verifying_key = match VerifyingKey::from_bytes(&key_arr) {
            Ok(vk) => vk,
            Err(_) => return false,
        };

        let signature_bytes = match hex::decode(&receipt.signature_hex) {
            Ok(bytes) => bytes,
            Err(_) => return false,
        };

        if signature_bytes.len() != 64 {
            return false;
        }

        let mut sig_arr = [0u8; 64];
        sig_arr.copy_from_slice(&signature_bytes);
        let signature = Signature::from_bytes(&sig_arr);

        let canonical_bytes = Self::canonical_payload_bytes(
            &receipt.receipt_id,
            &receipt.audit_id,
            receipt.compliance_standard,
            &receipt.merkle_state_root,
            receipt.transaction_block_index,
            receipt.transaction_count,
            receipt.total_volume_cu,
            receipt.invariance_preserved,
            &receipt.issued_at,
            &receipt.expires_at,
        );

        verifying_key.verify_strict(&canonical_bytes, &signature).is_ok()
    }

    /// Generates a Merkle inclusion proof for a target leaf index in a tree.
    pub fn generate_inclusion_proof(
        tree: &CompleteMerkleTree,
        leaf_index: usize,
        leaf_tx_id: &str,
    ) -> Result<MerkleInclusionProof, String> {
        if leaf_index >= tree.leaves.len() {
            return Err("Leaf index out of bounds".to_string());
        }

        let mut path = Vec::new();
        let mut idx = leaf_index;

        for level in &tree.levels[..tree.levels.len().saturating_sub(1)] {
            let is_right_sibling = idx % 2 == 0;
            let sibling_idx = if is_right_sibling { idx + 1 } else { idx - 1 };

            if sibling_idx < level.len() {
                path.push(MerkleProofNode {
                    is_right_sibling,
                    sibling_hash_hex: hex::encode(&level[sibling_idx]),
                });
            } else {
                // If odd leaf without right pair, RFC 6962 rule: parent duplicates single child
                path.push(MerkleProofNode {
                    is_right_sibling,
                    sibling_hash_hex: hex::encode(&level[idx]),
                });
            }

            idx /= 2;
        }

        Ok(MerkleInclusionProof {
            leaf_tx_id: leaf_tx_id.to_string(),
            leaf_hash_hex: hex::encode(&tree.leaves[leaf_index]),
            root_hash_hex: hex::encode(&tree.root),
            path,
        })
    }

    /// Cryptographically verifies a Merkle inclusion proof against an expected state root.
    pub fn verify_inclusion_proof(proof: &MerkleInclusionProof, leaf_bytes: &[u8]) -> bool {
        let computed_leaf_hash = {
            let mut ctx = Context::new(&SHA256);
            ctx.update(leaf_bytes);
            ctx.finish().as_ref().to_vec()
        };

        // If proof supplies raw leaf hash directly, ensure it matches
        if let Ok(expected_leaf_hash) = hex::decode(&proof.leaf_hash_hex) {
            if computed_leaf_hash != expected_leaf_hash {
                return false;
            }
        }

        let mut current_hash = computed_leaf_hash;

        for node in &proof.path {
            let sibling_bytes = match hex::decode(&node.sibling_hash_hex) {
                Ok(b) => b,
                Err(_) => return false,
            };

            let mut ctx = Context::new(&SHA256);
            ctx.update(&[0x01]); // Domain separation for internal nodes

            if node.is_right_sibling {
                ctx.update(&current_hash);
                ctx.update(&sibling_bytes);
            } else {
                ctx.update(&sibling_bytes);
                ctx.update(&current_hash);
            }

            current_hash = ctx.finish().as_ref().to_vec();
        }

        hex::encode(current_hash) == proof.root_hash_hex
    }

    /// Internal serialization helper to guarantee deterministic bytes across all platforms.
    fn canonical_payload_bytes(
        receipt_id: &Uuid,
        audit_id: &Uuid,
        standard: ComplianceStandard,
        merkle_state_root: &str,
        block_idx: u64,
        tx_count: usize,
        total_volume: f64,
        invariance_preserved: bool,
        issued_at: &DateTime<Utc>,
        expires_at: &DateTime<Utc>,
    ) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"APEXSOVEREIGN_COMPLIANCE_ATTESTATION_V1:");
        bytes.extend_from_slice(receipt_id.as_bytes());
        bytes.extend_from_slice(audit_id.as_bytes());
        bytes.extend_from_slice(standard.to_string().as_bytes());
        bytes.extend_from_slice(merkle_state_root.as_bytes());
        bytes.extend_from_slice(&block_idx.to_be_bytes());
        bytes.extend_from_slice(&(tx_count as u64).to_be_bytes());
        bytes.extend_from_slice(&total_volume.to_be_bytes());
        bytes.push(if invariance_preserved { 1 } else { 0 });
        bytes.extend_from_slice(&issued_at.timestamp_millis().to_be_bytes());
        bytes.extend_from_slice(&expires_at.timestamp_millis().to_be_bytes());
        bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_issue_and_verify_compliance_receipt() {
        let engine = AttestationEngine::new(None, Some("Sovereign Audit Zone A"));
        let receipt = engine.issue_attestation(
            Uuid::new_v4(),
            ComplianceStandard::Soc2TypeIi,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            104,
            1500,
            245000.50,
            true,
            365,
        );

        assert!(AttestationEngine::verify_receipt_signature(&receipt));
    }

    #[test]
    fn test_tampered_receipt_fails_verification() {
        let engine = AttestationEngine::new(None, None);
        let mut receipt = engine.issue_attestation(
            Uuid::new_v4(),
            ComplianceStandard::Iso27001,
            "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
            10,
            50,
            1200.0,
            true,
            90,
        );

        // Tamper with volume
        receipt.total_volume_cu += 1.0;
        assert!(!AttestationEngine::verify_receipt_signature(&receipt));
    }
}
