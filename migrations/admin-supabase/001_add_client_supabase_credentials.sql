-- Agrega las columnas que el admin del backoffice envía pero que no existían
-- en el schema original de clients_config. Sin esto, guardar un cliente con
-- credenciales del Supabase del cliente truena con:
--   "Could not find the 'supabase_anon_key' column of 'clients_config' in the schema cache"

ALTER TABLE clients_config
  ADD COLUMN IF NOT EXISTS supabase_url       TEXT,
  ADD COLUMN IF NOT EXISTS supabase_anon_key  TEXT,
  ADD COLUMN IF NOT EXISTS restaurant_config  JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hospedaje_config   JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS eventos_config     JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS logo_url_light     TEXT;

-- Forzar a PostgREST a recargar el schema cache (sin esto el frontend sigue
-- viendo el error hasta que el caché expire solo).
NOTIFY pgrst, 'reload schema';
