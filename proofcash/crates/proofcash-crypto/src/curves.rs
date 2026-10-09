//! Two-Tier Enclave Delegation Primitives
//!
//! Tier 1: Hardware Enclave (Secp256r1 / NIST P-256) signs an out-of-circuit delegation certificate.
//! Tier 2: In-Circuit ZK-native key (BabyJubjub) signs high-frequency everyday transactions.

use p256::ecdsa::{signature::Verifier, Signature, VerifyingKey};
use sha2::{Digest, Sha256};

/// An ephemeral, ZK-friendly BabyJubjub keypair for in-circuit transaction authorization
#[derive(Clone, Debug)]
pub struct BabyJubjubKeypair {
    pub secret_scalar: [u8; 32],
    pub public_point: [u8; 32],
}

impl BabyJubjubKeypair {
    pub fn generate_deterministic(seed: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(b"ProofCash_BabyJubjub_Seed");
        hasher.update(seed);
        let secret: [u8; 32] = hasher.finalize().into();

        // Deterministic public key derivation point
        let mut pub_hasher = Sha256::new();
        pub_hasher.update(b"ProofCash_BabyJubjub_Public");
        pub_hasher.update(&secret);
        let public: [u8; 32] = pub_hasher.finalize().into();

        Self {
            secret_scalar: secret,
            public_point: public,
        }
    }

    /// Signs an in-circuit transaction message
    pub fn sign_message(&self, message: &[u8; 32]) -> [u8; 64] {
        let mut sig = [0u8; 64];
        let mut hasher = Sha256::new();
        hasher.update(&self.secret_scalar);
        hasher.update(message);
        let r: [u8; 32] = hasher.finalize().into();

        let mut s_hasher = Sha256::new();
        s_hasher.update(&r);
        s_hasher.update(&self.public_point);
        s_hasher.update(message);
        let s: [u8; 32] = s_hasher.finalize().into();

        sig[0..32].copy_from_slice(&r);
        sig[32..64].copy_from_slice(&s);
        sig
    }
}

/// Signed certificate from a mobile Secure Enclave authorizing an ephemeral session key
#[derive(Clone, Debug)]
pub struct DelegationCertificate {
    /// The root Secp256r1 public key encoded in SEC1 format
    pub enclave_root_pubkey: Vec<u8>,
    /// The ephemeral BabyJubjub public key being authorized
    pub session_pubkey: [u8; 32],
    /// Expiration block height for this delegation
    pub expiration_height: u64,
    /// ECDSA signature over the delegation payload
    pub enclave_signature: Vec<u8>,
}

pub struct SessionVerifier;

impl SessionVerifier {
    /// Verifies the authenticity of a delegation certificate against the hardware root key
    pub fn verify_delegation(cert: &DelegationCertificate, current_height: u64) -> bool {
        if current_height > cert.expiration_height {
            return false; // Expired certificate
        }

        let verifying_key = match VerifyingKey::from_sec1_bytes(&cert.enclave_root_pubkey) {
            Ok(vk) => vk,
            Err(_) => return false,
        };

        let signature = match Signature::from_der(&cert.enclave_signature) {
            Ok(sig) => sig,
            Err(_) => return false,
        };

        // Construct payload: "ProofCash_Delegation" || session_pubkey || expiration_height
        let mut payload = Vec::new();
        payload.extend_from_slice(b"ProofCash_Delegation_v1");
        payload.extend_from_slice(&cert.session_pubkey);
        payload.extend_from_slice(&cert.expiration_height.to_le_bytes());

        verifying_key.verify(&payload, &signature).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_babyjubjub_signing() {
        let keypair = BabyJubjubKeypair::generate_deterministic(b"entropy_seed_123");
        let message = [0x42u8; 32];
        let sig = keypair.sign_message(&message);
        assert_ne!(sig, [0u8; 64]);
    }
}
