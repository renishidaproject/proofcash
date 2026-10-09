"""
Unidirectional Streaming Payment Channel
Author: Ren Ishida (October 2026)
"""

import time
import hashlib
from dataclasses import dataclass, field
from typing import List, Optional
from .wallet import AgentWallet, PICO_JOULES_PER_PCASH

DEFAULT_ENERGY_BOND_PJ = 10_000 # 10,000 Pico-Joules refundable anti-dust bond

@dataclass
class ChannelState:
    sequence: int
    transferred_pj: int
    signature: bytes
    timestamp: float
    memo: str

class StreamingChannel:
    def __init__(
        self,
        sender: AgentWallet,
        recipient_address: str,
        capacity_pcash: float,
        energy_bond_pj: int = DEFAULT_ENERGY_BOND_PJ
    ):
        self.sender = sender
        self.recipient_address = recipient_address
        self.capacity_pj = int(capacity_pcash * PICO_JOULES_PER_PCASH)
        self.energy_bond_pj = energy_bond_pj
        
        self.channel_id = "chan_0x" + hashlib.sha256(
            self.sender.address.encode() + self.recipient_address.encode() + str(time.time()).encode()
        ).hexdigest()[:16]

        self.transferred_pj = 0
        self.sequence = 0
        self.states: List[ChannelState] = []
        self.is_closed = False

        # Lock capacity and bond from sender wallet
        total_lock = self.capacity_pj + self.energy_bond_pj
        if self.sender.balance_pj < total_lock:
            raise ValueError(f"Insufficient balance to open channel: need {total_lock} pJ, have {self.sender.balance_pj} pJ")
        self.sender.balance_pj -= total_lock

    @property
    def remaining_capacity_pj(self) -> int:
        return self.capacity_pj - self.transferred_pj

    @property
    def remaining_capacity_pcash(self) -> float:
        return self.remaining_capacity_pj / PICO_JOULES_PER_PCASH

    def stream_micropayment(self, amount_pj: int, memo: str = "") -> ChannelState:
        """
        Generates a sub-cent cryptographically signed balance increment.
        Executes in microsecond time with ZERO on-chain fees.
        """
        if self.is_closed:
            raise RuntimeError("Cannot stream: channel already closed.")

        if self.transferred_pj + amount_pj > self.capacity_pj:
            raise ValueError(f"Channel capacity exceeded: remaining {self.remaining_capacity_pj} pJ, requested {amount_pj} pJ")

        self.sequence += 1
        self.transferred_pj += amount_pj

        # State payload: channel_id || sequence || transferred_pj || memo
        payload = f"{self.channel_id}:{self.sequence}:{self.transferred_pj}:{memo}".encode()
        signature = self.sender.sign_message(payload)

        state = ChannelState(
            sequence=self.sequence,
            transferred_pj=self.transferred_pj,
            signature=signature,
            timestamp=time.time(),
            memo=memo
        )
        self.states.append(state)
        return state

    def stream_tokens(self, token_count: int, rate_per_token_pj: int = 1_000) -> ChannelState:
        """
        Convenience method for paying AI inference models per token.
        Default rate: 1,000 pJ (0.000000001 PCASH) per token.
        """
        total_cost = token_count * rate_per_token_pj
        return self.stream_micropayment(total_cost, memo=f"Inference: {token_count} tokens")

    def settle_on_chain(self) -> dict:
        """
        Submits the single highest signed state for optimistic settlement on L1.
        Reclaims unused capacity and the refundable energy bond.
        """
        if self.is_closed:
            raise RuntimeError("Channel already closed.")

        self.is_closed = True
        unused_capacity = self.capacity_pj - self.transferred_pj
        # Refund unused capital + energy bond back to sender
        self.sender.balance_pj += unused_capacity + self.energy_bond_pj

        latest_state = self.states[-1] if self.states else None
        tx_payload = {
            "channel_id": self.channel_id,
            "sender": self.sender.address,
            "recipient": self.recipient_address,
            "final_payout_pj": self.transferred_pj,
            "final_payout_pcash": self.transferred_pj / PICO_JOULES_PER_PCASH,
            "bond_reclaimed_pj": self.energy_bond_pj,
            "total_micro_transactions": self.sequence,
            "latest_signature": latest_state.signature.hex() if latest_state else None,
            "settlement_type": "Optimistic_L1"
        }
        return tx_payload

    def __repr__(self):
        return f"<StreamingChannel {self.channel_id} transferred={self.transferred_pj / PICO_JOULES_PER_PCASH:.6f}/{self.capacity_pj / PICO_JOULES_PER_PCASH:.4f} PCASH states={self.sequence}>"
