# ==============================================================================
# ApexSovereign.ai - Enterprise Hardened Production Dockerfile
# Multi-stage build with non-root security execution
# ==============================================================================

FROM python:3.12-slim-bookworm AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Final minimal runtime container
FROM python:3.12-slim-bookworm AS runner

WORKDIR /app

# Install runtime libpq for asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create dedicated non-root application user
RUN groupadd -g 10001 apex && \
    useradd -u 10001 -g apex -s /bin/bash -m apex

# Copy compiled python packages from builder
COPY --from=builder /root/.local /home/apex/.local
ENV PATH=/home/apex/.local/bin:$PATH
ENV PYTHONPATH=/app

# Copy application source
COPY --chown=apex:apex . /app

USER apex

# Default Render port
ENV PORT=10000
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:' + str(os.environ.get('PORT', 10000)) + '/health')" || exit 1

CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT} --workers 4 --proxy-headers"]
