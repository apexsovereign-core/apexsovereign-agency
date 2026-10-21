"""
Background Cron Jobs: Metering & PayPal Daily Reconciliation.
Invoked via Render cron worker:
- Metering: every 5 minutes ('python -m app.jobs metering')
- Reconciliation: daily ('python -m app.jobs reconcile')
"""

import sys
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from .config import settings
from . import db
from . import ledger

logger = logging.getLogger("apex.jobs")


async def run_metering_cycle():
    """
    5-minute Metering Cycle:
    Calculates compute hours elapsed for running non-demo clusters in supplier mode.
    Transfers accrued CU from user_escrow to platform_revenue via atomic double-entry ledger.
    """
    logger.info("Starting sovereign compute metering cycle...")
    await db.init_pool()

    if settings.PROVIDER_MODE != "supplier":
        logger.info("Provider mode is simulated. Demo clusters incur 0 CU charges. Metering cycle complete.")
        await db.close_pool()
        return

    query = """
        SELECT c.id, c.owner_id, c.burn_cu_hr, c.accrued_cu, c.last_metered_at, c.started_at,
               w.id as wallet_id, e.id as escrow_id, rev.id as revenue_id
        FROM apex.clusters c
        JOIN apex.accounts e ON e.owner_id = c.owner_id AND e.kind = 'user_escrow'
        JOIN apex.accounts w ON w.owner_id = c.owner_id AND w.kind = 'user_wallet'
        CROSS JOIN (SELECT id FROM apex.accounts WHERE code = 'platform_revenue' LIMIT 1) rev
        WHERE c.status = 'running' AND c.demo = FALSE;
    """
    try:
        clusters = await db.fetch_all(query)
        logger.info(f"Processing metering for {len(clusters)} active production clusters.")

        now = datetime.now(timezone.utc)
        for cl in clusters:
            last_metered = cl["last_metered_at"] or cl["started_at"] or now
            elapsed_sec = (now - last_metered).total_seconds()
            if elapsed_sec < 60:
                continue

            # Fractional hour burn
            hours = elapsed_sec / 3600.0
            charge_cu = int(round(cl["burn_cu_hr"] * hours))
            if charge_cu <= 0:
                continue

            interval_tag = now.strftime("%Y%m%d%H%M")
            idempotency_key = f"metering:{cl['id']}:{interval_tag}"

            lines = [
                {"account_id": str(cl["escrow_id"]), "direction": "debit", "amount_cu": charge_cu},
                {"account_id": str(cl["revenue_id"]), "direction": "credit", "amount_cu": charge_cu}
            ]

            try:
                await ledger.post_ledger_transaction(
                    tx_type="ADJUST",
                    reference=f"metering:{cl['id']}",
                    lines=lines,
                    idempotency_key=idempotency_key
                )
                await db.execute(
                    "UPDATE apex.clusters SET accrued_cu = accrued_cu + %s, last_metered_at = %s WHERE id = %s;",
                    (charge_cu, now, cl["id"])
                )
                logger.info(f"Metered cluster {cl['id']}: charged {charge_cu} CU.")
            except Exception as e:
                logger.error(f"Failed to meter cluster {cl['id']}: {e}")

    except Exception as e:
        logger.error(f"Error during metering execution: {e}")
    finally:
        await db.close_pool()


async def run_reconciliation_cycle():
    """
    Daily Reconciliation Cycle:
    Audits PayPal orders captured in the last 24 hours against ledger TOPUP entries.
    Flags any discrepancy at level ERROR in apex.audit_events.
    """
    logger.info("Starting daily PayPal settlement & ledger reconciliation...")
    await db.init_pool()

    since = datetime.now(timezone.utc) - timedelta(days=1)
    query_orders = """
        SELECT order_id, capture_id, amount_cents, cu_amount, owner_id 
        FROM apex.paypal_orders 
        WHERE status = 'COMPLETED' AND updated_at >= %s;
    """
    query_tx = """
        SELECT idempotency_key, reference, created_at 
        FROM apex.transactions 
        WHERE type = 'TOPUP' AND created_at >= %s;
    """

    try:
        orders = await db.fetch_all(query_orders, (since,))
        txs = await db.fetch_all(query_tx, (since,))

        tx_idempotency_set = {t["idempotency_key"] for t in txs if t.get("idempotency_key")}

        mismatches = 0
        for o in orders:
            expected_key = f"paypal:capture:{o['capture_id']}"
            if expected_key not in tx_idempotency_set:
                mismatches += 1
                logger.error(f"RECONCILIATION MISMATCH: Order {o['order_id']} (Capture: {o['capture_id']}) missing in ledger!")
                await db.execute(
                    """
                    INSERT INTO apex.audit_events (event_type, level, details)
                    VALUES ('RECONCILIATION_MISMATCH', 'ERROR', %s::jsonb);
                    """,
                    (f'{{"order_id": "{o["order_id"]}", "capture_id": "{o["capture_id"]}", "amount_cents": {o["amount_cents"]}}}',)
                )

        summary_msg = f"Reconciliation Complete: {len(orders)} orders inspected. {mismatches} mismatches detected."
        logger.info(summary_msg)
        print(summary_msg)

    except Exception as e:
        logger.error(f"Error during reconciliation execution: {e}")
    finally:
        await db.close_pool()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m app.jobs [metering|reconcile]")
        sys.exit(1)

    job_type = sys.argv[1].lower()
    if job_type == "metering":
        asyncio.run(run_metering_cycle())
    elif job_type == "reconcile":
        asyncio.run(run_reconciliation_cycle())
    else:
        print(f"Unknown job command: {job_type}")
        sys.exit(1)
