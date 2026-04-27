// Migración one-shot: Airtable Roof 107 → Supabase Roof 107
//
// USO:
//   AIRTABLE_TOKEN=patXXX \
//   AIRTABLE_BASE=appgKyoRhii26nFvl \
//   AIRTABLE_TABLE=Leads \
//   SUPABASE_URL=https://kaybyeziadxkunlatrfh.supabase.co \
//   SUPABASE_SERVICE_KEY=eyJXXX \
//   node migrations/client-supabase/107-roof/migrate-airtable-to-supabase.js
//
// Idempotente: usa airtable_record_id como conflict key, puedes re-correr.
// Sin dependencias npm — usa fetch nativo (Node 22).

const {
    AIRTABLE_TOKEN,
    AIRTABLE_BASE,
    AIRTABLE_TABLE = 'Leads',
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
} = process.env;

if (!AIRTABLE_TOKEN || !AIRTABLE_BASE || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Faltan env vars. Revisa el header del archivo.');
    process.exit(1);
}

async function fetchAllAirtable() {
    const records = [];
    let offset;
    do {
        const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`);
        url.searchParams.set('pageSize', '100');
        if (offset) url.searchParams.set('offset', offset);

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
        });
        if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);

        const data = await res.json();
        records.push(...data.records);
        offset = data.offset;
        console.log(`  ${records.length} records leídos…`);
    } while (offset);
    return records;
}

function parseFecha(raw) {
    if (!raw) return null;
    const ms = Date.parse(raw);
    return isNaN(ms) ? null : new Date(ms).toISOString();
}

function mapEstado(raw) {
    const s = (raw || '').toLowerCase();
    if (s.includes('confirm')) return 'Confirmado';
    if (s.includes('rechaz')) return 'Rechazado';
    return 'Nuevo Lead';
}

async function upsertSupabase(rows) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/restaurant_reservations?on_conflict=airtable_record_id`,
        {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify(rows),
        }
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return res.json();
}

(async () => {
    console.log('Leyendo Airtable…');
    const records = await fetchAllAirtable();
    console.log(`Total: ${records.length} records\n`);

    const rows = records.map(r => ({
        airtable_record_id: r.id,
        nombre_cliente:     r.fields['Nombre Cliente'] || null,
        email:              r.fields['email'] || null,
        telefono:           r.fields['Telefono'] || null,
        tipo_evento:        r.fields['TipoEvento'] || null,
        pax:                r.fields['PAX'] || null,
        fecha_evento:       parseFecha(r.fields['FechaEvento']),
        detalles:           r.fields['Detalles'] || null,
        conversacion:       r.fields['Conversacion'] || null,
        estado:             mapEstado(r.fields['Estado']),
    }));

    console.log('Insertando en Supabase…');
    const result = await upsertSupabase(rows);
    console.log(`✅ ${result.length} rows migradas`);
})();
