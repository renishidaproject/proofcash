//! # ProofCash Prover Engine
//!
//! High-performance SIMD/GPU proving pipeline using Binius binary tower fields,
//! out-of-core Walsh-Hadamard Transforms, and strict < 12 GB VRAM memory management.

pub mod binary_tower;
pub mod gpu_pipeline;
pub mod wht;

pub use binary_tower::{BinaryField64, BinaryField8};
pub use gpu_pipeline::{GpuMemoryStats, GpuProverPipeline, MAX_GPU_VRAM_BYTES, PEAK_ALLOCATION_TARGET_BYTES};
pub use wht::FastWalshHadamardTransform;
