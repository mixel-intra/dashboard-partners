# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

## Running & deploying

```bash
npm install            # Node 22 required (see package.json engines)
node server.js         # dev server → http://localhost:3000
```

- There is **no build step, no framework, no bundler, no test suite.** The app is
  static HTML/CSS/vanilla-JS served directly. Edit a file and reload.
- `server.js` is a hand-rolled dev server that mimics Vercel: it serves static files,
  applies `cleanUrls` (`/lead` → `lead.html`), and routes `/api/*` to the handlers in
  `api/` by adapting Node's `res` to Vercel's `res.status().json()` shape. **When you
  add a new `/api/*` endpoint you must register it in `server.js`** (Vercel picks it up
  automatically from the filesystem, but the local server does not).
- **Deploy = `git push origin main`** → Vercel auto-deploys (`vercel.json`). No CI.
- Entry point for local testing: `http://localhost:3000/login.html`, then
  `index.html?client=<slug>`.
- Codebase language is **Spanish** — comments, UI copy, and commit messages are all
  Spanish. Commits follow `tipo(scope): mensaje` (e.g. `fix(reservas): ...`).

## Architecture

### Multi-page static app
Each top-level `.html` file is a standalone page that pulls in shared modules from
`src/` via `<script>` tags (in order: `config.js` → `auth.js` → the page's own module):

| Page | Module | Purpose |
|---|---|---|
| `login.html` | `auth.js` | Login + change-password |
| `hub.html` | (inline) | Client picker for multi-client users |
| `index.html` | `dashboard.js` (~7.5k lines) | Main client dashboard — the core of the app |
| `pipeline.html` | (inline) | Sales/lead pipeline view |
| `admin.html` | `backoffice.js` | Intra-only back office: manage `clients_config`, users, lead templates |
| `lead.html` | `lead-template-render.js` | Public per-lead landing page (`/lead?id=…`) |

### Multi-tenant Supabase (the central concept)
Two Supabase layers, see `src/config.js`:
- **Admin Supabase** (`window.supabase` / `window.adminSupabase`) — one shared project
  (`zwghwruwxzttsofaezjp`). Holds `clients_config`, `user_profiles`,
  `user_client_access`, and cross-tenant data (reviews, kommo health).
- **Per-client Supabase** (`window.clientSupabase`) — instantiated **at runtime** by
  `initializeClientSupabase()` from `clients_config.supabase_url` /
  `supabase_anon_key` once the active client is known. Falls back to the admin client
  if a client has no credentials configured. Operational data (reservations, etc.)
  lives here.

`loadConfig()` in `dashboard.js` reads `?client=<slug>` → fetches its `clients_config`
row → sets theme/labels and picks rendering behavior from `client_type`
(`'hotel' | 'inmobiliaria' | 'otro'`). Some behavior is special-cased by slug
(e.g. `casa-de-empeño`/`cefemex`, `107-roof`) — grep for the slug when touching those.

**Anon keys are hardcoded in `config.js` and RLS is open** across the app — this is a
partner-facing dashboard, not a hardened multi-user system. Don't assume RLS protects
tenant data.

### Data sources (three of them)
1. **n8n webhooks** — lead data is fetched from n8n webhook URLs stored in
   `clients_config.webhook_url`. The browser cannot call these directly (CORS), so all
   calls go through **`/api/proxy?url=<encoded>`** (`api/proxy.js`), a pass-through that
   forwards method/body/Authorization and returns JSON. `webhook_url === 'DEMO'`
   triggers a fake-data demo mode.
2. **Supabase** — config, users, and operational tables (per the two-layer model above).
3. **Airtable** — restaurant reservations and events for some clients, written
   server-side via `api/reservations/create.js` using `AIRTABLE_TOKEN` (base/table
   resolved from `clients_config`, never trusted from the frontend).

### API endpoints (`api/`)
- `proxy.js` — generic CORS proxy (see above). Used everywhere.
- `reservations/create.js` — write a reservation to a client's Airtable.
- `leads/ingest.js` — n8n POSTs qualified leads (Bearer `LEADS_INGEST_SECRET`) into
  `qualified_leads` so `/lead?id=…` renders without depending on the webhook.
- `scrape-reviews.js` — social-listening pipeline (Bright Data scrapers → Claude Haiku
  for sentiment → `reviews` table). Cron daily 06:00 (`vercel.json`), `maxDuration` 300s.
- `kommo/` — "Salud de Canales" channel-health monitor. The **live logic runs in n8n**
  (the `n8n-*-code-node.js` files are the source pasted into n8n nodes). `heartbeat.js`
  / `sweep.js` / `_lib.js` are Vercel equivalents kept as an alternative but **not
  currently used** (see `api/kommo/RESUMEN-EJECUTIVO.md`).

### Auth (`src/auth.js`)
Custom, not Supabase Auth. Login checks `user_profiles` by email + **plaintext**
`password`. Session is a JSON blob in `localStorage` (`intra_session_v2`), valid 24h.
`role: 'admin'` = Intra (sees everything incl. internal panels); `role: 'partner'` =
client (limited to slugs in `user_client_access`). `checkAuth()` runs on page load and
redirects unauthorized users to `login.html` / `hub.html`.

### Migrations (`migrations/`)
Plain numbered `.sql` files, **applied manually** in the Supabase SQL editor — there is
no migration runner. `admin-supabase/` targets the shared admin project;
`client-supabase/<client>/` targets a specific client's project (also contains n8n
workflow JSON and system prompts for that client).

## Conventions & gotchas
- **Cache-busting:** shared JS is included with a `?v=<date-tag>` query
  (`dashboard.js?v=20260608-cde45`). Bump the tag when you change the JS so partners
  don't get a stale cached copy.
- Client-type and per-slug branching is pervasive in `dashboard.js`; a change "for one
  client" usually means a `state.clientType === …` or `state.clientId === …` guard, not
  a new file.
- Secrets (Slack webhooks, tokens) are **not** in the repo — they live in n8n or Vercel
  env vars. Env vars used: `AIRTABLE_TOKEN`, `LEADS_INGEST_SECRET`,
  `BRIGHT_DATA_API_TOKEN`, `ANTHROPIC_API_KEY`, `ADMIN_SUPABASE_SERVICE_KEY`,
  `CRON_SECRET`.
- `ESTADO-PROYECTO.md` is a running Spanish checkpoint/status doc — good background on
  in-flight features (Kommo monitor, CEFEMEX Casa de Empeño dashboard).
