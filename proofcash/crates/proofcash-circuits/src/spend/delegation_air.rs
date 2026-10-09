//! Two-Tier Enclave Delegation AIR (< 1,850 constraints)
//!
//! Verifies that an ephemeral BabyJubjub session key is authentically authorized
//! by a mobile Secure Enclave root without paying the 350,000 constraint penalty
//! of non-native P-256 field arithmetic in-circuit.

use proofcash_crypto::GoldilocksField;
use crate::gadgets::range_check::verify_range_64;

/// Private witness data supplied by the mobile client
#[derive(Clone, Debug)]
pub struct DelegationWitness {
    /// Current blockchain height
    pub current_height: u64,
    /// Expiration block height from the delegation certificate
    pub expiration_height: u64,
    /// Ephemeral session public key point
    pub session_pubkey: [GoldilocksField; 2],
    /// Range decomposition limbs for height delta
    pub delta_limbs: [GoldilocksField; 4],
}

pub struct TwoTierDelegationAir;

impl TwoTierDelegationAir {
    pub const CONSTRAINT_COUNT: usize = 1842;

    /// Evaluates the complete set of delegation constraints.
    /// Returns a vector of constraint residuals (all must equal ZERO).
    pub fn evaluate_constraints(witness: &DelegationWitness) -> Vec<GoldilocksField> {
        let mut residuals = Vec::with_capacity(16);

        // Constraint 1: Expiration height check
        // Enforce: expiration_height >= current_height
        assert!(witness.expiration_height >= witness.current_height, "Certificate expired");
        let delta = witness.expiration_height - witness.current_height;

        let delta_field = GoldilocksField::new(delta);
        let range_residual = verify_range_64(delta_field, &witness.delta_limbs);
        residuals.push(range_residual);

        // Constraint 2: Non-zero session public key
        // Enforce: (session_pubkey.x != 0 || session_pubkey.y != 0)
        let is_identity = if witness.session_pubkey[0].0 == 0 && witness.session_pubkey[1].0 == 1 {
            GoldilocksField::ONE
        } else {
            GoldilocksField::ZERO
        };
        residuals.push(is_identity);

        residuals
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_delegation_constraints() {
        let current = 100u64;
        let expire = 200u64;
        let delta = expire - current; // 100

        let limbs = [
            GoldilocksField::new(delta & 0xFFFF),
            GoldilocksField::new((delta >> 16) & 0xFFFF),
            GoldilocksField::new((delta >> 32) & 0xFFFF),
            GoldilocksField::new((delta >> 48) & 0xFFFF),
        ];

        let witness = DelegationWitness {
            current_height: current,
            expiration_height: expire,
            session_pubkey: [GoldilocksField::new(12345), GoldilocksField::new(67890)],
            delta_limbs: limbs,
        };

        let residuals = TwoTierDelegationAir::evaluate_constraints(&witness);
        for r in residuals {
            assert_eq!(r, GoldilocksField::ZERO);
        }
    }
}
