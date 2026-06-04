-- 007_kommo_channel_health.sql
-- Monitor de Salud de Canales (Kommo) — tablas en el Supabase admin (INTRA).
--
-- Modelo "latido" (dead-man's switch): cada inbound de Kommo dispara un webhook
-- a /api/kommo/heartbeat que actualiza ultima_senal[cuenta][canal]. Un sweep
-- periódico marca en rojo + alerta a Slack los canales esperados que llevan
-- más del umbral sin señal.
--
-- Multi-tenant lógico igual que la tabla `reviews`: account_slug = clients_config.id_slug.
-- ADITIVO: no modifica ni borra tablas/datos existentes. Idempotente (re-ejecutable).

-- ── Config por cuenta: Slack + flags ───────────────────────────────────────
-- kommo_slack_webhook_url: Incoming Webhook de Slack de ESTA cuenta (opcional).
--   Si está vacío, el sweep cae a SLACK_DEFAULT_WEBHOOK_URL (env).
-- kommo_config: espacio para opciones futuras (toggle recuperación, horario hábil, etc.)
alter table public.clients_config
  add column if not exists kommo_slack_webhook_url text,
  add column if not exists kommo_config jsonb default '{}'::jsonb;

-- ── Config de canal esperado + umbral (la "función" configurable) ───────────
create table if not exists public.kommo_channel_config (
  account_slug text        not null references public.clients_config(id_slug) on delete cascade,
  canal        text        not null,
  esperado     boolean     not null default true,
  umbral_horas int         not null default 6,
  updated_at   timestamptz default now(),
  primary key (account_slug, canal)
);

-- ── LATIDOS: corazón del sistema ────────────────────────────────────────────
create table if not exists public.kommo_channel_heartbeats (
  account_slug text        not null references public.clients_config(id_slug) on delete cascade,
  canal        text        not null,
  ultima_senal timestamptz,
  total_24h    int         default 0,
  en_alerta    boolean     default false,   -- true mientras el canal está caído (para detectar recuperación)
  updated_at   timestamptz default now(),
  primary key (account_slug, canal)
);

-- ── Log de alertas: dedup 1 por cuenta+canal+tipo+día ───────────────────────
create table if not exists public.kommo_alerts_log (
  id           uuid        primary key default gen_random_uuid(),
  account_slug text        not null references public.clients_config(id_slug) on delete cascade,
  nombre       text,                                         -- nombre legible de la cuenta (snapshot)
  canal        text        not null,
  tipo         text        not null check (tipo in ('caida','recuperacion')),
  detalle      text,
  fail_date    date        not null default current_date,
  created_at   timestamptz default now(),
  unique (account_slug, canal, tipo, fail_date)
);

create index if not exists idx_kommo_alerts_log_account on public.kommo_alerts_log (account_slug, created_at desc);

-- ── RLS coherente con clients_config/reviews (lectura pública + gestión total) ─
-- El frontend lee con anon; los endpoints escriben con service key (bypass RLS).
alter table public.kommo_channel_config     enable row level security;
alter table public.kommo_channel_heartbeats enable row level security;
alter table public.kommo_alerts_log         enable row level security;

drop policy if exists "kcc_read" on public.kommo_channel_config;
drop policy if exists "kcc_all"  on public.kommo_channel_config;
create policy "kcc_read" on public.kommo_channel_config     for select using (true);
create policy "kcc_all"  on public.kommo_channel_config     for all    using (true) with check (true);

drop policy if exists "kch_read" on public.kommo_channel_heartbeats;
drop policy if exists "kch_all"  on public.kommo_channel_heartbeats;
create policy "kch_read" on public.kommo_channel_heartbeats for select using (true);
create policy "kch_all"  on public.kommo_channel_heartbeats for all    using (true) with check (true);

drop policy if exists "kal_read" on public.kommo_alerts_log;
drop policy if exists "kal_all"  on public.kommo_alerts_log;
create policy "kal_read" on public.kommo_alerts_log         for select using (true);
create policy "kal_all"  on public.kommo_alerts_log         for all    using (true) with check (true);

-- Forzar a PostgREST a recargar el schema cache.
notify pgrst, 'reload schema';
