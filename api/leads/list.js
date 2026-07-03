// api/leads/list.js
// Lee los leads de un cliente desde Airtable y los devuelve como JSON al frontend.
// Sigue el mismo patrón que api/reservations/create.js: la base/tabla se resuelven
// server-side desde clients_config (para que el frontend no pueda apuntar a una base
// arbitraria) y se lee con el token de la variable de entorno AIRTABLE_TOKEN (Vercel).
//
// Hoy la fuente de leads del Panel del Director (logic-systems) es Airtable. Cuando se
// migre a Supabase, el frontend dejará de llamar aquí y consultará clientSupabase.
//
// USO (desde el dashboard):
//   GET /api/leads/list?client=<slug>
//   → { leads: [ { id, ...campos } ] }
//
// CONFIGURACIÓN (en clients_config.leads_config, JSON):
//   {
//     "airtable_base_id":  "appXXXXXXXXXXXXXX",
//     "airtable_table_id": "Leads",              // nombre o id de la tabla
//     "airtable_view":     "Grid view",          // opcional
//     "field_map": {                             // opcional: campo Airtable → clave que usa director.js
//        "nombre": "Nombre", "telefono": "Teléfono", "estatus": "Etapa",
//        "estatus_id": "Etapa ID", "fecha_creacion": "Creado",
//        "utm_campaign": "Sistema", "utm_medium": "Fuente"
//     }
//   }
// Los campos crudos de Airtable se devuelven tal cual; field_map SOLO agrega alias con
// las claves canónicas que espera director.js (F.*), sin borrar los originales.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = process.env.ADMIN_SUPABASE_URL || process.env.SUPABASE_URL || 'https://zwghwruwxzttsofaezjp.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2h3cnV3eHp0dHNvZmFlempwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzY3ODMsImV4cCI6MjA4Njg1Mjc4M30.c-DeJa9h4EA_oaiZPLHh_NV2fKsLO75O62VaerobToI';
const AIRTABLE_TOKEN    = process.env.AIRTABLE_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function sendCors(res) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

// Aplica el field_map: agrega claves canónicas a partir de los campos de Airtable.
function applyFieldMap(fields, fieldMap) {
    if (!fieldMap) return fields;
    const out = { ...fields };
    for (const canonical in fieldMap) {
        const airtableField = fieldMap[canonical];
        if (airtableField && fields[airtableField] !== undefined && out[canonical] === undefined) {
            out[canonical] = fields[airtableField];
        }
    }
    return out;
}

module.exports = async function handler(req, res) {
    sendCors(res);

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

    if (!AIRTABLE_TOKEN) {
        return res.status(500).json({ error: 'Falta AIRTABLE_TOKEN en el entorno. Configúralo en Vercel → Settings → Environment Variables.' });
    }

    const clientSlug = (req.query && (req.query.client || req.query.slug)) || '';
    if (!clientSlug) return res.status(400).json({ error: 'client es requerido' });

    // ── Resolver base/tabla de Airtable del cliente (server-side) ──────────────
    let leadsConfig;
    try {
        const { data, error } = await supabase
            .from('clients_config')
            .select('*')
            .eq('id_slug', clientSlug)
            .single();
        if (error) throw error;
        leadsConfig = (data && data.leads_config) || {};
    } catch (e) {
        return res.status(400).json({ error: 'No se pudo leer la configuración del cliente: ' + (e.message || e) });
    }

    const baseId  = leadsConfig.airtable_base_id;
    const tableId = leadsConfig.airtable_table_id;
    const view    = leadsConfig.airtable_view;
    const fieldMap = leadsConfig.field_map;
    if (!baseId || !tableId) {
        return res.status(400).json({ error: 'Este cliente no tiene Airtable de leads configurado (base/tabla en clients_config.leads_config).' });
    }

    // ── Leer todos los registros (Airtable pagina de 100 en 100) ───────────────
    try {
        const leads = [];
        let offset = null;
        do {
            const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`);
            url.searchParams.set('pageSize', '100');
            if (view)   url.searchParams.set('view', view);
            if (offset) url.searchParams.set('offset', offset);

            const r = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
            });
            const text = await r.text();
            if (!r.ok) {
                console.error('Airtable list error:', r.status, text.substring(0, 500));
                return res.status(502).json({ error: 'Airtable rechazó la lectura de leads', status: r.status, detail: text.substring(0, 500) });
            }
            const data = JSON.parse(text);
            (data.records || []).forEach(rec => {
                leads.push({ id: rec.id, ...applyFieldMap(rec.fields || {}, fieldMap) });
            });
            offset = data.offset || null;
        } while (offset);

        return res.status(200).json({ leads });
    } catch (error) {
        console.error('list leads error:', error.message, error.stack);
        return res.status(500).json({ error: error.message, type: error.name });
    }
};
