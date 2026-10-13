# ProofCash Canonical Genesis Ceremony & Peer Bootstrap Manifest
**The Mathematical Invariants, Real-World Timestamp, and Canonical Anchor for Block #0**  
*Document Version: 1.0 (Formal Genesis Attestation)*  
*Author: Core Engineering & Security Council | Ren Ishida (October 2026)*

---

## 1. Executive Summary

In accordance with cypherpunk consensus traditions (established by Satoshi Nakamoto in the Bitcoin Genesis Block), ProofCash anchors its immutable Layer-1 state root to a verifiable real-world global event and mathematically proves **zero pre-mining**.

Every node running `proofcashd` independently verifies these exact parameters before accepting block proposals or gossiping peer transactions.

---

## 2. Canonical Genesis Block #0 Invariants

```json
{
  "height": 0,
  "prev_block_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "state_root": "9d24db8529db13d58549346b8ec1a4e8d23ce7130389e3e9b70fe25863b9a46c",
  "nullifier_root": "0000000000000000000000000000000000000000000000000000000000000000",
  "target": "00003fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "nonce": 7111,
  "timestamp": 1791540000,
  "reservoir_payout": 0,
  "headline": "Financial Times 09/Oct/2026 Sovereign debt surpasses $100T as autonomous AI compute drains global power grids",
  "coinbase_commitment": "fd8613449fc24fd4b5f69f68b19449669f9d7adffc75b9c52cfbebe69e631589",
  "posw_hash": "00000b4aec2efa365cbe1b7d181863846ba3f2f5d188c51d9666d5da488ab222",
  "recursive_proof_size_kb": 43.21,
  "block_hash": "ef77394f7adbc68ef6f7b084b9e9d54896f6b3347e550577a3b39bce5e4cb09a"
}
```

### Parameter Explanations:
1. **Real-World Timestamp Headline:**
   *"Financial Times 09/Oct/2026 Sovereign debt surpasses $100T as autonomous AI compute drains global power grids"*
   - Proves that Block #0 was mined **on or after October 9, 2026**, preventing any secret early mining or hidden chain generation before this date.
2. **Proof-of-Sampling-Work Nonce:**
   `7,111`
   - Discovered on commodity laptop hardware after evaluating 7,111 PoSW matrix sampling challenges.
3. **Pre-Mine Allocation:**
   `0.0000 PCASH (0 pico-Joules)`
   - 100% burned to nullifier `0x00...00`. Zero tokens reserved for founders, developers, or early private investors.
4. **O(1) Recursive Proof Budget:**
   `43.21 KB`
   - Constant-size STARK proof representation allowing fresh clients and mobile devices to sync from Genesis in $< 10\text{ ms}$.

---

## 3. Canonical Distributed Peer Bootstrap Mesh

Fresh validator nodes and client wallets initialize peer discovery using these canonical seeds:

```json
{
  "protocol_version": 1,
  "network": "proofcash-mainnet",
  "default_p2p_port": 9333,
  "default_rpc_port": 8332,
  "bootstrap_seeds": [
    "seed.proofcash.org:8776",
    "seed-asia.proofcash.org:8776",
    "seed-nordic.proofcash.org:8776",
    "seed-sa.proofcash.org:8776",
    "iris.radicle.network:8776",
    "rosa.radicle.network:8776"
  ]
}
```

---

## 4. Node Operator Initialization Protocol

To independently verify Genesis Block #0 and initialize a local validator node:

```bash
# 1. Clone the canonical repository
git clone https://github.com/Renishidaproject/proofcash.git
cd proofcash

# 2. Verify genesis block hash against manifest
sha256sum release/genesis_block.json
# Expected: 034da72bfa5c8da3ca8e3ba0e90aeea1b9dfcd60af140984592a34d374c64034

# 3. Boot node daemon from Genesis #0
./build-out/proofcashd --datadir=/var/lib/proofcash --network=mainnet
```

*The Genesis state is mathematically sealed, verified, and permanent.*
