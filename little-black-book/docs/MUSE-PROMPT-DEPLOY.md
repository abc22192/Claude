# Prompt for the browser agent (Muse): deploy the new Little Black Book

Paste everything below the line into Muse. Bella logs into Hostinger herself and types the passwords herself. Muse never needs them in chat.

---
You are helping me deploy a Node.js app on Hostinger. I will log in to Hostinger myself and I will type every password and secret myself. Do not ask me to paste any secret into this chat. If a field needs a secret, stop and tell me which field, and wait while I type it.

Do not delete, edit or open anything that already exists (other apps, databases, files). Only add.

1. In hPanel go to Websites, Add website, choose Node.js Apps (Deploy an app). Pick the domain or subdomain I tell you. Upload `little-black-book-v2.zip` from my downloads.
2. Build settings: Framework Express, Node version 22, package manager npm, entry file server.js, start command npm start.
3. Open the Environment Variables form. Add these names and leave the values empty for me to type: DB_HOST (value localhost, you may fill this), DB_PORT (3306, you may fill this), DB_NAME, DB_USER, DB_PASSWORD, ADMIN_PASSWORD, SESSION_SECRET, PUBLIC_URL, API_KEY, TELEGRAM_BOT_TOKEN. Tell me when each is waiting for me.
4. For the database values, open Databases, MySQL Databases and read the NAME and USER to me. Do not reveal or reset the password. If I need a new password I will press Change password myself.
5. After I have typed everything, press Deploy. Wait for it to finish. Open the site address. Tell me exactly what the page says. If it says "Almost ready", read me the sentences on it.
6. Open the site address followed by /health and tell me the result.
7. Stop there. Do not log in for me.
