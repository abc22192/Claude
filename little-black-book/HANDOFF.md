# HANDOFF: Little Black Book CRM

Read this whole file before doing anything. It replaces the long chat history.

## READ THESE FIRST (updated 2026-10-07)
1. `docs/BELLA-REQUIREMENTS-2026-10-07.md` is Bella's detailed, screen-by-screen feedback, her priorities, and the proposed phased plan. It overrides the batch plan at the bottom of this file.
2. `docs/HOW-IT-WORKS-AND-SETUP.md` is the plain-English guide and setup runbook.
3. `docs/design/` holds her black book art and the old app reference screenshot.
4. **Plan first. Build nothing until Bella approves the plan.** She has said the plan and the documentation matter most. Never make her repeat herself. Record every new instruction in the requirements file.
5. Spot-check gate: before asking her to rely on the CRM, have her verify about 5 real clients she knows.

## Rules for working with Bella (she is "Babe")
- She runs Bella Blast solo. She is not a coder. Never ask her to edit code, files or fields by hand.
- She is out of patience and credits. Work in ONE tested batch. One zip. One browser-agent (Muse) prompt. No piecemeal fixes and no "try this and tell me".
- Test every change against a real MySQL or MariaDB in the sandbox before sending it. If the sandbox can't run one, say so BEFORE sending anything. Past bugs all came from skipping this.
- Ask before deploying anything. Never ask for passwords in chat. Never print secrets.
- Writing style: no em dashes, no semicolons, no staccato fragments. Never mention Fansly. Use BBW, never "fat". Bold headers, tight bullets, max 3 options only when a real tradeoff exists.
- Cost discipline: use tools she already pays for (Claude Pro, Cowork, Notion AI, Gemini, ChatGPT, Grok, Hostinger) before recommending anything new.
- Be direct and hold a position, but verify facts before stating them. Hostinger does allow legal adult content. Hostinger's "Deploy an app" screen is Node only, so this PHP app goes through File Manager.

## What exists
- Live site: https://crm.blastwithbella.com (PHP 8 + MySQL on Hostinger shared hosting). Files are uploaded by hand through File Manager into that subdomain's folder.
- Repo: abc22192/Claude, branch claude/new-bot-hostinger-deploy-5po9r1, draft PR #6. App code is in little-black-book/public.
- Secrets live only in secrets.php on the server (git-ignored). Created through install.php.
- Working and seen by Bella: login page, database connection, table creation, Telegram webhook set (green checks), bulk-import preview (184 people, 209 sessions, 99 review items).
- NOT confirmed: the real import run, the phone-friendly dashboard upload (crm-update.zip), the Telegram bot replying, anything on the person page.
- Dashboard v2 (index.php, review.php, style.css) is pushed. app/db.php has a log_session() helper pushed. person.php is still the old long edit form. log.php does not exist yet.
- Buyer data: Google Drive folder "Buyer list for Claude" (3 CSVs: summary, confident purchases, ambiguous purchases). Bella also has a full Telegram chat export.

## Requirements baseline (Bella's own handoff)
- The Little Black Book is relationship memory, not a sales log. Brain dump first, sorting second. She should never start from zero with a person.
- Four layers. PERSON (permanent memory), INTERACTION (what happened), SESSION (what was paid for), FOLLOW-UP (what happens next). Total Spent and Session Count are derived from Sessions, never typed.
- One entry per person. Search before create. Never guess. Never invent. Never overwrite known info with a guess. Preserve every original dump. Ambiguous goes to review or asks Bella.
- Dream Night is a verbatim personal scenario, not a niche word. Fetish is not Tone. Tone is only a free-text memory note of how to be with the person. NO voice router, NO tone categories, NO copy generation in the CRM.
- Bella Effect: payment or intake creates a Session (level L1 to L4), sets Knows Bella Effect, enriches the person, and is never added as a fetish.
- Inputs: private Telegram brain-dump bot, forwarded Telegram messages, the CRM's own entry page, forms, payment data, email. The customer-facing Desk bot stays separate. Notion stays a reference layer, not a second CRM.
- Security: private login, private bot, secrets stored safely, ability to revoke an integration.
- Manual control: create, search, edit any person, add an interaction, add a session, add or edit a follow-up, correct AI mistakes, see the source of each fact.
- Before deployment, test end to end: Telegram dump, forwarded message, manual entry, payment or session, Bella Effect intake, update to an existing person, an ambiguous item going to review, a manual correction.

