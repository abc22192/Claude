# Build Log / Diary

_Format: timestamp | what was done | what changed | what's next_

---

## 2026-10-07T00:00:00Z | Project kickoff and platform research

**What was done:**
- Found the full project brief on Notion ("Prompt Directory App -- Build Plan + Claude Code Prompt")
- Researched AppDeploy: deployment process, SDK features, database (KV store), content policy (no adult content), React-Vite template
- Researched Hostinger: MySQL databases, remote MySQL access (add allowed IPs via hPanel), PHP REST API capability, connection via port 3306
- Studied reference app (AI Prompts on App Store): prompt library with categories, one-click copy, favorites, search, prompt generation
- Designed dual-platform architecture: AppDeploy for SFW data + frontend, Hostinger for adult data + documentation

**What changed:**
- Created project directory: `projects/prompt-directory/`
- Created research doc: `projects/prompt-directory/docs/research.md`
- Created architecture doc: `projects/prompt-directory/docs/architecture.md`
- Created this build log: `projects/prompt-directory/docs/build-log.md`

**What's next:**
- Present architecture summary and build plan to Bella for approval
- On approval: scaffold the React app with AppDeploy template
- Bella will provide Hostinger credentials when I hit the Hostinger setup step
