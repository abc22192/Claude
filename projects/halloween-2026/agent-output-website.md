# Agent 2: Website Architect — Blast or Treat Dual-Payment Site Plan
_Created: 2026-10-19_
_Status: PLAN ONLY_

---

## 1. Page Structure — Two Doors, One Room

The metaphor: a dark hallway with two doors. One door says "OnlyFans." The other says "Enter." Both open into the same room — the Blast or Treat board. The room looks the same from either door. But the payment counter in the room changes based on which door you walked through.

### OF-Clean Side (the "OnlyFans Door")

**What the fan sees, top to bottom, on one screen (no scroll):**

```
┌─────────────────────────────────┐
│  🎃  BLAST OR TREAT             │  ← Cinzel, rose gold on black
│  Halloween Night. One Hour.     │
│  Six Windows. One Question:     │
│  When does Bella blast?         │
│                                 │
│  ┌───┬───┬───┬───┬───┬───┐     │
│  │ A │ B │ C │ D │ E │ F │     │  ← The board. Six squares.
│  │ ✓ │ ? │ ? │ ✓ │ ? │ ? │     │     ✓ = claimed, ? = open
│  └───┴───┴───┴───┴───┴───┘     │
│                                 │
│  YOUR PRICE: $15 / square       │  ← Single price, no comparison
│  (VIP subscribers: $10)         │
│                                 │
│  TAP A SQUARE TO CLAIM          │  ← Opens reservation flow
│                                 │
│  Oct 31 · Time TBD              │
│  Everyone who pays gets the     │
│  recording.                     │
└─────────────────────────────────┘
```

**What is NOT on this page:**
- No Cash App, YouPay, or Amazon links
- No mention of Telegram
- No external payment instructions
- No links to any non-OF platform

**Payment flow on this page:**
- Fan taps an open square
- Gets a reservation code (e.g., "TREAT-B-7X4")
- Instructions: "DM me this code on OnlyFans with your $15 tip" (or "send $10 if you're VIP")
- Square goes to "Pending" status
- Bella verifies the tip in her OF inbox, confirms, square goes "Claimed"

### Open Side (the "Enter" Door)

**What the fan sees, top to bottom, on one screen (no scroll):**

```
┌─────────────────────────────────┐
│  🎃  BLAST OR TREAT             │  ← Same header, same vibe
│  Halloween Night. One Hour.     │
│  Six Windows. One Question:     │
│  When does Bella blast?         │
│                                 │
│  ┌───┬───┬───┬───┬───┬───┐     │
│  │ A │ B │ C │ D │ E │ F │     │  ← Same board, synced
│  │ ✓ │ ? │ ? │ ✓ │ ? │ ? │     │
│  └───┴───┴───┴───┴───┴───┘     │
│                                 │
│  $10 / square                   │
│                                 │
│  TAP A SQUARE TO CLAIM          │
│                                 │
│  ┌─────────────────────┐        │
│  │  💵 Cash App         │        │  ← Payment options
│  │  🎁 YouPay           │        │     (revealed after
│  │  📦 Amazon Gift Card │        │      tapping a square)
│  └─────────────────────┘        │
│                                 │
│  Oct 31 · Time TBD              │
│  Everyone who pays gets the     │
│  recording.                     │
└─────────────────────────────────┘
```

**Payment flow on this page:**
- Fan taps an open square
- Gets a reservation code (e.g., "TREAT-D-2K9")
- Chooses payment method:
  - **Cash App:** Send $10 to $blastwithbella. Note: your code + platform name (or just ".")
  - **YouPay:** Tap to open YouPay page. Include your code in the note.
  - **Amazon:** Send a $10 gift card to bootyfulfarts@gmail.com. Subject: your code.
- Square goes to "Pending"
- Bella verifies manually, confirms, square goes "Claimed"

---

## 2. URL Strategy

