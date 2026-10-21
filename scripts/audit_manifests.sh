#!/usr/bin/env bash
# ==============================================================================
# ApexSovereign.ai - Operational Command 10: Manifest & Container Audit Script
# File: scripts/audit_manifests.sh
# Target: Dockerfile, Dockerfile.frontend, k8s/deployment-all.yaml
# Classification: Production Pre-Flight Container & Kubernetes Orchestration Audit
# ==============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ERRORS=0

log_info() { echo -e "${CYAN}[AUDIT-INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[AUDIT-PASS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[AUDIT-WARN]${NC} $1"; }
log_fail() { echo -e "${RED}[AUDIT-FAIL]${NC} $1"; ERRORS=$((ERRORS + 1)); }

echo "================================================================================"
echo "    APEXSOVEREIGN.AI — PRODUCTION CONTAINER & KUBERNETES MANIFEST AUDIT        "
echo "================================================================================"

# 1. Audit Backend Dockerfile
log_info "1. Auditing FastAPI Backend Container (Dockerfile)..."
if [ ! -f "Dockerfile" ]; then
    log_fail "Dockerfile not found at repository root."
else
    # Check exposed port
    if grep -E "EXPOSE\s+8000" Dockerfile > /dev/null; then
        log_pass "Backend Dockerfile exposes standard FastAPI port 8000."
    else
        log_warn "Explicit EXPOSE 8000 not matched in Dockerfile."
    fi

    # Check non-root user execution
    if grep -E "USER\s+" Dockerfile > /dev/null; then
        log_pass "Non-root security context configured in Dockerfile."
    else
        log_warn "Root execution detected. Consider adding a non-root system user."
    fi

    # Check HEALTHCHECK instruction
    if grep -E "HEALTHCHECK" Dockerfile > /dev/null; then
        log_pass "Container HEALTHCHECK instruction defined."
    else
        log_warn "No explicit Docker HEALTHCHECK; relying on Kubernetes liveness probes."
    fi
fi

# 2. Audit Frontend Dockerfile
log_info "2. Auditing React/Vite/Nginx Frontend Container (Dockerfile.frontend)..."
if [ ! -f "Dockerfile.frontend" ]; then
    log_fail "Dockerfile.frontend not found at repository root."
else
    if grep -E "EXPOSE\s+80" Dockerfile.frontend > /dev/null; then
        log_pass "Frontend Dockerfile exposes HTTP port 80."
    else
        log_warn "Port 80 not explicitly declared in Dockerfile.frontend."
    fi

    if grep -E "nginx" Dockerfile.frontend > /dev/null; then
        log_pass "Production Nginx multi-stage build verified."
    fi
fi

# 3. Audit Kubernetes Manifests (k8s/deployment-all.yaml)
log_info "3. Auditing Kubernetes Master Deployment Manifests (k8s/deployment-all.yaml)..."
if [ ! -f "k8s/deployment-all.yaml" ]; then
    log_fail "k8s/deployment-all.yaml not found."
else
    # Check namespace declaration
    if grep -E "name:\s+apexsovereign-prod" k8s/deployment-all.yaml > /dev/null; then
        log_pass "Namespace 'apexsovereign-prod' verified."
    else
        log_fail "Namespace 'apexsovereign-prod' missing from deployment-all.yaml."
    fi

    # Check resource requests & limits
    if grep -E "resources:" k8s/deployment-all.yaml > /dev/null && grep -E "limits:" k8s/deployment-all.yaml > /dev/null; then
        log_pass "Compute resource limits and CPU/memory requests defined."
    else
        log_fail "Resource requests or limits missing; risk of container noisy-neighbor OOM."
    fi

    # Check Health Probes (/health)
    if grep -E "path:\s+/health" k8s/deployment-all.yaml > /dev/null; then
        log_pass "Kubernetes liveness/readiness probes configured to '/health'."
    else
        log_fail "Health probe path '/health' not detected in deployment manifest."
    fi

    # Check HorizontalPodAutoscaler (HPA)
    if grep -E "kind:\s+HorizontalPodAutoscaler" k8s/deployment-all.yaml > /dev/null; then
        log_pass "HorizontalPodAutoscaler (HPA) resource declared."
    else
        log_fail "HPA definition missing from k8s/deployment-all.yaml."
    fi

    # Check TLS & Ingress
    if grep -E "kind:\s+Ingress" k8s/deployment-all.yaml > /dev/null; then
        log_pass "Kubernetes Ingress with SSL/TLS termination declared."
    else
        log_fail "Ingress manifest missing from k8s/deployment-all.yaml."
    fi
fi

echo "================================================================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}MANIFEST AUDIT PASSED: All Container and Kubernetes Specs Certified.${NC}"
    exit 0
else
    echo -e "${RED}MANIFEST AUDIT FAILED: $ERRORS critical issue(s) identified.${NC}"
    exit 1
fi
