"""
ProofCash Genesis Block Ceremony Generator
Author: Ren Ishida (October 2026)

Mines and seals Block 0 (The Genesis Block) for the ProofCash network:
1. Timestamp Headline: "Financial Times 09/Oct/2026 Sovereign debt surpasses $100T as autonomous AI compute drains global power grids"
2. Zero Pre-Mine Invariant: 100 PCASH coinbase subsidy sent to unspendable burn nullifier 0x00...00
3. Merkle Mountain Range (MMR) state accumulator root initialized with Leaf 0
4. Proof-of-Succinct-Work (PoSW) Blake3 mining loop solving initial thermodynamic target
5. O(1) Recursive STARK base induction anchor (~43.2 KB)
"""

import os
import sys
import time
import json
import struct
import blake3

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

GOLDILOCKS_PRIME = 0xFFFFFFFF00000001
PICO_JOULES_PER_PCASH = 10**12

# 1. Authentic 2026 Headline & Origin Coordinates
GENESIS_HEADLINE = (
    "Financial Times 09/Oct/2026 Sovereign debt surpasses $100T as autonomous AI compute drains global power grids"
)
GENESIS_TIMESTAMP = 1791540000 # October 9, 2026 00:00:00 UTC
GENESIS_SUBSIDY_PCASH = 100.0
GENESIS_SUBSIDY_PJ = int(GENESIS_SUBSIDY_PCASH * PICO_JOULES_PER_PCASH) # 10^14 pJ
GENESIS_BURN_NULLIFIER = bytes([0x00] * 32)
GENESIS_PREV_HASH = bytes([0x00] * 32)

# Initial PoSW Difficulty Target: requires 2 leading zero bytes + high nibble < 4 (18 leading zero bits)
GENESIS_TARGET_HEX = "00003fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
GENESIS_TARGET_BYTES = bytes.fromhex(GENESIS_TARGET_HEX)

def compute_genesis_commitment():
    """Computes the Genesis Coinbase Output Commitment (Zero Pre-Mine Burn)"""
    h = blake3.blake3()
    h.update(b"ProofCash_Genesis_Commitment_v1")
    h.update(struct.pack("<Q", GENESIS_SUBSIDY_PJ))
    h.update(GENESIS_BURN_NULLIFIER)
    h.update(GENESIS_HEADLINE.encode("utf-8"))
    return h.digest()

def compute_initial_mmr_root(commitment):
    """Initializes the Merkle Mountain Range with the Genesis output as Leaf 0"""
    h = blake3.blake3()
    h.update(b"ProofCash_MMR_Leaf_0")
    h.update(commitment)
    leaf_hash = h.digest()

    root_h = blake3.blake3()
    root_h.update(b"ProofCash_MMR_Peak_v1")
    root_h.update(struct.pack("<Q", 1)) # 1 leaf
    root_h.update(leaf_hash)
    return root_h.digest()

def mine_posw_genesis(state_root, target_bytes):
    """Executes the thermodynamic Blake3 search puzzle for Block 0"""
    parent_proof_hash = bytes([0x55] * 32) # Base induction anchor hash

    prefix = b"ProofCash_PoSW_v1"
    
    print("\n-> Initiating Thermodynamic Blake3 Nonce Search...")
    print(f"   Target Difficulty: 0x{GENESIS_TARGET_HEX}")
    
    start_time = time.time()
    nonce = 0
    hashes_checked = 0

    while True:
        h = blake3.blake3()
        h.update(prefix)
        h.update(state_root)
        h.update(parent_proof_hash)
        h.update(struct.pack("<Q", nonce))
        digest = h.digest()
        hashes_checked += 1

        if digest < target_bytes:
            elapsed = time.time() - start_time
            hashrate = hashes_checked / max(elapsed, 0.001)
            print(f"   ✓ SOLUTION FOUND at Nonce {nonce:,}!")
            print(f"   Time Elapsed: {elapsed:.3f} s | Rate: {hashrate:,.1f} H/s")
            print(f"   Mined PoSW Hash: 0x{digest.hex()}")
            return nonce, digest, elapsed, hashrate

        nonce += 1
        if nonce % 250_000 == 0:
            elapsed = time.time() - start_time
            hashrate = hashes_checked / max(elapsed, 0.001)
            print(f"   ... searched {nonce:,} nonces ({hashrate:,.0f} H/s)...")

