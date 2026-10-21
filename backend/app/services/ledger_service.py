"""
ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
Module: Idempotent Financial Ledger & Balance Transaction Engine
Author: Principal Systems Architect

Guarantees:
- ACID transactional consistency via asyncpg transactions and row-level locks (FOR UPDATE).
- Zero double-allocation or double-spending under distributed concurrent requests.
- Immutable append-only ledger entries for comprehensive financial audits.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional
from asyncpg.connection import Connection

from backend.app.core.exceptions import InsufficientCreditsError

logger = logging.getLogger("apexsovereign.ledger")


class LedgerService:
    """
    Transactional ledger engine for enterprise tenant balances and compute billing.
    """

    @staticmethod
    async def fulfill_payment_idempotent(
        conn: Connection,
        tenant_id: str,
        amount_currency: float,
        currency: str,
        credits_allocated: float,
        provider_order_id: str,
        provider_capture_id: Optional[str],
        webhook_event_id: Optional[str],
        idempotency_key: str,
        raw_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Fulfills a verified PayPal payment idempotently.
        Ensures that repeated webhook deliveries or capture retries do not double-credit.
        """
        # 1. Check for existing payment transaction
        existing_tx = await conn.fetchrow(
            """
            SELECT id, status, credits_allocated
            FROM payment_transactions
            WHERE provider_order_id = $1 OR (webhook_event_id IS NOT NULL AND webhook_event_id = $2);
            """,
            provider_order_id,
            webhook_event_id,
        )

        if existing_tx and existing_tx["status"] == "COMPLETED":
            logger.info("Payment %s already fulfilled. Idempotently returning existing state.", provider_order_id)
            tenant_row = await conn.fetchrow("SELECT credit_balance FROM tenants WHERE id = $1;", tenant_id)
            current_bal = float(tenant_row["credit_balance"]) if tenant_row else 0.0
            return {
                "status": "ALREADY_FULFILLED",
                "payment_id": str(existing_tx["id"]),
                "credits_allocated": float(existing_tx["credits_allocated"]),
                "current_balance": current_bal,
                "is_replay": True,
            }

        # 2. Acquire strict Row-Level Lock on the Tenant row to serialize concurrent balance mutations
        tenant_row = await conn.fetchrow(
            """
            SELECT id, credit_balance
            FROM tenants
            WHERE id = $1
            FOR UPDATE;
            """,
            tenant_id,
        )

        if not tenant_row:
            raise ValueError(f"Tenant {tenant_id} not found in database.")

        balance_before = float(tenant_row["credit_balance"])
        balance_after = balance_before + credits_allocated

        # 3. Update Tenant Balance
        await conn.execute(
            """
            UPDATE tenants
            SET credit_balance = $1,
                updated_at = NOW()
            WHERE id = $2;
            """,
            balance_after,
            tenant_id,
        )

        # 4. Insert Immutable Ledger Entry
        ledger_row = await conn.fetchrow(
            """
            INSERT INTO ledger_entries (
                tenant_id,
                transaction_type,
                amount,
                balance_before,
                balance_after,
                idempotency_key,
                reference_id,
                metadata
            )
            VALUES ($1, 'CREDIT_PURCHASE', $2, $3, $4, $5, $6, $7::jsonb)
            RETURNING id;
            """,
            tenant_id,
            credits_allocated,
            balance_before,
            balance_after,
            idempotency_key,
            provider_order_id,
            json.dumps({"currency": currency, "amount_paid": amount_currency, "capture_id": provider_capture_id}),
        )

        # 5. Insert or Update Payment Transaction Record
        payment_row = await conn.fetchrow(
            """
            INSERT INTO payment_transactions (
                tenant_id,
                provider,
                provider_order_id,
                provider_capture_id,
                amount,
                currency,
                credits_allocated,
                status,
                webhook_event_id,
                idempotency_key,
                raw_payload
            )
            VALUES ($1, 'PAYPAL', $2, $3, $4, $5, $6, 'COMPLETED', $7, $8, $9::jsonb)
            ON CONFLICT (provider_order_id) DO UPDATE
            SET status = 'COMPLETED',
                provider_capture_id = EXCLUDED.provider_capture_id,
                webhook_event_id = EXCLUDED.webhook_event_id,
                updated_at = NOW()
            RETURNING id;
            """,
            tenant_id,
            provider_order_id,
            provider_capture_id,
            amount_currency,
            currency,
            credits_allocated,
            webhook_event_id,
            idempotency_key,
            json.dumps(raw_payload or {}),
        )

        logger.info(
            "Fulfilled payment: Tenant=%s, Order=%s, Credits=+%.4f, NewBalance=%.4f",
            tenant_id,
            provider_order_id,
            credits_allocated,
            balance_after,
        )

        return {
            "status": "COMPLETED",
            "payment_id": str(payment_row["id"]),
            "ledger_id": str(ledger_row["id"]),
            "balance_before": balance_before,
            "balance_after": balance_after,
            "credits_allocated": credits_allocated,
            "is_replay": False,
        }

    @staticmethod
    async def reserve_compute_credits(
        conn: Connection,
        tenant_id: str,
        estimated_cost: float,
        idempotency_key: str,
        job_id: str,
        metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Atomically checks tenant balance and holds/reserves credits for autonomous compute execution.
        Raises InsufficientCreditsError if balance is less than estimated cost.
        """
        # Strict Row-Level Lock
        tenant_row = await conn.fetchrow(
            """
            SELECT credit_balance
            FROM tenants
            WHERE id = $1
            FOR UPDATE;
            """,
            tenant_id,
        )

        if not tenant_row:
            raise ValueError(f"Tenant {tenant_id} not found in database.")

        balance_before = float(tenant_row["credit_balance"])

        if balance_before < estimated_cost:
            raise InsufficientCreditsError(
                tenant_id=tenant_id,
                required=estimated_cost,
                available=balance_before,
            )

        balance_after = balance_before - estimated_cost

        # Deduct balance
        await conn.execute(
            """
            UPDATE tenants
            SET credit_balance = $1,
                updated_at = NOW()
            WHERE id = $2;
            """,
            balance_after,
            tenant_id,
        )

        # Record debit ledger entry
        ledger_row = await conn.fetchrow(
            """
            INSERT INTO ledger_entries (
                tenant_id,
                transaction_type,
                amount,
                balance_before,
                balance_after,
                idempotency_key,
                reference_id,
                metadata
            )
            VALUES ($1, 'COMPUTE_USAGE', $2, $3, $4, $5, $6, $7::jsonb)
            RETURNING id;
            """,
            tenant_id,
            -estimated_cost,
            balance_before,
            balance_after,
            idempotency_key,
            job_id,
            json.dumps(metadata),
        )

        return {
            "ledger_id": str(ledger_row["id"]),
            "balance_before": balance_before,
            "balance_after": balance_after,
            "reserved_amount": estimated_cost,
        }
