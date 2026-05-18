-- Social Listening — tabla única de reviews en el Supabase admin.
-- Multi-tenant lógico: cada review lleva hotel_id (= clients_config.id_slug).
-- Se llena desde /api/scrape-reviews y se lee desde el dashboard del cliente.

create table if not exists public.reviews (
    id                uuid primary key default gen_random_uuid(),

    -- Tenant
    hotel_id          text not null
                      references public.clients_config(id_slug) on delete cascade,

    -- Identificación de la fuente
    source            text not null
                      check (source in ('google','tripadvisor','booking')),
    source_review_id  text not null,

    -- Datos crudos
    author            text,
    author_avatar_url text,
    rating            numeric(3,1),   -- 1.0 a 5.0 (Booking 1-10 se normaliza a /5 al guardar)
    title             text,
    body              text,
    language          text,
    review_date       timestamptz,
    review_url        text,
    raw_json          jsonb,

    -- Análisis Claude
    sentiment         text check (sentiment in ('positive','neutral','negative')),
    category          text check (category in ('service','cleanliness','location','food','price','rooms','amenities','other')),
    priority          text check (priority in ('high','medium','low')),
    summary           text,
    topics            text[],
    analyzed_at       timestamptz,
    analysis_model    text,

    scraped_at        timestamptz default now(),
    updated_at        timestamptz default now(),

    unique (hotel_id, source, source_review_id)
);

create index if not exists reviews_hotel_date_idx  on public.reviews (hotel_id, review_date desc);
create index if not exists reviews_hotel_source_idx on public.reviews (hotel_id, source);
create index if not exists reviews_priority_idx    on public.reviews (hotel_id, priority) where priority = 'high';

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_reviews_updated_at on public.reviews;
create trigger trg_reviews_updated_at
    before update on public.reviews
    for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;

-- Lectura pública (anon). El filtrado por hotel se hace en el frontend con .eq('hotel_id', slug).
-- Si más adelante quieres aislamiento estricto, puedes endurecer esto con un claim/JWT.
create policy "anon read"  on public.reviews for select to anon using (true);
-- Escritura solo desde el backend (service_role bypassea RLS, así que esto cubre el cron).
-- Bloqueamos escritura anon para que clientes no puedan ensuciar la tabla.
create policy "anon no write" on public.reviews for insert to anon with check (false);
create policy "anon no update" on public.reviews for update to anon using (false);

NOTIFY pgrst, 'reload schema';