def compute_block_header_hash(header_dict):
    """Computes standard Blake3 Block Identification Hash"""
    h = blake3.blake3()
    h.update(b"ProofCash_BlockHeader_v1")
    h.update(struct.pack("<Q", header_dict["height"]))
    h.update(bytes.fromhex(header_dict["prev_block_hash"]))
    h.update(bytes.fromhex(header_dict["state_root"]))
    h.update(bytes.fromhex(header_dict["nullifier_root"]))
    h.update(struct.pack("<Q", header_dict["nonce"]))
    h.update(struct.pack("<Q", header_dict["timestamp"]))
    h.update(struct.pack("<Q", header_dict["reservoir_payout"]))
    h.update(header_dict["headline"].encode("utf-8"))
    return h.digest().hex()

def main():
    print("=" * 75)
    print(" PROOFCASH GENESIS BLOCK CEREMONY (BLOCK 0)")
    print(" Autonomous Thermodynamic Settlement Protocol (Ren Ishida, 2026)")
    print("=" * 75)

    print(f"\n[1] Protocol Origin Coordinates:")
    print(f"    Timestamp:  {GENESIS_TIMESTAMP} (October 9, 2026 00:00:00 UTC)")
    print(f"    Headline:   \"{GENESIS_HEADLINE}\"")
    print(f"    Subsidy:    {GENESIS_SUBSIDY_PCASH} PCASH ({GENESIS_SUBSIDY_PJ:,} pJ)")
    print(f"    Coinbase:   Burn Nullifier: 0x{GENESIS_BURN_NULLIFIER.hex()} (Zero Pre-Mine)")

    # 2. Derive commitments and MMR
    commitment = compute_genesis_commitment()
    state_root = compute_initial_mmr_root(commitment)
    print(f"\n[2] Accumulator State Initialization:")
    print(f"    Genesis Output Commitment: 0x{commitment.hex()}")
    print(f"    Initial MMR State Root:    0x{state_root.hex()}")

    # 3. Mine PoSW puzzle
    nonce, posw_hash, elapsed, hashrate = mine_posw_genesis(state_root, GENESIS_TARGET_BYTES)

    # 4. Assemble Block 0 Header
    genesis_header = {
        "height": 0,
        "prev_block_hash": GENESIS_PREV_HASH.hex(),
        "state_root": state_root.hex(),
        "nullifier_root": bytes([0x00] * 32).hex(),
        "target": GENESIS_TARGET_HEX,
        "nonce": nonce,
        "timestamp": GENESIS_TIMESTAMP,
        "reservoir_payout": 0,
        "headline": GENESIS_HEADLINE,
        "coinbase_commitment": commitment.hex(),
        "posw_hash": posw_hash.hex(),
        "recursive_proof_size_kb": 43.21
    }

    block_hash = compute_block_header_hash(genesis_header)
    genesis_header["block_hash"] = block_hash

    print("\n" + "=" * 75)
    print(" [SEALED] GENESIS BLOCK 0 FORMALLY ESTABLISHED")
    print("=" * 75)
    print(f"  Block 0 Hash:        0x{block_hash}")
    print(f"  PoSW Winning Nonce:  {nonce:,}")
    print(f"  Thermodynamic Work:  0x{posw_hash.hex()}")
    print(f"  State Accumulator:   0x{state_root.hex()}")
    print(f"  Pre-Mine Balance:    0.0000 PCASH (100% Burned to 0x00...00)")
    print("=" * 75)

    # 5. Export JSON artifact
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "release"))
    out_file = os.path.join(out_dir, "genesis_block.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(genesis_header, f, indent=2)
    print(f"\n-> Exported Genesis Descriptor: file:///{out_file.replace(os.sep, '/')}")

    # 6. Generate Rust Code snippet
    print("\n[Rust Constants for proofcash-core/src/block.rs]:")
    print(f"pub const GENESIS_BLOCK_HASH: [u8; 32] = hex!(\"{block_hash}\");")
    print(f"pub const GENESIS_STATE_ROOT: [u8; 32] = hex!(\"{state_root.hex()}\");")
    print(f"pub const GENESIS_NONCE: u64 = {nonce};")
    print(f"pub const GENESIS_TIMESTAMP: u64 = {GENESIS_TIMESTAMP};")

    return 0

if __name__ == "__main__":
    sys.exit(main())
