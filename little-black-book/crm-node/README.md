# Little Black Book (Node app)

Private relationship memory for Bella Blasts. Built from scratch. Node 22, Express, MySQL. Two dependencies, no build step.

## Put it on Hostinger (one zip, no File Manager)
1. Hostinger, Websites, Add website, **Node.js app** (Deploy an app), upload `little-black-book-v2.zip`.
2. Settings: Framework Express, Node 22, package manager npm, entry file `server.js`, start command `npm start`.
3. Environment variables (type them into Hostinger's form yourself, never in chat):

| Name | What it is |
|---|---|
| `DB_HOST` | `localhost` |
| `DB_PORT` | `3306` |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | from Hostinger, Databases, MySQL Databases |
| `ADMIN_PASSWORD` | the password you type to open the app, 10+ characters |
| `SESSION_SECRET` | any random text, 16+ characters |
| `PUBLIC_URL` | your site address, no slash at the end |
| `API_KEY` | 20+ random characters, for Grok |
| `TELEGRAM_BOT_TOKEN` | from BotFather |
| `TELEGRAM_OWNER_ID` | add after your first message to the bot, the bot tells you the number |
| `APP_TZ` | optional, default `America/New_York` |
| `ANTHROPIC_API_KEY` | optional, extra sorting ideas that always wait for your OK |

4. Deploy. Open the site. If a setup step is missing, the page says exactly what in plain English.
5. Tables are created automatically. Every table starts with `lbb_`, so it can share a database with another app without touching it.

## Telegram
Message your bot once. It replies with your Telegram ID and saves nothing. Put that number in `TELEGRAM_OWNER_ID`, redeploy, then Settings, Connect. From then on it only listens to you. Send text to file it. Forward a client's message to save it on their card.

## Grok
Address: `PUBLIC_URL/api/v1`. Instructions file: `PUBLIC_URL/api/v1/openapi.json`. Send `Authorization: Bearer API_KEY`.

## Rules the app keeps
- Total spent and purchase count come only from counted purchases, never typed.
- A purchase without an amount is saved but not counted until Bella confirms it.
- The sorter files only what is certain. Everything else waits for her OK. Your exact words are always saved.
- Every change can be undone and redone, including imports and merges.

## Tests
`TEST_DB_NAME=... TEST_DB_USER=... TEST_DB_PASSWORD=... node tests/run.js` (drops all `lbb_` tables in that database, use a throwaway one).
