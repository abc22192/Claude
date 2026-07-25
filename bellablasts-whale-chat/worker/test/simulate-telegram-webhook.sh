#!/usr/bin/env bash
# Simulates Telegram delivering the owner's threaded reply to the webhook.
# Run simulate-visitor-message.sh first and pass its printed sessionId and
# telegramMessageId in as args:
#
#   ./simulate-telegram-webhook.sh <sessionId> <telegramMessageId>
#
# Requires TELEGRAM_WEBHOOK_SECRET and TELEGRAM_OWNER_CHAT_ID to be set in
# worker/.dev.vars (any values work locally — they just need to match what
# `wrangler dev` loaded). Requires: curl, jq.
set -euo pipefail

SESSION_ID="${1:?usage: simulate-telegram-webhook.sh <sessionId> <telegramMessageId>}"
REPLIED_TO_MESSAGE_ID="${2:?usage: simulate-telegram-webhook.sh <sessionId> <telegramMessageId>}"
BASE_URL="${BASE_URL:-http://localhost:8787}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${TELEGRAM_WEBHOOK_SECRET:?set TELEGRAM_WEBHOOK_SECRET to match worker/.dev.vars}"
: "${TELEGRAM_OWNER_CHAT_ID:?set TELEGRAM_OWNER_CHAT_ID to match worker/.dev.vars}"

PAYLOAD=$(sed \
  -e "s/__OWNER_CHAT_ID__/$TELEGRAM_OWNER_CHAT_ID/" \
  -e "s/__REPLIED_TO_MESSAGE_ID__/$REPLIED_TO_MESSAGE_ID/" \
  "$SCRIPT_DIR/sample-telegram-update.json")

echo "-- posting fake Telegram webhook update --"
# The webhook route replies with a plain-text "ok" (Telegram's requirement),
# not JSON, so this is printed as-is rather than piped through jq.
curl -sS -X POST "$BASE_URL/api/telegram-webhook" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_WEBHOOK_SECRET" \
  -d "$PAYLOAD"
echo

echo
echo "-- polling session for the owner's reply --"
POLL_RESP=$(curl -sS "$BASE_URL/api/messages?sessionId=$SESSION_ID&sinceSeq=0")
echo "$POLL_RESP" | jq .

OWNER_MSG=$(echo "$POLL_RESP" | jq -r '.messages[] | select(.from=="owner") | .text' | head -n1)
AWAITING=$(echo "$POLL_RESP" | jq -r .awaitingReply)

if [ -z "$OWNER_MSG" ]; then
  echo "FAIL: no owner message found in session transcript" >&2
  exit 1
fi
if [ "$AWAITING" != "false" ]; then
  echo "FAIL: awaitingReply should be false after the owner replies" >&2
  exit 1
fi

echo "OK: owner reply landed (\"$OWNER_MSG\") and awaitingReply flipped to false."
