//! PID-Damped Thermodynamic Fee Reservoir Controller
//!
//! Regulates block payout yield to maintain baseline thermodynamic security
//! without inflating supply beyond the 1,000,000,000 PCASH cap.
//! Includes Anti-Windup Clamping and Leaky Integration to prevent harmonic hunting.

use proofcash_core::output::PicoJoules;

#[derive(Clone, Debug)]
pub struct ReservoirConfig {
    pub kp: f64,
    pub ki: f64,
    pub kd: f64,
    /// Leaky integration forgetting factor (e.g., 0.98)
    pub alpha: f64,
    /// Maximum payout ceiling as multiplier of base block subsidy (e.g., 1.5)
    pub max_payout_multiplier: f64,
}

impl Default for ReservoirConfig {
    fn default() -> Self {
        Self {
            kp: 0.5,
            ki: 0.05,
            kd: 0.1,
            alpha: 0.98,
            max_payout_multiplier: 1.5,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct PidFeeReservoir {
    /// Total balance held in the reservoir (in Pico-Joules)
    pub balance: PicoJoules,
    /// Total fees burned permanently by protocol velocity (in Pico-Joules)
    pub total_burned: PicoJoules,
    /// Leaky integral state
    pub integral_state: f64,
    /// Previous error for derivative calculation
    pub prev_error: f64,
    /// Configuration constants
    pub config: ReservoirConfig,
}

impl PidFeeReservoir {
    pub fn new(config: ReservoirConfig) -> Self {
        Self {
            balance: 0,
            total_burned: 0,
            integral_state: 0.0,
            prev_error: 0.0,
            config,
        }
    }

    /// Deposits a public transaction fee: 50% permanently burned, 50% added to reservoir
    pub fn deposit_fee(&mut self, fee: PicoJoules) {
        let burn_amount = fee / 2;
        let reservoir_amount = fee - burn_amount;
        self.total_burned += burn_amount;
        self.balance += reservoir_amount;
    }

    /// Computes the smoothed payout emitted to block provers/miners
    pub fn calculate_and_emit_payout(
        &mut self,
        current_difficulty: f64,
        target_difficulty: f64,
        base_block_subsidy: PicoJoules,
    ) -> PicoJoules {
        if self.balance == 0 {
            return 0;
        }

        // Error: positive if difficulty dropped below target
        let error = (target_difficulty - current_difficulty) / target_difficulty;

        // Leaky integration with anti-windup
        self.integral_state = (self.config.alpha * self.integral_state) + error;
        // Clamp integral state
        self.integral_state = self.integral_state.clamp(-10.0, 10.0);

        // Derivative term
        let derivative = error - self.prev_error;
        self.prev_error = error;

        // PID output calculation
        let pid_signal = (self.config.kp * error)
            + (self.config.ki * self.integral_state)
            + (self.config.kd * derivative);

        // Map signal to payout fraction: normalized around baseline smooth payout
        let target_multiplier = (1.0 + pid_signal).clamp(0.0, self.config.max_payout_multiplier);
        
        // Base smooth emission: 1/100,000th of reservoir per block * multiplier
        let nominal_payout = ((self.balance as f64) * 0.00001 * target_multiplier) as PicoJoules;
        let max_allowed = ((base_block_subsidy as f64) * self.config.max_payout_multiplier) as PicoJoules;

        // Enforce anti-windup ceiling and balance bounds
        let final_payout = nominal_payout.min(max_allowed).min(self.balance);
        self.balance -= final_payout;
        final_payout
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fee_split_and_burn() {
        let mut reservoir = PidFeeReservoir::default();
        reservoir.deposit_fee(1000);
        assert_eq!(reservoir.total_burned, 500);
        assert_eq!(reservoir.balance, 500);
    }

    #[test]
    fn test_pid_anti_windup_clamp() {
        let mut reservoir = PidFeeReservoir::default();
        reservoir.balance = 1_000_000_000_000; // 1 PCASH
        let base_subsidy = 100_000_000_000; // 0.1 PCASH

        // Massive difficulty collapse: error = +1.0
        let payout = reservoir.calculate_and_emit_payout(0.0, 100.0, base_subsidy);
        let max_allowed = (base_subsidy as f64 * 1.5) as PicoJoules;
        assert!(payout <= max_allowed);
        assert!(payout > 0);
    }
}
