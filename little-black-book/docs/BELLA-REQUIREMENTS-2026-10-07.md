# Bella's requirements and feedback (2026-10-07)

**Status: NOTHING in this file is built yet.** Bella asked for documentation and a plan before any new building. This file is the single record of her feedback so she never has to repeat herself. Add to it over time. Do not replace it.

Her words are in quotes. Reference images are in `docs/design/`.

## What matters most (her order)
1. **Documentation.** How easy it is, how to set it up, what the bot is, how the web part works.
2. **A person screen she can use live while talking to a client.**
3. **A follow-up system for OLD clients.**
4. **Money.** Income, monthly costs, profit.
5. **Real history** from Telegram and Notion, merged, not blank people.
6. **A smart brain dump** that shows what it saved and has undo and redo.
7. **A professional look** that uses her black book art.
8. **Staying logged in.**

## 1. Documentation (most important)
- "The most important thing is the documentation, how easy it is and how to set it up."
- She does not know "what's wrong with the bot" or "what's on the web" or how it works.
- Needed: a plain-English guide to what each piece is, a from-scratch setup runbook that a person OR a browser agent can follow, and a "when X breaks, do Y" table. See `docs/HOW-IT-WORKS-AND-SETUP.md`.
- Everything decided in chat gets written down here or in `HANDOFF.md`. Never make her re-explain.

## 2. New person screen
- "Email is the most rare way of capturing somebody. It really should not be in the main card." Email belongs in a separate Email List view (the old app had one).
- "Telegram is not the only source." There is also X, OnlyFans, ATW and many others. Having Telegram transcripts does not make Telegram the only source. Support several platforms per person, each with its own username.
- "Where we chat" and "where we met" are very similar and should be combined into one field.
- The current free-text "Chat on" box confused her ("it just skipped it, I don't understand how that even works"). Do not use that method again. Use tap-to-pick platform chips.
- The screen should capture the important things up front, not just identity.

## 3. Person screen (used live with a customer)
Must be visible on the main screen, without scrolling through a form:
- How much money they spent, and the services they purchased.
- Interactions (a real place for them).
- Notes, fetishes, tone.
- **New field: "How they made me feel."** "I forget how they made me feel but when they start talking to me again I go oh yeah, that's right, they made me feel cheap."
- "I see them when I'm dealing with a customer, so that's really important."
- The old app's idea fits: search a name and pull up their **relationship report**. The database stays underneath.

## 4. Dashboard and lists
- She liked the toggle chips.
- She asked for analytics on top of the toggles (see Money).
- The 179-name list is too long. She does not need that much at once. She wants more toggle views of sorts. (Unclear whether she wants a "top 10" view or does not. Confirm. See open questions.)
- "To confirm" and its number made no sense to her. Needs a plain-language name and a one-line explanation, or it should stay hidden until it matters.

## 5. Spot checks of real clients failed (trust problem)
- She checked a couple of real clients and found it "disgustingly rude how horribly it was done."
- Kaiser Bruh and Kaiser bush are the same person split into two, and Kaiser bush shows $0 and 0 purchases.
- Bigboy Hollywood shows $0 and 0 purchases. She knows she has history with them.
- Both have history in the Little Black Book in her Notion that was never brought over.
- Cowork built that Notion book from the Telegram export, so importing it will create duplicates. They must be combined. She said that is "a whole service," and **not to build it now.**
- **Launch gate:** before she is asked to rely on the CRM, she spot-checks about 5 clients she knows well. Spend, history and intel must be right.

## 6. Imported people are empty
- On a person like Bigboy "there's nothing listed." The Telegram transcripts and exports were not brought over. The only interaction text is that it "was dumped from the buyer list."
- "Just really no effort put into it at all."
- Data errors found: the import set "Chat on" to Telegram for every imported person, which is wrong. Status is "imported". Notes hold only an import tag.

## 7. Brain dump
- "I hate it." "The bot is not very smart. It really didn't put anything where it's supposed to go."
- When it makes a mistake, it saves the mistake. Required:
  1. **A receipt** right after saving that shows what it saved and where, with a button to tap through and verify.
  2. **An undo button.**
  3. **A redo button.**
  4. **Undo and redo on the main screen too**, backed by an activity history, "because I have a lot of issues."
