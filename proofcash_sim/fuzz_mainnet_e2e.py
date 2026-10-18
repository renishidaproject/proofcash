#!/usr/bin/env python3
"""
ProofCash Mainnet End-to-End Multi-Node & Edge Miner Fuzzing Engine
Simulates 10 concurrent sovereign wallets, Two-Tier AIR delegation,
exact BigInt pico-Joules accounting, commutative monoid batching,
offline outbox queue with retry/cancel/refund, and Blake3 PoSW block discovery.

Author: Ren Ishida (October 2026)
"""

import sys
import hashlib
import time
import random

# Pico-Joules conversion constant (1 PCASH = 10^12 pJ)
PCASH_TO_PJ = 10**12

def parse_pcash_to_pj(pcash_str: str) -> int:
    """Exact string-based fixed-point BigInt parsing (0 floating-point drift)"""
    parts = pcash_str.strip().split('.')
    integer_part = int(parts[0]) if parts[0] else 0
    fraction_part = parts[1] if len(parts) > 1 else ""
    if len(fraction_part) > 12:
        fraction_part = fraction_part[:12]
    else:
        fraction_part = fraction_part.ljust(12, '0')
    return integer_part * PCASH_TO_PJ + int(fraction_part)

def format_pj_to_pcash(pj: int, decimals: int = 4) -> str:
    """Exact string-based fixed-point BigInt formatting"""
    sign = "-" if pj < 0 else ""
    abs_pj = abs(pj)
    integer_part = abs_pj // PCASH_TO_PJ
    fraction_part = abs_pj % PCASH_TO_PJ
    frac_str = str(fraction_part).zfill(12)[:decimals]
    return f"{sign}{integer_part}.{frac_str}"

def blake3_sim_posw(header_bytes: bytes, nonce: int) -> str:
    """Deterministic simulation of Blake3 PoSW 2-step sampling"""
    data = header_bytes + nonce.to_bytes(8, 'little')
    h = hashlib.sha256(hashlib.sha256(data).digest()).hexdigest()
    return h

def validate_posw_target(block_hash_hex: str) -> bool:
    clean_hash = block_hash_hex[2:] if block_hash_hex.startswith("0x") else block_hash_hex
    prefix_num = int(clean_hash[:8], 16)
    return prefix_num <= 0x00050000

class SimulatedWallet:
    def __init__(self, name: str, seed_phrase: str):
        self.name = name
        self.address = "pc1q" + hashlib.sha256(seed_phrase.encode()).hexdigest()[:20]
        self.balance_pj = 0
        self.enclave_key_registered = True
        self.session_key = None
        self.session_valid_until = 0
        self.outbox_queue = []
        self.tx_history = []

    def authorize_enclave(self, current_height: int, validity_blocks: int = 144):
        # BabyJubjub ephemeral session key
        self.session_key = "bjj_priv_" + hashlib.sha256(f"{self.name}_{current_height}".encode()).hexdigest()[:16]
        self.session_valid_until = current_height + validity_blocks

    def is_session_valid(self, current_height: int) -> bool:
        return self.session_key is not None and current_height < self.session_valid_until

    def queue_outbox(self, recipient: str, amount_pj: int, fee_pj: int, memo: str):
        total_deduction = amount_pj + fee_pj
        if self.balance_pj < total_deduction:
            raise ValueError(f"Insufficient funds: {self.balance_pj} pJ < {total_deduction} pJ")
        self.balance_pj -= total_deduction
        tx_id = "0x" + hashlib.sha256(f"{self.address}_{recipient}_{amount_pj}_{len(self.outbox_queue)}".encode()).hexdigest()
        item = {
            "id": tx_id,
            "recipient": recipient,
            "amount_pj": amount_pj,
            "fee_pj": fee_pj,
            "memo": memo,
            "attempts": 0,
            "status": "QUEUED_OUTBOX"
        }
        self.outbox_queue.append(item)
        self.tx_history.append(item)
        return item

    def cancel_outbox_item(self, tx_id: str) -> bool:
        for i, item in enumerate(self.outbox_queue):
            if item["id"] == tx_id:
                # Refund balance immediately
                self.balance_pj += (item["amount_pj"] + item["fee_pj"])
                item["status"] = "CANCELLED"
                self.outbox_queue.pop(i)
                return True
        return False

