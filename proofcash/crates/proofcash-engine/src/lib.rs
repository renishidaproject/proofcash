//! # ProofCash Execution Engine
//!
//! Evaluates transactions, reduces Commutative Delta-UTXOs in parallel,
//! and regulates the PID Thermodynamic Fee Reservoir.

pub mod monoid;
pub mod pid_reservoir;

pub use monoid::{reduce_commutative_deltas, DeltaResolutionResult};
pub use pid_reservoir::{PidFeeReservoir, ReservoirConfig};
