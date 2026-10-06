---
name: fill-with-flags
description: Bella's operating mode for all content work. When writing articles, posts, captions, docs, scripts, or any content for her and you don't have her exact personal input for a part — DO NOT STALL. Fill the gap with your best guess from everything you know about her, and visually mark the fill in a color that stands out (blue in Notion, [!NOTE] callout in GitHub, [AI-FILL] prefix elsewhere). She reviews on scan with her ADHD brain, not on request. This is permanent permission she granted during the Foundation Session on 2026-10-06.
---

# Fill with Flags — Bella's Content Operating Mode

**She gave this permission on 2026-10-06 in the Foundation Session. It is permanent until she revokes it.**

> *"I want to have it permission so it doesn't stall and go, oh, I'm waiting for you, babe. I'm waiting for you, babe. Give me this, babe. I need to be factual, babe. No, keep going. Fill in spots. Highlight it so that I can go back and proofread it."*

---

## The rule

When writing an article, caption, post, doc, essay, slide copy, email, or any content for Bella, and you don't have her specific personal input for a part that needs it:

1. **DO NOT STALL.** Do not stop and ask her unless the gap is listed in "When NOT to fill" below.
2. **FILL IT** with your best guess using everything you know about her (`context/me.md`, `memory/MEMORY.md`, the Foundation Session doc, her Notion catalog, prior sessions, her voice).
3. **MARK the fill visually** so she can spot it on a casual re-read, not by scanning a separate checklist.

She reviews, replaces, keeps, or edits async. Nothing blocks on her response.

---

## How to mark the fill — by destination platform

### In GitHub markdown (repo files, PRs, memory docs)

Use a GitHub Alert blockquote. `[!NOTE]` renders as a blue-tinted callout box with a blue info icon — the color she asked for.

```markdown
> [!NOTE]
> **[AI-FILL — verify or replace]** The sleepover was at Jessica's house in third grade.
```

For a single inline word or short phrase, use bold + `[AI-FILL]` prefix inside a blockquote:

```markdown
> **[AI-FILL]** third grade
```

### In Notion

Use a blue callout block (Notion native syntax, renders as a blue-background box):

```
<callout icon="🔵" color="blue_bg">
**[AI-FILL — verify or replace]** The sleepover was at Jessica's house in third grade.
</callout>
```

For inline fills inside a longer paragraph, wrap in blue-colored text if the editor supports it, and always prefix with `[AI-FILL]` so the marker is explicit even when color doesn't render.

### In chat (talking to her directly here)

Mark fills with 🔵 at the start of the line and `[AI-FILL]` label:

```
🔵 **[AI-FILL]** third grade — I guessed based on the "age 9" detail. Replace if wrong.
```

### In delivered copy for Canva, slides, email, posts

Mark fills inline with `[AI-FILL — replace]` so whoever is pasting it in sees the marker. If the destination supports color, use blue.

---

## When NOT to fill — ask her instead

These are the ONLY exceptions. Everything else gets filled with a flag.

1. **A medical diagnosis.** (See the open lipedema vs lymphoma question. Never guess which condition she has.)
2. **A legal or financial fact** — a dollar amount in pricing, a date on a contract, a name of a vendor.
3. **An identifying detail of a real person** she hasn't named — an ex's actual name, a client's handle, a family member's current situation.
4. **Vault items** — any specifics from the childhood sexualization context. She chose to keep these private. Never fabricate detail here.
5. **A claim she'd be publicly held to** — a stat, a quote attributed to her, a case study outcome, a testimonial from a real client.

For all of these: ASK her, don't fill. Everything else: FILL and FLAG.

---

## Example — the right behavior

**Bad (stalls):**
> I need the name of the specific grade you were in when you got suspended for the farting game. Please tell me so I can finish Post 1 of the Ass Chronicles.

**Good (fills + flags):**
> Here's the full ass series Post 1 ready for Canva. Slide 1 has a filled grade — verify or replace.
>
> **Slide 1:**
> > [!NOTE]
> > **[AI-FILL]** fifth grade
>
> "I got suspended from school in **[fifth grade]** for farts."

---

## Why this works for her

- ADHD cannot track a running list of "waiting on your input" items. The list gets lost.
- A colored marker inside the text catches her eye naturally when she reads.
- Content ships. Nothing blocks on her response.
- She reviews and corrects async at her own pace.
- The marker is both VISUAL (color) and TEXTUAL (`[AI-FILL]` prefix) so it survives platform differences in color rendering.

---

## Related

- Permanent record of her permission: `memory/sessions/2026-10-06-foundation-session.md`
- Her content thesis: *"It's like a fart. It's so intimate and so secret and so private but I'm sharing it with you."*
- The Notion mirror of this skill: see Foundation Session page under 🏠 Bella Blast HQ.
