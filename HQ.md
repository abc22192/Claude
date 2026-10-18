# Bella Blast HQ
_Our working brain. Claude updates this at every session end. Check it anytime at github.com/abc22192/Claude._

**Last updated:** 2026-10-18

---

## 🔥 FIRES — deal with these first

_No active fires right now._

| # | Task | Status | Resolved |
|---|------|--------|----------|
| ~~1~~ | ~~2024 Taxes~~ | MAILED IN | Oct 18, 2026. Owes $2,025 — NOT YET PAID |
| ~~2~~ | ~~Website migration~~ | DOMAIN SAFE | bellablast.com points to Beacons. Permanent home TBD |

---

## 📋 ACTIVE TASK BOARD

| Task | Status | Notes |
|------|--------|-------|
| Fan automation + funnel | PLANNING | Stop manually screening fans; build self-serve buy flow |
| Email system | NOT STARTED | List build + welcome sequence |
| Telegram welcome sequences | NOT STARTED | Fans going cold after joining |
| Podcast revival (PodGasFarts) | BLOCKED | 8 episodes ready to record, zero ever recorded |
| Consistent posting (OF + Scrapbook) | IN PROGRESS | Target: never go dark more than 2 days |
| Bella Effect intake form | SHIPPED (not shared) | Private — she needs to flip share toggle to "Anyone with the link" |
| Match Game rebuild | QUEUED | After intake. MASH-style, $3 deposit → unlocks |
| Bella Blast menu HTML rebuild | IN PROGRESS | v1 exists, needs full rebuild |
| Substy platform | PLAN PHASE | $9 wallet, OF connected, Telegram connected |
| Prompt Directory App | RESEARCH DONE | Architecture built, awaiting go-ahead to build |

---

## 🎯 90-DAY GOALS

1. Fan automation + funnel — fans buy without her constantly being there
2. Email system — list + welcome + nurture
3. Telegram membership system — warm welcome, engagement flow
4. Podcast revival — trust-builder and brand pivot anchor
5. Consistent posting — OF + Scrapbook, never 2+ days dark
6. Outsource 1-2 tasks — social posting is top candidate

---

## 📁 ACTIVE PROJECTS

### PodGasFarts YouTube Strategy
- **Full game plan:** `projects/podgasfarts/youtube-game-plan.md`
- **Key insight:** 41% of all views came from 2 relationship-advice-framed videos — the growth formula she's been ignoring
- **Blocking issue:** Two channels splitting the audience (PodGasFarts vs. Bella Blast Fart Zone, 870K views)
- **This week:** Record 1 episode. Use the Hype ask script. Post the 2 viral-formula style videos.
- **Hype script:** In scratchpad — ready to record

### Bella Blast Menu
- v1 artifact: https://claude.ai/artifact/5Mr9CjbkwPiQDBiUgef1iS
- Full brief in `projects/bella-blast/brief.md`
- DO NOT rebuild without answering 5 planning questions (in brief)

### Bella Effect Intake
- Artifact: https://claude.ai/artifact/WcWzVNZ88awUHWNNxab1Lh
- Still private — needs share toggle flipped
- Purpose: Admin intake for paying custom-session fans, NOT a public funnel

### Match Game
- MASH-style elimination, fans build a fantasy date with Bella
- Funnel: $3 deposit → game → upsell Telegram → extra for Google Voice
- Queued after Bella Effect intake is public

---

## 🧠 QUICK REFERENCE

| Thing | Status/Info |
|-------|-------------|
| Domain | bellablast.com → Beacons (safe) |
| AI brain | Grok (Gemini in old Notion page is stale — ignore it) |
| Substy | Connected: OF (Bella Blast), Telegram. chatInboxEnabled=false on OF. |
| Platforms | OnlyFans, Scrapbook, Telegram, Podcast (PodGasFarts) |
| Second YouTube channel | Bella Blast Fart Zone — 870K views, splitting audience. Strategic decision needed. |
| Active client | England: 3 days at $250 + meals |
| Formatting rules | No em dashes. No semicolons. BBW not "fat." Never mention Fansly. Client messages: plain blockquote (>), NEVER code blocks. |

---

## 📝 RECENT SESSION LOG

### 2026-10-14 — YouTube Strategy + Infrastructure
- Ran 6 parallel agents: Hype research, brand voice, VidIQ channel audit, Notion episode inventory, Hype script, synthesis
- Surfaced the viral formula (relationship framing = 41% of all views) and the podcast block (8 ready topics, zero recorded)
- Built relationship journal system, fixed session-start hook, fixed git detached HEAD
- Added mandatory quality check to CLAUDE.md
- Built this HQ file
- **What I got wrong:** Did not flag taxes and website deadline at session open. Always fires first, always.

### 2026-10-13 — Substy, website pressure, taxes reframe
- Website domain confirmed safe — bellablast.com pointing to Beacons
- Substy platform exploration — connected OF + Telegram
- Taxes: called out printer excuse as false blocker. UPS Store / e-file are the fix.

---

## 🔧 INFRASTRUCTURE STATUS

| System | Status |
|--------|--------|
| GitHub auto-save | WORKING — hooks commit memory/ context/ decisions/ on every write |
| Git branch | working branch: `claude/system-audit-custom-agents-bk1ucg` |
| Session-start hook | ACTIVE — reads MEMORY.md, session_log.md, relationship_journal.md at every session start |
| Quality check | LOCKED IN — mandatory step in CLAUDE.md before any task declared done |
| Relationship journal | ACTIVE — `memory/relationship_journal.md`, written every session end |
| **Custom agents** | LIVE (Oct 18) — `/memory-auditor` `/github-auditor` `/website-organizer` `/session-cleaner` `/claude-code-tutor` |
| **Prompt dictionary** | LIVE (Oct 18) — `docs/prompt-dictionary.md` |
| **Daily morning brief** | ACTIVE — fires 9:47 AM ET every day, push notification to phone |
| **Daily evening wrap** | ACTIVE — fires 8:51 PM ET every day, push notification to phone |

## 🔌 TOKEN AUDIT — Oct 18, 2026

**The problem:** 40+ plugin connectors are failing every session (proxy tunnel errors). They load into your context window even though they do nothing — wasting tokens.

**Specific wastes found:**
- `plugin:brand-voice:box/figma/gong/granola` — all failing (proxy 403)
- `plugin:canva:canva` — failing
- `plugin:data:amplitude/atlassian/bigquery/definite/hex` — all failing
- `plugin:hostinger:*` (5 Hostinger plugins) — executable not found
- `plugin:marketing:ahrefs/similarweb/supermetrics` — all failing
- `plugin:operations:asana/notion/slack` — all failing
- 20+ more failing plugins

**Duplicate connectors (double-loading):**
- Google Drive is connected TWICE (`Google_Drive` + `plugin:small-business:google-drive`)
- Gmail is connected TWICE
- Notion is connected but `plugin:operations:notion` fails separately

**What to do:** Go to `claude.ai` → Settings → Connectors → disconnect plugins you're not actively using. The Hostinger, Box, Figma, Gong, Granola, ahrefs, Amplitude, Asana, and Slack ones are all failing — clean those out. Keep: Notion, Google Drive, Google Calendar, Gmail (pick ONE of each duplicate), Riverside, VidIQ, Substy, Beacons.

**Estimated savings:** Removing 30+ dead connectors reduces the system prompt by ~15-20%, which means more tokens available for actual work each session.
