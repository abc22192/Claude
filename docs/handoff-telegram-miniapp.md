# Handoff: Telegram Protected Video + Deposit Form

Written 2026-10-10. Paste this whole file into a new chat to continue.
Repo: abc22192/Claude, branch `ccr-548e3668-gows6h`, draft PR #10.

## 1. Original goals

1. Stop videos leaking from the Telegram vaults. The vault channels are private with "restrict saving" on, but people still save videos on Android.
2. Build a Telegram Mini App that delivers protected video through a deep link with authenticated access and useful access records for investigating leaks. It must not promise that copying is impossible.
3. Possibly sell the system later as a kit. It should stay low-support and not custom per buyer.
4. Brainstorm a welcome flow and perks for paid members.
5. Urgent side task: a page to post today where fans pay a $3 deposit to reserve a bundle or video, handled by hand.

## 2. What we learned and decided

- **No Telegram setting stops saving or recording.** Protected content is a rule that Telegram's own apps are asked to follow. It covers messages, not Mini App content. Modded clients can ignore it.
- **Mini App is the best Telegram option.** No file ever reaches the phone, so the Android save leak goes away. Screen recording stays possible, so the goal is deterrence plus tracing: a moving watermark with the account code, logs, session limits, and bans.
- **A client-side watermark does not survive ripping the stream with a valid session.** The fix is segment-level watermarking, which is a later upgrade. The packaging step should be built to allow it.
- **DRM is a maybe-later.** It may block recording on some phones, but it is unproven inside Telegram's in-app browser. Bunny's price is unclear: one source says $99/month, another says included.
- **Identity.** The Mini App sends signed launch data, and the server validates it with the bot token. The start parameter is only routing, never a credential.
- **Access check.** Use "is this person currently in the vault channel" via `getChatMember`. MyMembers.io keeps handling billing and says it removes expired members automatically. Not yet tested.
- **Hosting.** Hostinger Business plan: can run Node apps but not ffmpeg or video streaming (shared limits and fair use). Riverside is out because its policy bans adult content.
- **Chosen plan:** video on Bunny Stream (allows legal adult content), Mini App plus login check plus logs on AppDeploy, subdomain such as `vault.bellablasts.com`. A Hostinger VPS (KVM 2, $8.99 promo, $14.99 renewal) is the fallback.
- **Dropped:** Telegram Stars and paid media. Payments stay on CCBill and the existing rails.

## 3. What exists now

| Item | State |
|---|---|
| `docs/telegram-miniapp-architecture.md` | Done. Full pre-build report: threat model, access, delivery, audit trail, admin, MVP, milestones |
| `deposit-form/index.html` | Done. Single-file mobile page, tested on a phone-size screen with no errors. Send button is off until a Telegram username is set |
| PR #10 | Draft, clean, no CI configured |
| Mini App, bot, test page | Not started |

## 4. Technologies and services involved

- Telegram: Bot API, Mini Apps (`initData` HMAC validation), `startapp` deep links, `getChatMember`, `chat_member` updates (must be requested in `allowed_updates`), webhook secret token, `protect_content`
- Video: HLS with AES-128, token-signed segment URLs, hls.js, ffmpeg (VPS only on Hostinger), Bunny Stream
- Hosting: AppDeploy (not connected in the build session), Hostinger Business, optional Hostinger VPS
- Existing stack: MyMembers.io (three vaults), CCBill via mymember.site, YouPay, Cash App
- Form: plain HTML, CSS, JS. Opens `t.me/<user>?text=` with a prefilled message

## 5. Open items and unknowns

- Is the $3 deposit the right number? It is not on the pricing sheet. Closest: Etsy $3.99, waitlist deposits $40 and $65.
- Telegram username, real bundle names with one line each, and confirmation that YouPay and Cash App are the right rails. The form needs all three.
- Has the form been deployed or posted? Unknown.
- The prefilled-message link has not been tested on real phones.
- VPS: it was set to expire Oct 4. Recommendation was to let it lapse unless something else lives on it. Whether it was renewed is unknown.
- Not yet verified: MyMembers.io actually removes expired members, our bot can be admin in all three vault channels, AppDeploy can run a bot webhook on a custom subdomain, Bunny's real pricing and DRM cost, whether HLS plays cleanly in Telegram on iPhone, Android, and desktop.
- Telegram's own docs were blocked in the build environment, so Telegram facts came from search summaries. Re-check before coding. Allow `core.telegram.org` and `docs.bunny.net` in the environment's network settings to fix that.
- Brand rules still apply: no em dashes, no semicolons, "Tellegramz" in fan-facing copy, never the word "free", Stripe and PayPal banned.

## 6. Next steps, in order

1. **Finish and post the form.** Answer the three form questions, fill in the config, upload the file to Hostinger Business or AppDeploy, test the Telegram button on your own phone, then post. This is the part that can earn money this week.
2. **Make the bot** with @BotFather (about two minutes).
3. **Run the playback test.** One sample clip inside Telegram on iPhone, Android, and desktop. This decides whether anything else is worth building.
4. **Confirm the access check.** Add the bot as admin to one vault, join with a test account, and see if `getChatMember` and removal behave.
5. **Build in order:** login and access, protected delivery, player with watermark, logs and admin bot commands, channel buttons and revocation. Detail is in the architecture report.
6. **Decide on DRM and the sellable kit only after real leak data.**

## 7. Questions for the new discussion

1. Is the form live yet, and what are the three answers it needs?
2. Do you want to go ahead with Bunny plus AppDeploy, or keep the VPS option open?
3. Are you OK launching with deter-and-trace and revisiting DRM only if leaks continue?
