//! # ProofCash Cryptographic Primitives
//!
//! Provides fundamental hash functions, field operations, and curve abstractions
//! tailored for succinct, zero-knowledge verification and enclave passkey integration.

pub mod blake3_hash;
pub mod curves;
pub mod poseidon2;

pub use blake3_hash::blake3_digest;
pub use curves::{BabyJubjubKeypair, DelegationCertificate, SessionVerifier};
pub use poseidon2::{goldilocks_hash, GoldilocksField};
