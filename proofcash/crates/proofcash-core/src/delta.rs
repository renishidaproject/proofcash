use serde::{Deserialize, Serialize};

/// A commutative state mutation targeting a shared state pool/sink
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommutativeDelta {
    /// Target shared state sink output identifier
    pub sink_id: [u8; 32],
    /// Signed balance mutation (positive for deposits, negative for withdrawals)
    pub delta_amount: i128,
    /// Localized state transition parameters
    pub state_mutation: Vec<u8>,
    /// Ephemeral caller signature authorizing the mutation
    pub caller_signature: [u8; 64],
    /// Deterministic hash used for canonical resolution precedence (MEV elimination)
    pub precedence_hash: [u8; 32],
}

impl CommutativeDelta {
    pub fn new(
        sink_id: [u8; 32],
        delta_amount: i128,
        state_mutation: Vec<u8>,
        caller_signature: [u8; 64],
        precedence_hash: [u8; 32],
    ) -> Self {
        Self {
            sink_id,
            delta_amount,
            state_mutation,
            caller_signature,
            precedence_hash,
        }
    }
}
