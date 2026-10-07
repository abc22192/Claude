# Deploy to Hostinger — step by step

This is written for shared hosting (Premium / Business / Cloud) using **hPanel**.
It also works on a Hostinger VPS. No command line needed for shared hosting.

**Time:** about 20 minutes. **You need:** your new bot token from @BotFather,
and access to your Hostinger hPanel.

---

## Hosting policy (good news)

Hostinger allows legal adult content on its hosting, including shared plans, so
you can run this on a normal shared plan under a subdomain. No VPS needed. The
only rule is that everything stored stays legal. Source: Hostinger support,
"Is Adult Content Allowed at Hostinger". Password-locking the dashboard (built
in) is still smart, since this is your private business data either way.

---

## Step 1 — Create the subdomain (or use your domain)

1. hPanel → **Domains → Subdomains**.
2. Create `crm` under `bellablasts.com` → gives you `crm.bellablasts.com`.
3. Note the folder it maps to (usually `public_html/crm` or its own
   `.../crm.bellablasts.com/public_html`). That folder is your **web root**.

## Step 2 — Create the MySQL database

1. hPanel → **Databases → Management** (MySQL Databases).
2. **Create a new database.** Write down:
   - Database name (often prefixed, e.g. `u123456_lbb`)
   - Username (e.g. `u123456_lbb`)
   - Password (make it strong)
   - Host is almost always `localhost`.

> ⚠️ **Do NOT use the "Deploy an app" / "Web App" screen.** That one is for
> Node.js/JavaScript apps only and will reject this with "unsupported framework."
> This app is PHP, which runs on classic web hosting. Use **File Manager**, below.

## Step 3 — Upload the files

1. hPanel → **Files → File Manager**, open your web root from Step 1.
2. Upload **everything inside the `public/` folder** of this project into that
   web root. So you end up with `webroot/index.php`, `webroot/webhook.php`,
   `webroot/app/…`, `webroot/assets/…`, etc.
   - Easiest: zip the *contents* of `public/`, upload the zip, extract in place.
   - Make sure the hidden **`.htaccess`** file comes along (turn on "show hidden
     files" in File Manager if you don't see it).

## Step 4 — Create secrets.php

1. In File Manager, open `secrets.example.php`.
2. **Save As** `secrets.php` in the same folder.
3. Edit `secrets.php` and fill in:
   - `TELEGRAM_BOT_TOKEN` → your new @BotFather token.
   - `TELEGRAM_WEBHOOK_SECRET` → invent a long random string (30+ chars).
   - `TELEGRAM_OWNER_ID` → your Telegram numeric id (message @userinfobot to get
     it). This makes the bot ignore everyone but you. Optional but recommended.
   - `DB_NAME`, `DB_USER`, `DB_PASS` → from Step 2. Leave `DB_HOST` as `localhost`.
   - `DASHBOARD_PASSWORD` → the password you'll type to open the dashboard.
   - `API_INGEST_KEY` → invent another long random string. Only needed if you'll
     connect outside apps (Zapier, a website form) via `api.php`. Fine to set now.
   - `ANTHROPIC_API_KEY` → leave blank for now (free, rule-based mode).

## Step 5 — Make sure PHP is 8.0+

hPanel → **Advanced → PHP Configuration** → set PHP to **8.1 or newer**. The
`curl` extension is on by default on Hostinger; nothing else to enable.

## Step 6 — Run setup once

1. Visit `https://crm.bellablasts.com/setup.php`.
2. Log in with your `DASHBOARD_PASSWORD`.
3. Click **"Create tables & connect Telegram."**
4. You should see two green checks: tables created, and Telegram webhook set.
   If Telegram errors, re-check the bot token and that the URL is **https**.

## Step 7 — Test the loop

1. Open Telegram, message your new bot: `/start`.
2. Send a real messy dump, e.g.:
   > *Talked to @joe_whale again tonight. He calls me goddess. Dream night is a
   > candlelit dinner then a private show. Into feet. Tone playful but bratty.*
3. The bot should reply that it sorted it and set a follow-up, and it may ask
   one question if something valuable is missing.
4. Open `https://crm.bellablasts.com/` → you'll see Joe with his fields filled,
   his raw dump preserved, and a follow-up scheduled.
5. Send a dump with no name (e.g. *"she loved the new set"*) → the bot saves it
   and asks **"who is this about?"** → reply with a name → it files it.

That's the whole end-to-end loop working. ✅

---

## Keeping it healthy

- **No process to babysit.** PHP runs per-request, so there is nothing to
  restart and no 503 from a crashed bot. If a page 500s, it's almost always a
  wrong DB credential in `secrets.php` — the page tells you which.
- **Follow-ups:** the dashboard shows what's due. If you later want a daily
  Telegram nudge, that's a small cron job in hPanel → **Advanced → Cron Jobs**
  hitting a `remind.php` (not built yet — say the word).
- **Backups:** hPanel → **Files → Backups**. The raw dumps are your source of
  truth, so a weekly DB backup covers you.

## Security notes

- `secrets.php` and the whole `app/` folder are blocked from the web by
  `.htaccess`. Confirm by visiting `https://crm.bellablasts.com/secrets.php` —
  it should be **403 Forbidden**, not show the file.
- The webhook checks Telegram's secret header, so randoms can't post fake
  updates.
- One password protects every dashboard page. Pick a real one.

## If you'd rather I deploy it

I did **not** deploy anything — you asked me to ask first, and I don't have your
Hostinger login or your bot token, and I shouldn't. If you want, connect the
Hostinger deploy path and hand me the bot token through the secure route (never
paste it in chat), and I'll wire Steps 3–6 for you.
