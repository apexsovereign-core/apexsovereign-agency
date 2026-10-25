#!/usr/bin/env bash
# Bind to Render's required port instantly to pass health checks
uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000} &

# Launch the background agent swarm loop
python3 agent_swarm.py
