-- Plantilla HTML libre para el "Resumen de Lead Calificado" por cliente.
-- Cada entorno sube su propio HTML con placeholders {{campo}} que el sistema
-- sustituye por valores reales del payload del webhook al renderizar
-- lead.html?id=<lead_id>.

ALTER TABLE clients_config
  ADD COLUMN IF NOT EXISTS lead_template JSONB DEFAULT '{}';

-- Esquema esperado de lead_template:
-- {
--   "html":             "<!DOCTYPE html>...<div>{{nombre}}</div>...",  -- HTML libre completo
--   "lead_id_field":    "id",                          -- campo en el payload que identifica al lead
--   "sucursal_field":   "sucursal_sugerida",           -- campo de sucursal (filtros + index)
--   "qualified_stages": ["empeño oro", "empeño otros", -- valores de "estatus" (case-insensitive,
--                        "rescate de prenda",          --  match parcial) que cuentan como calificados.
--                        "cita agendada", "reagendar", --  Si está vacío, ningún lead se sincroniza.
--                        "empeñado"],
--   "estatus_field":    "estatus"                      -- campo donde leer el estatus del lead
-- }
--
-- Solo los leads cuyo payload[estatus_field] (lowercase, contains) coincida con
-- algún valor de qualified_stages serán snapshotados a qualified_leads.

NOTIFY pgrst, 'reload schema';
