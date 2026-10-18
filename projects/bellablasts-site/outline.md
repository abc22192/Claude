# bellablasts.com — The Final Site Outline

_Drafted 2026-10-11. For Bella to approve or redirect. Oct 14 go-live._

---

## The honest situation

You don't have "nothing." You have **23 deployed apps on AppDeploy** and multiple homepages. The reason you keep spinning is nobody's picked ONE and told you "we're done building. We're pointing the domain and shipping."

That's my job today.

---

## My call: ship the **Theater Lobby**

**Homepage:** `bella-blast-theater-homepage-prototype-csf234`
Live preview: https://bella-blast-theater-homepage-prototype-csf234.v2.appdeploy.ai/

Why this one over the Box Office page:
- It's your newest direction (last touched Nov 2026). You've already been iterating toward it.
- It has real structure: marquee → 3 doors → Meet Bella → The Bella Effect → footer. The Box Office page is just a front door with no destinations.
- The Theater Lobby already contains a Box Office MODAL inside it (Pricing · Access · How It Works · Customs · FAQ). So you get both.

If you hate this call, your veto is one word. We flip to Box Office. No drama.

---

## The nav (what shows on the site)

| Spot | Label | Where it goes |
|------|-------|---------------|
| 1 | **Home** | Theater Lobby |
| 2 | **The Bella Blast** | Secret Menu page (`bella-blast-secret-menu-pkb19p`) — the signature $25 / $100 / $150 offering |
| 3 | **Clips & Store** | Direct Store (`bella-direct-store-4qtuj4`) |
| 4 | **The Bella Effect** | Intake (`bella-effect-intake-jxrlkp`) |
| 5 | **Chat / Contact** | Whale Chat (`bella-blast-whale-chat-atx0d0`) |
| hidden | **Inner Circle** | VIP landing (`bella-blast-the-inner-circle-2ys27q`) — linked from inside, not top nav |
| footer | **PodGAS** | Podcast site (`044dc955cf664a34a5`) |
| hidden | **Booking** | Coaching booking page (`bella-blast-booking-9iz5zt`) — only promoted when you're taking coaching |

Everything else stays alive but isn't in the main nav. Private tools (Little Black Book CRM, Telegram receptionist, Link redirect manager, Bella Effect Feed) are internal and never shown.

---

## What gets killed (so the site is CLEAN)

These are duplicates or old. They stay archived on AppDeploy but aren't linked from anywhere public:

- `bellablasts-homepage-34e4sr` — Box Office front door (replaced by Theater Lobby)
- `bella-blast-wo1vre` — Old cinematic single-creator site (older concept)
- `649256abffcc48d880` — Old BellaBlasts.com Experience site
- `4928b0699ffb42bb80` — Old 3D custom content landing
- `cea53623c9934acdbe` — Old journal-aesthetic custom orders page
- `1519bd3b7b614dd8a6` — May/June birthday landing (dated)
- `fart-squares-nlcf8i` — June 10 birthday stream (dated)
- `receipt-check-auwqx7` — Older public intake (superseded by Bella Effect Intake)
- `bella-hq-crm-vcoq9b` — Older CRM (superseded by Little Black Book)
- `1b8d80b620b540f98f` — Older Telegram receptionist (if LBB handles ingestion now)
- `podgas-application-yudjoa` — Keep IF podcast is reviving; otherwise park

Nothing gets deleted today. Just unlinked. Zero risk.

---

## 3 steps to Oct 14 go-live

1. **You confirm the domain name.** `bellablast.com` (singular) or `bellablasts.com` (plural)? Your context files say singular. Your AppDeploy pages and the message you just sent me say plural. Which did you actually register? I need the answer before step 2.

2. **I point the domain at the Theater Lobby.** Done via AppDeploy's `configure_custom_domain`. You get DNS instructions and set them on your registrar. ~30 min of your time once you have the DNS panel open.

3. **I wire the nav links** on the Theater Lobby to the 5 destinations above. This is a single update to the homepage. You preview, approve, done.

That's it. No new builds. No new designs. No new decisions after you answer step 1.

---

## What I need from you right now

One thing: **singular or plural domain.** Then I take it from there.
