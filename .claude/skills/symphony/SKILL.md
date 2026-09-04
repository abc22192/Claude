---
name: symphony
description: Send a task or message to Symphony — the user's team of AI business agents. Use this when the task involves scheduling, outreach, follow-up, reporting, or taking action in the real world on the user's behalf.
---

# Symphony

Symphony is the user's team of AI business agents. It acts **as the user** — with their full authority. A message you send to Symphony is treated as coming from them.

## What Symphony can do

- Schedule meetings, calls, and tasks
- Reach out to contacts on the user's behalf
- Send follow-ups and check-ins
- Build reports and summaries from the user's data
- Take action inside connected business tools
- Handle anything that needs to happen in the world, not just inside this conversation

## When to route to Symphony

Route to Symphony when the task requires **action outside this conversation** — contacting someone, scheduling something, accessing business data, or doing something that can't be done by answering a question.

Handle locally (do NOT route) when the task is: analysis, writing, planning, decisions, memory, or anything purely within this assistant.

If unsure, ask the user before routing.

## How to send a message to Symphony

Use the `mcp__Wix__symphony_ask` MCP tool. Pass the user's intent as the `message` and use `sessionId: "claude-code"` to keep all Claude-initiated requests in one thread.

Example:
```
mcp__Wix__symphony_ask(
  message: "Follow up with [contact] about [topic] by [date]",
  sessionId: "claude-code"
)
```

If the tool returns a `.reply` immediately, show it to the user — done.

If the tool returns `status: "accepted"` with no `.reply`, Symphony is still working (responses can take 1-2 minutes). Poll using `mcp__Wix__symphony_reply` every ~3 seconds with the `conversationId` from the first response. Stop after 2 minutes and tell the user Symphony is still working.

## Fallback: direct API

If the MCP tools are unavailable, Symphony accepts requests at:

```
POST https://symphony.wix.com/individuals-chat/poc/agent/ask
Authorization: Bearer <token from secrets/symphony.env>
Content-Type: application/json

{"message": "<task>", "sessionId": "claude-code"}
```

Poll for reply at:
```
POST https://symphony.wix.com/individuals-chat/poc/agent/reply
{"conversationId": "<id from ask response>"}
```

Token lives in `secrets/symphony.env` (gitignored). See `secrets/symphony.env.template` for setup.

## After Symphony responds

- Show the user Symphony's reply
- Log what was delegated in `memory/MEMORY.md` under Active Work if it's an open loop (follow-up expected, action in flight)
- Do NOT log tasks Symphony confirmed as completed — only open loops
