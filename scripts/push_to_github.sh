#!/usr/bin/env bash
# scripts/push_to_github.sh
# Push ApexSovereign.ai production commits directly to GitHub repository

set -e

REPO_URL="${1:-$GITHUB_REPO_URL}"
TOKEN="${2:-$GITHUB_TOKEN}"

if [ -z "$REPO_URL" ]; then
  echo "Usage: ./scripts/push_to_github.sh <GITHUB_REPO_URL> [GITHUB_TOKEN]"
  echo "Example: ./scripts/push_to_github.sh https://github.com/apexsovereign-core/apexsovereign-agency.git ghp_xxxx"
  exit 1
fi

if [ -n "$TOKEN" ]; then
  CLEAN_URL=$(echo "$REPO_URL" | sed -E 's#https://([^@]+@)?github.com/#https://x-access-token:'"$TOKEN"'@github.com/#')
  git remote remove origin 2>/dev/null || true
  git remote add origin "$CLEAN_URL"
  echo "[GITHUB PUSH] Pushing to $REPO_URL on branch main..."
  git push -u origin main --force
else
  git remote remove origin 2>/dev/null || true
  git remote add origin "$REPO_URL"
  echo "[GITHUB PUSH] Pushing to $REPO_URL on branch main..."
  git push -u origin main
fi

echo "[GITHUB PUSH] Completed successfully. Render / Vercel deployment triggered."
