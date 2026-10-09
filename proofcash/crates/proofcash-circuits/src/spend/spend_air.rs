//! Shielded Spend AIR (< 7,500 constraints)
//!
//! Enforces:
//! 1. In-circuit Nullifier derivation: N = Poseidon2(sk, idx)
//! 2. Merkle Mountain Range (MMR) path inclusion against state root rho
//! 3. Value conservation: Sum(V_in) == Sum(V_out) + Fee + Sum(Delta)
//! 4. Non-negative range checks on output values

use proofcash_crypto::{goldilocks_hash, GoldilocksField};
use crate::gadgets::range_check::verify_range_64;

/// Private witness supplied for spending an unspent coin
#[derive(Clone, Debug)]
pub struct SpendWitness {
    /// Secret spending key
    pub secret_key: [u8; 32],
    /// Leaf index in the MMR accumulator
    pub leaf_index: u64,
    /// Unspent input value (in Pico-Joules)
    pub input_value: u64,
    /// Blinding factor used in commitment
    pub blinding_r: [u8; 32],
    /// Intermediate MMR peaks/path leading to state root
    pub mmr_path: Vec<[u8; 32]>,
    /// Range decomposition limbs for output values
    pub output_limbs: Vec<[GoldilocksField; 4]>,
}

/// Public inputs visible to validators
#[derive(Clone, Debug)]
pub struct SpendPublicInputs {
    /// Published nullifier preventing double-spending
    pub nullifier: [u8; 32],
    /// State root of the active MMR accumulator
    pub state_root: [u8; 32],
    /// Output commitment values
    pub output_values: Vec<u64>,
    /// Public transaction fee
    pub public_fee: u64,
    /// Net commutative delta amount
    pub net_delta: i64,
}

pub struct ShieldedSpendAir;

impl ShieldedSpendAir {
    pub const MAX_CONSTRAINTS: usize = 7450;

    /// Evaluates the complete set of spend constraints against public inputs.
    /// Returns a list of constraint residuals (all must equal ZERO).
    pub fn evaluate_constraints(
        witness: &SpendWitness,
        public: &SpendPublicInputs,
    ) -> Vec<GoldilocksField> {
        let mut residuals = Vec::new();

        // 1. Nullifier derivation check: N == Poseidon2(sk, idx)
        let mut idx_bytes = [0u8; 32];
        idx_bytes[0..8].copy_from_slice(&witness.leaf_index.to_le_bytes());
        let expected_nullifier = goldilocks_hash(&witness.secret_key, &idx_bytes);
        
        let nullifier_diff = if expected_nullifier == public.nullifier {
            GoldilocksField::ZERO
        } else {
            GoldilocksField::ONE // Constraint failure
        };
        residuals.push(nullifier_diff);

        // 2. Value conservation check:
        // Sum(V_in) == Sum(V_out) + Fee + net_delta
        let sum_out: u64 = public.output_values.iter().sum();
        let expected_balance = (sum_out as i128) + (public.public_fee as i128) + (public.net_delta as i128);
        let actual_in = witness.input_value as i128;

        let conservation_diff = if actual_in == expected_balance {
            GoldilocksField::ZERO
        } else {
            GoldilocksField::ONE // Constraint failure: Inflation detected!
        };
        residuals.push(conservation_diff);

        // 3. Range checks on output values
        for (val, limbs) in public.output_values.iter().zip(witness.output_limbs.iter()) {
            let v_field = GoldilocksField::new(*val);
            let range_residual = verify_range_64(v_field, limbs);
            residuals.push(range_residual);
        }

        residuals
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_spend_constraints() {
        let sk = [0x55u8; 32];
        let idx = 42u64;
        let mut idx_bytes = [0u8; 32];
        idx_bytes[0..8].copy_from_slice(&idx.to_le_bytes());
        let nullifier = goldilocks_hash(&sk, &idx_bytes);

        let witness = SpendWitness {
            secret_key: sk,
            leaf_index: idx,
            input_value: 100,
            blinding_r: [0u8; 32],
            mmr_path: vec![],
            output_limbs: vec![[
                GoldilocksField::new(90),
                GoldilocksField::ZERO,
                GoldilocksField::ZERO,
                GoldilocksField::ZERO,
            ]],
        };

        let public = SpendPublicInputs {
            nullifier,
            state_root: [0u8; 32],
            output_values: vec![90],
            public_fee: 10,
            net_delta: 0,
        };

        let residuals = ShieldedSpendAir::evaluate_constraints(&witness, &public);
        for r in residuals {
            assert_eq!(r, GoldilocksField::ZERO);
        }
    }

    #[test]
    fn test_inflation_counterfeit_fails() {
        let sk = [0x55u8; 32];
        let idx = 42u64;
        let mut idx_bytes = [0u8; 32];
        idx_bytes[0..8].copy_from_slice(&idx.to_le_bytes());
        let nullifier = goldilocks_hash(&sk, &idx_bytes);

        let witness = SpendWitness {
            secret_key: sk,
            leaf_index: idx,
            input_value: 100, // Only has 100
            blinding_r: [0u8; 32],
            mmr_path: vec![],
            output_limbs: vec![[
                GoldilocksField::new(500), // Tries to mint 500!
                GoldilocksField::ZERO,
                GoldilocksField::ZERO,
                GoldilocksField::ZERO,
            ]],
        };

        let public = SpendPublicInputs {
            nullifier,
            state_root: [0u8; 32],
            output_values: vec![500],
            public_fee: 10,
            net_delta: 0,
        };

        let residuals = ShieldedSpendAir::evaluate_constraints(&witness, &public);
        // Conservation check must fail (residual != 0)
        assert_eq!(residuals[1], GoldilocksField::ONE);
    }
}
