# Prompt Directory — Research & Architecture

## 1. Research findings

### AppDeploy (general / SFW side, as briefed)
- It is an AI-driven deploy platform you drive through an MCP server (deploy from chat). Frontend templates: `html-static`, `react-vite`, `nextjs-static`. App types: `frontend-only` or `frontend+backend`.
- Backend features available: database (CRUD key-value tables), storage (files + signed URLs), auth, realtime, notifications, secrets, cron, and a set of AI features.
- Hard architectural rule: the front end must call the AppDeploy backend only through `api` from `@appdeploy/client`. Raw `fetch()` / `axios()` to AppDeploy routes is disallowed. Frontend must never import the backend SDK and vice versa.
- Its database is a key-value CRUD store, not full SQL. Fine for prompts, categories, favorites.
- Content policy: could not fetch appdeploy.ai/terms from this environment (egress-blocked). Treated as a standard managed app-hosting AUP, which restricts adult/sexual content that is served, transmitted, or made available through the platform, not merely stored on it.

### Hostinger (adult side, as briefed)
- Remote MySQL is supported: Databases -> Remote MySQL -> add the connecting app server's IP (or Any Host), connect on port 3306 to a host like `srvXXXX.hstgr.io` with db name, user, password.
- Databases are localhost-only until an IP is allowlisted. Direct browser connection is not an option, credentials would be exposed. The correct pattern is a small server-side API in front of the MySQL DB.
- Hostinger also offers full web hosting and VPS, so it can host an entire app plus its database, and it permits adult content on appropriate plans.

Sources: Hostinger remote MySQL docs (hostinger.com/tutorials/how-to-grant-remote-access-mysql, docs.hostinger.com/websites/databases); AppDeploy deploy contract via MCP.

## 2. The problem with the briefed architecture

The brief assumes: adult data in a Hostinger DB = AppDeploy stays clean = policy respected.

That does not hold. The app itself is hosted on AppDeploy. When a user opens an adult category, the AppDeploy-hosted front end fetches those prompts (through the AppDeploy backend, because that is the only sanctioned way to make calls) and renders them. AppDeploy is then the channel serving adult content, regardless of where the bytes are stored. Most app-host AUPs cover content made available through the service, not just stored on it.

Consequences if AppDeploy flags it:
- They can suspend or delete the whole app. The general/SFW side dies with the adult side. That is worse than the risk the split was meant to avoid.
- The alternative, having the browser hit Hostinger directly to keep traffic off AppDeploy, exposes DB credentials to the client and fights AppDeploy's own build rules. Not viable.

## 3. Recommended architecture

Two clean options. Recommendation first.

### Option A (recommended): whole app on Hostinger
- One app, one MySQL database, hosted entirely on Hostinger (VPS or hosting plan that allows adult content).
- All features (browse, search, favorites, one-tap copy, admin CRUD, manageable categories) run in one codebase. Adult and general prompts are just rows with a category flag.
- Result: genuinely one seamless app, mobile-first, neon. No cross-platform stitching. No policy landmine. No single point of catastrophic failure. Uses infrastructure already paid for.

### Option B: AppDeploy for SFW, Hostinger for adult, kept as separate apps
- General/SFW prompt directory hosted on AppDeploy (its DB + storage), never touches adult content.
- Adult directory is a separate app hosted entirely on Hostinger (MySQL + a thin API), on its own domain or subdomain.
- Keeps AppDeploy strictly clean. But it breaks the "one seamless combined app" requirement, users cross between two apps, and there is double the maintenance.

### Not recommended: the briefed stitch (AppDeploy front end + Hostinger adult DB stitched into one app)
- Fails the content-policy goal it was designed to meet, for the reasons in section 2. Documented here so the reasoning is not lost.

## 4. Data layer (applies to whichever option is chosen)
- Tables: `prompts` (id, title, body, category_id, is_adult, tags, created_at), `categories` (id, name, slug, is_adult), `favorites` (per-device or per-user). Favorites can stay device-local first, then move server-side if accounts are added.
- Admin CRUD for prompts and categories behind a simple auth gate (admin only, for Babe).
- One-tap copy is pure client-side (clipboard API) with a clear copied confirmation.

## 5. Open decision (blocks the build)
Which hosting model: Option A (recommended) or Option B. Everything downstream depends on this.
