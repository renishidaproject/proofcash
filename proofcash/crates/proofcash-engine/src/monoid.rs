//! Commutative Monoid Reduction Tree for Delta-UTXOs
//!
//! Resolves shared state contention concurrently without race conditions.
//! If net withdrawals exceed pool liquidity, conflicts are deterministically resolved
//! using canonical precedence hash sorting (lowest hash wins, eliminating MEV).

use proofcash_core::delta::CommutativeDelta;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeltaResolutionResult {
    /// Net balance applied to the shared state pool
    pub net_delta: i128,
    /// Indices of deltas successfully accepted and applied
    pub accepted_indices: Vec<usize>,
    /// Indices of deltas rejected due to zero-balance floor invariant
    pub rejected_indices: Vec<usize>,
}

/// Reduces a batch of commutative deltas targeting a shared state sink
pub fn reduce_commutative_deltas(
    base_balance: u128,
    deltas: &[CommutativeDelta],
) -> DeltaResolutionResult {
    if deltas.is_empty() {
        return DeltaResolutionResult {
            net_delta: 0,
            accepted_indices: Vec::new(),
            rejected_indices: Vec::new(),
        };
    }

    // Associative summation: sum all deltas
    let total_delta: i128 = deltas.iter().map(|d| d.delta_amount).sum();

    // Check if base_balance + total_delta >= 0
    let potential_balance = (base_balance as i128) + total_delta;
    if potential_balance >= 0 {
        // All deltas succeed without contention
        return DeltaResolutionResult {
            net_delta: total_delta,
            accepted_indices: (0..deltas.len()).collect(),
            rejected_indices: Vec::new(),
        };
    }

    // Contention detected: Liquidity exceeded.
    // Apply Canonical Precedence Sorting: Sort by precedence_hash lexicographically (MEV-proof)
    let mut indexed: Vec<(usize, &CommutativeDelta)> = deltas.iter().enumerate().collect();
    indexed.sort_by(|a, b| a.1.precedence_hash.cmp(&b.1.precedence_hash));

    let mut current_balance = base_balance as i128;
    let mut accepted = Vec::new();
    let mut rejected = Vec::new();
    let mut net_delta = 0i128;

    for (orig_idx, delta) in indexed {
        if current_balance + delta.delta_amount >= 0 {
            current_balance += delta.delta_amount;
            net_delta += delta.delta_amount;
            accepted.push(orig_idx);
        } else {
            // Cannot satisfy invariant without going below zero
            rejected.push(orig_idx);
        }
    }

    accepted.sort(); // Restore deterministic order
    rejected.sort();

    DeltaResolutionResult {
        net_delta,
        accepted_indices: accepted,
        rejected_indices: rejected,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_commutative_reduction_no_contention() {
        let base_balance = 100u128;
        let deltas = vec![
            CommutativeDelta::new([0; 32], 50, vec![], [0; 64], [1; 32]),
            CommutativeDelta::new([0; 32], -30, vec![], [0; 64], [2; 32]),
            CommutativeDelta::new([0; 32], -20, vec![], [0; 64], [3; 32]),
        ];
        let res = reduce_commutative_deltas(base_balance, &deltas);
        assert_eq!(res.net_delta, 0); // +50 - 30 - 20 = 0
        assert_eq!(res.accepted_indices.len(), 3);
        assert!(res.rejected_indices.is_empty());
    }

    #[test]
    fn test_canonical_precedence_overdraft_resolution() {
        let base_balance = 10u128;
        // Two conflicting withdrawals: -7 and -6. Total = -13 > 10!
        let d1 = CommutativeDelta::new([0; 32], -7, vec![], [0; 64], [0x01; 32]); // Lower hash
        let d2 = CommutativeDelta::new([0; 32], -6, vec![], [0; 64], [0x02; 32]); // Higher hash

        let res = reduce_commutative_deltas(base_balance, &[d1, d2]);
        assert_eq!(res.net_delta, -7);
        assert_eq!(res.accepted_indices, vec![0]);
        assert_eq!(res.rejected_indices, vec![1]);
    }
}
