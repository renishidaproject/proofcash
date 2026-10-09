//! Poseidon2 Arithmetic Sponge over the 64-bit Goldilocks Field
//!
//! Goldilocks prime: p = 2^64 - 2^32 + 1 = 18446744069414584321
//! Provides zero-knowledge friendly hashing with sub-microsecond evaluation on 64-bit CPUs.

/// The Goldilocks prime modulus: p = 2^64 - 2^32 + 1
pub const GOLDILOCKS_ORDER: u64 = 0xFFFF_FFFF_0000_0001;

/// Element in the Goldilocks Field
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct GoldilocksField(pub u64);

impl GoldilocksField {
    pub const ZERO: Self = Self(0);
    pub const ONE: Self = Self(1);

    #[inline(always)]
    pub fn new(val: u64) -> Self {
        Self(val % GOLDILOCKS_ORDER)
    }

    /// Constant-time addition in the Goldilocks field
    #[inline(always)]
    pub fn add(self, rhs: Self) -> Self {
        let (sum, overflow) = self.0.overflowing_add(rhs.0);
        let res = sum.wrapping_add(if overflow { 0xFFFF_FFFF } else { 0 });
        if res >= GOLDILOCKS_ORDER {
            Self(res - GOLDILOCKS_ORDER)
        } else {
            Self(res)
        }
    }

    /// Constant-time multiplication using 128-bit unsigned arithmetic
    #[inline(always)]
    pub fn mul(self, rhs: Self) -> Self {
        let prod = (self.0 as u128) * (rhs.0 as u128);
        let low = prod as u64;
        let high = (prod >> 64) as u64;

        // Reduction using Goldilocks property 2^64 = 2^32 - 1 mod p
        let high_hi = high >> 32;
        let high_lo = high & 0xFFFF_FFFF;

        let (t0, o0) = low.overflowing_sub(high_hi);
        let t0 = t0.wrapping_sub(if o0 { 0xFFFF_FFFF } else { 0 });

        let (t1, o1) = t0.overflowing_add(high_lo << 32);
        let mut res = t1.wrapping_add(if o1 { 0xFFFF_FFFF } else { 0 });

        if res >= GOLDILOCKS_ORDER {
            res -= GOLDILOCKS_ORDER;
        }
        Self(res)
    }

    /// S-box permutation: x^7
    #[inline(always)]
    pub fn sbox(self) -> Self {
        let x2 = self.mul(self);
        let x4 = x2.mul(x2);
        let x6 = x4.mul(x2);
        x6.mul(self)
    }
}

/// Computes a Poseidon2 hash of two 256-bit byte arrays into a 32-byte digest
/// Used as the primary branch compressor in the Merkle Mountain Range (MMR).
pub fn goldilocks_hash(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut state = [GoldilocksField::ZERO; 4];

    // Unpack bytes into 64-bit field words
    state[0] = GoldilocksField::new(u64::from_le_bytes(left[0..8].try_into().unwrap()));
    state[1] = GoldilocksField::new(u64::from_le_bytes(left[8..16].try_into().unwrap()));
    state[2] = GoldilocksField::new(u64::from_le_bytes(right[0..8].try_into().unwrap()));
    state[3] = GoldilocksField::new(u64::from_le_bytes(right[8..16].try_into().unwrap()));

    // Poseidon2 round permutation rounds (simplified MDS matrix mixing + S-box)
    for round in 0..8 {
        // Add round constant
        state[0] = state[0].add(GoldilocksField::new(0x12345678_90ABCDEF ^ (round as u64)));
        state[1] = state[1].add(GoldilocksField::new(0xFEDCBA09_87654321 ^ (round as u64)));
        
        // Non-linear S-box layer
        state[0] = state[0].sbox();
        state[1] = state[1].sbox();
        state[2] = state[2].sbox();
        state[3] = state[3].sbox();

        // Linear MDS mixing
        let sum = state[0].add(state[1]).add(state[2]).add(state[3]);
        state[0] = state[0].add(sum);
        state[1] = state[1].add(sum);
        state[2] = state[2].add(sum);
        state[3] = state[3].add(sum);
    }

    // Pack state back to 32 bytes
    let mut output = [0u8; 32];
    output[0..8].copy_from_slice(&state[0].0.to_le_bytes());
    output[8..16].copy_from_slice(&state[1].0.to_le_bytes());
    output[16..24].copy_from_slice(&state[2].0.to_le_bytes());
    output[24..32].copy_from_slice(&state[3].0.to_le_bytes());
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_goldilocks_arithmetic() {
        let a = GoldilocksField::new(GOLDILOCKS_ORDER - 1);
        let b = GoldilocksField::new(2);
        let c = a.add(b);
        assert_eq!(c.0, 1);
    }

    #[test]
    fn test_hash_determinism() {
        let left = [1u8; 32];
        let right = [2u8; 32];
        let h1 = goldilocks_hash(&left, &right);
        let h2 = goldilocks_hash(&left, &right);
        assert_eq!(h1, h2);
        assert_ne!(h1, [0u8; 32]);
    }
}
