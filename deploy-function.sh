#!/bin/bash
# Deploy kytalystScan Cloud Function
# Run from anywhere: ~/Documents/kytalyst-fn/deploy-function.sh

GCLOUD="$HOME/google-cloud-sdk/bin/gcloud"
PYTHON="/opt/homebrew/bin/python3.12"
FUNCTION_DIR="$HOME/Documents/kytalyst-fn/functions"

echo "Pulling latest source..."
cd ~/Documents/kytalyst-fn && git pull

echo "Deploying kytalystScan..."
CLOUDSDK_PYTHON=$PYTHON $GCLOUD functions deploy kytalystScan \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point kytalystScan \
  --source $FUNCTION_DIR \
  --project kytrac-72d91 \
  --region us-central1 \
  --no-gen2

echo "Done."
