// api/reservations/create.js
// Crea una reserva nueva escribiéndola directo en la tabla de Airtable del cliente.
// Las reservas de restaurante viven en Airtable (no en Supabase). La base/tabla se
// resuelven server-side desde clients_config (para que el frontend no pueda apuntar
// a una base arbitraria) y se escribe con un token guardado en la variable de
// entorno AIRTABLE_TOKEN (configurada en Vercel).
//
// USO (desde el dashboard):
//   POST /api/reservations/create
//   Body JSON: { clientSlug, nombre, telefono, email, tipoEvento, pax,
//                fechaEvento (YYYY-MM-DD), horaEvento (HH:MM), detalles }

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = process.env.ADMIN_SUPABASE_URL || process.env.SUPABASE_URL || 'https://zwghwruwxzttsofaezjp.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2h3cnV3eHp0dHNvZmFlempwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzY3ODMsImV4cCI6MjA4Njg1Mjc4M30.c-DeJa9h4EA_oaiZPLHh_NV2fKsLO75O62VaerobToI';
const AIRTABLE_TOKEN    = process.env.AIRTABLE_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function sendCors(res) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

module.exports = async function handler(req, res) {
    sendCors(res);

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    if (!AIRTABLE_TOKEN) {
        return res.status(500).json({ error: 'Falta AIRTABLE_TOKEN en el entorno. Configúralo en Vercel → Settings → Environment Variables.' });
    }

    const body = req.body || {};
    const clientSlug = body.clientSlug || body.client_id || body.client;
    const nombre = (body.nombre || '').toString().trim();

    if (!clientSlug) return res.status(400).json({ error: 'clientSlug es requerido' });
    if (!nombre)     return res.status(400).json({ error: 'El nombre del cliente es requerido' });

    // ── Resolver base/tabla de Airtable del cliente (server-side) ──────────────
    let restaurantConfig;
    try {
        const { data, error } = await supabase
            .from('clients_config')
            .select('restaurant_config')
            .eq('id_slug', clientSlug)
            .single();
        if (error) throw error;
        restaurantConfig = (data && data.restaurant_config) || {};
    } catch (e) {
        return res.status(400).json({ error: 'No se pudo leer la configuración del cliente: ' + (e.message || e) });
    }

    const baseId  = restaurantConfig.airtable_base_id;
    const tableId = restaurantConfig.airtable_table_id;
    if (!baseId || !tableId) {
        return res.status(400).json({ error: 'Este cliente no tiene Airtable configurado (base/tabla).' });
    }

    // ── Construir los campos (omitiendo vacíos) ────────────────────────────────
    const pax = parseInt(body.pax, 10);
    const fields = { 'Nombre Cliente': nombre, 'Estado': body.estado || 'Nuevo Lead' };
    if (body.telefono)   fields['Telefono']    = String(body.telefono).trim();
    if (body.email)      fields['email']       = String(body.email).trim();
    if (body.tipoEvento) fields['TipoEvento']  = String(body.tipoEvento).trim();
    if (Number.isFinite(pax) && pax > 0) fields['PAX'] = pax;
    if (body.fechaEvento) fields['FechaEvento'] = String(body.fechaEvento).trim();
    if (body.horaEvento)  fields['HoraEvento']  = String(body.horaEvento).trim();
    if (body.detalles)   fields['Detalles']    = String(body.detalles).trim();

    // ── Crear el registro en Airtable ──────────────────────────────────────────
    try {
        const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`;
        const r = await fetch(airtableUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                'Content-Type': 'application/json'
            },
            // typecast: Airtable coacciona tipos (fecha/número) a partir de strings.
            body: JSON.stringify({ records: [{ fields }], typecast: true })
        });
        const text = await r.text();

        if (!r.ok) {
            console.error('Airtable create error:', r.status, text.substring(0, 500));
            return res.status(502).json({
                error: 'Airtable rechazó la creación de la reserva',
                status: r.status,
                detail: text.substring(0, 500)
            });
        }

        const data = JSON.parse(text);
        return res.status(200).json({ ok: true, record: (data.records && data.records[0]) || null });
    } catch (error) {
        console.error('create reservation error:', error.message, error.stack);
        return res.status(500).json({ error: error.message, type: error.name });
    }
};
