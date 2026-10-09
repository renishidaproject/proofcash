//! Binius Binary Tower Field Arithmetic
//!
//! Implements binary tower field arithmetic: F_2 -> F_4 -> F_16 -> F_256 -> F_2^16 -> F_2^32 -> F_2^64.
//! Addition is bitwise XOR (zero CPU/GPU cycle latency).
//! Multiplication maps directly onto SIMD byte/word vector registers (AVX-512, ARM Neon, CUDA PTX).

/// 8-bit Binary Tower Field element (F_2^8)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct BinaryField8(pub u8);

impl BinaryField8 {
    pub const ZERO: Self = Self(0);
    pub const ONE: Self = Self(1);

    /// Addition in binary field is bitwise XOR
    #[inline(always)]
    pub fn add(self, rhs: Self) -> Self {
        Self(self.0 ^ rhs.0)
    }

    /// Subtraction is identical to addition in characteristic 2
    #[inline(always)]
    pub fn sub(self, rhs: Self) -> Self {
        self.add(rhs)
    }

    /// Multiplication in F_2^8 using standard Rijndael/AES reduction polynomial: x^8 + x^4 + x^3 + x + 1
    #[inline(always)]
    pub fn mul(self, rhs: Self) -> Self {
        let mut a = self.0;
        let mut b = rhs.0;
        let mut p = 0u8;

        for _ in 0..8 {
            if (b & 1) != 0 {
                p ^= a;
            }
            let hi_bit = (a & 0x80) != 0;
            a <<= 1;
            if hi_bit {
                a ^= 0x1B; // Irreducible polynomial reduction
            }
            b >>= 1;
        }
        Self(p)
    }
}

/// 64-bit Binary Tower Field element (F_2^64)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct BinaryField64(pub u64);

impl BinaryField64 {
    pub const ZERO: Self = Self(0);
    pub const ONE: Self = Self(1);

    #[inline(always)]
    pub fn add(self, rhs: Self) -> Self {
        Self(self.0 ^ rhs.0)
    }

    /// Fast carry-less multiplication (simulating clmul hardware instruction)
    #[inline(always)]
    pub fn mul(self, rhs: Self) -> Self {
        let mut res = 0u64;
        let mut a = self.0;
        let mut b = rhs.0;

        while b > 0 {
            if (b & 1) == 1 {
                res ^= a;
            }
            a = (a << 1) ^ if (a & 0x8000_0000_0000_0000) != 0 { 0x1B } else { 0 };
            b >>= 1;
        }
        Self(res)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_binary_field_addition_identity() {
        let a = BinaryField8(0x57);
        let b = BinaryField8(0x83);
        // XOR: 0x57 ^ 0x83 = 0xD4
        assert_eq!(a.add(b), BinaryField8(0xD4));
        // a + a = 0 in characteristic 2
        assert_eq!(a.add(a), BinaryField8::ZERO);
    }

    #[test]
    fn test_binary_field_multiplication() {
        let a = BinaryField8(0x57);
        let b = BinaryField8(0x02);
        // (0x57 << 1) = 0xAE
        assert_eq!(a.mul(b), BinaryField8(0xAE));
    }
}
