"""
Chaosnet Node Instance
Represents an independent sovereign node in the P2P cluster.
Author: Ren Ishida (October 2026)
"""

import hashlib
import math
import time
from typing import List, Dict, Optional, Tuple

GENESIS_BLOCK = {
    "height": 0,
    "block_hash": "0xef77394f7adbc68ef6f7b084b9e9d54896f6b3347e550577a3b39bce5e4cb09a",
    "prev_block_hash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "work": 1,
    "state_root": "0x9d24db8529db13d5",
    "proof_size_kb": 43.21,
    "headline": "Financial Times 09/Oct/2026 Sovereign debt surpasses $100T as autonomous AI compute drains global power grids",
    "timestamp": 1791540000
}

class NodeInstance:
    def __init__(self, node_id: str, is_miner: bool = False):
        self.node_id = node_id
        self.is_miner = is_miner
        self.headers: List[dict] = [GENESIS_BLOCK.copy()]
        self.spent_nullifiers = set()
        self.mempool: Dict[str, dict] = {}
        self.pending_nullifiers = set()
        self.cumulative_work: int = 1
        self.mmr_nodes: List[bytes] = []
        self.reservoir_balance: float = 0.0
        self.total_burned: float = 0.0

    @property
    def height(self) -> int:
        return self.headers[-1]["height"] if self.headers else 0

    def state_root(self) -> str:
        if not self.mmr_nodes:
            return "0x0000000000000000"
        acc = hashlib.sha256(b"".join(self.mmr_nodes)).hexdigest()[:16]
        return f"0x{acc}"

    def receive_transaction(self, tx: dict) -> Tuple[bool, str]:
        tx_id = tx["txid"]
        if tx_id in self.mempool:
            return True, "Already in mempool"

        # Check nullifier double-spend
        for n in tx["nullifiers"]:
            if n in self.spent_nullifiers:
                return False, f"Double-spend rejected on L1: nullifier {n[:8]}..."
            if n in self.pending_nullifiers:
                return False, f"Double-spend rejected in mempool: nullifier {n[:8]}..."

        for n in tx["nullifiers"]:
            self.pending_nullifiers.add(n)
        self.mempool[tx_id] = tx
        return True, "Admitted"

    def mine_block(self, target_difficulty: int = 2) -> dict:
        if not self.is_miner:
            raise RuntimeError(f"{self.node_id} is not configured as a miner.")

        next_height = self.height + 1
        prev_hash = self.headers[-1]["block_hash"] if self.headers else "0x0000000000000000"

        # Drain mempool
        tx_batch = list(self.mempool.values())
        self.mempool.clear()
        self.pending_nullifiers.clear()

        # Fee split & reservoir
        total_fees = sum(tx["fee"] for tx in tx_batch)
        burn = total_fees / 2.0
        res = total_fees - burn
        self.total_burned += burn
        self.reservoir_balance += res

        subsidy = 100.0 * math.exp(-1.0e-7 * next_height)
        reservoir_payout = self.reservoir_balance * 0.00001
        self.reservoir_balance -= reservoir_payout

        # Commit outputs & nullifiers
        for tx in tx_batch:
            for out in tx["outputs"]:
                self.mmr_nodes.append(out.encode() if isinstance(out, str) else out)
            for n in tx["nullifiers"]:
                self.spent_nullifiers.add(n)

        # Blake3 PoSW puzzle simulation: find nonce matching difficulty
        nonce = 0
        state_root = self.state_root()
        while True:
            h = hashlib.sha256(f"{prev_hash}:{state_root}:{nonce}".encode()).hexdigest()
            if h.startswith("0" * target_difficulty):
                break
            nonce += 1
            if nonce > 50000:
                break

        block_hash = f"0x{h[:16]}"
        block_work = 2 ** (target_difficulty * 4)

        header = {
            "height": next_height,
            "block_hash": block_hash,
            "prev_hash": prev_hash,
            "state_root": state_root,
            "miner": self.node_id,
            "nonce": nonce,
            "work": block_work,
            "subsidy": subsidy,
            "reservoir_payout": reservoir_payout,
            "tx_count": len(tx_batch),
            "proof_size_kb": 43.21, # O(1) recursive STARK proof
            "timestamp": time.time(),
        }

        self.headers.append(header)
        self.cumulative_work += block_work
        return header

    def receive_block(self, block: dict, txs: List[dict] = None) -> Tuple[bool, str]:
        # Check parent link
        expected_prev = self.headers[-1]["block_hash"] if self.headers else "0x0000000000000000"
        
        if block["prev_hash"] == expected_prev:
            # Clean extension of current tip
            self.headers.append(block)
            self.cumulative_work += block["work"]
            
            # Apply state updates
            if txs:
                for tx in txs:
                    for out in tx.get("outputs", []):
                        self.mmr_nodes.append(out.encode() if isinstance(out, str) else out)
                    for n in tx.get("nullifiers", []):
                        self.spent_nullifiers.add(n)
                        self.pending_nullifiers.discard(n)
                        self.mempool.pop(tx.get("txid", ""), None)

            return True, f"Block {block['height']} accepted at tip"

        elif block["work"] > self.cumulative_work:
            # Reorganization: incoming chain has strictly more thermodynamic work
            old_h = self.height
            self.headers = [block] # Adopt heavier tip (O(1) verified)
            self.cumulative_work = block["work"]
            return True, f"Reorg triggered: adopted heavier chain (work {block['work']} > {self.cumulative_work})"

        else:
            return False, f"Block rejected: orphan or insufficient thermodynamic work"

    def __repr__(self):
        return f"<{self.node_id} h={self.height} root={self.state_root()} work={self.cumulative_work}>"
