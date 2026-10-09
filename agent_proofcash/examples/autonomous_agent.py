"""
Example: Autonomous AI Agent Streaming Inference Payments
Author: Ren Ishida (October 2026)

Demonstrates an autonomous AI agent paying a GPU cluster per token
using unidirectional streaming channels with ZERO on-chain fees.
"""

import sys
import os
import time

# Ensure package is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agent_proofcash import AgentWallet, StreamingChannel, ProofCashClient, stream_inference

def main():
    print("================================================================")
    print("  AGENT-PROOFCASH: Autonomous Machine-to-Machine Payment Demo   ")
    print("================================================================")

    # 1. Initialize client and wallet
    client = ProofCashClient()
    info = client.get_blockchain_info()
    print(f"-> Connected to ProofCash ({info.get('chain')}): Block Height {info.get('blocks')}")

    client_agent = AgentWallet.generate()
    gpu_cluster_addr = "pcash1_cluster_h100_datacenter_9a4f"
    print(f"-> Agent Wallet Address:   {client_agent.address}")
    print(f"-> Initial Agent Balance:  {client_agent.balance_pcash:.4f} PCASH")

    # 2. Ephemeral session key derivation (Two-Tier Enclave Delegation)
    sk, pk = client_agent.derive_ephemeral_session_key(timeout_blocks=144)
    print(f"-> Derived Session Key:    {pk} (Valid for 24 hours)")

    # 3. Open Streaming Channel
    channel_capacity = 2.0  # 2 PCASH
    print(f"\n-> Opening Unidirectional Streaming Channel with GPU Provider...")
    channel = StreamingChannel(
        sender=client_agent,
        recipient_address=gpu_cluster_addr,
        capacity_pcash=channel_capacity
    )
    print(f"  Channel ID:         {channel.channel_id}")
    print(f"  Locked Capacity:    {channel.capacity_pj / 1e12:.2f} PCASH")
    print(f"  Refundable Bond:    {channel.energy_bond_pj} Pico-Joules")

    # 4. Stream payments across 5 simulated AI inference tasks
    print("\n-> Commencing Real-Time Token Streaming across 5 Inference Tasks:")
    prompts = [
        ("Translate English to Japanese", 120),
        ("Analyze Quantum Circuit Math", 450),
        ("Generate Rust Code for MMR", 280),
        ("Summarize Financial Report", 310),
        ("Synthesize Audio Waveform", 540),
    ]

    for task_name, token_count in prompts:
        state = channel.stream_tokens(token_count, rate_per_token_pj=10_000_000) # 0.00001 PCASH/token
        cost_pcash = (token_count * 10_000_000) / 1e12
        print(f"  [Task: {task_name[:28]:<28}] {token_count:>4} tokens -> Streamed {cost_pcash:.6f} PCASH (Seq #{state.sequence})")
        time.sleep(0.05)

    # 5. Optimistic On-Chain Settlement
    print("\n-> Session Complete. Executing Optimistic Settlement on L1...")
    settlement = channel.settle_on_chain()
    print(f"  Total Micro-Transactions:   {settlement['total_micro_transactions']}")
    print(f"  Total Payout to GPU Node:   {settlement['final_payout_pcash']:.6f} PCASH")
    print(f"  Bond Successfully Reclaimed:{settlement['bond_reclaimed_pj']} Pico-Joules")
    print(f"  Final Agent Balance:        {client_agent.balance_pcash:.6f} PCASH")
    print(f"  Latest Cryptographic Proof: {settlement['latest_signature'][:32]}...")

    print("\n[OK] 100% of micro-payments streamed with ZERO on-chain gas congestion.")

if __name__ == "__main__":
    main()
