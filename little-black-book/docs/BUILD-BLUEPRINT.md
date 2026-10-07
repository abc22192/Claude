# Build blueprint: Little Black Book v2 (Node app)

Decision (Bella, 2026-10-07): restart from scratch as a Node app that deploys by ONE zip on Hostinger's "Deploy an app" screen. Do not reuse the ChatGPT-built app. Make it far better. This file is the plan. Code lives in `little-black-book/crm-node/`.

## Rules that never bend
- No build step. `npm install` then `node server.js`. Only two dependencies (express, mysql2).
- Every table is prefixed `lbb_` so it can never collide with another app's tables in the same database.
- If the database is down, the app still starts and shows a plain-English fix page. No 503.
- Nothing is guessed. Anything the sorter is not sure about waits for her OK.
- Every change can be undone and redone (global Undo and Redo, plus an Undo button after each save).
- Every import has a dry run first and is one undoable step.
- Tested on a real MariaDB before any zip is handed over.

## Screens
1. **Today** (home): money this month, who to reach out to today (top 5), quick actions (Brain dump, Log session, New person), search, undo and redo bar.
2. **People:** search plus toggle views: Top 10, Whales, Due to check in, Gone quiet, Bella Effect, New leads, By platform.
3. **Person (relationship report):** money strip, then everything she needs live: Dream Night, Tone, Fetishes, Magic Words, Call Me, What they like about me, **How they made me feel**, Plans. Platforms with usernames. Purchases, conversations and check-ins in one timeline. A 4-field quick log (what, amount, where, date). Email lives under "More."
4. **Follow-ups:** automatic check-ins 1 month and 3 months after the last purchase, sorted by what the person has spent, with Done, Snooze and Skip.
5. **Money:** income by month, platform and service, top clients, monthly expenses, profit, CSV download for Google Sheets.
6. **Brain dump:** free text with tap-to-insert nudges (not fields). After saving, a receipt shows exactly what was saved where, with Undo and Fix.
7. **To confirm:** purchases the history could not prove. Yes (with amount) or Skip.
8. **Merge duplicates:** suggested pairs, preview, merge, undoable.
9. **Import:** buyer CSVs and the Notion export. Dry run, report, then run as one undoable step.
10. **Settings and health:** check-in timing, tier thresholds, connection checks in plain English, backup download.

## Integrations
- **Telegram:** private bot (locked to her ID). Brain dump, `/log`, `/find`, `/today`, `/undo`, `/redo`, forwarded messages, inline Undo button.
- **API for Grok and other apps:** key-protected endpoints plus an OpenAPI file, including a Bella Effect session endpoint.

## Look
Black, gold and cream with serif headings. Her black leather book art on the login and home header. Installable on her phone's home screen.

## Environment variables (entered once in Hostinger's form)
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `ADMIN_PASSWORD`, `SESSION_SECRET`. Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`, `TELEGRAM_WEBHOOK_SECRET`, `API_KEY`, `ANTHROPIC_API_KEY`, `PUBLIC_URL`, `TZ`.

## Sorting honesty
Rules alone cannot understand a rambling brain dump. The sorter produces proposals with a confidence level. High-confidence ones apply. The rest wait for her OK. An optional AI pass (only if `ANTHROPIC_API_KEY` is set) can be added without changing anything else.
