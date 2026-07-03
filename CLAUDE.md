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
| `director.html` | `director.js` | **`logic-systems` only** — dedicated "Panel del Director General". Reached via a redirect guard in `index.html`; see the client section below. |

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

### `logic-systems` — Panel del Director General (caso especial)
`logic-systems` **no usa el dashboard estándar**. Un guard en el `<head>` de
`index.html` redirige `?client=logic-systems` a `director.html` (y `director.html`
redirige de vuelta a `index.html` cualquier otro slug). El contenido es un bento grid
claro con estilos inline (`director.html` + `src/director.js`), pero **reutiliza el
chrome de layout compartido** (`src/style.css` + `src/theme-intra.css`): sidebar
colapsable + topbar, igual que los demás dashboards, con `<html data-theme="light">`
**fijo** (este panel NO tiene toggle de modo oscuro). El sidebar/menú-móvil solo trae
Cambiar contraseña, Ver otro Dashboard y Cerrar sesión (`logout()` /
`openChangePasswordModal()` vienen de `auth.js`; `toggleSidebar`/`toggleMobileMenu`
están inline en `director.html`). Usa ionicons para el chrome y Phosphor para el bento.

**Fuente de datos:** hoy los leads viven en **Airtable**. `fetchLeads()` los pide a
**`/api/leads/list?client=logic-systems`** (`api/leads/list.js`), un endpoint
server-side que guarda el token `AIRTABLE_TOKEN` y resuelve base/tabla desde
`clients_config.leads_config` (JSON: `airtable_base_id`, `airtable_table_id`,
`airtable_view?`, y un `field_map` opcional que alias-a los campos de Airtable a las
claves que espera `director.js`). Si no está configurado, el panel carga vacío (no
truena) con una guía. **Está pendiente cargar `leads_config` real** (base, tabla y
nombres de campo) — hasta entonces el panel muestra el estado vacío o el modo demo
(`webhook_url = 'DEMO'`). **La dirección es migrar de Airtable a Supabase**: cuando
pase, se reemplaza esa llamada por una query a `clientSupabase`.

Las **demos agendadas** hoy se *derivan* del estatus del lead (`esCalificado`);
la dirección es que salgan de un **calendario real en Outlook con la cuenta del
cliente** (integración pendiente).

**Qué mira el cliente:** los leads que piden **demos de sus sistemas**. La empresa
tiene 4 sistemas y el panel gira en torno a dos dimensiones **fijas** (no dinámicas
como en el dashboard estándar):

- **Sistema** (antes "Campaña" — el label del filtro y las tarjetas dicen "Sistema"):
  botones fijos para los 4 productos → **CIB Financiera, e-SIGeN, CIB Casa de Empeño,
  e-SIGeN PLD**. Definidos en `SISTEMAS` (`src/director.js`); cada lead se mapea con
  `normSistema()` desde `utm_campaign`.
- **Fuente:** botones fijos → **Facebook, WhatsApp, Instagram, Google** (siempre estas
  cuatro). Definidos en `FUENTES`; cada lead se mapea con `normFuente()` desde
  `utm_medium`/`utm_source`.

`normSistema()`/`normFuente()` normalizan por regex con fallbacks, así que toleran
variantes (`fb`, `ig`, `cpc`, "casa de empeño", etc.). **Cuando confirmes cómo llega
el dato real de Kommo, ajusta esos patrones.** El agente de IA que califica los leads
se llama **Camila** (etapa "Seguimiento CAMILA" en el pipeline de Kommo). Bump del
cache-bust `director.js?v=YYYYMMDD-N` al tocar el JS.

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
