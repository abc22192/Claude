# How the Little Black Book works, and how to set it up

Plain English first. Technical details at the bottom. Written so a person or a browser agent (Muse) can follow it with no coding.

## The five pieces
1. **The web app.** What you open at `crm.blastwithbella.com`. It is a set of PHP files sitting in a folder on Hostinger. Nothing "runs" all day. The files wake up when someone visits a page.
2. **The database.** Where every person, purchase, note and follow-up is stored. It lives at Hostinger (hPanel, Databases, MySQL Databases). If the database is lost, the CRM is empty, so back it up.
3. **The Telegram bot.** A bot you create with @BotFather. It does not run anywhere. When you message it, Telegram forwards your message to a web address on your site (the webhook). The site sorts the message and replies. That is why there are no crashes or 503 errors from a process dying.
4. **The settings file (`secrets.php`).** Holds your login password, database login, bot token and keys. It lives only on the server, never in GitHub. Nobody should ever see it.
5. **GitHub, Drive and Notion.** GitHub holds the code. Drive holds the buyer CSVs. Notion is a reference notebook, not a second CRM.

## What "webhook" means
A webhook is a mailbox address on your website. Another service (Telegram, Grok, Zapier, a form) drops a message in it. Your site opens it, does the work, and answers.
- `webhook.php` is Telegram's mailbox. It checks a secret code so strangers can't post fake messages.
- `api.php` is the mailbox for every other app. It needs your API key. Anything that can send a web request can use it, including Grok.

## How a brain dump travels (today)
You send a message. Telegram or the web page passes it to the site. The site saves the exact original first. It then tries to find which person it is about, fills in what it can, and replies. Anything it can't place goes to a "to confirm" list.

**Known weakness:** today's sorting is simple keyword matching, so it misfiles things. See `HANDOFF.md` for the verified bugs and `BELLA-REQUIREMENTS-2026-10-07.md` for what she wants instead.

## Where things live
| Thing | Where |
|---|---|
| The live site | `https://crm.blastwithbella.com` |
| Site files | Hostinger, File Manager, the folder for the subdomain |
| Database | Hostinger, Databases, MySQL Databases |
| Settings and secrets | `secrets.php`, in the site folder on the server only |
| Code | GitHub repo `abc22192/Claude`, folder `little-black-book/public` |
| Buyer CSVs | Google Drive, folder "Buyer list for Claude" |
| Her black book art | `docs/design/brand-book-cover.png` |

## Set it up from scratch
**A. Hostinger**
1. Domains, Subdomains: create the subdomain (for example `crm`). Note its folder in File Manager.
2. Databases, MySQL Databases: create a database AND a database user, give the user all privileges on it, and save the database name, user and password.
3. PHP version: 8.1 or newer.
4. **Use File Manager, not the "Deploy an app" screen.** That screen is Node only and will say "Unsupported framework" for this PHP app.

**B. Telegram (make it private)**
1. In Telegram, message @BotFather, send `/newbot`, and save the token it gives you.
2. Message @userinfobot to get your own numeric Telegram ID. Putting this in the settings makes the bot ignore everyone but you.
3. Never share the bot's link.

**C. Upload and configure**
1. Upload the app zip into the subdomain's folder and extract it there.
2. Open `/install.php` once and fill in the form. It writes `secrets.php`.
3. **Delete `install.php` right after.** The current version has no login and can expose your settings.
4. Open `/setup.php`, log in, and tap "Create tables & connect Telegram."
5. Open the site and log in.

**D. Check it works**
Send the bot a test message, then search for that person on the site.

## How to update the app
Today: download the update zip, upload it to the subdomain folder in File Manager, extract, and choose replace. Never delete `secrets.php` or the `app` folder. There is no auto-update yet. Pulling from GitHub automatically may be possible on her Hostinger plan, but it is not verified.

## When something breaks
| What you see | What it means | Fix |
|---|---|---|
| "Unsupported framework or invalid project structure" | You are on Hostinger's Node-only app screen | Use File Manager instead |
| "Access denied for user ... using password: YES" | Database user or password is wrong, or the user has no rights on that database | Hostinger, Databases, change the password, attach the user to the database with all privileges, then save the new password in the settings |
| "1064 syntax error ... line 27" during setup | A known bug in an older `app/db.php` | Upload the latest `app/db.php` |
| "Wrong password" on the login page | The dashboard password in `secrets.php` differs from what you typed | Use the password you set in `/install.php` |
| Logged out constantly | Known issue, fix planned in Phase 1 | Log in again for now |
| Uploaded a file but nothing changed | Replace was not confirmed, or the browser cached the page | Re-upload and say yes to replace, then hard refresh |
| Bot is silent | Webhook not set, wrong token, or your numeric ID is wrong | Run `/setup.php` again and read the green or red messages |
| A client shows $0 but you know they paid | Their purchase is in the "to confirm" list or never imported | See requirements, section 5 |

## Security checklist
- Delete `install.php` after setup. Delete the buyer CSVs from the site folder after importing.
- Set your Telegram numeric ID in the settings so only you can use the bot.
- Use a long, unique dashboard password. Keep it in a password manager.
- If anything was shown in a screenshot or chat, change it.
- To revoke an integration: change `API_INGEST_KEY` (cuts off Grok, Zapier and forms) or change the bot token with @BotFather (cuts off Telegram).

## Plan for Grok (not built yet)
Grok helps with her Bella Effect scripts. The idea is that Grok sends a web request to `api.php` with the API key whenever a Bella Effect session happens. The CRM then creates the session and enriches the person. Needs: a new endpoint for a Bella Effect session, and a short guide Grok can follow. Which Grok setup she uses must be confirmed first.

## Glossary
- **Database:** the filing cabinet.
- **Bot token:** the bot's password. Anyone who has it can control the bot.
- **API key:** the password other apps use to talk to your site.
- **Webhook:** a mailbox address on your site.
- **File Manager:** Hostinger's tool for uploading files to your site.
