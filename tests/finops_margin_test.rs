// ============================================================================
// ApexSovereign.ai - FINOPS MARGIN OPTIMIZATION & ARBITRAGE TEST SUITE
// File: tests/finops_margin_test.rs
// Implements:
//   1. Initialization of multi-cloud compute nodes (Bare-Metal B200, AWS H100 Spot).
//   2. Simulation of a sudden 40% spot price spike on AWS H100 cluster.
//   3. Verification that FinOps daemon detects margin dropping below 12% (<0% negative margin)
//      within a single cycle and re-routes 100% of traffic to bare-metal nodes.
//   4. Verification of zero billing discrepancy during the dynamic arbitrage shift.
// ============================================================================

use std::collections::HashMap;
use std::time::Duration;
use chrono::Utc;

#[derive(Debug, Clone, PartialEq)]
pub enum ProviderType {
    BareMetalDirect,
    AwsSpot,
    LambdaLabs,
}

#[derive(Debug, Clone)]
pub struct NodeCostYieldMetrics {
    pub node_id: String,
    pub region: String,
    pub provider: ProviderType,
    pub spot_cost_per_hour_usd: f64,
    pub client_billing_rate_per_hour_usd: f64,
    pub active_traffic_weight: f64,
}

pub struct SimulationLedgerAccount {
    pub client_id: String,
    pub total_billed_usd: f64,
    pub total_provider_cost_usd: f64,
    pub realized_net_profit_usd: f64,
}

pub struct FinOpsArbitrageEngine {
    pub nodes: HashMap<String, NodeCostYieldMetrics>,
    pub ledger: SimulationLedgerAccount,
    pub min_target_margin: f64, // 0.12 (12%)
}

impl FinOpsArbitrageEngine {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            ledger: SimulationLedgerAccount {
                client_id: "enterprise-tenant-alpha".to_string(),
                total_billed_usd: 0.0,
                total_provider_cost_usd: 0.0,
                realized_net_profit_usd: 0.0,
            },
            min_target_margin: 0.12,
        }
    }

    pub fn register_node(&mut self, node: NodeCostYieldMetrics) {
        self.nodes.insert(node.node_id.clone(), node);
    }

    pub fn calculate_net_margin(&self, node_id: &str) -> f64 {
        let node = self.nodes.get(node_id).expect("Node must exist");
        if node.client_billing_rate_per_hour_usd <= 0.0 {
            return -1.0;
        }
        (node.client_billing_rate_per_hour_usd - node.spot_cost_per_hour_usd)
            / node.client_billing_rate_per_hour_usd
    }

    /// Re-evaluates routing weights across all nodes based on margins.
    /// Nodes below 12% target are blacklisted (weight 0.0).
    /// Traffic is 100% shifted to qualifying bare-metal / high-margin nodes.
    pub fn rebalance_routing_weights(&mut self) -> (usize, usize) {
        let mut active_nodes = Vec::new();
        let mut blacklisted_nodes = Vec::new();

        for (id, node) in self.nodes.iter_mut() {
            let margin = (node.client_billing_rate_per_hour_usd - node.spot_cost_per_hour_usd)
                / node.client_billing_rate_per_hour_usd;

            if margin < self.min_target_margin {
                node.active_traffic_weight = 0.0;
                blacklisted_nodes.push(id.clone());
            } else {
                let base_weight = match node.provider {
                    ProviderType::BareMetalDirect => 1.5,
                    ProviderType::LambdaLabs => 1.2,
                    ProviderType::AwsSpot => 1.0,
                };
                let boost = (margin - self.min_target_margin) * 2.0;
                node.active_traffic_weight = base_weight * (1.0 + boost);
                active_nodes.push(id.clone());
            }
        }

        // Normalize weights of active nodes so they sum to 1.0 (or 100% distribution)
        let total_weight: f64 = self.nodes.values().map(|n| n.active_traffic_weight).sum();
        if total_weight > 0.0 {
            for node in self.nodes.values_mut() {
                if node.active_traffic_weight > 0.0 {
                    node.active_traffic_weight /= total_weight;
                }
            }
        }

        (active_nodes.len(), blacklisted_nodes.len())
    }

    /// Simulates batch inference routing & records credit debit / provider cost
    pub fn route_and_bill_batch(&mut self, hours: f64) {
        for node in self.nodes.values() {
            if node.active_traffic_weight > 0.0 {
                let billed = node.client_billing_rate_per_hour_usd * hours * node.active_traffic_weight;
                let cost = node.spot_cost_per_hour_usd * hours * node.active_traffic_weight;

                self.ledger.total_billed_usd += billed;
                self.ledger.total_provider_cost_usd += cost;
                self.ledger.realized_net_profit_usd += (billed - cost);
            }
        }
    }
}

