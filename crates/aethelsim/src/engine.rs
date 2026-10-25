// ==============================================================================
// APEXSOVEREIGN HOLDINGS — 10-YEAR PLANETARY EXPANSION SIMULATOR
// Path: crates/aethelsim/src/engine.rs
// Algorithm: Monte Carlo Stochastic Resource & Capacity Forecaster (120 Months)
// Modeling: GPU Supply Growth, SMR Energy Capture, CU Velocity & Biopharma IP Yield
// ==============================================================================

use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use rand_distr::{Distribution, Normal};
use serde::{Deserialize, Serialize};

pub const TOTAL_SIMULATION_MONTHS: usize = 120; // 10 Years = 120 Months

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroStressParameters {
    pub supply_chain_shock_probability: f64, // Probability of 6-month GPU delay
    pub grid_curtailment_frequency: f64,     // Frequency of localized power bottlenecks
    pub hyperscaler_price_war_discount: f64, // Hyperscalers slashing list rates by 15-40%
    pub base_energy_cost_usd_mwh: f64,       // Baseline wholesale power cost
}

impl Default for MacroStressParameters {
    fn default() -> Self {
        Self {
            supply_chain_shock_probability: 0.12,
            grid_curtailment_frequency: 0.18,
            hyperscaler_price_war_discount: 0.25,
            base_energy_cost_usd_mwh: 28.50,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlySimulationRecord {
    pub month_index: usize,
    pub year: f64,
    // Compute Infrastructure Capacity
    pub h100_capacity_units: u64,
    pub b200_capacity_units: u64,
    pub nextgen_capacity_units: u64,
    pub total_active_gpus: u64,
    // Power Generation & Infrastructure
    pub smr_capacity_mw: f64,
    pub hydro_geothermal_mw: f64,
    pub total_dedicated_power_mw: f64,
    pub pue_efficiency: f64,
    // Financial Ledger Metrics (AethelPay)
    pub cu_minted_monthly: f64,
    pub cu_burned_monthly: f64,
    pub gross_revenue_usd: f64,
    pub capital_expenditure_usd: f64,
    pub net_operating_cashflow_usd: f64,
    pub sovereign_treasury_reserve_usd: f64,
    // AuraPharm Biopharma IP Portfolio
    pub molecular_candidates_synthesized: u64,
    pub proprietary_ip_asset_valuation_usd: f64,
    pub active_stress_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanetaryTrajectoryMatrix {
    pub simulation_seed: u64,
    pub total_iterations: usize,
    pub terminal_active_gpus: u64,
    pub terminal_dedicated_power_mw: f64,
    pub terminal_annual_runrate_usd: f64,
    pub cumulative_biopharma_ip_assets: u64,
    pub monthly_trajectory: Vec<MonthlySimulationRecord>,
}

pub struct SimulationEngine {
    params: MacroStressParameters,
    rng: StdRng,
}

impl SimulationEngine {
    pub fn new(seed: u64, params: MacroStressParameters) -> Self {
        Self {
            params,
            rng: StdRng::seed_from_u64(seed),
        }
    }

    /// Executes a deterministic 120-month Monte Carlo simulation trajectory
    pub fn simulate_10_year_expansion(&mut self) -> PlanetaryTrajectoryMatrix {
        let mut monthly_records: Vec<MonthlySimulationRecord> = Vec::with_capacity(TOTAL_SIMULATION_MONTHS);

        // Initial State (Month 1, Year 2026 Baseline)
        let mut h100_units: u64 = 1024;
        let mut b200_units: u64 = 256;
        let mut nextgen_units: u64 = 0;
        let mut smr_mw: f64 = 45.0; // Initial 45 MW SMR facility
        let mut hydro_geo_mw: f64 = 75.0;
        let mut treasury_reserve_usd: f64 = 5_000_000.0;
        let mut cumulative_candidates: u64 = 120;

        let monthly_growth_dist = Normal::new(1.035, 0.012).unwrap(); // ~3.5% monthly compound growth
        let capex_efficiency_dist = Normal::new(0.985, 0.005).unwrap();

        for month in 1..=TOTAL_SIMULATION_MONTHS {
            let year = 2026.0 + (month as f64 / 12.0);

            // 1. Evaluate Macro Shocks
            let is_supply_shock = self.rng.gen_bool(self.params.supply_chain_shock_probability);
            let is_grid_curtailment = self.rng.gen_bool(self.params.grid_curtailment_frequency);
            let is_hyperscaler_price_war = month % 18 == 0; // Price war every 18 months

            let stress_mode = if is_supply_shock {
                "SUPPLY_CHAIN_BOTTLENECK"
            } else if is_grid_curtailment {
                "GRID_CURTAILMENT_SURPLUS"
            } else if is_hyperscaler_price_war {
                "HYPERSCALER_PRICE_WAR"
            } else {
                "NOMINAL_EXPANSION"
            };

            // 2. Hardware Supply Evolution
            let growth_factor = if is_supply_shock { 1.008 } else { monthly_growth_dist.sample(&mut self.rng).max(1.0) };

            h100_units = (h100_units as f64 * (if month < 36 { growth_factor } else { 0.995 })) as u64;
            b200_units = (b200_units as f64 * (if month < 72 { growth_factor * 1.02 } else { 0.99 })) as u64;

            if month >= 36 {
                let new_nextgen = ((month - 35) as f64 * 128.0 * growth_factor) as u64;
                nextgen_units += new_nextgen;
            }

            let total_gpus = h100_units + b200_units + nextgen_units;

            // 3. Clean Energy Acquisition Trajectory (SMR & Stranded Off-takes)
            if month % 12 == 0 {
                smr_mw += 45.0; // Commercial SMR commissioned annually
                hydro_geo_mw += 60.0; // Stranded Nordic/Iceland expansion
            }
            let total_mw = smr_mw + hydro_geo_mw;
            let pue = (1.08 - (month as f64 * 0.0003)).max(1.02);

            // 4. Financial Settlement Modeling (AethelPay & Compute Units)
            let spot_clearing_rate = if is_hyperscaler_price_war {
                1.42
            } else {
                (1.85 - (month as f64 * 0.0035)).max(0.95)
            };

            let compute_hours_utilized = (total_gpus as f64 * 720.0 * 0.92) as f64; // 92% utilization
            let gross_revenue = compute_hours_utilized * spot_clearing_rate;

            // CU Peg: $1.00 = 100 CU
            let cu_minted = gross_revenue * 100.0;
            let cu_burned = cu_minted * 0.96;

            let power_consumed_mwh = (total_mw * 720.0 * 0.88);
            let energy_opex = power_consumed_mwh * self.params.base_energy_cost_usd_mwh;
            let capex = (total_gpus as f64 * 45.0) * capex_efficiency_dist.sample(&mut self.rng);
            let opex = energy_opex + (total_gpus as f64 * 18.0);
            let net_cashflow = gross_revenue - (opex + (capex * 0.08));

            treasury_reserve_usd += net_cashflow;

            // 5. AuraPharm Biopharma Yield (Synthesized on Curtailed Megawatts)
            let curtailed_mw = if is_grid_curtailment { total_mw * 0.35 } else { total_mw * 0.12 };
            let monthly_molecules = ((curtailed_mw * 1000.0) / 45.0) as u64;
            cumulative_candidates += monthly_molecules;
            let ip_valuation = cumulative_candidates as f64 * 350_000.0; // $350k avg fair value per sealed candidate

            monthly_records.push(MonthlySimulationRecord {
                month_index: month,
                year: (year * 100.0).round() / 100.0,
                h100_capacity_units: h100_units,
                b200_capacity_units: b200_units,
                nextgen_capacity_units: nextgen_units,
                total_active_gpus: total_gpus,
                smr_capacity_mw: smr_mw,
                hydro_geothermal_mw: hydro_geo_mw,
                total_dedicated_power_mw: total_mw,
                pue_efficiency: (pue * 1000.0).round() / 1000.0,
                cu_minted_monthly: (cu_minted * 100.0).round() / 100.0,
                cu_burned_monthly: (cu_burned * 100.0).round() / 100.0,
                gross_revenue_usd: (gross_revenue * 100.0).round() / 100.0,
                capital_expenditure_usd: (capex * 100.0).round() / 100.0,
                net_operating_cashflow_usd: (net_cashflow * 100.0).round() / 100.0,
                sovereign_treasury_reserve_usd: (treasury_reserve_usd * 100.0).round() / 100.0,
                molecular_candidates_synthesized: cumulative_candidates,
                proprietary_ip_asset_valuation_usd: ip_valuation,
                active_stress_mode: stress_mode.to_string(),
            });
        }

        let terminal = monthly_records.last().unwrap();
        PlanetaryTrajectoryMatrix {
            simulation_seed: 42091,
            total_iterations: TOTAL_SIMULATION_MONTHS,
            terminal_active_gpus: terminal.total_active_gpus,
            terminal_dedicated_power_mw: terminal.total_dedicated_power_mw,
            terminal_annual_runrate_usd: terminal.gross_revenue_usd * 12.0,
            cumulative_biopharma_ip_assets: terminal.molecular_candidates_synthesized,
            monthly_trajectory: monthly_records,
        }
    }
}
