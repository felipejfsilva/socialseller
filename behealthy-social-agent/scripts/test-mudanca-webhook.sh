#!/bin/bash
# Test script to simulate MUDANÇA comment webhook events
# Usage: ./scripts/test-mudanca-webhook.sh [mudanca|other|dedup]

WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:5678/webhook/instagram-comment-mudanca}"
TEST_TYPE="${1:-mudanca}"

echo "=== Testing MUDANÇA Comment Automation ==="
echo "URL: $WEBHOOK_URL"
echo "Test: $TEST_TYPE"
echo ""

case "$TEST_TYPE" in
  mudanca)
    echo ">> Sending MUDANÇA comment..."
    PAYLOAD='{
      "object": "instagram",
      "entry": [{
        "id": "test_page_id",
        "time": 1234567890,
        "changes": [{
          "field": "comments",
          "value": {
            "from": {"id": "test_user_mudanca_001", "username": "ana_carolina_sp"},
            "text": "MUDANÇA! Quero transformar minha vida!",
            "media": {"id": "test_reel_media_id"},
            "created_time": 1234567890
          }
        }]
      }]
    }'
    ;;
  mudanca-lower)
    echo ">> Sending lowercase mudança comment..."
    PAYLOAD='{
      "object": "instagram",
      "entry": [{
        "id": "test_page_id",
        "time": 1234567890,
        "changes": [{
          "field": "comments",
          "value": {
            "from": {"id": "test_user_mudanca_002", "username": "paula_ferreira"},
            "text": "mudança total! preciso disso",
            "media": {"id": "test_reel_media_id"},
            "created_time": 1234567890
          }
        }]
      }]
    }'
    ;;
  no-accent)
    echo ">> Sending MUDANCA without accent..."
    PAYLOAD='{
      "object": "instagram",
      "entry": [{
        "id": "test_page_id",
        "time": 1234567890,
        "changes": [{
          "field": "comments",
          "value": {
            "from": {"id": "test_user_mudanca_003", "username": "roberto_lima"},
            "text": "MUDANCA agora!",
            "media": {"id": "test_reel_media_id"},
            "created_time": 1234567890
          }
        }]
      }]
    }'
    ;;
  other)
    echo ">> Sending non-MUDANÇA comment (should be skipped)..."
    PAYLOAD='{
      "object": "instagram",
      "entry": [{
        "id": "test_page_id",
        "time": 1234567890,
        "changes": [{
          "field": "comments",
          "value": {
            "from": {"id": "test_user_other_001", "username": "maria_oliveira"},
            "text": "Que legal esse conteúdo!",
            "media": {"id": "test_reel_media_id"},
            "created_time": 1234567890
          }
        }]
      }]
    }'
    ;;
  dedup)
    echo ">> Sending duplicate MUDANÇA comment (same user, should be skipped on 2nd call)..."
    PAYLOAD='{
      "object": "instagram",
      "entry": [{
        "id": "test_page_id",
        "time": 1234567890,
        "changes": [{
          "field": "comments",
          "value": {
            "from": {"id": "test_user_mudanca_001", "username": "ana_carolina_sp"},
            "text": "MUDANÇA de novo!",
            "media": {"id": "test_reel_media_id"},
            "created_time": 1234567890
          }
        }]
      }]
    }'
    ;;
  dm)
    echo ">> Sending DM event (should be skipped — not a comment)..."
    PAYLOAD='{
      "object": "instagram",
      "entry": [{
        "id": "test_page_id",
        "time": 1234567890,
        "messaging": [{
          "sender": {"id": "test_user_dm_001"},
          "recipient": {"id": "dr_felipe_id"},
          "timestamp": 1234567890000,
          "message": {
            "mid": "test_mid_001",
            "text": "MUDANÇA via DM"
          }
        }]
      }]
    }'
    ;;
  *)
    echo "Unknown test type: $TEST_TYPE"
    echo ""
    echo "Usage: $0 [mudanca|mudanca-lower|no-accent|other|dedup|dm]"
    echo ""
    echo "Tests:"
    echo "  mudanca       - MUDANÇA comment (should trigger DM)"
    echo "  mudanca-lower - lowercase mudança (should trigger DM)"
    echo "  no-accent     - MUDANCA without accent (should trigger DM)"
    echo "  other         - Non-MUDANÇA comment (should be skipped)"
    echo "  dedup         - Duplicate user (should be skipped on 2nd call)"
    echo "  dm            - DM event (should be skipped — not a comment)"
    exit 1
    ;;
esac

echo ""
echo "Sending payload..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "HTTP Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

# Validate response
if [ "$TEST_TYPE" = "other" ] || [ "$TEST_TYPE" = "dm" ]; then
  if echo "$BODY" | jq -e '.status == "skipped"' > /dev/null 2>&1; then
    echo "PASS: Event correctly skipped"
  else
    echo "WARN: Expected 'skipped' status but got something else"
  fi
elif [ "$TEST_TYPE" = "mudanca" ] || [ "$TEST_TYPE" = "mudanca-lower" ] || [ "$TEST_TYPE" = "no-accent" ]; then
  if echo "$BODY" | jq -e '.status == "ok"' > /dev/null 2>&1; then
    echo "PASS: MUDANÇA comment processed successfully"
  else
    echo "INFO: Check response — may have been processed or skipped"
  fi
fi

echo ""
echo "Done."
