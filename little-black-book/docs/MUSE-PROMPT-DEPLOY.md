# Prompt for the browser agent (Muse): put the new Little Black Book on crm.bellablasts.com

Bella approved this on 2026-10-07. Paste everything below the line into Muse. Bella logs into Hostinger herself and types every password herself. Muse never needs a secret in chat.

---
You are helping me replace the app at crm.bellablasts.com in Hostinger with a new Node.js app. I will log in to Hostinger myself and I will type every password and secret myself. Never ask me to paste a secret into this chat. If a field needs a secret, tell me which field and wait while I type it.

Rules: Do not delete any database, any table, or any other website or app. Only change the app that serves crm.bellablasts.com. Read values to me only if they are not passwords.

1. In hPanel open Websites, then the Node.js app that serves crm.bellablasts.com. Tell me its name and what it currently shows (just describe it).
2. Open its Environment Variables. READ ME THE NAMES ONLY, not the values. Tell me which of these already exist: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, ADMIN_PASSWORD, SESSION_SECRET, PUBLIC_URL, API_KEY, TELEGRAM_BOT_TOKEN. Keep the DB_ ones that exist. Leave any other existing names alone.
3. Upload the new code: use the app's option to upload a new build or redeploy from a zip, and choose `little-black-book-v2.zip`. Settings must be: Framework Express, Node 22, package manager npm, entry file server.js, start command npm start.
4. Add or fill these variables. Fill the safe ones yourself and leave the secret ones for me to type: DB_HOST = localhost, DB_PORT = 3306, PUBLIC_URL = https://crm.bellablasts.com, APP_TZ = America/New_York. For me to type: ADMIN_PASSWORD (10 or more characters), SESSION_SECRET (16 or more random characters), API_KEY (20 or more random characters), TELEGRAM_BOT_TOKEN. If DB_NAME, DB_USER or DB_PASSWORD are missing or I changed the password, open Databases, MySQL Databases, read me the database NAME and USER, and let me type the password myself. Do not reset or reveal any password.
5. When I say everything is typed, press Deploy and wait for it to finish.
6. Open https://crm.bellablasts.com/health and tell me exactly what it says. Then open https://crm.bellablasts.com and tell me what the page says. If it says "Almost ready", read me every sentence on it.
7. Stop. Do not log in for me.
