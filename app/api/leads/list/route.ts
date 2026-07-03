import { type NextRequest } from 'next/server';
import { corsJson, corsPreflight } from '@/lib/api/cors';
import { EnvFaltanteError, requireEnv } from '@/lib/api/env';
import { adminAnonClient } from '@/lib/api/supabaseServer';

// Lee los leads de un cliente desde Airtable y los devuelve como JSON.
// Port 1:1 de legacy/api/leads/list.js. La base/tabla se resuelven server-side
// desde clients_config.leads_config (JSON: airtable_base_id, airtable_table_id,
// airtable_view?, field_map?) para que el frontend no pueda apuntar a una base
// arbitraria. field_map SOLO agrega alias canónicos (los que espera director.js)
// sin borrar los campos crudos de Airtable.
//
// USO: GET /api/leads/list?client=<slug> → { leads: [ { id, ...campos } ] }

const METHODS = 'GET, OPTIONS';

type FieldMap = Record<string, string>;

function applyFieldMap(fields: Record<string, unknown>, fieldMap?: FieldMap) {
  if (!fieldMap) return fields;
  const out: Record<string, unknown> = { ...fields };
  for (const canonical in fieldMap) {
    const airtableField = fieldMap[canonical];
    if (airtableField && fields[airtableField] !== undefined && out[canonical] === undefined) {
      out[canonical] = fields[airtableField];
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  let airtableToken: string;
  try {
    airtableToken = requireEnv('AIRTABLE_TOKEN');
  } catch (e: any) {
    return corsJson({ error: e.message }, 500, METHODS);
  }

  const q = req.nextUrl.searchParams;
  const clientSlug = q.get('client') || q.get('slug') || '';
  if (!clientSlug) return corsJson({ error: 'client es requerido' }, 400, METHODS);

  // ── Resolver base/tabla de Airtable del cliente (server-side) ──────────────
  let leadsConfig: any;
  try {
    const supabase = adminAnonClient();
    const { data, error } = await supabase
      .from('clients_config')
      .select('*')
      .eq('id_slug', clientSlug)
      .single();
    if (error) throw error;
    leadsConfig = (data && data.leads_config) || {};
  } catch (e: any) {
    if (e instanceof EnvFaltanteError) return corsJson({ error: e.message }, 500, METHODS);
    return corsJson(
      { error: 'No se pudo leer la configuración del cliente: ' + (e.message || e) },
      400,
      METHODS
    );
  }

  const baseId = leadsConfig.airtable_base_id;
  const tableId = leadsConfig.airtable_table_id;
  const view = leadsConfig.airtable_view;
  const fieldMap: FieldMap | undefined = leadsConfig.field_map;
  if (!baseId || !tableId) {
    return corsJson(
      {
        error:
          'Este cliente no tiene Airtable de leads configurado (base/tabla en clients_config.leads_config).',
      },
      400,
      METHODS
    );
  }

  // ── Leer todos los registros (Airtable pagina de 100 en 100) ───────────────
  try {
    const leads: Record<string, unknown>[] = [];
    let offset: string | null = null;
    do {
      const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`);
      url.searchParams.set('pageSize', '100');
      if (view) url.searchParams.set('view', view);
      if (offset) url.searchParams.set('offset', offset);

      const r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${airtableToken}` },
      });
      const text = await r.text();
      if (!r.ok) {
        console.error('Airtable list error:', r.status, text.substring(0, 500));
        return corsJson(
          {
            error: 'Airtable rechazó la lectura de leads',
            status: r.status,
            detail: text.substring(0, 500),
          },
          502,
          METHODS
        );
      }
      const data = JSON.parse(text);
      (data.records || []).forEach((rec: any) => {
        leads.push({ id: rec.id, ...applyFieldMap(rec.fields || {}, fieldMap) });
      });
      offset = data.offset || null;
    } while (offset);

    return corsJson({ leads }, 200, METHODS);
  } catch (error: any) {
    console.error('list leads error:', error.message, error.stack);
    return corsJson({ error: error.message, type: error.name }, 500, METHODS);
  }
}

export function OPTIONS() {
  return corsPreflight(METHODS);
}
