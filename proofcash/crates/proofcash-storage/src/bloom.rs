//! Nullifier Bloom Filter Index
//!
//! Provides sub-microsecond O(1) set membership testing for spent nullifiers,
//! enabling nodes to immediately reject double-spend attempts in the mempool
//! without querying disk storage.

use proofcash_crypto::blake3_digest;
use serde::{Deserialize, Serialize};

/// High-performance Bloom Filter for nullifier existence checks
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NullifierBloomFilter {
    bit_vector: Vec<u64>,
    num_bits: usize,
    num_hashes: usize,
    count: usize,
}

impl NullifierBloomFilter {
    /// Creates a new bloom filter sized for target capacity (e.g., 1,000,000 nullifiers)
    /// with target false positive rate < 0.01%
    pub fn new(capacity: usize) -> Self {
        let num_bits = (capacity * 20).max(64); // ~20 bits per item gives < 0.01% FPR
        let num_u64s = (num_bits + 63) / 64;
        Self {
            bit_vector: vec![0u64; num_u64s],
            num_bits,
            num_hashes: 7,
            count: 0,
        }
    }

    /// Adds a spent nullifier to the filter
    pub fn insert(&mut self, nullifier: &[u8; 32]) {
        for i in 0..self.num_hashes {
            let bit_idx = self.hash_index(nullifier, i);
            let u64_idx = bit_idx / 64;
            let offset = bit_idx % 64;
            self.bit_vector[u64_idx] |= 1u64 << offset;
        }
        self.count += 1;
    }

    /// Checks if a nullifier has potentially already been spent.
    /// If false: definitively NOT spent (no false negatives).
    pub fn contains(&self, nullifier: &[u8; 32]) -> bool {
        for i in 0..self.num_hashes {
            let bit_idx = self.hash_index(nullifier, i);
            let u64_idx = bit_idx / 64;
            let offset = bit_idx % 64;
            if (self.bit_vector[u64_idx] & (1u64 << offset)) == 0 {
                return false;
            }
        }
        true
    }

    pub fn len(&self) -> usize {
        self.count
    }

    pub fn is_empty(&self) -> bool {
        self.count == 0
    }

    fn hash_index(&self, nullifier: &[u8; 32], seed: usize) -> usize {
        let mut data = [0u8; 36];
        data[0..32].copy_from_slice(nullifier);
        data[32..36].copy_from_slice(&(seed as u32).to_le_bytes());
        let digest = blake3_digest(&data);
        let val = u64::from_le_bytes(digest[0..8].try_into().unwrap());
        (val as usize) % self.num_bits
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bloom_filter_membership() {
        let mut filter = NullifierBloomFilter::new(10_000);
        let n1 = [0xAAu8; 32];
        let n2 = [0xBBu8; 32];
        let n3 = [0xCCu8; 32];

        filter.insert(&n1);
        filter.insert(&n2);

        assert!(filter.contains(&n1));
        assert!(filter.contains(&n2));
        assert!(!filter.contains(&n3)); // Negative case
    }
}
