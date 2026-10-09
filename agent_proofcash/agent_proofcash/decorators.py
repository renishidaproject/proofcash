"""
Python Decorators for Autonomous AI Agents
Author: Ren Ishida (October 2026)
"""

import functools
from typing import Callable
from .channel import StreamingChannel

def pay_per_call(channel: StreamingChannel, amount_pj: int = 10_000):
    """
    Decorator that automatically streams a micro-payment every time
    the decorated function or API is invoked.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            state = channel.stream_micropayment(amount_pj, memo=f"Call: {func.__name__}")
            result = func(*args, **kwargs)
            return result, state
        return wrapper
    return decorator

def stream_inference(channel: StreamingChannel, rate_per_token_pj: int = 1_000):
    """
    Decorator for LLM completion calls that counts response tokens
    and streams proportional payment automatically.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            response_text = func(*args, **kwargs)
            # Estimate token count (standard ~4 chars per token)
            estimated_tokens = max(1, len(str(response_text)) // 4)
            state = channel.stream_tokens(estimated_tokens, rate_per_token_pj=rate_per_token_pj)
            return response_text, state
        return wrapper
    return decorator
