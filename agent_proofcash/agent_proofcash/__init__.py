"""
Agent-ProofCash SDK
Autonomous Machine-to-Machine Micro-Streaming Library
Author: Ren Ishida (October 2026)
"""

from .wallet import AgentWallet, PICO_JOULES_PER_PCASH
from .channel import StreamingChannel, ChannelState
from .client import ProofCashClient
from .decorators import pay_per_call, stream_inference

__version__ = "0.1.0"
__all__ = [
    "AgentWallet",
    "StreamingChannel",
    "ChannelState",
    "ProofCashClient",
    "pay_per_call",
    "stream_inference",
    "PICO_JOULES_PER_PCASH",
]
