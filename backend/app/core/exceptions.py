"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Domain Exceptions & Error Hierarchy
Author: Principal Systems Architect
"""

class ApexSovereignBaseException(Exception):
    """Base exception for all ApexSovereign domain faults."""
    def __init__(self, message: str, code: str = "INTERNAL_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


class MissingConfigurationError(ApexSovereignBaseException):
    """Raised when critical configuration is missing."""
    def __init__(self, message: str):
        super().__init__(message, code="MISSING_CONFIGURATION")


class IdempotencyConflictError(ApexSovereignBaseException):
    """Raised when an operation with the same idempotency key is already in progress."""
    def __init__(self, key: str, message: str = "Concurrent operation in progress for this idempotency key."):
        super().__init__(message, code="IDEMPOTENCY_CONFLICT")
        self.key = key


class InsufficientCreditsError(ApexSovereignBaseException):
    """Raised when a tenant balance is inadequate for compute reservation."""
    def __init__(self, tenant_id: str, required: float, available: float):
        super().__init__(
            f"Tenant {tenant_id} has insufficient credits (Available: {available:.4f}, Required: {required:.4f})",
            code="INSUFFICIENT_CREDITS",
        )
        self.tenant_id = tenant_id
        self.required = required
        self.available = available


class PayPalVerificationError(ApexSovereignBaseException):
    """Raised when a PayPal webhook fails cryptographic signature verification."""
    def __init__(self, message: str = "PayPal webhook cryptographic verification failed."):
        super().__init__(message, code="PAYPAL_VERIFICATION_FAILED")


class InvalidComputeLeaseError(ApexSovereignBaseException):
    """Raised when an autonomous worker provides an expired or forged compute lease token."""
    def __init__(self, message: str = "Invalid or expired compute lease token."):
        super().__init__(message, code="INVALID_LEASE_TOKEN")
