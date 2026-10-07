# Architecture Summary

_Last updated: 2026-10-07_

---

## The Split: Why Two Platforms

AppDeploy does not allow adult content. Bella's prompt directory includes adult/fetish prompt categories. Solution: split storage so adult content lives on her own Hostinger infrastructure, everything else on AppDeploy. The user sees ONE seamless app.

---

## System Diagram

```
User's Phone Browser
   |                         |
   | api.* calls             | fetch() calls
   | (SFW data)              | (adult data)
   v                         v
[AppDeploy Backend]     [Hostinger PHP API]
   |                         |
   v                         v
[AppDeploy DB]          [MySQL Database]
 - SFW prompts           - Adult prompts
 - SFW categories         - Adult categories
 - All favorites           - Build log / docs
 - User preferences
```

---

## Data Routing

### How it works
- Every category has a `source` flag: `"appdeploy"` or `"hostinger"`
- The frontend data service layer knows which API to call based on the source
- When browsing all categories: fetches from BOTH sources, merges client-side
- When viewing a category's prompts: routes to the correct API based on that category's source
- When searching: searches both sources in parallel, merges results
- Favorites are stored on AppDeploy only (just prompt ID + source reference, no content duplication)

### Content Policy Compliance
- **AppDeploy storage**: Only SFW prompt text, SFW categories, favorite references (ID + source flag), user preferences
- **AppDeploy compute (backend)**: Only handles SFW data. Never proxies, caches, or touches adult content
- **Hostinger storage**: Adult prompt text, adult categories, documentation database
- **Hostinger API**: Serves adult data directly to the frontend via CORS-enabled endpoints
- **Result**: Adult content flows from Hostinger directly to the user's browser. AppDeploy infrastructure is never involved with adult content in any way.

---

## API Design

### AppDeploy Backend Routes (SFW only)
```
GET    /api/categories          - List SFW categories
POST   /api/categories          - Add SFW category (admin)
PUT    /api/categories/:id      - Update SFW category (admin)
DELETE /api/categories/:id      - Delete SFW category (admin)

GET    /api/prompts             - List SFW prompts (with search, filter by category)
GET    /api/prompts/:id         - Get single SFW prompt
POST   /api/prompts             - Add SFW prompt (admin)
PUT    /api/prompts/:id         - Update SFW prompt (admin)
DELETE /api/prompts/:id         - Delete SFW prompt (admin)

GET    /api/favorites           - Get user's favorites list
POST   /api/favorites           - Add favorite (stores prompt ID + source)
DELETE /api/favorites/:id       - Remove favorite
```

### Hostinger PHP API Routes (adult only)
```
GET    /api/categories.php      - List adult categories
POST   /api/categories.php      - Add adult category (admin)
PUT    /api/categories.php      - Update adult category (admin)
DELETE /api/categories.php      - Delete adult category (admin)

GET    /api/prompts.php         - List adult prompts (with search, filter)
GET    /api/prompts.php?id=X    - Get single adult prompt
POST   /api/prompts.php         - Add adult prompt (admin)
PUT    /api/prompts.php         - Update adult prompt (admin)
DELETE /api/prompts.php         - Delete adult prompt (admin)

GET    /api/docs.php            - Read build log / documentation
POST   /api/docs.php            - Write build log entry
```

### Authentication
- AppDeploy: Uses AppDeploy's built-in auth for admin routes (or a simple admin password for MVP)
- Hostinger API: API key passed in `X-API-Key` header. Key stored as AppDeploy secret + hardcoded in Hostinger API config.

---

## Database Schema

### AppDeploy Tables (key-value store)

**categories**
```json
{
  "name": "SEO & Content Writing",
  "slug": "seo-content",
  "icon": "pencil",
  "order": 1,
  "source": "appdeploy",
  "prompt_count": 12
}
```

**prompts**
```json
{
  "title": "SEO Article Skeleton",
  "category_id": "abc123",
  "category_slug": "seo-content",
  "text": "Write a ~500-word article titled '[TITLE]'...",
  "tags": ["seo", "writing", "article"],
  "source": "appdeploy",
  "created_at": "2026-10-07T00:00:00Z"
}
```

**favorites**
```json
{
  "prompt_id": "abc123",
  "source": "appdeploy",
  "created_at": "2026-10-07T00:00:00Z"
}
```

### Hostinger MySQL Tables

**adult_categories**
```sql
CREATE TABLE adult_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  icon VARCHAR(50),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**adult_prompts**
```sql
CREATE TABLE adult_prompts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category_id INT NOT NULL,
  prompt_text TEXT NOT NULL,
  tags JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES adult_categories(id)
);
```

**build_log**
```sql
CREATE TABLE build_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action VARCHAR(500) NOT NULL,
  changes TEXT,
  next_steps TEXT
);
```

---

## Tech Stack Summary

| Layer | Technology | Content |
|-------|-----------|---------|
| Frontend | React + Vite (SPA on AppDeploy) | All UI, neon theme, mobile-first |
| SFW Backend | AppDeploy Node.js/TS | SFW prompts, categories, favorites |
| SFW Database | AppDeploy built-in KV store | SFW data only |
| Adult Backend | PHP REST API on Hostinger | Adult prompts, categories, docs |
| Adult Database | MySQL on Hostinger | Adult data + build log |
