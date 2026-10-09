//! Transaction Mempool for ProofCash
//!
//! Validates incoming transactions, performs sub-microsecond nullifier checks,
//! and orders transactions for parallel block proposal.

use proofcash_core::Transaction;
use proofcash_storage::StateDatabase;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Default)]
pub struct Mempool {
    /// Pending transactions keyed by transaction hash (txid)
    transactions: HashMap<[u8; 32], Transaction>,
    /// Unconfirmed nullifiers currently locked by pending transactions
    pending_nullifiers: HashSet<[u8; 32]>,
}

impl Mempool {
    pub fn new() -> Self {
        Self {
            transactions: HashMap::new(),
            pending_nullifiers: HashSet::new(),
        }
    }

    /// Validates and admits a transaction to the mempool
    pub fn insert(
        &mut self,
        tx: Transaction,
        state_db: &StateDatabase,
    ) -> Result<[u8; 32], &'static str> {
        if !tx.is_structurally_valid() {
            return Err("Transaction structurally invalid");
        }

        let txid = tx.txid();
        if self.transactions.contains_key(&txid) {
            return Ok(txid); // Already present
        }

        // Check for double-spends against confirmed ledger
        for nullifier in &tx.nullifiers {
            if state_db.is_nullifier_spent(nullifier) {
                return Err("Double-spend detected: nullifier already spent on L1");
            }
            if self.pending_nullifiers.contains(nullifier) {
                return Err("Double-spend detected: nullifier already pending in mempool");
            }
        }

        // Lock nullifiers and admit transaction
        for nullifier in &tx.nullifiers {
            self.pending_nullifiers.insert(*nullifier);
        }
        self.transactions.insert(txid, tx);

        Ok(txid)
    }

    /// Drains a batch of transactions for block proposal
    pub fn drain_batch(&mut self, max_count: usize) -> Vec<Transaction> {
        let mut batch = Vec::new();
        let txids: Vec<[u8; 32]> = self.transactions.keys().take(max_count).copied().collect();

        for txid in txids {
            if let Some(tx) = self.transactions.remove(&txid) {
                for n in &tx.nullifiers {
                    self.pending_nullifiers.remove(n);
                }
                batch.push(tx);
            }
        }
        batch
    }

    pub fn len(&self) -> usize {
        self.transactions.len()
    }

    pub fn is_empty(&self) -> bool {
        self.transactions.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mempool_double_spend_rejection() {
        let mut mempool = Mempool::new();
        let db = StateDatabase::new();

        let tx1 = Transaction {
            nullifiers: vec![[0x11; 32]],
            outputs: vec![],
            commutative_deltas: vec![],
            public_fee: 10,
            zk_proof: vec![],
        };

        let tx2 = Transaction {
            nullifiers: vec![[0x11; 32]], // Same nullifier!
            outputs: vec![],
            commutative_deltas: vec![],
            public_fee: 20,
            zk_proof: vec![],
        };

        assert!(mempool.insert(tx1, &db).is_ok());
        assert_eq!(
            mempool.insert(tx2, &db),
            Err("Double-spend detected: nullifier already pending in mempool")
        );
    }
}
