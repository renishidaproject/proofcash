"""
Unit Tests for Agent-ProofCash SDK
Author: Ren Ishida (October 2026)
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agent_proofcash import AgentWallet, StreamingChannel, stream_inference, PICO_JOULES_PER_PCASH

class TestAgentProofCash(unittest.TestCase):
    def test_wallet_creation_and_signing(self):
        wallet = AgentWallet.generate()
        self.assertTrue(wallet.address.startswith("pcash1"))
        self.assertEqual(wallet.balance_pcash, 100.0)

        message = b"proofcash_machine_payload_42"
        sig = wallet.sign_message(message)
        self.assertTrue(wallet.verify_signature(message, sig))
        self.assertFalse(wallet.verify_signature(b"wrong_message", sig))

    def test_ephemeral_session_key(self):
        wallet = AgentWallet.generate()
        sk, pk = wallet.derive_ephemeral_session_key(timeout_blocks=72)
        self.assertTrue(pk.startswith("bjub_0x"))
        self.assertEqual(len(sk), 64)

    def test_streaming_channel_lifecycle(self):
        wallet = AgentWallet.generate()
        initial_bal = wallet.balance_pj

        channel = StreamingChannel(
            sender=wallet,
            recipient_address="pcash1_recipient_gpu",
            capacity_pcash=5.0,
            energy_bond_pj=10_000
        )

        # Ensure balance was locked
        self.assertEqual(wallet.balance_pj, initial_bal - (5 * PICO_JOULES_PER_PCASH) - 10_000)

        # Stream 1: 1,000,000 pJ
        s1 = channel.stream_micropayment(1_000_000, memo="call 1")
        self.assertEqual(s1.sequence, 1)
        self.assertEqual(channel.transferred_pj, 1_000_000)

        # Stream 2: 500 tokens at 1,000 pJ/token = 500,000 pJ
        s2 = channel.stream_tokens(500, rate_per_token_pj=1_000)
        self.assertEqual(s2.sequence, 2)
        self.assertEqual(channel.transferred_pj, 1_500_000)

        # Settle on chain
        settlement = channel.settle_on_chain()
        self.assertEqual(settlement["total_micro_transactions"], 2)
        self.assertEqual(settlement["final_payout_pj"], 1_500_000)
        self.assertEqual(settlement["bond_reclaimed_pj"], 10_000)

        # Check that unused capacity + bond were refunded
        expected_final = initial_bal - 1_500_000
        self.assertEqual(wallet.balance_pj, expected_final)

    def test_channel_capacity_exceeded_error(self):
        wallet = AgentWallet.generate()
        channel = StreamingChannel(
            sender=wallet,
            recipient_address="pcash1_recipient",
            capacity_pcash=0.001
        )
        with self.assertRaises(ValueError):
            channel.stream_micropayment(int(0.002 * PICO_JOULES_PER_PCASH))

    def test_stream_inference_decorator(self):
        wallet = AgentWallet.generate()
        channel = StreamingChannel(wallet, "pcash1_model", 1.0)

        @stream_inference(channel, rate_per_token_pj=1_000)
        def mock_llm_inference(prompt):
            return "This is a sixteen-character test output."

        response, state = mock_llm_inference("Hello")
        self.assertEqual(response, "This is a sixteen-character test output.")
        self.assertGreater(state.transferred_pj, 0)
        self.assertEqual(state.sequence, 1)

if __name__ == "__main__":
    unittest.main()
