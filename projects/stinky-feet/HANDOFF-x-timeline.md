# Handoff: mine Bella's X feet timeline

_Written October 2, 2026 for the next Claude session. Bella starts that session after she opens network access to sotwe.com._

## Before anything else

- CLAUDE.md applies. Read `memory/MEMORY.md` and the last entry of `memory/session_log.md` from the branch below, not from main.
- **Branch:** the feet docs live on `ccr-9c63ec63-7ibk0c` (draft PR #8, not merged yet). Fetch it and build your own branch on top of it: `git fetch origin ccr-9c63ec63-7ibk0c` then `git checkout -B <your-branch> origin/ccr-9c63ec63-7ibk0c`.

## The goal

Doc 01, section 7 has X numbers from another AI's June audit, and nobody has checked them against X. Replace them with real numbers from her @bbwbootyfulfeet timeline. That way the voice rules in Card 9 rest on her own top posts.

## Step 1: Check access

- Test `https://www.sotwe.com/bbwbootyfulfeet`, `https://sotwe.com/bbwbootyfulfeet`, `https://xcancel.com/bbwbootyfulfeet`, and `https://x.com/bbwbootyfulfeet` with curl.
- If a host is refused, run `curl -sS "$HTTPS_PROXY/__agentproxy/status"` and read `recentRelayFailures`. Tell Bella the exact host to add under Network access, in one line. Don't try to get around the block.
- If the page loads but has no posts in the HTML, the page is probably rendered by JavaScript. Use Playwright with the pre-installed Chromium (`executablePath: '/opt/pw-browsers/chromium'`) and scroll. Check the proxy status again, because the page may call extra hosts that also need adding.

## Step 2: Pull the data

For every feet post you can reach (aim for the last 90 days, and more is fine):
- date, full text word for word, likes, replies, reposts, views (if shown), media type (photo, video, or text), and the post link.
- Save the raw rows to `projects/stinky-feet/data/x-bbwbootyfulfeet-<date>.csv`.
- Never fill a missing number with a guess. Leave the cell blank.

## Step 3: Analyze

- Rank the top 10 by replies and the top 10 by likes. Pick the bottom 5 by likes, counting only posts older than 3 days.
- Tag each top post with its moves from doc 01, section 3 (1 ordinary moment, 2 point his eyes, 3 put it in his body, 4 catch him, 5 leave it open).
- Count how many top posts end on a question or a choice.
- Count how many top posts open with a one- or two-word beat like "Smooth. Stinky." That answers her pending call in `decisions/log.md`.
- Check the June audit numbers (141, 101, 72, 62, and 41 likes in doc 01, section 7) and say which ones hold.
- Find "Kicked my feet up and called it a night" and confirm its numbers. She said about 9K views, 514 likes, 43 replies, and 128 reposts.
- Log how every numbered "Stinky Feet Report" post did, if any are live.

## Step 4: Write it up

- **Doc 01, section 7:** replace part 1 ("Your top June posts") with the real top-posts table and what the numbers say. Keep part 2 (X's label report) unless new data changes it.
- If the data contradicts a Card 9 rule, say so plainly in section 4. Her rule is that contradicting evidence goes first and never gets buried.
- **Doc 05:** add a dated receipts entry (hosts reached, posts pulled, the date range, and anything missing).
- Update `decisions/log.md`, `memory/MEMORY.md`, and `memory/session_log.md`.
- Commit, push to your branch, and open a draft PR.

## If sotwe can't be reached at all

1. Search her Google Drive for an X export she may have dropped in. Try "tweets," "X export," "under the hood," and "bbwbootyfulfeet."
2. If you find new "under the hood" reports, read them and update doc 01, section 7, part 2 with which account carries the "NsfwAdmin" label.
3. If Drive has nothing, give her the Grok route in two lines. Grok can read X, so she can ask it to put her last 90 days of feet posts into a Google Doc (date, text, likes, replies, reposts, views, link). Then you read that doc from Drive and run steps 3 and 4. Treat Grok's numbers as secondhand, the same way doc 01 treats the June audit.

## Guardrails

- Read only on X. Never post, like, reply, follow, or DM.
- Don't edit Notion. She declined a Notion edit on Oct 2, so ask first.
- Feet account only. Leave @bootyfulfarts alone unless she asks.
- No em dashes, no semicolons, and no fragment stacks in anything you write. "Soles," never "pads." "BBW," never "fat" or "big girl." Never write the name of her dead platform (the `bella-platform-status` skill lists it).
- Don't read her messages back to her for confirmation. Make the call and note your guess in the doc.
