"""
Forwarding module for root-level access to backend/mesh_failover_engine.py
"""
import sys
from pathlib import Path
backend_path = str(Path(__file__).resolve().parent / "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from mesh_failover_engine import *
