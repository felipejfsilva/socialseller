#!/bin/bash
# Start script for Be Healthy Social Selling Agent
# Usage: ./scripts/start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Be Healthy Social Selling Agent ==="
echo ""

# Check for .env file
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "ERROR: .env file not found."
  echo "Copy config/env.example to .env and fill in your credentials:"
  echo "  cp config/env.example .env"
  exit 1
fi

# Load environment variables
set -a
source "$PROJECT_DIR/.env"
set +a

# Verify required variables
REQUIRED_VARS=("KOMMO_BASE_URL" "KOMMO_ACCESS_TOKEN" "OPENAI_API_KEY")
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "ERROR: $var is not set in .env"
    exit 1
  fi
done

echo "[1/3] Verifying Kommo API access..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $KOMMO_ACCESS_TOKEN" \
  "$KOMMO_BASE_URL/users")

if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Kommo API returned HTTP $HTTP_CODE. Check your token."
  exit 1
fi
echo "  ✓ Kommo API accessible"

echo "[2/3] Setting up CRM pipeline..."
node "$SCRIPT_DIR/setup-pipeline.js"
echo "  ✓ Pipeline configured"

echo "[3/3] Starting n8n..."
echo ""
echo "n8n will be available at: http://localhost:${N8N_PORT:-5678}"
echo "Webhook URL: ${WEBHOOK_URL:-http://localhost:5678}/webhook/instagram-webhook"
echo ""
echo "To import the workflow:"
echo "  1. Open n8n in your browser"
echo "  2. Import workflows/social-instagram-agent.json"
echo "  3. Configure the Kommo Bearer Auth credential"
echo "  4. Set environment variables in n8n settings"
echo "  5. Activate the workflow"
echo ""

cd "$PROJECT_DIR"
npx n8n start