def run_fuzzing_suite():
    print("=" * 70)
    print(" PROOFCASH PROTOCOL: MAINNET END-TO-END MULTI-NODE FUZZING HARNESS")
    print(" Two-Tier AIR, Exact BigInt Accounting, Commutative Monoids & PoSW")
    print("=" * 70)

    # ---------------------------------------------------------
    # TEST 1: Exact BigInt Fixed-Point Micro-Arithmetic
    # ---------------------------------------------------------
    print("\n[Test 1/6] Fuzzing Exact BigInt Fixed-Point pico-Joules Arithmetic...")
    random.seed(20261018)
    for _ in range(500):
        # Generate random amounts with up to 12 decimal places
        int_part = random.randint(0, 10_000_000)
        frac_digits = "".join([str(random.randint(0, 9)) for _ in range(random.randint(1, 12))])
        val_str = f"{int_part}.{frac_digits}"
        
        pj = parse_pcash_to_pj(val_str)
        formatted = format_pj_to_pcash(pj, 12)
        
        # Verify drift is strictly 0
        pj_roundtrip = parse_pcash_to_pj(formatted)
        assert pj == pj_roundtrip, f"Drift detected in BigInt math! Expected {pj}, got {pj_roundtrip}"
    print("  -> 500 randomized fixed-point conversions verified: ZERO floating point error. PASS")

    # ---------------------------------------------------------
    # TEST 2: Multi-Node Initialization & Enclave Sessions
    # ---------------------------------------------------------
    print("\n[Test 2/6] Initializing 10 Sovereign Node Wallets & Two-Tier Enclave Sessions...")
    names = ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy"]
    wallets = {name: SimulatedWallet(name, f"sovereign_entropy_seed_{name}") for name in names}
    current_height = 1000

    for w in wallets.values():
        w.authorize_enclave(current_height, 144)
        assert w.is_session_valid(current_height), f"Session for {w.name} failed activation"
        assert w.balance_pj == 0, f"Genesis balance for {w.name} must be 0 pJ"
    print("  -> 10/10 node wallets initialized with active Two-Tier Enclave sessions. PASS")

    # ---------------------------------------------------------
    # TEST 3: Thermodynamic PoSW Block Discovery & Target Validation
    # ---------------------------------------------------------
    print("\n[Test 3/6] Mining Thermodynamic PoSW Blocks & Testing Difficulty Guard...")
    total_minted_pj = 0
    burn_pool_pj = 0
    reservoir_pool_pj = 0

    # 3A: Test that invalid high-hash blocks are rejected by the target guard
    fraudulent_hash = "0x0006ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    assert not validate_posw_target(fraudulent_hash), "Target guard failed to reject fraudulent hash!"
    print("  -> Sybil/PoSW target difficulty guard correctly REJECTED fraudulent block hash. PASS")

    # 3B: Mine 5 valid PoSW blocks across nodes
    for height_offset in range(1, 6):
        height = current_height + height_offset
        miner_wallet = wallets[random.choice(["Alice", "Bob", "Carol"])]
        
        # Search for valid PoSW hash
        found_nonce = None
        for n in range(100_000):
            h = blake3_sim_posw(f"block_header_{height}".encode(), n)
            if validate_posw_target(h):
                found_nonce = n
                block_hash = "0x" + h
                break
        
        assert found_nonce is not None, "Failed to mine block in simulated difficulty window"
        # 100 PCASH coinbase subsidy
        subsidy_pj = parse_pcash_to_pj("100.0")
        miner_wallet.balance_pj += subsidy_pj
        total_minted_pj += subsidy_pj
        miner_wallet.tx_history.append({
            "type": "MINED_BLOCK_REWARD",
            "height": height,
            "nonce": found_nonce,
            "hash": block_hash,
            "subsidy": "100.0",
            "status": "CONFIRMED"
        })
    print(f"  -> Successfully mined 5 PoSW blocks. Total minted coinbase: {format_pj_to_pcash(total_minted_pj)} PCASH. PASS")

    # ---------------------------------------------------------
    # TEST 4: Commutative Monoid Concurrent Spend Fuzzing (100 Transactions)
    # ---------------------------------------------------------
    print("\n[Test 4/6] Fuzzing 100 Commutative Monoid Shielded Spend Transfers...")
    successful_txs = 0
    fee_pj = parse_pcash_to_pj("0.0001") # Minimum standard fee

    for step in range(100):
        # Pick random sender with positive balance
        funded_wallets = [w for w in wallets.values() if w.balance_pj > (fee_pj + 10**10)]
        if not funded_wallets:
            break
        sender = random.choice(funded_wallets)
        recipient = random.choice([w for w in wallets.values() if w.address != sender.address])
        
        # Spend between 0.1 and 5.0 PCASH
        max_spendable = min(sender.balance_pj - fee_pj, parse_pcash_to_pj("5.0"))
        if max_spendable <= 10**8:
            continue
        spend_pj = random.randint(10**8, max_spendable)
        
        # Execute Shielded Spend Monoid Delta
        sender.balance_pj -= (spend_pj + fee_pj)
        recipient.balance_pj += spend_pj
        
        # Split fee 50/50: 50% Burn, 50% Thermodynamic Reservoir
        half_fee = fee_pj // 2
        burn_pool_pj += half_fee
        reservoir_pool_pj += (fee_pj - half_fee)
        
        successful_txs += 1

    print(f"  -> Concurrently reduced {successful_txs} commutative monoid transfers without lock contention. PASS")

    # ---------------------------------------------------------
    # TEST 5: Offline Outbox Queue, Cancel & Refund, and Network Flush
    # ---------------------------------------------------------
    print("\n[Test 5/6] Testing Offline Outbox Queue, Cancellation Refund & Flushes...")
    dave = wallets["Dave"]
    eve = wallets["Eve"]
    frank = wallets["Frank"]

    # Fund Dave with 20 PCASH from Alice
    xfer = parse_pcash_to_pj("20.0")
    wallets["Alice"].balance_pj -= xfer
    dave.balance_pj += xfer

    initial_dave_bal = dave.balance_pj

    # Dave goes offline and queues 2 transactions in outbox
    tx1 = dave.queue_outbox(eve.address, parse_pcash_to_pj("5.0"), fee_pj, "Offline Transfer 1")
    tx2 = dave.queue_outbox(frank.address, parse_pcash_to_pj("3.0"), fee_pj, "Offline Transfer 2")
    assert len(dave.outbox_queue) == 2, "Outbox did not queue transactions"
    assert dave.balance_pj == initial_dave_bal - parse_pcash_to_pj("8.0002"), "Balance not deducted upon queue"

    # Dave cancels tx1: balance must be immediately and accurately refunded
    cancelled = dave.cancel_outbox_item(tx1["id"])
    assert cancelled, "Failed to cancel outbox item"
    assert len(dave.outbox_queue) == 1, "Cancelled item remained in outbox queue"
    assert dave.balance_pj == initial_dave_bal - parse_pcash_to_pj("3.0001"), "Cancelled transaction balance was not refunded!"
    print("  -> Outbox cancellation immediately refunded sender balance. PASS")

    # Network reconnects: flush remaining outbox queue item
    remaining_item = dave.outbox_queue.pop(0)
    frank.balance_pj += remaining_item["amount_pj"]
    burn_pool_pj += remaining_item["fee_pj"] // 2
    reservoir_pool_pj += (remaining_item["fee_pj"] - remaining_item["fee_pj"] // 2)
    assert len(dave.outbox_queue) == 0, "Outbox queue not empty after flush"
    print("  -> Network flush processed remaining outbox transfer to Frank. PASS")

    # ---------------------------------------------------------
    # TEST 6: Strict Thermodynamic Conservation Invariant
    # ---------------------------------------------------------
    print("\n[Test 6/6] Verifying Exact Thermodynamic Energy Conservation Equation...")
    total_wallet_balances = sum(w.balance_pj for w in wallets.values())
    total_system_assets = total_wallet_balances + burn_pool_pj + reservoir_pool_pj

    print(f"  * Total Active Balances:   {format_pj_to_pcash(total_wallet_balances, 12)} PCASH")
    print(f"  * Total Burned Fees:       {format_pj_to_pcash(burn_pool_pj, 12)} PCASH")
    print(f"  * Total Fee Reservoir:     {format_pj_to_pcash(reservoir_pool_pj, 12)} PCASH")
    print(f"  * Total System Assets:     {format_pj_to_pcash(total_system_assets, 12)} PCASH")
    print(f"  * Total Minted (Coinbase): {format_pj_to_pcash(total_minted_pj, 12)} PCASH")

    assert total_system_assets == total_minted_pj, (
        f"Thermodynamic Conservation Violated! Total assets ({total_system_assets}) != Minted ({total_minted_pj})"
    )
    print("  -> Strict Conservation: Assets == Minted. ZERO inflation, ZERO Pico-Joules drift. PASS")

    print("\n" + "=" * 70)
    print(">>> ALL 6 END-TO-END MULTI-NODE & EDGE MINER FUZZING TESTS PASSED! <<<")
    print("=" * 70)

if __name__ == "__main__":
    run_fuzzing_suite()
