-- Tabla que persiste cada lead calificado (snapshot del webhook al momento
-- de la sincronización). Se usa para que la página pública lead.html?id=<lead_id>
-- pueda renderizar aunque el webhook no esté disponible y para que las URLs
-- compartidas por WhatsApp sigan funcionando históricamente.
--
-- Flujo:
--   1. Admin click "Sincronizar leads calificados" → backoffice consulta el
--      webhook del entorno, filtra por las etapas calificadas configuradas
--      en clients_config.lead_template.qualified_stages, y upserta aquí.
--   2. n8n puede también empujar leads directamente vía /api/leads/ingest.
--   3. lead.html?id=<lead_id> hace SELECT por lead_id y renderiza con el
--      template HTML del cliente correspondiente.

CREATE TABLE IF NOT EXISTS qualified_leads (
    lead_id       TEXT        PRIMARY KEY,
    client_id     TEXT        NOT NULL REFERENCES clients_config(id_slug) ON DELETE CASCADE,
    payload       JSONB       NOT NULL DEFAULT '{}',
    sucursal      TEXT,                          -- extraída de payload[sucursal_field] para queries rápidas
    estatus       TEXT,                          -- estatus/etapa del lead al momento del snapshot
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qualified_leads_client     ON qualified_leads(client_id);
CREATE INDEX IF NOT EXISTS idx_qualified_leads_sucursal   ON qualified_leads(client_id, sucursal);
CREATE INDEX IF NOT EXISTS idx_qualified_leads_updated_at ON qualified_leads(updated_at DESC);

-- Allow anon read (la página /lead?id=… es pública y no requiere auth)
ALTER TABLE qualified_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qualified_leads_anon_read" ON qualified_leads;
CREATE POLICY "qualified_leads_anon_read"
    ON qualified_leads
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Inserts/updates: el admin usa anon key (mismo patrón que el resto de tablas
-- de este proyecto). Se permite write a anon + authenticated.
DROP POLICY IF EXISTS "qualified_leads_authenticated_write" ON qualified_leads;
DROP POLICY IF EXISTS "qualified_leads_anon_write" ON qualified_leads;
CREATE POLICY "qualified_leads_anon_write"
    ON qualified_leads
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
