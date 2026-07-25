#!/usr/bin/env bash
# Exercises POST /api/message for both branches of the classifier against a
# locally running `wrangler dev` (default http://localhost:8787).
#
# Requires: curl, jq. Run `wrangler dev --local` in another terminal first.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
SESSION_ID="test-session-$(date +%s)"

echo "== session: $SESSION_ID =="

echo
echo "-- 1. bare greeting --"
GREETING_RESP=$(curl -sS -X POST "$BASE_URL/api/message" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"hey\"}")
echo "$GREETING_RESP" | jq .

CLASSIFICATION=$(echo "$GREETING_RESP" | jq -r .classification)
if [ "$CLASSIFICATION" != "greeting" ]; then
  echo "FAIL: expected classification=greeting, got $CLASSIFICATION" >&2
  exit 1
fi
AWAITING=$(echo "$GREETING_RESP" | jq -r .awaitingReply)
if [ "$AWAITING" != "false" ]; then
  echo "FAIL: greeting should not set awaitingReply" >&2
  exit 1
fi
echo "OK: greeting got an instant canned reply, no pending Telegram thread."

echo
echo "-- 2. substantive message --"
SUBSTANTIVE_RESP=$(curl -sS -X POST "$BASE_URL/api/message" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"how much for a custom video?\"}")
echo "$SUBSTANTIVE_RESP" | jq .

CLASSIFICATION=$(echo "$SUBSTANTIVE_RESP" | jq -r .classification)
if [ "$CLASSIFICATION" != "substantive" ]; then
  echo "FAIL: expected classification=substantive, got $CLASSIFICATION" >&2
  exit 1
fi
AWAITING=$(echo "$SUBSTANTIVE_RESP" | jq -r .awaitingReply)
if [ "$AWAITING" != "true" ]; then
  echo "FAIL: substantive message should set awaitingReply=true" >&2
  exit 1
fi
TG_ID=$(echo "$SUBSTANTIVE_RESP" | jq -r .telegramMessageId)
echo "OK: substantive message forwarded, fake dry-run telegramMessageId=$TG_ID"

echo
echo "-- 3. inspect local KV --"
echo "Expect a pending:$SESSION_ID key and a tg:$TG_ID key:"
# NOTE: `wrangler dev --local` (no --remote) actually stores local KV data
# under the namespace's preview_id, so standalone `wrangler kv` inspection
# commands need --preview to read the same store the dev server wrote to.
npx wrangler kv key list --binding=CHAT_KV --local --preview | grep -E "pending:$SESSION_ID|tg:$TG_ID" || {
  echo "FAIL: expected KV keys not found (run this from worker/)" >&2
  exit 1
}

echo
echo "All checks passed. telegramMessageId=$TG_ID sessionId=$SESSION_ID"
echo "(feed both into simulate-telegram-webhook.sh to test the reply path)"
