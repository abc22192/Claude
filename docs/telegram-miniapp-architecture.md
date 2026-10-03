# Telegram Mini App: Pre-Build Architecture Report

Status: DESIGN ONLY. No code, no infrastructure, no installs.
Date: 2026-10-03

## How to read this

- [D] Documented. Confirmed against official Telegram documentation this session.
- [R] Recommendation. My architectural judgment.
- [A] Assumption or unverified. Must be confirmed before it carries weight.

Verification limit: direct fetches of core.telegram.org were blocked by this session's network policy. Telegram facts below were confirmed through search results that quote the official pages (Mini Apps, Bot API, Bot API changelog, Content protection, Deep links, Invite links, Star subscriptions). They are not full-page reads. Anything marked [A] should be re-checked against the live page before coding. To allow full-page reads, add core.telegram.org under Allowed domains in the environment's network settings.

Existing stack this must fit (from the platform fact sheet): three separate Telegram vaults sold through MyMembers.io (All My Curves $10, VIFL $15, VISL $30), payments through CCBill, home base mymember.site. Vaults stay separate. Stripe and PayPal are banned. Telegram Stars are not part of the stack.

---

## 0. Verdict on the hypothesis

About 80 percent right. The skeleton is correct: Telegram as storefront, Mini App as viewer, backend as gatekeeper, HLS with short-lived tokens, logging, session caps. Four things are overstated or missing:

1. A client-side watermark overlay does not survive "ripping". If the raw HLS stream can be fetched with a valid session (ffmpeg, yt-dlp, devtools), the clean video comes out with no watermark. The overlay only catches screen recordings. The fix is segment-level watermarking, which is a later upgrade, so the packager must be designed to allow it.
2. HLS alone protects nothing. The protection is the tokenized, session-bound, revocable delivery around it.
3. DRM as a "later upgrade" is unproven inside Telegram. Mini Apps run in the platform WebView. Widevine and FairPlay support there is inconsistent [A]. Test on real devices before promising it.
4. The entitlement source is missing from the hypothesis. MyMembers.io already owns billing and vault membership. The cleanest MVP uses vault channel membership as the entitlement (section 3).

---

## 1. Core goal

- Purpose: deliver premium video to paying vault members through a controlled player instead of a downloadable file, and keep enough evidence to investigate a leak.
- Users: vault members (viewers), Bella (admin), nobody else.
- Experience: member taps a Watch button under a post in the vault, the Mini App opens, plays the video, no login screen. Non-members see a polite "join the vault" message.
- Success: (a) no downloadable file is ever handed out, (b) revoked members lose playback within about a minute, (c) given a leaked clip with a visible watermark, you can name the account and show its session history in under five minutes.
- Non-goal: making copying impossible. It is not achievable. The system raises effort, deters casual leaks, and creates attribution leads.

## 2. Threat model (only what changes the architecture)

| Threat | Material? | Response |
|---|---|---|
| Forwarded or copied link | Yes, certain | Link is only routing. Access is decided by the authenticated Telegram account. |
| Reused or shared session token | Yes | Session-bound tokens, short TTL, IP and user-agent drift flag, instant kill. |
| Account sharing (many people, one subscription) | Yes | Concurrent session cap, flags on multi-IP use. Attribution is to an account, not a person. |
| Direct file access or guessable URLs | Yes | Originals never web-addressable. Only tokenized HLS segments are served. |
| Ripping stream with a valid session (ffmpeg, devtools) | Yes | Cannot be prevented. Detect by download speed faster than realtime and non-browser user agents. |
| Automated bulk download | Yes | Rate limits, per-session segment budget, speed flag. |
| Screen recording or screenshots | Yes, unpreventable | Visible moving watermark plus logs. No documented Telegram API blocks screen capture inside a Mini App [A: not found in docs reached]. |
| Multiple devices | Moderate | Concurrent session cap. No device ID is provided by Telegram. Optional soft device token via DeviceStorage or SecureStorage (Bot API 9.0+) [D]. |
| Insider or creator-side leaks (editors, other platforms) | Out of scope | Cannot be caught by this system. |

Not worth designing for now: nation-state-level attackers, hardware capture cards, jailbroken-device tooling.

## 3. Identity and access

