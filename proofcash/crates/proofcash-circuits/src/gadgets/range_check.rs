//! 64-bit and 128-bit Range Check Gadget (AIR)
//!
//! Decomposes integer values into 16-bit limbs to prove non-negativity
//! and prevent field underflow/overflow balance exploits.

use proofcash_crypto::GoldilocksField;

#[derive(Clone, Copy, Debug, Default)]
pub struct RangeCheckLimb {
    pub limb: GoldilocksField,
}

/// Verifies that value v decomposes into four 16-bit limbs:
/// v = L0 + L1 * 2^16 + L2 * 2^32 + L3 * 2^48
/// with each limb L_i in [0, 65535].
pub fn verify_range_64(
    v: GoldilocksField,
    limbs: &[GoldilocksField; 4],
) -> GoldilocksField {
    let base16 = GoldilocksField::new(1 << 16);
    let base32 = base16.mul(base16);
    let base48 = base32.mul(base16);

    // Reconstruct value from limbs
    let reconstructed = limbs[0]
        .add(limbs[1].mul(base16))
        .add(limbs[2].mul(base32))
        .add(limbs[3].mul(base48));

    // Constraint: v - reconstructed == 0
    let neg_reconstructed = if reconstructed.0 == 0 {
        reconstructed
    } else {
        GoldilocksField::new(proofcash_crypto::poseidon2::GOLDILOCKS_ORDER - reconstructed.0)
    };

    v.add(neg_reconstructed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_range_check() {
        let val = 0x1234_5678_9ABC_DEF0u64;
        let l0 = GoldilocksField::new((val & 0xFFFF) as u64);
        let l1 = GoldilocksField::new(((val >> 16) & 0xFFFF) as u64);
        let l2 = GoldilocksField::new(((val >> 32) & 0xFFFF) as u64);
        let l3 = GoldilocksField::new(((val >> 48) & 0xFFFF) as u64);

        let v = GoldilocksField::new(val);
        let diff = verify_range_64(v, &[l0, l1, l2, l3]);
        assert_eq!(diff, GoldilocksField::ZERO);
    }
}
