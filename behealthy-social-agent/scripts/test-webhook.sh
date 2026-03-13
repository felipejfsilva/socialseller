#!/bin/bash
# Test script to simulate Instagram webhook events
# Usage: ./scripts/test-webhook.sh [dm|comment|follow]

WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:5678/webhook/instagram-webhook}"
EVENT_TYPE="${1:-dm}"

echo "=== Testing Instagram Webhook ==="
echo "URL: $WEBHOOK_URL"
echo "Event: $EVENT_TYPE"
echo ""

case "$EVENT_TYPE" in
  dm)
    PAYLOAD='{
      "object": "instagram",
      "entry": [{
        "id": "test_page_id",
        "time": 1234567890,
        "messaging": [{
          "sender": {"id": "test_user_123"},
          "recipient": {"id": "dr_felipe_id"},
          "timestamp": 1234567890000,
          "message": {
            "mid": "test_mid_001",
            "text": "Olá! Gostaria de saber mais sobre os tratamentos de emagrecimento."
          }
        }]
      }]
    }'
    ;;
  comment)
    PAYLOAD='{
      "object": "instagram",
      "entry": [{
        "id": "test_page_id",
        "time": 1234567890,
        "changes": [{
          "field": "comments",
          "value": {
            "from": {"id": "test_user_456", "username": "maria_silva"},
            "text": "Que resultados incríveis! Quero saber mais sobre procedimentos estéticos.",
            "media": {"id": "test_media_id"}
          }
        }]
      }]
    }'
    ;;
  follow)
    PAYLOAD='{
      "object": "instagram",
      "entry": [{
        "id": "test_page_id",
        "time": 1234567890,
        "changes": [{
          "field": "followers",
          "value": {
            "id": "test_user_789",
            "username": "joao_santos"
          }
        }]
      }]
    }'
    ;;
  *)
    echo "Unknown event type: $EVENT_TYPE"
    echo "Usage: $0 [dm|comment|follow]"
    exit 1
    ;;
esac

echo "Sending payload..."
echo ""

curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq . 2>/dev/null || echo "(raw response above)"

echo ""
echo "Done."
