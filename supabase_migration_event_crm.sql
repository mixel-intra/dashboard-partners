-- =======================================================
-- MIGRACIÓN: Panel de Seguimiento de Eventos (Mini-CRM)
-- Ejecutar en el SQL Editor de Supabase (producción)
-- =======================================================

-- 1. Agregar columna airtable_config a clients_config
ALTER TABLE clients_config
ADD COLUMN IF NOT EXISTS airtable_config JSONB DEFAULT '{}';

-- 2. Tabla: event_seguimiento
CREATE TABLE IF NOT EXISTS event_seguimiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_slug TEXT NOT NULL REFERENCES clients_config(id_slug) ON DELETE CASCADE,
    id_lead BIGINT NOT NULL,
    estatus TEXT NOT NULL DEFAULT 'nuevo'
        CHECK (estatus IN ('nuevo', 'contactado', 'cotizando', 'cotizacion_enviada', 'venta', 'perdido')),
    asignado_a TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(client_slug, id_lead)
);

ALTER TABLE event_seguimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura de seguimiento" ON event_seguimiento FOR SELECT USING (true);
CREATE POLICY "Permitir gestión de seguimiento" ON event_seguimiento FOR ALL USING (true);

-- 3. Tabla: event_interacciones
CREATE TABLE IF NOT EXISTS event_interacciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_slug TEXT NOT NULL REFERENCES clients_config(id_slug) ON DELETE CASCADE,
    id_lead BIGINT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('llamada', 'whatsapp', 'email', 'nota')),
    resultado TEXT,
    vendedor_nombre TEXT NOT NULL,
    vendedor_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE event_interacciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura de interacciones" ON event_interacciones FOR SELECT USING (true);
CREATE POLICY "Permitir gestión de interacciones" ON event_interacciones FOR ALL USING (true);

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_event_seg_client ON event_seguimiento(client_slug);
CREATE INDEX IF NOT EXISTS idx_event_seg_lead ON event_seguimiento(client_slug, id_lead);
CREATE INDEX IF NOT EXISTS idx_event_int_client ON event_interacciones(client_slug);
CREATE INDEX IF NOT EXISTS idx_event_int_lead ON event_interacciones(client_slug, id_lead);
CREATE INDEX IF NOT EXISTS idx_event_int_created ON event_interacciones(created_at DESC);
