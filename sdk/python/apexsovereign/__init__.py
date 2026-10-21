"""
ApexSovereign.ai Official Enterprise Python SDK
Includes Headless Agentic Compute Hooks & Autonomous Budget Lock
"""

from .client import (
    ApexSovereignClient,
    ArbitrageRouteResponse,
    MolecularProofResponse,
    CreditBalanceResponse,
    ApexSovereignError,
    InsufficientCreditError,
    RateLimitError,
)

from .agent import (
    AgentComputeConfig,
    AgentComputeError,
    AutonomousBudgetExceededError,
    InvalidSubtokenError,
    ClusterFailoverError,
    AgentSubtoken,
    AutonomousBudgetLock,
    DynamicFailoverRouter,
    ApexSovereignLLM,
    ApexSovereignVectorRetriever,
    ApexAutonomousAgent,
)

__all__ = [
    # Enterprise Client
    "ApexSovereignClient",
    "ArbitrageRouteResponse",
    "MolecularProofResponse",
    "CreditBalanceResponse",
    "ApexSovereignError",
    "InsufficientCreditError",
    "RateLimitError",
    # Agentic Compute SDK
    "AgentComputeConfig",
    "AgentComputeError",
    "AutonomousBudgetExceededError",
    "InvalidSubtokenError",
    "ClusterFailoverError",
    "AgentSubtoken",
    "AutonomousBudgetLock",
    "DynamicFailoverRouter",
    "ApexSovereignLLM",
    "ApexSovereignVectorRetriever",
    "ApexAutonomousAgent",
]

__version__ = "1.1.0"
