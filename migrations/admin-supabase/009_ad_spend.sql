-- 009_ad_spend.sql
-- Gasto de publicidad por cuenta y mes — para el KPI de ROAS de CEFEMEX Casa de Empeño.
-- Lo captura SOLO Intra (rol admin) desde el dashboard; el cliente puede VER el ROAS
-- pero no editar el gasto (el candado de edición es a nivel UI, por rol).

create table if not exists public.ad_spend (
  account_slug text        not null references public.clients_config(id_slug) on delete cascade,
  periodo      text        not null,                 -- 'YYYY-MM'
  monto        numeric     not null default 0,
  updated_at   timestamptz default now(),
  primary key (account_slug, periodo)
);

alter table public.ad_spend enable row level security;
drop policy if exists "ad_spend_read" on public.ad_spend;
drop policy if exists "ad_spend_all"  on public.ad_spend;
create policy "ad_spend_read" on public.ad_spend for select using (true);
create policy "ad_spend_all"  on public.ad_spend for all    using (true) with check (true);

notify pgrst, 'reload schema';