Telegram identity [D]:
- The Mini App sends `Telegram.WebApp.initData` to the backend.
- Backend recomputes `secret_key = HMAC_SHA256(bot_token, key "WebAppData")`, builds the data-check-string (all fields except `hash`, sorted alphabetically, `key=value`, joined by line feeds), and compares `hex(HMAC_SHA256(data_check_string, secret_key))` to `hash`.
- `auth_date` is the Unix time the data was received. Docs say to check it to reject stale data. They give no fixed window. [R] Reject older than 1 hour, then exchange for our own session.
- `initDataUnsafe` is unsigned and must never be trusted. [D]
- Third parties can validate without the bot token using the Ed25519 `signature` plus `bot_id`. [D] Not needed for MVP.
- initData is empty when the Mini App is launched from a keyboard button or from inline mode. [D] Use direct links, inline URL buttons, the main Mini App or the menu button.

Deep links and start parameters [D]:
- Format `https://t.me/<bot>/<app>?startapp=<value>`. Value arrives as `start_param` inside the signed initData and as `tgWebAppStartParam`.
- Allowed characters A-Z a-z 0-9 _ -. Docs list a longer maximum than the old 64 (search summary says 512, verify). [R] Design for 64 or less.
- The start parameter is not a secret and not a credential. It is routing only (an opaque item slug).

Links [R]:
- No per-user unique links in MVP. Identity comes from signed initData, so a unique link adds nothing. One link per item, reusable, never signed, never expiring.
- A forwarded link opened by a non-member produces a "denied" event. That log line is a useful leak signal (see section 5).

Entitlements [R, with A]:
- MVP entitlement = current membership of the item's vault channel, checked by our bot with `getChatMember` (bot must be an admin of each vault channel, alongside the MyMembers.io bot) [A: confirm behavior for channel members]. This needs zero integration with MyMembers.io or CCBill.
- Each item has a `vault_id`. A member only sees items for vaults they are in. Vault separation is enforced by data, not by UI.
- An admin override table allows manual grants and permanent blocks.
- Revocation: request `chat_member` updates, which must be listed explicitly in `allowed_updates` [D]. On leave or kick, kill all that user's sessions immediately. Also re-check membership on each token refresh as a backstop.
- [A] MyMembers.io removes expired subscribers from the vault channel automatically. Confirm this, because the whole entitlement model rests on it.

## 4. Content delivery

- Originals ("masters") live in private storage with no web route. Never in the web root.
- One-time packaging per upload: master to HLS (several renditions optional) with AES-128 encryption, key stored server-side per item. Masters are kept so repackaging is always possible.
- The Mini App never receives a file URL. It receives a short-lived playlist URL for its session.
- Token design [R]: token = signed value bound to session ID and item, validated on every playlist, key, and segment request. Server checks the session is still active (cheap lookup). Revocation = mark session dead, effective on the next request. Token TTL 10 minutes sliding, absolute session cap 6 hours.
- AES-128 key is served only through an authenticated endpoint and also counts as the "play started" audit event. This is obfuscation, not DRM. It stops casual reuse of leaked segment URLs.
- Telegram protected-content settings cover messages [D]: `protect_content` on send methods, channel `noforwards`. They are requirements placed on Telegram clients ("forwards, downloads, copying, and screenshots must be disabled"), not server-side enforcement. They do not govern Mini App web content. Use them for teaser posts and bot messages only.
- Playback compatibility is untested [A]: native HLS on iOS, hls.js (MSE) elsewhere, Telegram desktop WebView. This is the first thing to test.

## 5. Leak and access evidence

Minimum audit trail, one append-only events table:

| Field | Notes |
|---|---|
| ts | server time |
| telegram_user_id | from validated initData, the only trusted identifier |
| username snapshot | for readability, can change |
| session_id | our own, links all events |
| item_id, vault_id | what was accessed |
| event | auth_ok, auth_fail(reason), denied, play_start (key fetch), heartbeat (every 30s with position), segment_stats, session_end, session_killed, token_anomaly |
| ip, user_agent | from the server request, not the client |
| client_hint | platform and version from the Mini App, treated as unsigned |

Suspicious patterns worth flagging:
- more than N concurrent sessions per account
- IP or ASN jumps mid-session
- segments pulled faster than realtime (ripping signature)
- non-browser user agents (ffmpeg, curl, python)
- segment requests with no heartbeats
- many distinct accounts denied on the same item slug (link being circulated)
- many items opened in a short window

