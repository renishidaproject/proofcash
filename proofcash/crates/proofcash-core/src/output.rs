use serde::{Deserialize, Serialize};

/// Core balance representation in Pico-Joules (1 PCASH = 10^12 pJ)
pub type PicoJoules = u128;

/// Exactly 10^12 Pico-Joules per 1 ProofCash coin
pub const PICO_JOULES_PER_PCASH: PicoJoules = 1_000_000_000_000;

/// The absolute hard cap of 1,000,000,000 PCASH
pub const TOTAL_CAP_PCASH: u64 = 1_000_000_000;

/// Total supply in discrete units = 10^21 pJ
pub const MAX_PICO_JOULES: PicoJoules = (TOTAL_CAP_PCASH as u128) * PICO_JOULES_PER_PCASH;

/// A discrete, shielded Extended-UTXO output
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Output {
    /// Cryptographic commitment: Commit(value, owner_pk, blinding_r)
    pub commitment: [u8; 32],
    /// Optional localized state datum (for eUTXO smart contracts/channels)
    pub state_datum: Option<Vec<u8>>,
    /// Refundable thermodynamic anti-dust bond
    pub energy_bond: PicoJoules,
    /// Block height at which this output was committed
    pub birth_height: u64,
}

impl Output {
    pub fn new(commitment: [u8; 32], state_datum: Option<Vec<u8>>, energy_bond: PicoJoules, height: u64) -> Self {
        Self {
            commitment,
            state_datum,
            energy_bond,
            birth_height: height,
        }
    }

    /// Checks if a dust bond is sufficient (e.g., minimum 10,000 pJ)
    pub fn is_bond_valid(&self, min_bond: PicoJoules) -> bool {
        self.energy_bond >= min_bond
    }
}
