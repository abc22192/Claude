# 📓 Little Black Book CRM

A private, single-operator CRM with a Telegram brain-dump bot. You dump messy
notes about a person, it saves the raw note untouched, sorts it onto the right
contact, fills in the relationship intel, asks one question when something
important is missing, and sets the next follow-up.

Built to run on **plain PHP + MySQL** so it deploys on any Hostinger plan and
has **no process to crash** (no more 503s). Deploy steps are in
[`DEPLOY-HOSTINGER.md`](DEPLOY-HOSTINGER.md).

## The loop it runs

```
Telegram message
   → raw dump SAVED INTACT (never rewritten)
   → matched to a person (@handle, known name, or the active person in the chat)
   → CRM fields filled (only empty ones; nothing you know gets clobbered)
   → ONE missing-info question if something valuable is blank
   → follow-up scheduled on that person's cadence
   → if it can't tell who it's about → saved + parked in the review queue + it asks "who is this?"
```

This is deliberately the *smallest* end-to-end loop from the spec. It is not
trying to be everything. Get this reliable first.

## What's a "person" record

The fields that make this a Little Black Book and not just an address book:
Dream Night, Tone, Magic Words, What They Like About Me, Call Me, Interests,
Plans to Finish, Already Knows About, plus platform, payment, spending, status,
last contact, cadence, and next follow-up.

## Talking to the bot

- Just send any text → it's a brain dump.
- `name: Their Name` → set who the next notes are about (creates them if new).
- `/people` → list everyone.
- `/review` → anything it wasn't sure about.
- `/help` → the above.

## The web dashboard

- `index.php` — everyone, follow-ups due today, and the review queue.
- `person.php?id=…` — one person's full record. Editable, so you fix anything
  the auto-sort got wrong. Shows conversation history **and** every original
  raw dump.
- Password-protected (one password, set in `secrets.php`).

## AI cleanup is optional and OFF by default

Everything works with free rule-based extraction. If you paste an Anthropic API
key into `secrets.php`, brain dumps get a smarter AI pass. No key = no cost, no
change in reliability.

## Files

```
public/                 ← this folder's contents become your public_html
  index.php             dashboard
  person.php            one contact
  webhook.php           Telegram receives here
  setup.php             run once: builds tables + connects Telegram
  logout.php
  secrets.example.php   copy to secrets.php and fill in (git-ignored)
  assets/style.css
  app/                  includes only (blocked from the web by .htaccess)
    config.php  db.php  telegram.php  sorter.php  auth.php  schema.sql
```

## Heads up on hosting policy

Hostinger's shared-hosting terms restrict adult content. This tool is a private,
password-locked internal CRM, not a public adult site, which is a much lower
risk — but the field labels are adult-adjacent. If you want to be safe, run it
on a Hostinger **VPS** (looser policy, you control the box). Check the current
line in Hostinger's Universal Terms of Service under "adult content" before you
point a real domain at it. Details in the deploy guide.