- **Better prompting.** The page should write out suggestions (not form fields and not where each thing goes). Nudges like who it was, what they bought and paid, where it happened, what they are into, their tone, how they made her feel, what they want next, when to follow up. "There's a lot, it'll come naturally, that's what a brain does." The dump stays free-form.

## 8. Look and feel
- "Very blocky and very bland." She paid for higher-end builds to get a more sophisticated look.
- She is **not** asking to change it yet. Plan first.
- Her black leather book art (`docs/design/brand-book-cover.png`, gold filigree, "Bella Blasts Little Blackbook") "should be on there somehow." It should look professional.
- She shared the old app as reference (`docs/design/old-crm-reference-bellablasts.png`). It has a cream background, serif headings, gold accents and the header "BELLA HQ, Bella's Little Black Book." The tabs are People, Email List, Follow-ups and Sessions, with the headline "Who are you looking for?" Confirm this is the target feel.

## 9. Login
- It logs her out instantly, all the time. Very frustrating. She wants it to remember her.

## 10. Money and analytics
- "Understand how much money I'm making and what I'm paying a month." That means **income AND monthly expenses**, so profit. Expenses were never in the spec before.
- Views: by month, by platform, by service, top clients, with a way to download the data for Google Sheets.

## 11. Follow-up system (her real business priority)
- "I need to be chasing the old ones. Already paid, already knows me and trusts me" instead of chasing new clients.
- Example rule: "You did a job with him a month ago, we check in with him in three months just to say hi."
- Needed: automatic check-in dates after a purchase, a daily "reach out today" list, and a suggested reason or message per person.

## 12. Integrations
- Webhooks: "we gotta figure out how webhooks go and everything else."
- **Grok:** Grok has been helping her with her Bella Effect scripts. She wants Grok able to put Bella Effect sessions and facts into the CRM every time. This needs an endpoint and key Grok can call. Not yet verified with Grok.
- Notion: reference layer. The Little Black Book in Notion holds richer history than the CRM right now. Merge later (see section 5).
- Telegram: one source among many.

## 13. Explicitly NOT now
- The Notion and Telegram merge service.
- Importing the Telegram transcripts.
- Any visual redesign without a plan she approved.

## Open questions (ask once, then record the answer here)
1. Does she want a short "top 10" style view, or no top-10 limit?
2. Is the old crm.bellablasts.com look the target?
3. What are her monthly costs? A simple list is enough.
4. Check-in timing: 1 month and 3 months after a purchase, or something else?
5. Which Notion database is the Little Black Book to treat as the source?
6. Which Grok does she use (app, API, other) so the integration fits?

## Proposed plan (for her yes before any building)
- **Phase 0 (no new features):** documentation (done), security cleanup (remove the unsafe `install.php`, delete the public CSVs, lock the bot to her ID).
- **Phase 1:** person report screen, new person capture with platform chips and "how they made me feel," quick log of a session, fix the Telegram-for-everyone data error, stay-logged-in.
- **Phase 2:** follow-up system, then Money (income, expenses, profit).
- **Phase 3:** brain dump v2 (receipt, undo and redo, activity history, nudges, smarter sorting).
- **Phase 4:** look and feel using her book art.
- **Phase 5:** history import and merge from Notion and Telegram, Grok webhook, payments.
- Every phase is tested on a real database, delivered as one zip plus one browser-agent prompt, and checked by Bella on about 5 real clients before the next phase starts.

---

# Update 2: decisions confirmed (Bella's second message, 2026-10-07)

These override anything above that conflicts.

## Decisions
1. **Build it as a Node.js app and deploy it with ONE zip upload on Hostinger's "Deploy an app" screen.** She prefers this to File Manager. "Just putting a zip file on, uploading it, was much easier." She told me this at the start and I overruled her with PHP. That was the wrong call. Secrets go in that screen's environment variables form, so no settings file is ever edited by hand.
   - The existing app at `crm.bellablasts.com` is the app slot. It is Node 22, Express preset, entry file `server.js`, npm. Its tabs are People, Email List, Follow-ups and Sessions.
   - `crm.blastwithbella.com` (PHP, File Manager) was only a workaround domain because the PHP zip was rejected by the app screen. Retire it once the Node app replaces it.
   - Not verified: how many app slots her Hostinger plan allows. Redeploying into the existing slot avoids needing a new one.
   - Not in this repo: the source code of the app currently running at `crm.bellablasts.com`. Find out where it was built. If nobody has it, rebuild it to match its layout.
