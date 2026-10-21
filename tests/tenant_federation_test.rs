// ============================================================================
// ApexSovereign.ai - TENANT FEDERATION & CRYPTOGRAPHIC VERIFICATION INTEGRATION TEST
// File: tests/tenant_federation_test.rs
// Implements:
//   1. Asymmetric Ed25519 API key issuance and sub-millisecond edge verification.
//   2. Autonomous multi-tier tenant onboarding with isolated wallet generation.
//   3. O(1) in-memory revocation cache and tenant suspension enforcement.
//   4. Dynamic concurrent VCU quota check, reservation, and saturation shedding.
//   5. Cryptographic signature tamper detection with zero internal state leakage.
// ============================================================================

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use tenant_core::auth::{
        ApiKeyClaims, ApiKeyScope, AuthError, CryptographicKeyManager, SlaTier,
    };
    use tenant_core::onboarding::{
        AutonomousTenantOrchestrator, OnboardTenantRequest, CU_PER_USD,
    };
    use uuid::Uuid;

    #[tokio::test]
    async fn test_cryptographic_key_generation_and_ed25519_verification() {
        let key_mgr = Arc::new(CryptographicKeyManager::new_random());
        let tenant_id = Uuid::new_v4();
        let slug = "hyperion-compute";

        let (api_key, claims) = key_mgr
            .issue_api_key(
                tenant_id,
                slug,
                SlaTier::Enterprise,
                vec![ApiKeyScope::ComputeInference, ApiKeyScope::ClusterArbitrage],
                Some(90),
                Some("us-east-b200-nvlink".to_string()),
            )
            .expect("Failed to issue key");

        assert!(api_key.starts_with("sk_live_"));
        assert_eq!(claims.tenant_id, tenant_id);
        assert_eq!(claims.tier, SlaTier::Enterprise);
        assert_eq!(claims.rate_limit_tps, 2500);
        assert_eq!(claims.max_concurrent_vcu, 64);

        // Verification via Authorization header
        let auth_header = format!("Bearer {}", api_key);
        let session = key_mgr
            .validate_authorization_header(&auth_header, Some(ApiKeyScope::ComputeInference))
            .expect("Verification must succeed");

        assert_eq!(session.claims.tenant_slug, slug);
        assert_eq!(session.claims.tier, SlaTier::Enterprise);

        // Verify scope enforcement: requesting an unauthorized scope should fail
        let unauthorized_result = key_mgr.validate_authorization_header(
            &auth_header,
            Some(ApiKeyScope::TenantAdmin),
        );
        match unauthorized_result {
            Err(AuthError::InsufficientScope { required, .. }) => {
                assert_eq!(required, "tenant:admin");
            }
            other => panic!("Expected InsufficientScope, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_tampered_key_and_signature_rejection() {
        let key_mgr = Arc::new(CryptographicKeyManager::new_random());
        let tenant_id = Uuid::new_v4();

        let (api_key, _) = key_mgr
            .issue_api_key(
                tenant_id,
                "tamper-target",
                SlaTier::Standard,
                vec![ApiKeyScope::ComputeInference],
                Some(30),
                None,
            )
            .expect("Key issuance failed");

        // Mutate a single character in the payload section of the token
        let mut tampered_bytes = api_key.into_bytes();
        let split_pos = tampered_bytes.iter().position(|&b| b == b'.').unwrap();
        // Flip a byte in the payload
        tampered_bytes[split_pos - 1] = if tampered_bytes[split_pos - 1] == b'a' { b'b' } else { b'a' };
        let tampered_key = String::from_utf8(tampered_bytes).unwrap();

        let verify_result = key_mgr.verify_api_key(&tampered_key, None);
        assert!(
            matches!(verify_result, Err(AuthError::InvalidSignature) | Err(AuthError::DecodeError(_))),
            "Tampered token must be strictly rejected at the edge"
        );
    }

    #[tokio::test]
    async fn test_in_memory_key_revocation() {
        let key_mgr = Arc::new(CryptographicKeyManager::new_random());
        let tenant_id = Uuid::new_v4();

        let (api_key, claims) = key_mgr
            .issue_api_key(
                tenant_id,
                "revocation-target",
                SlaTier::Professional,
                vec![ApiKeyScope::ComputeInference],
                Some(30),
                None,
            )
            .expect("Key issuance failed");

        // First verification succeeds
        assert!(key_mgr.verify_api_key(&api_key, None).is_ok());

        // Revoke the key by ID
        key_mgr.revoke_key(claims.key_id);
        assert!(key_mgr.is_key_revoked(&claims.key_id));

        // Subsequent verification must fail instantaneously in O(1) time
        let verify_result = key_mgr.verify_api_key(&api_key, None);
        assert!(
            matches!(verify_result, Err(AuthError::TokenRevoked)),
            "Revoked key must be immediately rejected"
        );
    }

    #[tokio::test]
    async fn test_tenant_blacklisting() {
        let key_mgr = Arc::new(CryptographicKeyManager::new_random());
        let tenant_id = Uuid::new_v4();

        let (api_key, claims) = key_mgr
            .issue_api_key(
                tenant_id,
                "blacklisted-org",
                SlaTier::Enterprise,
                vec![ApiKeyScope::ComputeInference],
                Some(30),
                None,
            )
            .expect("Key issuance failed");

        assert!(key_mgr.verify_api_key(&api_key, None).is_ok());

        // Blacklist entire tenant
        key_mgr.blacklist_tenant(claims.tenant_id);

        let verify_result = key_mgr.verify_api_key(&api_key, None);
        assert!(
            matches!(verify_result, Err(AuthError::TenantSuspended(_))),
            "Suspended tenant must be rejected"
        );

        // Lift blacklist
        key_mgr.unblacklist_tenant(&claims.tenant_id);
        assert!(key_mgr.verify_api_key(&api_key, None).is_ok());
    }

    #[tokio::test]
    async fn test_autonomous_tenant_onboarding_and_quota_arbitration() {
        let key_mgr = Arc::new(CryptographicKeyManager::new_random());
        let orchestrator = AutonomousTenantOrchestrator::new(key_mgr.clone());

        // 1. Onboard Enterprise Tenant
        let ent_req = OnboardTenantRequest {
            name: "Neural Nexus Global".to_string(),
            slug: Some("neural-nexus".to_string()),
            email: "ops@neuralnexus.com".to_string(),
            tier: SlaTier::Enterprise,
            initial_credits_usd: 5000.0,
            custom_tps_limit: None,
            custom_max_vcu: None,
            cluster_affinity: Some("b200-nvlink-us-central".to_string()),
        };

        let ent_profile = orchestrator
            .onboard_tenant(ent_req)
            .await
            .expect("Onboarding must succeed");

        assert_eq!(ent_profile.slug, "neural-nexus");
        assert_eq!(ent_profile.tier, SlaTier::Enterprise);
        assert_eq!(ent_profile.initial_balance_cu, 5000.0 * CU_PER_USD);
        assert_eq!(ent_profile.max_concurrent_vcu, 64);
        assert_eq!(ent_profile.rate_limit_tps, 2500);

        // 2. Validate Root API Key
        let verify_res = key_mgr.verify_api_key(&ent_profile.primary_api_key, None);
        assert!(verify_res.is_ok());

        // 3. Test dynamic VCU quota reservations
        let reserve1 = orchestrator
            .check_and_reserve_quota(ent_profile.tenant_id, 32)
            .expect("Quota check failed");
        assert!(reserve1.allowed);
        assert_eq!(reserve1.active_vcu, 32);
        assert_eq!(reserve1.remaining_vcu, 32);

        let reserve2 = orchestrator
            .check_and_reserve_quota(ent_profile.tenant_id, 32)
            .expect("Quota check failed");
        assert!(reserve2.allowed);
        assert_eq!(reserve2.active_vcu, 64);
        assert_eq!(reserve2.remaining_vcu, 0);

        // Attempting to reserve additional VCU beyond ceiling must be rejected
        let reserve_overflow = orchestrator
            .check_and_reserve_quota(ent_profile.tenant_id, 4)
            .expect("Quota check failed");
        assert!(!reserve_overflow.allowed);
        assert!(reserve_overflow.reason.is_some());

        // Release 16 VCUs and re-verify capacity
        orchestrator.release_vcu(ent_profile.tenant_id, 16);
        let reserve_post_release = orchestrator
            .check_and_reserve_quota(ent_profile.tenant_id, 8)
            .expect("Quota check failed");
        assert!(reserve_post_release.allowed);
        assert_eq!(reserve_post_release.active_vcu, 56);
    }
}
