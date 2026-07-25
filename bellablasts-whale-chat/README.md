# BellaBlasts Whale Chat

A standalone landing page with an inline chat widget for turning fans into a
direct conversation without asking them to fill out a form first. A visitor
just starts typing:

- A bare greeting ("hey", "hi", "how are you") gets an instant canned reply.
- Anything more gets forwarded to you as a Telegram DM, with no auto-reply in
  the widget — just a quiet "sent" status line.
- If you don't reply within 2 minutes, the widget shows a reassurance message
  and your contact channels (Telegram, Email, X/Twitter, Snapchat) as a
  fallback.
- If you reply in Telegram (by replying directly to the forwarded message),
  your answer shows up in the visitor's chat within a few seconds.

It's two pieces:

- `widget/whale-chat-widget.html` — the page itself. Self-contained (inline
  CSS/JS), no build step — paste it into Hostinger's HTML embed block exactly
  like `bellablasts-linkhub.html`.
- `worker/` — a small Cloudflare Worker that holds the chat state, talks to
  Telegram, and runs the 2-minute timer. This needs to be deployed once;
  after that you never touch it again unless you want to change behavior.

This guide assumes no prior Cloudflare/command-line experience.

## 1. Prerequisites

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up).
- [Node.js](https://nodejs.org) installed (needed to run `wrangler`, Cloudflare's deploy tool).
- Your Telegram bot token from [@BotFather](https://t.me/BotFather) (you said you already have this).
- Your own numeric Telegram chat id — see step 4 below for how to find it.

## 2. Install and log in

```bash
cd bellablasts-whale-chat/worker
npm install
npx wrangler login   # opens a browser window to connect your Cloudflare account
```

## 3. Create the KV namespace (where chat sessions are stored)

```bash
npx wrangler kv namespace create CHAT_KV
npx wrangler kv namespace create CHAT_KV --preview
```

Each command prints an `id`. Open `wrangler.toml` and replace:
- `REPLACE_ME_KV_NAMESPACE_ID` with the id from the first command
- `REPLACE_ME_KV_PREVIEW_NAMESPACE_ID` with the id from the second

## 4. Set your secrets

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
# paste the token from @BotFather when prompted

npx wrangler secret put TELEGRAM_OWNER_CHAT_ID
# paste your numeric Telegram chat id when prompted

npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# make up any random string (e.g. from a password generator) and paste it —
# this just proves incoming webhook calls are really from Telegram
```

**Finding your chat id:** message your bot once (anything, e.g. "hi"), then
visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser —
your numeric chat id is in the JSON under `message.chat.id`. (Or message
[@userinfobot](https://t.me/userinfobot) directly, which replies with your id.)

## 5. Review `wrangler.toml`

- `ALLOWED_ORIGIN` — defaults to `https://bellablasts.com`. Change it if the
  widget will be served from a different domain.
- `WHALE_REPLY_WINDOW_MS` — defaults to `120000` (2 minutes). Change only if
  you want a different reply window.
- `[triggers] crons` — leave as `* * * * *` (checks every minute for sessions
  past their deadline; this is the finest granularity Cloudflare's free plan
  supports, so the fallback message can land up to ~60s after the nominal
  2-minute mark).

## 6. Deploy

```bash
npx wrangler deploy
```

This prints your Worker's URL, something like
`https://bellablasts-whale-chat.<your-subdomain>.workers.dev`. Copy it — you
need it in steps 7 and 8. (Optional: you can point a custom subdomain like
`chat.bellablasts.com` at it — see
[Cloudflare's custom domain docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).)

## 7. Register the Telegram webhook (one time)

Paste this into your browser's address bar, filling in your bot token, your
Worker URL from step 6, and the webhook secret from step 4:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>/api/telegram-webhook&secret_token=<YOUR_WEBHOOK_SECRET>
```

You should see `{"ok":true,"result":true,...}`.

## 8. Configure the widget

Open `widget/whale-chat-widget.html`, find the `CONFIG` block near the top
of the `<script>` tag, and fill in:

```js
var WORKER_BASE_URL = "https://REPLACE-ME.workers.dev"; // your Worker URL from step 6
var CONTACT = {
  telegram: "https://t.me/REPLACE_ME",
  email: "mailto:REPLACE_ME@example.com",
  twitter: "https://x.com/REPLACE_ME",
  snapchat: "https://snapchat.com/add/REPLACE_ME"
};
```

## 9. Publish

Paste the entire contents of `widget/whale-chat-widget.html` into Hostinger's
HTML embed block, same as you did for the coming-soon page.

## 10. Smoke test

1. Visit the live page, type "hey" — expect an instant reply in the widget.
2. Type a real question — expect a Telegram DM from your bot within a few
   seconds, and the widget shows "Sent — I'll be with you shortly."
3. In Telegram, **reply directly** to that forwarded message (swipe/long-press
   → Reply) — expect your answer to appear in the widget within ~4 seconds.
4. Send another real question and don't reply — expect the fallback message
   with contact buttons to appear roughly 2–3 minutes later.

## Known limits

- Workers/KV free tier: 100,000 requests/day, 1,000 KV writes/day. Each
  substantive message costs ~3 writes, each owner reply ~2 — comfortable for
  a solo creator's volume, but a real ceiling if this ever gets busy.
- Cron granularity is 1 minute, so the fallback can land up to ~60s after the
  nominal 2-minute mark.
- Chat sessions (and the Telegram reply-mapping) expire automatically after 7
  days of inactivity — no manual cleanup needed.
- If you reply in Telegram *without* using the reply feature (just typing a
  normal message), the bot can't tell which visitor it's for and will ask you
  to use "reply" instead.

## Local development / testing

See `worker/test/` for scripts that exercise the whole flow (classification,
Telegram forwarding, reply threading, the 2-minute fallback) against a local
`wrangler dev` server, without needing real Cloudflare or Telegram
credentials. Requires `curl` and `jq`.

```bash
cd worker
cp .dev.vars.example .dev.vars   # then fill in test values, see the file
npx wrangler dev --local --test-scheduled
```

In another terminal:

```bash
cd worker/test
./simulate-visitor-message.sh
# copy the printed sessionId + telegramMessageId into:
TELEGRAM_WEBHOOK_SECRET=... TELEGRAM_OWNER_CHAT_ID=... \
  ./simulate-telegram-webhook.sh <sessionId> <telegramMessageId>
./simulate-cron.sh
```