What the evidence can support:
- A leaked clip showing the watermark code points to a specific account, with its sessions, IPs and timestamps at the time of viewing. That is a strong investigative lead.

What it cannot support:
- Which human was behind the account. Shared logins, stolen accounts, VPNs and a cropped watermark all break the chain.
- Leaks that never touched the Mini App.
- Any proof beyond "this account had this item playing at this time". Treat flags as leads. Do not auto-ban on a single signal.

Privacy: logging user IDs and IPs should be disclosed in your terms. Set a retention period (suggest 180 days for events, longer for flagged cases).

## 6. Admin and creator side

MVP uses bot commands in a private admin chat (admin Telegram IDs allowlisted). No admin UI.

- `/who <code>` resolves a watermark code from a leaked clip to account, sessions, IPs. This is the highest-value command.
- `/user <id|@name>` shows entitlements, sessions, recent events.
- `/kill <user>` ends all sessions. `/block` and `/unblock`.
- `/flags` lists recent suspicious-pattern hits.
- `/stats` shows plays per item and per vault.
- Content ingest is a command-line packaging script on the server (master in, HLS out, row registered). No upload UI in MVP.

Later: web admin, link management, analytics dashboards.

## 7. Failure and edge cases

| Case | Behavior |
|---|---|
| Invalid or tampered initData | 401, log auth_fail, no session |
| Stale auth_date | Ask the Mini App to relaunch |
| Not in vault channel | Friendly "join" screen, log denied with slug |
| Revoked mid-playback | Next segment request fails, player shows a neutral ended message |
| Shared link | Works as routing only, entitlement decides |
| Duplicate sessions | Cap at 2, oldest killed first with a notice |
| Device change | New session, count against cap |
| Telegram API down | Cached entitlement honored for a short grace window (suggest 10 minutes), then fail closed |
| Backend down | Static shell loads, clear retry message |
| Content missing or partial upload | Item stays unpublished until packaging verifies all segments and key |
| Private URL exposed | Tokens expire fast, masters never routable, key endpoint authenticated |
| Abuse | Rate limits per user and per IP, segment budget per session |
| Bot token leak | Single point of failure. Store as secret, rotate via BotFather, all initData validation fails until updated |
| Origin hardening | Telegram disallows Mini App methods from origins other than the original Mini App domain, enabled for all Mini Apps July 20, 2026 [D via changelog summary, verify]. Keep the player on the same origin as the Mini App page. |

## 8. Security boundaries

| Layer | Provides | Does not provide |
|---|---|---|
| Telegram | Signed identity (initData), deep links, channel membership, protected-content flags for messages, invite and join controls | Control over Mini App content, screenshot blocking inside the Mini App, device IDs |
| Mini App | Player, visible watermark, heartbeats | Any trustworthy enforcement (client code can be altered) |
| Backend | Auth validation, entitlement, token issue and checks, sessions, revocation, logging, rate limits | Prevention of capture once a valid viewer is playing |
| Hosting and storage | Private masters, TLS, tokenized segment serving, backups, enough IO and bandwidth | Anything if misconfigured, a public bucket defeats the design |
| Cannot be guaranteed | No-copy, no-leak, attribution to a person, DRM-grade protection without a DRM provider |

## 9. Hosting verdict

Verified Hostinger facts [D via Hostinger help pages]:
- Node.js web apps are available on Business Web Hosting and Cloud plans.
- FFmpeg is supported only on VPS, not on shared or Cloud plans.
- Shared plan limits: CPU 100 to 150 percent, memory 768 MB to 1 GB, IO 1 to 3 MB/s, 30 to 50 processes. Hitting limits causes 503 errors.
- Terms prohibit using the service as a storage repository or file dump, and "unlimited" is subject to fair use meant for typical small business sites.
- Adult-oriented sites are allowed if everything is lawful.

Conclusion by function:

| Function | Shared/Business hosting | Needs |
|---|---|---|
| Serve the static Mini App page | Fine | none |
| Auth, entitlement, logging API (Node) | Possible on Business plan | Watch process and memory limits |
| Telegram bot webhook | Possible | HTTPS endpoint with secret token |
| FFmpeg HLS packaging | No | VPS or an external service |
| Streaming video to viewers | No (IO limit, fair use, repository rule) | VPS bandwidth, object storage plus CDN, or a video platform |
| Invisible forensic watermarking | No | VPS or processing service |
| DRM | No | Paid DRM provider, plus WebView compatibility proof |

