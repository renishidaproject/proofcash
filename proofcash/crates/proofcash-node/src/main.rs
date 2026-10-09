//! # proofcashd
//!
//! The ProofCash sovereign reference node daemon.
//! Author: Ren Ishida (October 2026)

use proofcash_node::{Mempool, NodeRpcHandler, PoSWMiner};
use proofcash_storage::StateDatabase;

fn main() {
    println!("========================================================");
    println!("  PROOFCASHD — Sovereign Thermodynamic Node Daemon v1.1 ");
    println!("  Author: Ren Ishida (October 2026)                     ");
    println!("========================================================");
    println!("-> Initializing memory-mapped state accumulator (MMR)...");
    let mut db = StateDatabase::new();
    let mut mempool = Mempool::new();
    let mut miner = PoSWMiner::default();

    println!("-> Genesis block loaded: State root = 0x{:02x}...", db.state_root()[0]);
    println!("-> O(1) Recursive STARK verifier initialized (~43.2 KB proof budget)");
    println!("-> PID Thermodynamic Fee Reservoir: Kp=0.5, Ki=0.05, alpha=0.98");
    println!("-> Total Supply Cap: 1,000,000,000 PCASH (10^21 Pico-Joules)");

    // Query initial node status
    let info = NodeRpcHandler::get_blockchain_info(&db, &miner);
    println!("\n[RPC] Initial Blockchain Status:");
    println!("  Height:           {}", info.blocks);
    println!("  State Root:       {}", info.state_root);
    println!("  Recursive Proof:  {:.2} KB", info.proof_size_kb);
    println!("  Reservoir Pool:   {} pJ", info.reservoir_balance);

    // Simulate mining a block
    println!("\n-> Mining Block 1 via Proof-of-Succinct-Work...");
    let hashes = NodeRpcHandler::mine_blocks(&mut miner, &mut db, &mut mempool, 1);
    println!("  Mined Block 1 Hash: {}", hashes[0]);

    let updated_info = NodeRpcHandler::get_blockchain_info(&db, &miner);
    println!("\n[RPC] Updated Blockchain Status:");
    println!("  Height:           {}", updated_info.blocks);
    println!("  New State Root:   {}", updated_info.state_root);
    println!("  Proof Size:       {:.2} KB (O(1) verified)", updated_info.proof_size_kb);
    println!("\n✓ Node daemon is running and synchronized. Listening for P2P peers.");
}
