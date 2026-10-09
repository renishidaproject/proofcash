use blake3::Hasher;

/// Computes a standard 256-bit Blake3 digest over arbitrary bytes.
pub fn blake3_digest(data: &[u8]) -> [u8; 32] {
    let mut hasher = Hasher::new();
    hasher.update(data);
    *hasher.finalize().as_bytes()
}

/// Computes the thermodynamic Proof-of-Succinct-Work (PoSW) mining hash.
/// Combines the block state root, parent recursive proof digest, and the 64-bit nonce.
pub fn mine_hash(state_root: &[u8; 32], parent_proof_hash: &[u8; 32], nonce: u64) -> [u8; 32] {
    let mut hasher = Hasher::new();
    hasher.update(b"ProofCash_PoSW_v1");
    hasher.update(state_root);
    hasher.update(parent_proof_hash);
    hasher.update(&nonce.to_le_bytes());
    *hasher.finalize().as_bytes()
}

/// Checks whether a mined hash meets the thermodynamic difficulty target.
/// The hash (interpreted as big-endian integer) must be strictly less than the target.
pub fn verify_difficulty(hash: &[u8; 32], target: &[u8; 32]) -> bool {
    // Lexicographical comparison matches big-endian numerical comparison
    hash < target
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blake3_deterministic() {
        let digest1 = blake3_digest(b"proofcash");
        let digest2 = blake3_digest(b"proofcash");
        assert_eq!(digest1, digest2);
        assert_ne!(digest1, [0u8; 32]);
    }

    #[test]
    fn test_difficulty_check() {
        let target = [0x00, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let valid_hash = [0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let invalid_hash = [0x01, 0x00, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        assert!(verify_difficulty(&valid_hash, &target));
        assert!(!verify_difficulty(&invalid_hash, &target));
    }
}
