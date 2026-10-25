"""
Forwarding module for root-level access to backend/model_tuning_engine.py
"""
import sys
from pathlib import Path
backend_path = str(Path(__file__).resolve().parent / "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from model_tuning_engine import *
