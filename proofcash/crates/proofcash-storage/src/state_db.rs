//! ProofCash State Database
//!
//! Stores block headers, the active Merkle Mountain Range accumulator,
//! and the spent nullifier index.

use crate::bloom::NullifierBloomFilter;
use proofcash_core::{BlockHeader, MerkleMountainRange};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StateDatabase {
    /// History of confirmed block headers
    pub headers: Vec<BlockHeader>,
    /// Active state accumulator
    pub mmr: MerkleMountainRange,
    /// Fast bloom filter for unconfirmed nullifiers
    pub bloom: NullifierBloomFilter,
    /// Authoritative set of spent nullifiers
    pub spent_nullifiers: HashSet<[u8; 32]>,
}

impl Default for StateDatabase {
    fn default() -> Self {
        Self::new()
    }
}

impl StateDatabase {
    pub fn new() -> Self {
        let mut db = Self {
            headers: Vec::new(),
            mmr: MerkleMountainRange::new(),
            bloom: NullifierBloomFilter::new(500_000),
            spent_nullifiers: HashSet::new(),
        };
        // Anchor Genesis Block 0 into the chain history
        db.headers.push(BlockHeader::genesis());
        db
    }

    /// Checks if a nullifier has already been spent
    pub fn is_nullifier_spent(&self, nullifier: &[u8; 32]) -> bool {
        if !self.bloom.contains(nullifier) {
            return false;
        }
        self.spent_nullifiers.contains(nullifier)
    }

    /// Records a confirmed block and commits its state transitions
    pub fn commit_block(
        &mut self,
        header: BlockHeader,
        new_commitments: &[[u8; 32]],
        spent: &[[u8; 32]],
    ) {
        // 1. Append commitments to MMR
        for c in new_commitments {
            self.mmr.append(*c);
        }

        // 2. Mark nullifiers as spent
        for n in spent {
            self.bloom.insert(n);
            self.spent_nullifiers.insert(*n);
        }

        // 3. Append header
        self.headers.push(header);
    }

    /// Current chain tip block height (Genesis = 0)
    pub fn tip_height(&self) -> u64 {
        if self.headers.is_empty() {
            0
        } else {
            (self.headers.len() - 1) as u64
        }
    }

    /// Current chain tip block identification hash
    pub fn tip_hash(&self) -> [u8; 32] {
        self.headers
            .last()
            .map(|h| h.block_hash())
            .unwrap_or([0u8; 32])
    }

    /// Current active state root
    pub fn state_root(&self) -> [u8; 32] {
        self.mmr.root()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_state_db_commit() {
        let mut db = StateDatabase::new();
        let c1 = [1u8; 32];
        let n1 = [2u8; 32];

        assert!(!db.is_nullifier_spent(&n1));

        let dummy_header = BlockHeader {
            height: 1,
            prev_block_hash: [0; 32],
            state_root: [0; 32],
            nullifier_root: [0; 32],
            recursive_proof: vec![],
            target: [0; 32],
            nonce: 0,
            timestamp: 0,
            reservoir_payout: 0,
        };

        db.commit_block(dummy_header, &[c1], &[n1]);
        assert!(db.is_nullifier_spent(&n1));
        assert_eq!(db.tip_height(), 1);
        assert_ne!(db.state_root(), [0; 32]);
    }
}
