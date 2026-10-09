//! JSON-RPC and CLI Interface for ProofCash
//!
//! Exposes administrative queries and transaction broadcast endpoints.

use crate::mempool::Mempool;
use crate::miner::PoSWMiner;
use proofcash_core::Transaction;
use proofcash_storage::StateDatabase;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct BlockchainInfo {
    pub chain: String,
    pub blocks: u64,
    pub state_root: String,
    pub reservoir_balance: u128,
    pub total_burned: u128,
    pub proof_size_kb: f64,
}

pub struct NodeRpcHandler;

impl NodeRpcHandler {
    /// Handler for `getblockchaininfo` RPC call
    pub fn get_blockchain_info(db: &StateDatabase, miner: &PoSWMiner) -> BlockchainInfo {
        BlockchainInfo {
            chain: "mainnet".to_string(),
            blocks: db.tip_height(),
            state_root: hex::encode(db.state_root()),
            reservoir_balance: miner.reservoir.balance,
            total_burned: miner.reservoir.total_burned,
            proof_size_kb: 43.21,
        }
    }

    /// Handler for `sendrawtransaction` RPC call
    pub fn send_raw_transaction(
        mempool: &mut Mempool,
        db: &StateDatabase,
        tx: Transaction,
    ) -> Result<String, &'static str> {
        let txid = mempool.insert(tx, db)?;
        Ok(hex::encode(txid))
    }

    /// Handler for `generate_blocks` / `mine` RPC call
    pub fn mine_blocks(
        miner: &mut PoSWMiner,
        db: &mut StateDatabase,
        mempool: &mut Mempool,
        count: usize,
    ) -> Vec<String> {
        let mut block_hashes = Vec::new();
        let target = [0xFF; 32]; // Standard target for test miners

        for _ in 0..count {
            let txs = mempool.drain_batch(500);
            let header = miner.mine_block(db, &txs, target);
            block_hashes.push(hex::encode(header.block_hash()));
        }
        block_hashes
    }
}

// Minimal hex encoding helper
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes
            .as_ref()
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }
}
