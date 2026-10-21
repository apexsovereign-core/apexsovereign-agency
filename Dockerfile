# ==============================================================================
# ApexSovereign.ai - Hardened Cloud Run Production Container
# Builds Vite SPA bundle and executes unified full-stack server (server.ts)
# ==============================================================================

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

# Install curl for production health probing
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./

# Install dependencies needed for build and runtime
RUN npm install --include=dev

# Copy application source code
COPY . .

# Compile production Vite distribution assets into dist/
RUN npm run build

# Cloud Run dynamic port binding
EXPOSE 8080

# Container health probe
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://127.0.0.1:${PORT:-8080}/health || exit 1

# Start the full-stack server listening on $PORT
CMD ["node", "server.ts"]
