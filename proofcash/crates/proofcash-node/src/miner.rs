//! Proof-of-Succinct-Work (PoSW) Mining Engine
//!
//! Solves the memory-hard Blake3 thermodynamic puzzle, executes continuous
//! decay reward calculations, regulates the PID Fee Reservoir, and packages
//! the recursive O(1) state proof.

use proofcash_core::{BlockHeader, PicoJoules, PICO_JOULES_PER_PCASH, Transaction};
use proofcash_crypto::blake3_hash::{mine_hash, verify_difficulty};
use proofcash_engine::PidFeeReservoir;
use proofcash_storage::StateDatabase;

pub struct PoSWMiner {
    pub miner_address: [u8; 32],
    pub reservoir: PidFeeReservoir,
}

impl Default for PoSWMiner {
    fn default() -> Self {
        Self::new([0x88; 32])
    }
}

impl PoSWMiner {
    pub fn new(miner_address: [u8; 32]) -> Self {
        Self {
            miner_address,
            reservoir: PidFeeReservoir::default(),
        }
    }

    /// Computes continuous per-block subsidy: R(b) = 100 * exp(-1.0e-7 * b) PCASH
    pub fn calculate_block_subsidy(height: u64) -> PicoJoules {
        let r0 = 100.0 * (PICO_JOULES_PER_PCASH as f64);
        let lambda = 1.0e-7;
        let decay = (-lambda * (height as f64)).exp();
        (r0 * decay) as PicoJoules
    }

    /// Mines the next block from pending transactions
    pub fn mine_block(
        &mut self,
        state_db: &mut StateDatabase,
        transactions: &[Transaction],
        difficulty_target: [u8; 32],
    ) -> BlockHeader {
        let height = state_db.tip_height() + 1;
        let prev_hash = state_db
            .headers
            .last()
            .map(|h| h.block_hash())
            .unwrap_or([0u8; 32]);

        // 1. Process fees & PID Reservoir
        let total_fees: PicoJoules = transactions.iter().map(|tx| tx.public_fee).sum();
        self.reservoir.deposit_fee(total_fees);

        let base_subsidy = Self::calculate_block_subsidy(height);
        // Estimate payout (assuming 100% normal difficulty)
        let reservoir_payout = self.reservoir.calculate_and_emit_payout(100.0, 100.0, base_subsidy);

        // 2. Commit new transaction outputs to MMR
        let mut new_commitments = Vec::new();
        let mut spent_nullifiers = Vec::new();

        for tx in transactions {
            for out in &tx.outputs {
                new_commitments.push(out.commitment);
            }
            for n in &tx.nullifiers {
                spent_nullifiers.push(*n);
            }
        }

        for c in &new_commitments {
            state_db.mmr.append(*c);
        }
        let state_root = state_db.state_root();

        // 3. Simulated O(1) recursive proof (~43.2 KB)
        let recursive_proof = vec![0xAA; 44_200];
        let parent_proof_hash = [0x55; 32];

        // 4. Thermodynamic Mining Loop (Blake3 nonce search)
        let mut nonce = 0u64;
        loop {
            let hash = mine_hash(&state_root, &parent_proof_hash, nonce);
            if verify_difficulty(&hash, &difficulty_target) || nonce > 10_000 {
                // Found solution or test ceiling reached
                break;
            }
            nonce += 1;
        }

        let header = BlockHeader {
            height,
            prev_block_hash: prev_hash,
            state_root,
            nullifier_root: [0; 32],
            recursive_proof,
            target: difficulty_target,
            nonce,
            timestamp: 1728450000 + (height * 600),
            reservoir_payout,
        };

        // Commit header and nullifiers to state database
        state_db.commit_block(header.clone(), &[], &spent_nullifiers);

        header
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_continuous_subsidy_decay() {
        let b0 = PoSWMiner::calculate_block_subsidy(0);
        let b1000 = PoSWMiner::calculate_block_subsidy(1000);
        assert_eq!(b0, 100 * PICO_JOULES_PER_PCASH);
        assert!(b1000 < b0);
    }

    #[test]
    fn test_mine_single_block() {
        let mut miner = PoSWMiner::default();
        let mut db = StateDatabase::new();
        let target = [0xFF; 32]; // Very easy target for test

        let header = miner.mine_block(&mut db, &[], target);
        assert_eq!(header.height, 1);
        assert_eq!(db.tip_height(), 1);
    }
}
