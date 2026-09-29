# Decision Log

**2026-09-28 — Prompt Directory hosting: all on Hostinger**
Decided to host the entire Prompt Directory app (front end, API, and one MySQL database) on Hostinger. Dropped the original AppDeploy + Hostinger storage split. Reason: an AppDeploy-hosted app that serves adult prompts is still distributing that content through AppDeploy regardless of where the bytes are stored, so the split did not achieve policy compliance and risked the whole app being killed. Single-platform on Hostinger gives one seamless app, no policy risk, and uses infrastructure already paid for.
