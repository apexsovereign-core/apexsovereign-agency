"""v22 deterministic compliance and revenue-event helpers.

This layer validates payload shape and classification before queueing work. It
never captures payments or invents PayPal verification; webhook events are
recorded for the configured PayPal webhook ID and forwarded to the existing
metering bridge when configured.
"""
from __future__ import annotations

import json
from typing import Any, Mapping

ALLOWED_CLASSIFICATIONS = {"public", "internal", "confidential", "restricted"}
MAX_METADATA_BYTES = 32_000


def compliance_check(metadata: Mapping[str, Any]) -> tuple[bool, str]:
    """Return a deterministic allow/block decision for enterprise metadata."""
    try:
        if len(json.dumps(dict(metadata), separators=(",", ":"), default=str).encode()) > MAX_METADATA_BYTES:
            return False, "metadata_exceeds_32kb_limit"
    except (TypeError, ValueError):
        return False, "metadata_must_be_json_serializable"
    classification = str(metadata.get("data_classification", "internal")).lower()
    if classification not in ALLOWED_CLASSIFICATIONS:
        return False, "invalid_data_classification"
    if classification == "restricted" and metadata.get("compliance_approved") is not True:
        return False, "restricted_data_requires_compliance_approval"
    if metadata.get("prohibited_action") is True:
        return False, "prohibited_action_blocked"
    return True, "approved"


def compliance_snapshot() -> dict[str, Any]:
    return {
        "mode": "deterministic_guardrails",
        "allowed_classifications": sorted(ALLOWED_CLASSIFICATIONS),
        "max_metadata_bytes": MAX_METADATA_BYTES,
    }