2. **Check-ins happen once a month and again at three months** after a purchase.
3. **She wants a "top 10" view AND several other views.** Not one long list of everyone. She also wants money views (how much is being made) and expense views.
4. **The Notion Little Black Book is the source of truth for existing people.** Other copies are archived. Everything exported from Telegram needs to be redone properly: collect it, organize it, and TEST it before running for real. "You never test them."
5. **Grok must work from both the Grok app and Grok in the browser.**
6. **She is not buying credits.** Plans must fit what she already pays for. Prefer included tools.

## What I found in the Notion Little Black Book (read-only look, 2026-10-07)
- Database id `02958ddc-e7ae-48f8-abaf-e5acc95f342d`, data source `77e388ba-5bc9-4de4-809c-89c8acface87`. A separate Sessions database sits beside it (`2b18021b-6561-4688-aa56-9dd76b53c740`).
- **421 people.** 294 have fetishes, 417 have notes, 56 have a tone, 41 have magic words, 13 have a dream night, 63 have a purchases list. 371 are Telegram, 37 are other platforms.
- **Only 6 Sessions rows exist in Notion.** So Notion holds the relationship intel, and the buyer CSVs hold the money. The CRM currently only has the money (179 people). Neither is complete alone. The real fix is one merged record per person.
- The existing Notion fields are the model to match. People fields: Client Name, Username, Telegram ID, Email, Chat On (select), Met Where, Date Met, Fetishes, Tone, Dream Night, Magic Words, What They Like About Me, Call Me, Plans to Finish, Payment Method, Payment Vibe (multi-select: Haggles, Easy, Tipper, Have to Ask, Cheap, Doesnt Pay, Loyal but Broke, Whale), Purchases, Knows Audio, Knows Bella Effect, Knows Inhalers, Status (VIP, Active, Need Follow-up, Ghosted, New), Follow-up Cadence (7 or 14 days), Last Contact, Notes. Calculated: Follow-up Date, Follow-up Status, Spender Tier, Total Spent, number of sessions.
- Views she already has and clearly likes: Total Revenue, Top Spenders (bar chart), Client Money, VIP Whales, Bella Effect, Priority Follow-Up, Open Threads, New Leads to Nurture, By Status board, Quick Scan.
- One field she asked for is NOT in Notion either: **"How they made me feel."**
- The Chat On list in Notion still contains a retired platform option. Do not carry it into the CRM.
- This answers the earlier open questions about "top 10", check-in timing and which Notion database to use.

## Risk to check before anything else: two apps may share one database
- The PHP install form pre-filled the old app's database name and user, which I copied from her screenshot of the old app's settings. She then reset that database user's password so the PHP app could connect. If the old app at `crm.bellablasts.com` uses the same user, its saved password no longer matches and it may be broken. It looked empty in her last screenshot.
- The PHP tables (`contacts`, `sessions`, `follow_ups` and others) may also sit in the same database as the old app's tables.
- **Read-only check:** in Hostinger, Databases, open phpMyAdmin for that database, list the table names and row counts, and change nothing. Then decide whether the new app gets its own separate database (recommended).

## Open questions that remain
1. Where did the app at `crm.bellablasts.com` come from (which chat or tool), and is its code saved anywhere?
2. Is the look of that app (cream, serif, gold) the target?
3. What are her monthly costs? A simple list is enough.
4. Which Grok setup does she use inside the Grok app, so the connection fits?

## Revised plan (replaces the phases above where they conflict)
- **Phase 0:** security cleanup, database check (above), and a decision on keeping or rebuilding the Node app.
- **Phase 1:** one Node app, one zip, secrets in the environment form. Person report screen, new person with platform chips, "how they made me feel," quick log of a session, check-ins at 1 and 3 months, Top 10 and other views, stay-logged-in.
- **Phase 2:** money views and expenses, undo and redo, brain dump v2.
- **Phase 3:** one merged import from the Notion book plus the buyer CSVs plus the Telegram export, with a review step and a dry run on a copy BEFORE the real run. She spot-checks about 5 real clients.
- **Phase 4:** look and feel with her book art, Grok connection for the app and browser, webhooks and payments.
