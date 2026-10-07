# Platform Research

_Last updated: 2026-10-07_

---

## AppDeploy

### What it is
Managed hosting platform for web apps. Handles deployment, hosting, and provides a built-in backend with database, auth, storage, and other features.

### App Types
- **frontend-only**: Static/client-side apps
- **frontend+backend**: Adds database, storage, server-side auth, and backend functionality

### Frontend Templates
- `html-static` (simple sites)
- `react-vite` (SPAs, interactive apps) **<-- we use this**
- `nextjs-static` (multi-page sites)

### Built-in Database
- Key-value store with tables
- CRUD operations: `db.add`, `db.get`, `db.list`, `db.update`, `db.delete`
- Auto-generated IDs (no app-chosen keys)
- Per-app minute and daily quotas
- 256 KiB max per serialized item
- 500 items max per call
- Pagination via `nextToken`

### Backend
- Node.js/TypeScript
- Router with middleware chains
- SDK: `@appdeploy/sdk` (backend only)
- Client: `@appdeploy/client` (frontend only, never cross-import)
- Frontend calls backend via `api.get()`, `api.post()`, etc.

### Deploy Method
- `deploy_app` tool call with files
- Template-based: start from `get_app_template`, only send changed/new files
- `upload_assets` for file uploads
- Automatic e2e testing on deploy

### Content Policy
- **No adult content allowed in AppDeploy storage or backend**
- General/SFW content only
- This is why the hosting split exists

### SDK Features Available
api, realtime, auth, notifications, invites, database, storage, secrets, ai.generate, ai.extract, ai.ocr, ai.classify, ai.scrape, ai.run, ai.image, cron

---

## Hostinger

### What it is
Web hosting provider. Bella already has a Hostinger account/infrastructure.

### Database Options
- **MySQL** via hPanel control panel
- Default port: 3306
- Management via phpMyAdmin
- Local connection: `localhost` (PHP) or `127.0.0.1` (Node.js)

### Remote MySQL Access
- **Disabled by default** for security
- Enable via: Websites Dashboard > Remote MySQL
- Add allowed IPs (IPv4 or IPv6), or use "Any Host" (% wildcard, not recommended)
- Connection requires: host, port (3306), database name, username, password

### Hosting for Our API
- PHP + MySQL is the native stack on shared hosting
- We'll build a simple PHP REST API that sits in front of MySQL
- CORS headers enabled for the AppDeploy domain
- API key authentication (shared secret)

### Shared Hosting Limitations
- Low connection caps (pool/close connections)
- Better for PHP/static sites
- VPS offers more control but costs more

### What Goes on Hostinger
- Adult prompt database (MySQL tables)
- Adult category data
- Documentation database (build log, research, architecture)
- PHP REST API endpoints

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Frontend framework | React-Vite (SPA) | Interactive app with search, favorites, admin panel |
| AppDeploy app type | frontend+backend | Need database for SFW prompts, categories, favorites |
| Adult data connection | Frontend calls Hostinger API directly | Adult content never touches AppDeploy infrastructure |
| Hostinger API | PHP + MySQL REST API | Native stack on shared hosting, simplest setup |
| Auth for Hostinger API | API key in request headers | Simple, sufficient for this use case |