[R] Recommended path: one Hostinger VPS running Nginx, the Node backend, a small database and ffmpeg. One bill, you already host with them, and everything in this design runs on it. Keep video URL generation behind one function so segment hosting can move to object storage plus CDN later without touching auth.

Alternative: keep the Mini App on Business hosting and put video on an external video platform with token auth. Less server work, but adds a vendor. Before picking any video vendor, check its acceptable use policy for adult content. That is the real gate, not the feature list.

## 10. MVP vs later

REQUIRED FOR MVP
- Validated initData auth and our own sessions
- Vault-channel entitlement via getChatMember, per-vault scoping
- Private masters, one-time HLS packaging with AES-128, keyed per item
- Session-bound tokens, server-side revocation, concurrent session cap
- Player in the Mini App with moving visible watermark (account code), heartbeat
- Events table and the flags above
- Admin bot commands, especially `/who`, `/kill`, `/block`
- chat_member webhook for fast revocation
- Replaceable storage and URL-signing layer
- Real-device playback test on iOS, Android, desktop before building more

WORTH CONSIDERING
- Segment-level A/B forensic watermarking (survives cropping and ripping, 2x storage)
- Soft device binding via DeviceStorage or SecureStorage
- Teaser posts with `protect_content` and join-request gating
- Basic analytics page
- Leak-response workflow (see section 12)

FUTURE
- Widevine and FairPlay DRM (only after a WebView compatibility test)
- Web admin UI and upload UI
- CDN or object storage migration
- Per-vault separate bots
- Automated takedown tooling

## 11. Build plan

M0. Spike (throwaway, about one session). Static page plus a test HLS clip opened from a direct link on iPhone, Android, desktop. Verifies: HLS playback in Telegram WebView, initData reaches the page, fullscreen. Untested after: everything server-side. Gate for the rest.

M1. Auth and entitlement. Depends on M0 and server with HTTPS. Builds initData validation, session issue, getChatMember check, deny paths. Verified by forged, stale, and valid fixtures plus a real launch. Untested: MyMembers.io removing members on expiry.

M2. Packaging and protected delivery. Depends on M1. Builds ffmpeg HLS plus AES pipeline, tokenized serving, revocation. Verified with curl (no token, expired token, killed session all rejected) and a deliberate rip with a valid token to measure the residual risk. Untested: large-audience load.

M3. Player, watermark, heartbeat. Depends on M2. Verified on real devices by recording the screen and reading the watermark. Untested: all device models.

M4. Evidence and admin. Depends on M3. Builds events, flags, bot commands. Verified by a leak drill: record a clip, run `/who`, confirm the right account and session. Untested: real-world false positive rate.

M5. Channel integration and launch. Depends on M4. Post templates with Watch buttons, chat_member revocation, block flow. Verified by kicking a test member and confirming playback stops within a minute, and by a non-member opening a forwarded link. Untested: unusual Telegram clients.

## 12. Open decisions

1. Hosting. Which Hostinger plan do you have now (Business or VPS)? How many GB of video and how many simultaneous viewers do you expect? This decides VPS size. Recommendation: VPS.
2. Entitlement source. Confirm MyMembers.io automatically removes expired members from the vault channels, and that you can add our bot as an admin to all three. If not, we need their API.
3. Risk acceptance. Are you comfortable with a deterrence-and-trace model (screen recording remains possible) for launch? If not, DRM becomes a gating item and the timeline changes.

Everything else is resolved by the recommendations above.

## Creative review: leak discovery and response loop

Label: Worth considering. Not added to the build.

Evidence is worthless if you never find the leak. Most leaks surface on leak sites and Telegram reposting channels days or weeks later. A light routine matters more than extra code: a recognizable watermark string that makes clips searchable, a weekly check of the usual leak spots, and a saved takedown template in Notion. Cheap, no build, and it turns the audit trail into outcomes.

## Corrections to earlier advice in this session

- Stars and paid media are dropped. Payments stay on CCBill through your existing stack.
- Fan-facing bot copy must not use the word "free". Use "preview" or "sample".
- The overlay watermark is a deterrent against screen recording only, not against ripping.
