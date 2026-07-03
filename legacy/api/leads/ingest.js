// api/leads/ingest.js
// Endpoint que n8n llama cuando un lead pasa a etapa calificada.
// Persiste el payload enriquecido en qualified_leads para que la URL
// /lead?id=<lead_id> renderice sin depender de la disponibilidad del webhook.
//
// USO desde n8n (HTTP Request node):
//   POST https://reporteintra.vercel.app/api/leads/ingest
//   Headers:
//     Authorization: Bearer <LEADS_INGEST_SECRET>
//     Content-Type:  application/json
//   Body JSON:
//     {
//       "client_id": "casa-de-empeño",
//       "lead_id":   "{{ $json.lead_id }}",
//       "payload": {
//         "nombre":              "{{ $json.cliente_nombre }}",
//         "telefono":            "{{ $json.cliente_tel }}",
//         "fecha_creacion":      "{{ $json.fecha }}",
//         "prenda_tipo":         "{{ $json.tipo_prenda }}",
//         "prenda_quilataje":    "{{ $json.quilataje }}",
//         "prenda_estado":       "{{ $json.estado }}",
//         "prenda_peso":         "{{ $json.peso }}",
//         "precio":              "{{ $json.monto }}",
//         "cliente_ubicacion":   "{{ $json.ubicacion }}",
//         "sucursal_sugerida":   "{{ $json.sucursal }}",
//         "sucursal_direccion":  "{{ $json.direccion }}",
//         "google_maps_url":     "{{ $json.maps_url }}",
//         "dia_visita":          "{{ $json.dia_visita }}",
//         "hora_visita":         "{{ $json.hora_visita }}"
//       },
//       "sucursal": "{{ $json.sucursal }}",
//       "estatus":  "{{ $json.estatus }}"
//     }

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = process.env.SUPABASE_URL      || 'https://zwghwruwxzttsofaezjp.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2h3cnV3eHp0dHNvZmFlempwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzY3ODMsImV4cCI6MjA4Njg1Mjc4M30.c-DeJa9h4EA_oaiZPLHh_NV2fKsLO75O62VaerobToI';
const INGEST_SECRET     = process.env.LEADS_INGEST_SECRET || 'cefemex-takin-shared-secret-change-me';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function sendCors(res) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

module.exports = async function handler(req, res) {
    sendCors(res);

    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'method not allowed' });
    }

    // ── Auth con secret compartido ─────────────────────────────
    const auth  = req.headers['authorization'] || req.headers['Authorization'] || '';
    const token = String(auth).replace(/^Bearer\s+/i, '').trim();
    if (!token || token !== INGEST_SECRET) {
        return res.status(401).json({ error: 'unauthorized' });
    }

    // ── Body ───────────────────────────────────────────────────
    const body = req.body || {};
    const client_id = body.client_id || body.client || body.entorno;
    const lead_id   = body.lead_id   || body.id     || body.leadId;
    const payload   = body.payload   || body.data   || {};

    if (!client_id || !lead_id) {
        return res.status(400).json({ error: 'client_id y lead_id son requeridos' });
    }
    if (typeof payload !== 'object' || payload === null) {
        return res.status(400).json({ error: 'payload debe ser un objeto JSON' });
    }

    // Permite override explícito de sucursal/estatus; si no, los extrae del payload.
    const sucursal = body.sucursal != null ? String(body.sucursal)
                      : (payload.sucursal_sugerida || payload.sucursal || null);
    const estatus  = body.estatus  != null ? String(body.estatus)
                      : (payload.estatus || payload.estado || null);

    const row = {
        lead_id:    String(lead_id),
        client_id:  String(client_id),
        payload:    payload,
        sucursal:   sucursal,
        estatus:    estatus,
        updated_at: new Date().toISOString()
    };

    try {
        const { error } = await supabase
            .from('qualified_leads')
            .upsert(row, { onConflict: 'lead_id' });

        if (error) {
            console.error('[leads-ingest] supabase error:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({
            ok: true,
            lead_id:  row.lead_id,
            share_url: `https://reporteintra.vercel.app/lead?id=${encodeURIComponent(row.lead_id)}`
        });
    } catch (err) {
        console.error('[leads-ingest] unexpected:', err);
        return res.status(500).json({ error: err.message || 'unexpected error' });
    }
};
