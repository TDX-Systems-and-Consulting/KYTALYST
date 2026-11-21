#!/bin/bash
# Deploy the kytalystScan Cloud Function to the KYTALYST Firebase project.
# Usage (Google Cloud Shell, or any machine with gcloud):  ./deploy-function.sh <kytalyst-project-id>
# Node 22, 2nd gen, secrets from Secret Manager (you create those yourself; keys never go in code).
set -euo pipefail

PROJECT="${1:?Pass the KYTALYST Firebase project ID, e.g. ./deploy-function.sh kytalyst-12345}"
GCLOUD="${GCLOUD:-$(command -v gcloud || echo "$HOME/google-cloud-sdk/bin/gcloud")}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Pulling latest source..."
git -C "$REPO_DIR" pull --ff-only

echo "Checking function syntax..."
node -c "$REPO_DIR/functions/index.js"

echo "Deploying kytalystScan to $PROJECT..."
"$GCLOUD" functions deploy kytalystScan \
  --project "$PROJECT" \
  --region us-central1 \
  --gen2 \
  --runtime nodejs22 \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point kytalystScan \
  --source "$REPO_DIR/functions" \
  --memory 512Mi \
  --timeout 60s \
  --set-secrets "RENTCAST_API_KEY=RENTCAST_API_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest" \
  --set-env-vars "SCAN_DAILY_LIMIT=50"

# Allowed websites default to tdx-kytalyst.com (see ALLOWED_ORIGINS in functions/index.js).
# --allow-unauthenticated only lets the request reach the code; the code itself
# rejects anyone without a KYTALYST sign-in token or from another website.
echo "Done. Function URL:"
"$GCLOUD" functions describe kytalystScan --project "$PROJECT" --region us-central1 --gen2 --format='value(url)'
