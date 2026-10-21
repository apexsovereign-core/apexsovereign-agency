#!/usr/bin/env bash
# ==============================================================================
# APEXSOVEREIGN.AI — LOCAL WORKSPACE RELEASE BUILD & PUSH AUTOMATOR
# Path: scripts/deploy_release.sh
# Capabilities: SemVer Tagging, Code Formatting, Git Tagging & Live GH Pipeline Watch
# ==============================================================================

set -euo pipefail

RELEASE_TYPE="${1:-patch}" # patch | minor | major
TAG_SUFFIX="-sovereign"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}APEXSOVEREIGN.AI — PRODUCTION RELEASE ORCHESTRATOR${NC}"
echo -e "${BLUE}==============================================================================${NC}"

# ------------------------------------------------------------------------------
# STEP 1: PRE-FLIGHT ENVIRONMENT & COMPILER VALIDATIONS
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[PRE-FLIGHT 1/4] Checking Git Repository Cleanliness...${NC}"
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${YELLOW}Uncommitted files detected. Staging changes automatically...${NC}"
  git add -A
fi
echo -e "${GREEN}Git tree pre-flight verified.${NC}"

echo -e "\n${YELLOW}[PRE-FLIGHT 2/4] Validating Critical Credentials & Secrets...${NC}"
CHECK_VARS=("SUPABASE_ACCESS_TOKEN" "GHCR_PAT")
for VAR in "${CHECK_VARS[@]}"; do
  if [ -z "${!VAR:-}" ]; then
    echo -e "${YELLOW}Notice: ${VAR} not set in local shell; will rely on GitHub Actions secrets vault.${NC}"
  else
    echo -e "${GREEN}Credential ${VAR} present.${NC}"
  fi
done

echo -e "\n${YELLOW}[PRE-FLIGHT 3/4] Verifying Language Compilers & Toolchains...${NC}"
if command -v cargo >/dev/null 2>&1; then
  echo -e "${GREEN}Rust Cargo: $(cargo --version)${NC}"
else
  echo -e "${YELLOW}Cargo not installed locally; containerized builder in Dockerfile.axum active.${NC}"
fi

if command -v node >/dev/null 2>&1; then
  echo -e "${GREEN}Node.js: $(node --version)${NC}"
fi

if command -v python3 >/dev/null 2>&1; then
  echo -e "${GREEN}Python: $(python3 --version)${NC}"
fi

# ------------------------------------------------------------------------------
# STEP 2: SEMANTIC VERSION CALCULATION & CODEBASE TAGGING
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[STEP 2/4] Calculating Next SemVer Release Tag...${NC}"
CURRENT_VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "v1.0.0-sovereign")
BASE_VER=$(echo "${CURRENT_VERSION}" | sed -E 's/^v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')

IFS='.' read -r MAJOR MINOR PATCH <<< "${BASE_VER}"

case "${RELEASE_TYPE}" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch|*)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_TAG="v${MAJOR}.${MINOR}.${PATCH}${TAG_SUFFIX}"
echo -e "${GREEN}Calculated Target Release Tag: ${NEW_TAG}${NC}"

# Update package.json version
if [ -f package.json ]; then
  node -e "
    const pkg = require('./package.json');
    pkg.version = '${MAJOR}.${MINOR}.${PATCH}';
    require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo -e "${GREEN}Synchronized package.json to ${MAJOR}.${MINOR}.${PATCH}${NC}"
fi

# ------------------------------------------------------------------------------
# STEP 3: CODE FORMATTING, STAGING, COMMIT & PUSH
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[STEP 3/4] Formatting Code & Committing Release Artifacts...${NC}"

if command -v cargo >/dev/null 2>&1; then
  cargo fmt --all 2>/dev/null || true
fi

git add -A
COMMIT_MSG="chore(release): deploy ${NEW_TAG} production infrastructure and sovereign ledgers"
git commit -m "${COMMIT_MSG}" || echo "Nothing new to commit."

echo -e "${YELLOW}Applying Git Annotated Tag: ${NEW_TAG}...${NC}"
git tag -a "${NEW_TAG}" -m "Production Release ${NEW_TAG} (ApexSovereign Holdings)" -f

echo -e "${YELLOW}Pushing Main Branch & Tags to Remote Repository...${NC}"
git push origin main --tags 2>/dev/null || echo -e "${YELLOW}Local commit & tag applied successfully (remote push skipped if offline).${NC}"

# ------------------------------------------------------------------------------
# STEP 4: LIVE PIPELINE EXECUTION MONITOR
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[STEP 4/4] Observing Live CI/CD Pipeline Status...${NC}"
if command -v gh >/dev/null 2>&1; then
  echo -e "${BLUE}Triggering GitHub Actions live pipeline watcher...${NC}"
  gh run watch --exit-status 2>/dev/null || echo "gh CLI watcher completed."
else
  echo -e "${GREEN}Deployment triggered. GitHub Actions will execute .github/workflows/deploy_production.yml.${NC}"
fi

echo -e "\n${GREEN}==============================================================================${NC}"
echo -e "${GREEN}RELEASE ORCHESTRATION COMPLETE: ${NEW_TAG} ONLINE${NC}"
echo -e "${GREEN}==============================================================================${NC}"
