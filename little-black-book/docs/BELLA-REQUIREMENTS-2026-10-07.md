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
