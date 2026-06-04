-- 008_kommo_channel_events.sql
-- Log de eventos (inbounds) por canal, para CONTAR registros por ventana (6h/24h).
-- Lo llena el nodo "latido" de n8n (1 fila por inbound). El resumen lo lee y cuenta.
-- Sin FK (tabla de alto volumen); con retención corta (el digest borra >48h).

create table if not exists public.kommo_channel_events (
  id           bigint generated always as identity primary key,
  account_slug text        not null,
  canal        text        not null,
  ts           timestamptz not null default now()
);

create index if not exists idx_kommo_events_lookup on public.kommo_channel_events (account_slug, canal, ts desc);
create index if not exists idx_kommo_events_ts     on public.kommo_channel_events (ts);

alter table public.kommo_channel_events enable row level security;
drop policy if exists "kce_all" on public.kommo_channel_events;
create policy "kce_all" on public.kommo_channel_events for all using (true) with check (true);

notify pgrst, 'reload schema';
