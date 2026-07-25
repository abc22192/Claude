#!/usr/bin/env bash
# Exercises the 2-minute-fallback cron logic without waiting 2 minutes:
# seeds local KV directly with a session/pending pair whose deadline is
# already in the past, then invokes the scheduled handler.
#
# Start the worker with scheduled-testing enabled in another terminal:
#   npx wrangler dev --test-scheduled
#
# Requires: curl, jq.
#
# NOTE: `wrangler dev --local` (no --remote) stores local KV data under the
# namespace's preview_id, so the `wrangler kv` seed/inspect commands below
# use --preview to read/write the same store the dev server uses.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
SESSION_ID="cron-test-$(date +%s)"
PAST_DEADLINE=$(( $(date +%s%3N) - 60000 )) # 1 minute in the past

echo "== session: $SESSION_ID (deadline already past) =="

SESSION_JSON=$(cat <<JSON
{
  "id": "$SESSION_ID",
  "createdAt": $PAST_DEADLINE,
  "messages": [
    { "id": "seed-1", "from": "visitor", "text": "you around?", "seq": 1, "ts": $PAST_DEADLINE }
  ],
  "lastSeq": 1,
  "awaitingReply": true,
  "deadlineAt": $PAST_DEADLINE,
  "fallbackSent": false,
  "telegramMessageId": 424242
}
JSON
)

echo "-- seeding session:$SESSION_ID --"
npx wrangler kv key put --binding=CHAT_KV --local --preview "session:$SESSION_ID" "$SESSION_JSON"

echo "-- seeding pending:$SESSION_ID --"
npx wrangler kv key put --binding=CHAT_KV --local --preview "pending:$SESSION_ID" "{\"deadlineAt\":$PAST_DEADLINE}"

echo
echo "-- invoking the scheduled handler (requires wrangler dev --test-scheduled) --"
curl -sS "$BASE_URL/__scheduled?cron=*+*+*+*+*"

echo
echo "-- polling session for the fallback message --"
POLL_RESP=$(curl -sS "$BASE_URL/api/messages?sessionId=$SESSION_ID&sinceSeq=0")
echo "$POLL_RESP" | jq .

FALLBACK_COUNT=$(echo "$POLL_RESP" | jq '[.messages[] | select(.kind=="fallback")] | length')
FALLBACK_SENT=$(echo "$POLL_RESP" | jq -r .fallbackSent)

if [ "$FALLBACK_COUNT" -lt 1 ]; then
  echo "FAIL: expected a fallback-kind message to have been appended" >&2
  exit 1
fi
if [ "$FALLBACK_SENT" != "true" ]; then
  echo "FAIL: expected fallbackSent=true" >&2
  exit 1
fi

echo
echo "-- confirming pending:$SESSION_ID was cleared --"
# NOTE: `wrangler kv key get` exits 0 even for a missing key (it just prints
# "Value not found"), so absence has to be checked via `kv key list` instead.
if npx wrangler kv key list --binding=CHAT_KV --local --preview | grep -q "\"pending:$SESSION_ID\""; then
  echo "FAIL: pending:$SESSION_ID should have been deleted" >&2
  exit 1
fi

echo "OK: fallback message appended and pending entry cleared."
