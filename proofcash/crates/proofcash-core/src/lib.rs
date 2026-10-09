//! # ProofCash Core Data Structures
//!
//! Encapsulates the Extended-UTXO schema, Commutative Delta types,
//! the post-quantum Merkle Mountain Range (MMR), and transaction formats.

pub mod block;
pub mod delta;
pub mod mmr;
pub mod output;
pub mod transaction;

pub use block::BlockHeader;
pub use delta::CommutativeDelta;
pub use mmr::MerkleMountainRange;
pub use output::{Output, PicoJoules, PICO_JOULES_PER_PCASH};
pub use transaction::Transaction;
