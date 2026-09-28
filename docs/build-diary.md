# Prompt Directory — Build Diary

Running log of every build step. Newest entries at the bottom. This lives locally in the repo for now because the Hostinger documentation database does not exist yet. Once the Hostinger DB is wired up, this diary moves there (a `build_log` table in the documents section) and this file becomes the mirror.

Entry format: timestamp, what I did, what changed, what's next.

---

**2026-09-28 19:26 UTC**
- What I did: Researched both hosting platforms. Read the full AppDeploy deploy contract and SDK feature list through its MCP server. Confirmed Hostinger remote MySQL setup path (Remote MySQL panel, IP allowlist, port 3306, host like srvXXXX.hstgr.io). Could not fetch appdeploy.ai/terms directly because the domain is blocked by this environment's egress proxy, so AppDeploy content-policy wording is inferred from the platform category plus the technical constraints in its own deploy contract.
- What changed: Found a logic flaw in the storage-split premise. AppDeploy's architecture forces the front end to talk to its own backend (@appdeploy/client, no raw fetch to AppDeploy routes), so an AppDeploy-hosted app that displays adult prompts is still serving that content through AppDeploy infrastructure even when the bytes live in a Hostinger DB. Storage location is not the same as policy compliance. Documented the finding and a safer recommended architecture in docs/research-and-architecture.md.
- What's next: Get Babe's decision on the hosting model (whole app on Hostinger vs AppDeploy-SFW-only + separate Hostinger adult app). No code until she picks and gives the go.

---

**2026-09-28 19:27 UTC**
- What I did: Presented the storage-split flaw and three hosting options to Babe. She chose Option A: build the whole app on Hostinger, drop AppDeploy from this build.
- What changed: Architecture is now single-platform. All data in one MySQL database on Hostinger, one codebase, one seamless app. No cross-platform routing needed. Decision routed to decisions/log.md.
- What's next: Confirm the build plan and tech stack with Babe, then wait for her explicit go before writing code. When I hit the connection step I will ask her for the specific Hostinger access I need (plan type, DB host, credentials).