## Audit findings (verified by test or code reading)
**Security**
- install.php has no login and now pre-fills the saved DB password, bot token and dashboard password for anyone who visits it, and can overwrite settings. My mistake. Replace it with a stub or delete it.
- The 3 buyer CSVs may still sit in the public web folder. .htaccess now blocks .csv but only after it is re-uploaded.
- An older Node app with a weak ADMIN_PASSWORD and a leaked DB password may still be running on the old domain.
- Telegram bot accepts anyone unless TELEGRAM_OWNER_ID is set.
- Login has no lockout, no session regeneration, and no CSRF tokens on any POST form. Pages are not marked noindex.

**Sorter bugs (tested)**
- The word "be" triggers Bella Effect. It flags the person and creates a fake Bella Effect session whenever a dump contains "be" and "paid".
- The word "of" sets chat_on to OnlyFans on almost every dump. "x" and "ig" do the same.
- "plans" and "into" capture random sentence fragments into Plans to Finish and Fetishes.
- Edited Telegram messages are processed as new dumps and create duplicates.
- The active-person context never expires, so a dump with no name goes to whoever was last used, even days ago.
- Short or common names (Bored, Mar, Sam, Jay, J, T) can match ordinary words and misfile.
- One dump is always assigned to one person. A rambling multi-person dump is not split.
- Follow-up dates in text ("next Tuesday") are not read. Every dump adds another identical follow-up row.
- api.php dumps share one chat context.

**Import**
- The real import matches people by exact name, so the preview counts (184 new) will differ from the real run (same-name people merge).
- Every purchase was stored as a generic "purchase". Bella Effect buyers are not flagged and levels are not set.
- Likely duplicate people created by different spellings: Jaime Garcia (C009, C151), Sam Rothman (C015, C124), Jimmy accounts (C027, C055, C122, C175), Kaiser Bruh and Kaiser bush, Tim B and Tim Black, Josh and Josh Anderson, Barry Jobe (C072, C168), Braden Rapp and bradenrapp6, Cal (C014, C101), Slanessh and Slannesh, O M (C144, C167), K (C157, C177).

**Missing**
Person summary page and a fast "log a session" form (what, amount, where, date). Merge-duplicates tool. Backfill product flags from purchases. Money page and CSV download for Google Sheets. Renewal-due and gone-quiet lists (vault subscriptions are monthly). Telegram /log command, forwarded-message handling, voice notes. Telegram export to intel extraction. Bella Effect intake form and payment flow. Phone home-screen icon. Backups. Auto-deploy from GitHub (unverified for her Hostinger plan).

## The one real design decision
The regex sorter cannot truly understand a rambling brain dump. The core promise needs an AI extraction pass. Options: (1) a small Anthropic API key with a cheap model, likely a few dollars per thousand dumps, (2) a scheduled Claude task that reads new raw dumps and fills the fields, (3) keep rules only but fix the bugs and accept shallow sorting. Recommend 1 or 2 plus fixing the rules. Ask Bella once.

## Batch 1 plan (after a fresh audit and her yes)
1. Security fixes above.
2. Fix the sorter bugs above, with tests.
3. Person page as a summary (money, key facts, purchases) with a 4-field quick log, plus log.php to log from the dashboard.
4. Merge-duplicates tool.
5. Backfill Bella Effect and product flags from purchase names.
6. Money page with CSV download.
7. Renewal-due and gone-quiet lists.
Deliver one zip and one Muse prompt. Later batches: Telegram upgrades, chat-export intel, Bella Effect intake, home-screen icon, backups, auto-deploy.
