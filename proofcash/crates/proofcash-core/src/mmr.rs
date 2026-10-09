use proofcash_crypto::goldilocks_hash;
use serde::{Deserialize, Serialize};

/// An append-only Merkle Mountain Range accumulator
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MerkleMountainRange {
    /// Flattened array of all node hashes in the MMR
    pub nodes: Vec<[u8; 32]>,
    /// Total number of leaves inserted
    pub leaf_count: usize,
}

impl MerkleMountainRange {
    pub fn new() -> Self {
        Self {
            nodes: Vec::new(),
            leaf_count: 0,
        }
    }

    /// Appends a new commitment leaf to the MMR and collapses complete subtrees
    pub fn append(&mut self, leaf_commitment: [u8; 32]) -> usize {
        let leaf_idx = self.nodes.len();
        self.nodes.push(leaf_commitment);
        self.leaf_count += 1;

        // Peak collapsing: if previous subtrees of equal height exist, merge them
        let mut height = 0;
        let mut current_idx = leaf_idx;

        while self.is_right_sibling(current_idx, height) {
            let left_idx = current_idx - (1 << (height + 1)) + 1;
            let parent_hash = goldilocks_hash(&self.nodes[left_idx], &self.nodes[current_idx]);
            self.nodes.push(parent_hash);
            current_idx = self.nodes.len() - 1;
            height += 1;
        }

        leaf_idx
    }

    /// Calculates the bag of peaks representing the state root
    pub fn get_peaks(&self) -> Vec<[u8; 32]> {
        if self.nodes.is_empty() {
            return Vec::new();
        }
        let mut peaks = Vec::new();
        let mut n = self.leaf_count;
        let mut cursor = 0;

        while n > 0 {
            let height = (usize::BITS - n.leading_zeros() - 1) as usize;
            let subtree_size = (1 << (height + 1)) - 1;
            let peak_idx = cursor + subtree_size - 1;
            if peak_idx < self.nodes.len() {
                peaks.push(self.nodes[peak_idx]);
            }
            cursor += subtree_size;
            n -= 1 << height;
        }
        peaks
    }

    /// Derives the single 32-byte root hash by bagging the peaks together
    pub fn root(&self) -> [u8; 32] {
        let peaks = self.get_peaks();
        if peaks.is_empty() {
            return [0u8; 32];
        }
        let mut acc = peaks[0];
        for peak in peaks.iter().skip(1) {
            acc = goldilocks_hash(&acc, peak);
        }
        acc
    }

    /// Helper checking whether a node position is a right child
    fn is_right_sibling(&self, idx: usize, height: usize) -> bool {
        let subtree_size = (1 << (height + 1)) - 1;
        idx >= subtree_size && (idx + 1) % (subtree_size + 1) == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mmr_append_and_root() {
        let mut mmr = MerkleMountainRange::new();
        let c1 = [1u8; 32];
        let c2 = [2u8; 32];
        mmr.append(c1);
        let root1 = mmr.root();
        assert_ne!(root1, [0u8; 32]);

        mmr.append(c2);
        let root2 = mmr.root();
        assert_ne!(root1, root2);
    }
}
