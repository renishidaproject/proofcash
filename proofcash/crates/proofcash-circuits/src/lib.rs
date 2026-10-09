//! # ProofCash Zero-Knowledge Circuits Engine
//!
//! Implements Plonky3 / Binius STARK Algebraic Intermediate Representation (AIR)
//! for shielded spend verification, two-tier enclave delegation, and recursive FRI folding.

pub mod gadgets;
pub mod recursive;
pub mod spend;

pub use gadgets::{
    verify_babyjubjub_addition, verify_poseidon2_transition, verify_range_64,
    verify_schnorr_signature, Poseidon2TraceRow, RangeCheckLimb,
};
pub use recursive::{RecursiveFriVerifier, RecursiveProofPayload};
pub use spend::{
    DelegationWitness, ShieldedSpendAir, SpendWitness, TwoTierDelegationAir,
};
