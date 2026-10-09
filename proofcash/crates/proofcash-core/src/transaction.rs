use crate::delta::CommutativeDelta;
use crate::output::{Output, PicoJoules};
use proofcash_crypto::blake3_digest;
use serde::{Deserialize, Serialize};

/// A complete, fully shielded ProofCash transaction
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Transaction {
    /// Nullifiers of spent inputs (prevents double-spending)
    pub nullifiers: Vec<[u8; 32]>,
    /// New commitments generated
    pub outputs: Vec<Output>,
    /// Concurrent balance/state mutations targeting shared pools
    pub commutative_deltas: Vec<CommutativeDelta>,
    /// Public transaction fee paid to provers and fee reservoir
    pub public_fee: PicoJoules,
    /// Zero-Knowledge validity proof (Spend, Conservation, State transitions)
    pub zk_proof: Vec<u8>,
}

impl Transaction {
    /// Computes the unique deterministic transaction hash
    pub fn txid(&self) -> [u8; 32] {
        let serialized = bincode::serialize(self).unwrap_or_default();
        blake3_digest(&serialized)
    }

    /// Basic structural validity check
    pub fn is_structurally_valid(&self) -> bool {
        // Must spend or create state, or apply a delta
        !self.nullifiers.is_empty() || !self.outputs.is_empty() || !self.commutative_deltas.is_empty()
    }
}