**Recommendation:** Use `enter.bellablasts.com` — it already exists as an entry-point subdomain and fits the theater metaphor perfectly (you're "entering" the event).

| Page | URL | Who gets this link |
|---|---|---|
| OF-Clean Side | `enter.bellablasts.com/halloween` | OnlyFans free page, VIP page |
| Open Side | `enter.bellablasts.com/treat` | Telegram, Twitter, IG, direct, everywhere else |
| Admin (Bella only) | `enter.bellablasts.com/admin` | Bella's private dashboard to verify/confirm |

**Why not bellablasts.com?** It currently points to Beacons and the permanent home decision is still open. Using `enter.bellablasts.com` avoids touching that.

**Why not a path parameter like `?side=of`?** Fans share links. If an OF fan shares the open-side link on OnlyFans, it could create a terms issue. Separate paths with no cross-linking are cleaner.

**Redirect safety:** `enter.bellablasts.com/halloween` never links to `/treat` and vice versa. No "also available on Telegram" callouts. Each page is self-contained.

---

## 3. Shared Board Sync

Both pages read from the same data. The simplest approach that works for this scale (6 squares, 1 event, 1 admin):

**Option A — JSON file on server (recommended for speed + simplicity):**
- A single `board.json` file on Hostinger stores the state of all 6 squares
- Both pages fetch it on load and every 30 seconds (polling)
- Only the admin page can write to it (Bella updates status after verifying payment)
- No database needed. No backend framework. Just a PHP endpoint that reads/writes one JSON file.

```json
{
  "squares": {
    "A": {"status": "claimed", "alias": "Agent Fox", "platform": "of"},
    "B": {"status": "available"},
    "C": {"status": "pending", "alias": null, "reserved_at": "2026-10-29T14:00:00Z", "code": "TREAT-C-8M2"},
    "D": {"status": "claimed", "alias": "Midnight", "platform": "telegram"},
    "E": {"status": "available"},
    "F": {"status": "available"}
  },
  "updated_at": "2026-10-29T15:32:00Z"
}
```

Public pages only see: square letter + status (available / pending / claimed) + alias (if claimed). They never see codes, platforms, or buyer details.

**Option B — AppDeploy with a small backend:**
- More robust but more setup time
- Would give real-time updates instead of polling
- Overkill for 6 squares and 12 days to build

**Recommendation:** Option A. A JSON file + PHP endpoint on Hostinger. Fast to build, zero cost, she already has Hostinger.

---

## 4. Reservation + Verification Flow

### Step by step (same for both sides, payment method differs):

```
Fan taps open square
       ↓
Page generates reservation code (random: TREAT-[square]-[3 chars])
       ↓
Code + payment instructions appear on screen
       ↓
Fan pays using the method shown on their page
       ↓
Square status → "Pending" (visible to everyone)
       ↓
3-hour hold starts (from Notion plan — fan has 3 hours to pay)
       ↓
Bella checks her admin page
       ↓
Admin shows: code, payment method, amount expected, timestamp
       ↓
Bella verifies actual payment received (OF inbox / Cash App / email)
       ↓
Bella taps "Confirm" → square goes "Claimed" with alias
       ↓
OR: 3 hours pass, no payment → square auto-returns to "Available"
       ↓
Exception: fan reports they paid but Bella hasn't checked yet →
square stays "Pending" until she reviews (up to 12 hours per Notion plan)
```

### Per payment method:

| Method | What fan does | What Bella checks |
|---|---|---|
| **OnlyFans tip** | DMs code + sends tip on OF | OF inbox — tip amount + DM with code |
| **Cash App** | Sends $ to $blastwithbella with code in note | Cash App notifications — amount + note |
| **YouPay** | Opens YouPay link, includes code | YouPay dashboard — payment + note |
| **Amazon gift card** | Emails gift card to bootyfulfarts@gmail.com, code in subject | Email — gift card amount + subject line |

### The admin page (Bella's private view):

```
┌─────────────────────────────────────────┐
│  BLAST OR TREAT — ADMIN                 │
│                                         │
│  A: CLAIMED ✓  Agent Fox (OF, $15)      │
│  B: PENDING ⏳  Code: TREAT-B-7X4       │
│     Reserved: 2:14pm · Expires: 5:14pm  │
│     Method: Cash App · Expected: $10    │
│     [ CONFIRM ]  [ RELEASE ]            │
│  C: AVAILABLE                           │
│  D: CLAIMED ✓  Midnight (TG, $10)       │
│  E: AVAILABLE                           │
│  F: PENDING ⏳  Code: TREAT-F-1P8       │
│     Reserved: 3:01pm · Expires: 6:01pm  │
│     Method: Amazon GC · Expected: $10   │
│     [ CONFIRM ]  [ RELEASE ]            │
│                                         │
│  Password-protected. Only Bella.        │
└─────────────────────────────────────────┘
```

---

## 5. Mobile-First, No-Scroll Layout

**The constraint:** Everything on one screen on a phone. No scrolling.

**How it fits:**

- Header: 3 lines of text (event name + tagline + the question). ~80px.
- Board: 6 squares in a single row. Each square is a tappable circle or card, ~50px wide. ~70px total with labels.
- Price: 1 line. ~30px.
- CTA button: "Tap a square to claim." ~50px.
- Date + recording note: 2 small lines. ~40px.
- Total content height: ~270px. iPhone SE viewport is 568px. Fits with room to breathe.

**After tapping a square** (the reservation overlay):
- A panel slides up from the bottom (like a drawer) covering the lower half
- Shows the code, payment instructions, and a "Got it" dismiss button
- The board stays visible behind it at the top
- On the OF-clean side: just the OF payment instructions
- On the open side: the three payment method buttons

**The theater feel:**
- Background: pure black (#000)
- Text: rose gold (#C8A08C) and warm off-white
- The squares glow faintly when available, dim when claimed
- Subtle pumpkin or candle flicker animation on the header (CSS only, no JS library)
- Font: Cinzel for "BLAST OR TREAT", Tenor Sans for everything else
- No borders, no cards, no boxes — just light floating in darkness

---

## 6. How Fans From Each Platform Find the Right Page

| Platform | What Bella posts | Link | Notes |
|---|---|---|---|
| **OF Free Page** | Pinned post with event info | `enter.bellablasts.com/halloween` | OF-clean side. $15 price shown. |
| **OF VIP Page** | Pinned post, VIP framing | `enter.bellablasts.com/halloween` | Same page, shows $10 for VIP. (VIP detection: honor system — she knows who her VIPs are.) |
| **Telegram VISL/VIFL** | Vault message | `enter.bellablasts.com/treat` | Open side. $10 price. |
| **Twitter/X** | Public tweet + pinned | `enter.bellablasts.com/treat` | Open side. |
| **Instagram** | Story / post (safe content) | `enter.bellablasts.com/treat` | Open side. Link in bio or story link. |
| **Direct / returning fans** | DM or Telegram message | `enter.bellablasts.com/treat` | Open side. |
| **PodGAS audience** | Podcast mention / Telegram | `enter.bellablasts.com/treat` | Open side. Cross-promo. |

**VIP detection on the OF-clean page:** The page shows both prices: "$15 per square ($10 for VIP subscribers)." Bella verifies VIP status when she checks the payment. If someone claims VIP and isn't, she messages them. This is manual and that's fine for 6 squares.

---

## 7. What Happens If an OF Fan Tries to Pay Outside OF

The OF-clean page (`/halloween`) literally does not show any other payment method. There's nothing to click, no mention of Cash App or YouPay, no "other options" link. The only instruction is "DM me this code on OnlyFans with your tip."

If a fan messages Bella directly asking if they can pay another way:
- That's Bella's judgment call, not the page's job
- She can manually give them the `/treat` link in DMs if she wants
- The page itself never makes that offer

---

## 8. Tech Stack Recommendation

**Recommended: Static HTML/CSS/JS + one PHP endpoint, hosted on Hostinger.**

Why:
- She already has Hostinger
- `enter.bellablasts.com` likely already points there (or can be pointed with a DNS record)
- 3 HTML files (OF page, open page, admin page) + 1 PHP file (board API) + 1 JSON file (board state)
- No framework, no database, no npm, no build step
- Total build: ~5 files
- Deployable in a day if the design is approved

**Why not AppDeploy:**
- AppDeploy is great for apps but this is a 3-page site with one shared JSON file
- Adding AppDeploy adds a deployment pipeline she has to learn for a 12-day event
- Hostinger is already paid for and she's familiar with it

**Why not a full backend (Node, Python, etc.):**
- Overkill. 6 squares. 1 admin. 1 JSON file. PHP reads and writes it.
- If she ever needs this for a bigger event, upgrade then

**File structure on Hostinger:**

```
enter.bellablasts.com/
├── halloween/
│   └── index.html          ← OF-clean page
├── treat/
│   └── index.html          ← Open page
├── admin/
│   └── index.html          ← Bella's admin (password-protected)
├── api/
│   └── board.php           ← Read/write board state
├── data/
│   └── board.json          ← Current board state
└── assets/
    └── style.css           ← Shared styles (black + rose gold)
```

**Security:**
- Admin page: password-protected via `.htaccess` or a simple password gate in the page itself
- Board API: GET is public (read board state), POST requires a secret token (only the admin page has it)
- No fan data stored beyond alias + square + status
- Reservation codes are random, not sequential, not guessable
- HTTPS on everything (Hostinger provides free SSL)

---

## 9. Timeline — Can This Be Built Before Oct 31?

**Yes. Comfortably, if we start this week.**

| Day | What gets done |
|---|---|
| **Day 1** (after approval) | Set up `enter.bellablasts.com` DNS, build the board API (PHP + JSON), deploy skeleton pages |
| **Day 2** | Build both fan-facing pages with full styling (black + rose gold, theater feel, mobile-first) |
| **Day 3** | Build admin page, test reservation flow end-to-end, password-protect admin |
| **Day 4** | Bella tests it. Adjustments. Polish. |
| **Buffer** | 7+ days before Oct 31 for promotion, square sales, and fixing anything |

**Critical path items:**
- DNS for `enter.bellablasts.com` — needs to be pointed to Hostinger. If it already is, instant. If not, 24-48 hours for propagation.
- Bella approving the design before build starts
- The board.json API needs to work cleanly on Hostinger's PHP version

**What could slow it down:**
- If `enter.bellablasts.com` doesn't exist as a subdomain yet and she needs to set it up in Hostinger
- If she wants real-time sync instead of 30-second polling (adds WebSocket complexity)
- If the design takes multiple rounds of revision

**Recommendation:** Start the DNS check and page skeleton TODAY if she approves this plan. The build itself is 2-3 days of focused work. That leaves a full week for promotion before Oct 31.

---

## Summary — What Makes This Different From a Template

This isn't a Linktree page or a checkout form. It's a dark room with six glowing squares. You walk in, you see what's taken, you pick your window, you get a code, you pay. The board updates. Everyone watching sees the same thing. The tension builds as squares fill up.

The OF door and the open door are separate entrances to the same room. The room looks the same. The payment counter is different. Nobody needs to know the other door exists.

Theater. Not a storefront.
