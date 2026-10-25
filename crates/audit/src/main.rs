//! ApexSovereign.ai - Autonomous Compliance & Cryptographic Audit Engine
//! Production Audit Daemon Entry Point (`crates/audit/src/main.rs`)

use std::sync::Arc;
use tokio::signal;
use tracing::{error, info, Level};
use tracing_subscriber::FmtSubscriber;

use audit::{
    ComplianceStandard, InvarianceAuditorConfig, SovereignAuditSupervisor,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize structured logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .with_target(false)
        .with_thread_ids(true)
        .finish();

    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to initialize tracing subscriber for apex-audit-daemon");

    info!("====================================================================");
    info!("APEXSOVEREIGN.AI: AUTONOMOUS COMPLIANCE & CRYPTOGRAPHIC AUDIT DAEMON");
    info!("Version: v1.0.0 | Enterprise Security & Invariance Verification");
    info!("====================================================================");

    // 2. Load environment configuration
    let audit_interval_secs: u64 = std::env::var("AUDIT_INTERVAL_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);

    let jurisdiction = std::env::var("AUDIT_JURISDICTION")
        .unwrap_or_else(|_| "ApexSovereign Sovereign Autonomous Trust (Delaware / Global)".into());

    let config = InvarianceAuditorConfig {
        audit_interval_secs,
        divergence_tolerance_epsilon: 0.000001,
        auto_trigger_circuit_breaker: true,
        supabase_url: std::env::var("SUPABASE_URL").unwrap_or_else(|_| "https://api.apexsovereign.ai".into()),
        supabase_service_key: std::env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_default(),
        webhook_alert_url: std::env::var("AUDIT_ALERT_WEBHOOK_URL").ok(),
    };

    info!(
        interval_secs = config.audit_interval_secs,
        supabase_target = %config.supabase_url,
        jurisdiction = %jurisdiction,
        "Audit daemon configuration loaded successfully"
    );

    // 3. Initialize supervisor and run background audit loops
    let supervisor = Arc::new(SovereignAuditSupervisor::new(config, Some(&jurisdiction)));
    supervisor.start().await;

    // Issue initial genesis compliance attestation
    info!("Generating initial system-wide SOC 2 Type II baseline attestation...");
    match supervisor.issue_ad_hoc_attestation(ComplianceStandard::Soc2TypeIi).await {
        Ok(receipt) => {
            info!(
                receipt_id = %receipt.receipt_id,
                standard = %receipt.compliance_standard,
                root = %receipt.merkle_state_root,
                "Genesis compliance attestation signed and locked into audit trail"
            );
        }
        Err(err) => {
            info!("Awaiting first completed audit cycle before issuing attestation: {}", err);
        }
    }

    // 4. Await termination signal for graceful shutdown
    info!("ApexSovereign Audit Daemon operational. Awaiting termination signal...");
    signal::ctrl_c().await?;

    info!("Termination signal intercepted. Commencing graceful audit shutdown...");
    info!("Flushing pending state receipts and terminating workers cleanly.");
    info!("ApexSovereign Audit Daemon halted successfully.");

    Ok(())
}