#[tokio::test]
async fn test_finops_sudden_spot_spike_and_100_percent_baremetal_reroute() {
    let mut engine = FinOpsArbitrageEngine::new();

    // 1. Initial State:
    // Client fixed billing rate: $4.50 / hour / VCU
    // Node A (Bare-Metal B200): Constant base cost $2.70 / hr (Margin: 40.0%)
    // Node B (AWS Spot H100): Initial spot cost $3.60 / hr (Margin: 20.0%, above 12% threshold)
    engine.register_node(NodeCostYieldMetrics {
        node_id: "node-baremetal-us-east".to_string(),
        region: "us-east-1".to_string(),
        provider: ProviderType::BareMetalDirect,
        spot_cost_per_hour_usd: 2.70,
        client_billing_rate_per_hour_usd: 4.50,
        active_traffic_weight: 0.5,
    });

    engine.register_node(NodeCostYieldMetrics {
        node_id: "node-aws-spot-us-east".to_string(),
        region: "us-east-1".to_string(),
        provider: ProviderType::AwsSpot,
        spot_cost_per_hour_usd: 3.60,
        client_billing_rate_per_hour_usd: 4.50,
        active_traffic_weight: 0.5,
    });

    // Initial normal operation check
    let margin_bm_pre = engine.calculate_net_margin("node-baremetal-us-east");
    let margin_aws_pre = engine.calculate_net_margin("node-aws-spot-us-east");
    assert!((margin_bm_pre - 0.40).abs() < 1e-4, "Bare-metal margin must be 40%");
    assert!((margin_aws_pre - 0.20).abs() < 1e-4, "AWS initial margin must be 20%");

    let (active_init, blacklisted_init) = engine.rebalance_routing_weights();
    assert_eq!(active_init, 2, "Both nodes should be active initially");
    assert_eq!(blacklisted_init, 0, "No nodes blacklisted initially");

    // Route 1 hour of inference workload before the spike
    engine.route_and_bill_batch(1.0);
    assert!(engine.ledger.realized_net_profit_usd > 0.0);

    // 2. CHAOS INJECTION: Sudden 40% spot price spike on AWS H100
    // $3.60 * 1.40 = $5.04 / hr. (Exceeds client billing rate of $4.50 -> Negative margin -12.0%)
    if let Some(aws_node) = engine.nodes.get_mut("node-aws-spot-us-east") {
        aws_node.spot_cost_per_hour_usd = 3.60 * 1.40; // $5.04 / hr
    }

    // 3. Margin Recalculation within 1 cycle
    let margin_aws_post = engine.calculate_net_margin("node-aws-spot-us-east");
    assert!(margin_aws_post < 0.0, "AWS margin must become negative post-spike ({:.2}%)", margin_aws_post * 100.0);

    // Run dynamic rebalance
    let (active_post, blacklisted_post) = engine.rebalance_routing_weights();
    assert_eq!(active_post, 1, "Only 1 node must remain active");
    assert_eq!(blacklisted_post, 1, "AWS node must be isolated / blacklisted");

    // Verify 100% of traffic is now shifted to bare-metal
    let bm_weight = engine.nodes.get("node-baremetal-us-east").unwrap().active_traffic_weight;
    let aws_weight = engine.nodes.get("node-aws-spot-us-east").unwrap().active_traffic_weight;

    assert_eq!(aws_weight, 0.0, "AWS spot node must receive 0.0% traffic");
    assert_eq!(bm_weight, 1.0, "Bare-metal node must receive 100.0% of traffic");

    // 4. Verification of Zero Billing Discrepancy during arbitrage shift
    let billed_before_shift = engine.ledger.total_billed_usd;
    let cost_before_shift = engine.ledger.total_provider_cost_usd;

    // Route next 2 hours of workload purely on bare-metal
    engine.route_and_bill_batch(2.0);

    let delta_billed = engine.ledger.total_billed_usd - billed_before_shift;
    let delta_cost = engine.ledger.total_provider_cost_usd - cost_before_shift;
    let delta_profit = delta_billed - delta_cost;

    // Expected for 2 hours on bare-metal at $4.50 billed and $2.70 cost:
    // Billed: $4.50 * 2 = $9.00
    // Cost: $2.70 * 2 = $5.40
    // Profit: $3.60 (Exactly 40.0% net margin preserved)
    assert!((delta_billed - 9.00).abs() < 1e-4, "Billed delta must exactly equal $9.00");
    assert!((delta_cost - 5.40).abs() < 1e-4, "Cost delta must exactly equal $5.40");
    assert!((delta_profit - 3.60).abs() < 1e-4, "Realized profit must exactly equal $3.60");
    assert!((delta_profit / delta_billed - 0.40).abs() < 1e-4, "Effective margin during shift must be locked at 40%");

    println!("FinOps Arbitrage shift successfully verified: 100% reroute to bare-metal, 0 billing discrepancies.");
}

fn main() {
    println!("FinOps integration test binary compiled.");
}
