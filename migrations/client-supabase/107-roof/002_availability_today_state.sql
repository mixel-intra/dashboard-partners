-- 002_availability_today_state.sql
-- Estado operativo "de hoy" para 107 Rooftop, consumido por el dashboard y el agente de n8n.
--   sold_out_date       : si == hoy (zona America/Santo_Domingo) → Sold Out activo (no reservas, sí walk-in)
--   closed_event_date   : si == hoy → Cerrado por eventualidad (ni reservas ni walk-ins)
--   sold_out_message    : mensaje que responde el agente cuando hay Sold Out
--   closed_event_message: mensaje que responde el agente cuando está cerrado por eventualidad
-- El estado se "restablece" solo: al cruzar la medianoche local la fecha deja de coincidir con hoy.

-- sold_out_time / closed_event_time: hora de inicio (ese día). NULL = todo el día (desde 00:00).
ALTER TABLE public.restaurant_availability
    ADD COLUMN IF NOT EXISTS sold_out_date date,
    ADD COLUMN IF NOT EXISTS closed_event_date date,
    ADD COLUMN IF NOT EXISTS sold_out_message text,
    ADD COLUMN IF NOT EXISTS closed_event_message text,
    ADD COLUMN IF NOT EXISTS sold_out_time time,
    ADD COLUMN IF NOT EXISTS closed_event_time time;
