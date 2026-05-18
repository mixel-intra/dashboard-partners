-- Roof 107 — tabla de reservas (reemplaza el Airtable)
-- Correr en el SQL Editor del Supabase del cliente.

create table public.restaurant_reservations (
    id              uuid primary key default gen_random_uuid(),

    kommo_lead_id   bigint unique,                 -- clave para UPSERT desde n8n
    kommo_chat_id   text,                          -- para responder vía Chat API

    nombre_cliente  text,
    email           text,
    telefono        text,
    tipo_evento     text,
    pax             int,
    fecha_evento    timestamptz,
    detalles        text,
    conversacion    text,

    estado          text default 'Nuevo Lead'
                    check (estado in ('Nuevo Lead','Confirmado','Rechazado')),

    created_at      timestamptz default now(),
    updated_at      timestamptz default now(),

    airtable_record_id text unique                 -- puente para la migración inicial; droppear después
);

create index on public.restaurant_reservations (estado, fecha_evento desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_rest_res_updated_at
    before update on public.restaurant_reservations
    for each row execute function public.set_updated_at();

alter table public.restaurant_reservations enable row level security;
create policy "anon all" on public.restaurant_reservations
    for all to anon using (true) with check (true);

alter publication supabase_realtime add table public.restaurant_reservations;
