//! Poseidon2 Sponge Permutation Constraints (Goldilocks AIR)
//!
//! Enforces non-linear S-box layer (x^7) and linear MDS matrix transitions
//! between consecutive execution trace rows.

use proofcash_crypto::GoldilocksField;

/// A single execution row in the Poseidon2 trace matrix (width 4)
#[derive(Clone, Copy, Debug, Default)]
pub struct Poseidon2TraceRow {
    pub state: [GoldilocksField; 4],
    pub round: u32,
    pub round_constants: [GoldilocksField; 4],
}

/// Evaluates transition constraints between row t and row t+1.
/// Returns zero vector if and only if state transition is mathematically valid.
pub fn verify_poseidon2_transition(
    current: &Poseidon2TraceRow,
    next: &Poseidon2TraceRow,
) -> [GoldilocksField; 4] {
    // 1. Add round constants and evaluate non-linear S-box: (s_i + rc_i)^7
    let mut after_sbox = [GoldilocksField::ZERO; 4];
    for i in 0..4 {
        let added = current.state[i].add(current.round_constants[i]);
        after_sbox[i] = added.sbox();
    }

    // 2. Linear MDS mixing
    let sum = after_sbox[0]
        .add(after_sbox[1])
        .add(after_sbox[2])
        .add(after_sbox[3]);
    let mut expected_next = [GoldilocksField::ZERO; 4];
    for i in 0..4 {
        expected_next[i] = after_sbox[i].add(sum);
    }

    // 3. Constraint evaluations: next.state[i] - expected_next[i] == 0
    let mut constraints = [GoldilocksField::ZERO; 4];
    for i in 0..4 {
        // In prime field, a - b = a + (p - b)
        let neg_expected = GoldilocksField::new(
            proofcash_crypto::poseidon2::GOLDILOCKS_ORDER - (expected_next[i].0 % proofcash_crypto::poseidon2::GOLDILOCKS_ORDER),
        );
        constraints[i] = next.state[i].add(neg_expected);
    }

    constraints
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_poseidon2_transition() {
        let current = Poseidon2TraceRow {
            state: [GoldilocksField::new(1), GoldilocksField::new(2), GoldilocksField::new(3), GoldilocksField::new(4)],
            round: 0,
            round_constants: [GoldilocksField::new(10), GoldilocksField::new(20), GoldilocksField::new(30), GoldilocksField::new(40)],
        };

        // Compute valid next row
        let mut after_sbox = [GoldilocksField::ZERO; 4];
        for i in 0..4 {
            after_sbox[i] = current.state[i].add(current.round_constants[i]).sbox();
        }
        let sum = after_sbox[0].add(after_sbox[1]).add(after_sbox[2]).add(after_sbox[3]);
        let next_state = [
            after_sbox[0].add(sum),
            after_sbox[1].add(sum),
            after_sbox[2].add(sum),
            after_sbox[3].add(sum),
        ];

        let next = Poseidon2TraceRow {
            state: next_state,
            round: 1,
            round_constants: [GoldilocksField::ZERO; 4],
        };

        let constraints = verify_poseidon2_transition(&current, &next);
        assert_eq!(constraints, [GoldilocksField::ZERO; 4]);
    }
}
