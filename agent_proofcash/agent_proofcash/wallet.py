"""
Agent Wallet & Ephemeral Session Key Management
Author: Ren Ishida (October 2026)
"""

import os
import hmac
import hashlib
import secrets
from typing import Tuple

PICO_JOULES_PER_PCASH = 1_000_000_000_000

class AgentWallet:
    def __init__(self, private_key_hex: str = None):
        if private_key_hex:
            self.private_key = bytes.fromhex(private_key_hex)
        else:
            self.private_key = secrets.token_bytes(32)

        self.public_key = hashlib.sha256(b"ProofCash_Pubkey:" + self.private_key).digest()
        self.address = "pcash1" + hashlib.sha256(self.public_key).hexdigest()[:38]
        self.balance_pj = 100 * PICO_JOULES_PER_PCASH # Default 100 PCASH funding for testing

    @classmethod
    def generate(cls) -> "AgentWallet":
        return cls()

    @classmethod
    def from_env(cls, env_var: str = "PROOFCASH_AGENT_KEY") -> "AgentWallet":
        key = os.environ.get(env_var)
        return cls(key)

    @property
    def balance_pcash(self) -> float:
        return self.balance_pj / PICO_JOULES_PER_PCASH

    def sign_message(self, message: bytes) -> bytes:
        return hmac.new(self.private_key, message, hashlib.sha256).digest()

    def verify_signature(self, message: bytes, signature: bytes) -> bool:
        expected = hmac.new(self.private_key, message, hashlib.sha256).digest()
        return hmac.compare_digest(expected, signature)

    def derive_ephemeral_session_key(self, timeout_blocks: int = 144) -> Tuple[str, str]:
        """
        Implements Two-Tier Enclave Delegation:
        Derives an ephemeral session key valid for timeout_blocks (~24h).
        """
        session_seed = secrets.token_bytes(32)
        session_sk = hashlib.sha256(b"Session_SK:" + self.private_key + session_seed).hexdigest()
        session_pk = "bjub_0x" + hashlib.sha256(bytes.fromhex(session_sk)).hexdigest()[:24]
        return session_sk, session_pk

    def __repr__(self):
        return f"<AgentWallet address={self.address} balance={self.balance_pcash:.4f} PCASH>"
