"""Cloud deployment entrypoint compatibility wrapper.

Canonical application code lives under backend/main.py; this wrapper allows
`uvicorn app:app` from the repository root without duplicating service logic.
"""
from __future__ import annotations

import sys
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
# The legacy backend imports `app.agency`; expose the real package path even
# though this compatibility module is also named `app`.
__path__ = [str(Path(backend_dir) / "app")]

from main import app  # noqa: E402

__all__ = ["app"]
