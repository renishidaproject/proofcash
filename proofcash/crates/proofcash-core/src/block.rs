use crate::output::{PicoJoules, PICO_JOULES_PER_PCASH};
use proofcash_crypto::blake3_digest;
use serde::{Deserialize, Serialize};

/// The immutable Genesis Headline timestamping the origin of ProofCash
pub const GENESIS_HEADLINE: &str =
    "Financial Times 09/Oct/2026 Sovereign debt surpasses $100T as autonomous AI compute drains global power grids";

/// Genesis Timestamp: October 9, 2026 00:00:00 UTC
pub const GENESIS_TIMESTAMP: u64 = 1791540000;

/// The winning Blake3 PoSW thermodynamic nonce discovered for Block 0
pub const GENESIS_NONCE: u64 = 7111;

/// The canonical Genesis Block hash
pub const GENESIS_BLOCK_HASH: [u8; 32] = [
    0xef, 0x77, 0x39, 0x4f, 0x7a, 0xdb, 0xc6, 0x8e,
    0xf6, 0xf7, 0xb0, 0x84, 0xb9, 0xe9, 0xd5, 0x48,
    0x96, 0xf6, 0xb3, 0x34, 0x7e, 0x55, 0x05, 0x77,
    0xa3, 0xb3, 0x9b, 0xce, 0x5e, 0x4c, 0xb0, 0x9a,
];

/// The state accumulator Merkle Mountain Range root at Genesis
pub const GENESIS_STATE_ROOT: [u8; 32] = [
    0x9d, 0x24, 0xdb, 0x85, 0x29, 0xdb, 0x13, 0xd5,
    0x85, 0x49, 0x34, 0x6b, 0x8e, 0xc1, 0xa4, 0xe8,
    0xd2, 0x3c, 0xe7, 0x13, 0x03, 0x89, 0xe3, 0xe9,
    0xb7, 0x0f, 0xe2, 0x58, 0x63, 0xb9, 0xa4, 0x6c,
];

/// Initial PoSW difficulty target: 18+ leading zero bits
pub const GENESIS_TARGET: [u8; 32] = [
    0x00, 0x00, 0x3f, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
];

/// The succinct block header of ProofCash
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlockHeader {
    pub height: u64,
    pub prev_block_hash: [u8; 32],
    /// Merkle Mountain Range (MMR) state accumulator root
    pub state_root: [u8; 32],
    /// Nullifier root of all spent coins up to this block
    pub nullifier_root: [u8; 32],
    /// O(1) Recursive STARK proof (~43.2 KB) verifying the entire chain from genesis
    pub recursive_proof: Vec<u8>,
    /// Thermodynamic difficulty target
    pub target: [u8; 32],
    /// Mining search puzzle nonce
    pub nonce: u64,
    pub timestamp: u64,
    /// Payout emitted by the PID-damped Fee Reservoir
    pub reservoir_payout: PicoJoules,
}

impl BlockHeader {
    /// Constructs the sealed, immutable Genesis Block 0
    pub fn genesis() -> Self {
        Self {
            height: 0,
            prev_block_hash: [0u8; 32],
            state_root: GENESIS_STATE_ROOT,
            nullifier_root: [0u8; 32],
            recursive_proof: vec![0xAA; 44_200], // Base induction anchor proof
            target: GENESIS_TARGET,
            nonce: GENESIS_NONCE,
            timestamp: GENESIS_TIMESTAMP,
            reservoir_payout: 0,
        }
    }

    /// Computes the block identification hash
    pub fn block_hash(&self) -> [u8; 32] {
        let serialized = bincode::serialize(self).unwrap_or_default();
        blake3_digest(&serialized)
    }

    /// Verifies that the recursive proof payload matches O(1) succinct limits (< 64 KB)
    pub fn is_proof_size_bounded(&self) -> bool {
        self.recursive_proof.len() <= 65_536
    }
}
