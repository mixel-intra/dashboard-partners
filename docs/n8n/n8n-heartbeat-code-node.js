// ============================================================
// n8n · Code node · LATIDO (heartbeat) — Salud de Canales Kommo
// ============================================================
// Pégalo en un nodo "Code" (modo: Run Once for All Items) CONECTADO
// DESPUÉS del trigger de Kommo (webhook "new_message").
// No usa Vercel: escribe directo a Supabase con la anon key (pública).
//
// AUTO-DETECTA la cuenta por el subdominio del payload (account[subdomain]),
// así puedes pegar el MISMO nodo en TODAS las cuentas sin editar nada.
// Si una cuenta no está en el mapa, usa SLUG_OVERRIDE (déjalo vacío salvo
// que esa cuenta no tenga subdominio mapeado).
// ------------------------------------------------------------

const SUPABASE_URL = 'https://zwghwruwxzttsofaezjp.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2h3cnV3eHp0dHNvZmFlempwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzY3ODMsImV4cCI6MjA4Njg1Mjc4M30.c-DeJa9h4EA_oaiZPLHh_NV2fKsLO75O62VaerobToI';

// Subdominio de Kommo -> slug en clients_config (auto-detección de cuenta).
// Sirve para cuentas con subdominio ÚNICO: pega el nodo idéntico y listo.
const SUBDOMAIN_MAP = {
    hotelnikche: 'hotel-nikche',
    santafedt: 'doubletree-santa-fe',
    hamptonvillahotel: 'hamptonvillahermosa',
    hamptoncarmenhotel: 'hamptoncarmen',
    hotelgardentuxtla: 'hilton-tuxtla',
    hotelgardengdl: 'garden-inn-gdl-airport',
    santafeghi: 'garden-inn-santa-fe',
    cefemex: 'cefemex',
    equipoedgarortiz: 'maspormarine',
    doubletreemazatlan2026: 'doubletree-mazatlan',
    hamptonmeridahotel: 'hamptonmerida',
    homewoodsantodomingo: 'homewood-suites-santo-domingo',
    holaroof107: 'roof-107',
    engelyucatan26: 'engelvolkers'
    // NOTA: cefemexcasaempeno NO va aquí porque ese Kommo lo comparten
    // Casa de Empeño y Logic Systems (cada uno con su PROPIO flujo n8n).
    // En cada flujo se fuerza el slug con SLUG_OVERRIDE (ver abajo).
};

// Forzar slug para cuentas que comparten subdominio de Kommo (1 flujo = 1 cuenta).
//   · Flujo de Casa de Empeño →  SLUG_OVERRIDE = 'casa-de-empeño'
//   · Flujo de Logic Systems  →  SLUG_OVERRIDE = 'logic-systems'
// Déjalo '' en las demás cuentas (se auto-detectan por subdominio).
const SLUG_OVERRIDE = '';

// origin de Kommo -> canal canónico
const ALIAS = {
    waba: 'whatsapp', wz: 'whatsapp', wa_lite: 'whatsapp', whatsapp: 'whatsapp',
    instagram_business: 'instagram', instagram: 'instagram',
    facebook: 'facebook', telegram: 'telegram', email: 'email',
    livechat: 'livechat', chat: 'livechat', telefonia: 'telefonia'
};

// BLINDADO: nunca rompe el flujo. Hace los writes como efecto secundario,
// se traga cualquier error, y SIEMPRE devuelve los items INTACTOS
// (return $input.all()) para no afectar a los nodos siguientes.
// Aun así, lo ideal es conectarlo como RAMA paralela de new_message.
const http = (opts) => this.helpers.httpRequest(opts);

try {
    for (const item of $input.all()) {
        const body = item.json.body || item.json || {};
        const sub = String(body['account[subdomain]'] || '').toLowerCase().trim();
        const slugs = SLUG_OVERRIDE ? [SLUG_OVERRIDE] : [].concat(SUBDOMAIN_MAP[sub] || []);
        const origin = String(body['message[add][0][origin]'] || '').toLowerCase().trim();
        const canal = ALIAS[origin] || null;
        if (!slugs.length || !canal) continue;

        const nowIso = new Date().toISOString();
        for (const slug of slugs) {
            try {
                await http({
                    method: 'POST',
                    url: `${SUPABASE_URL}/rest/v1/kommo_channel_heartbeats?on_conflict=account_slug,canal`,
                    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
                    body: { account_slug: slug, canal, ultima_senal: nowIso },
                    json: true
                });
            } catch (e) {}
            try {
                await http({
                    method: 'POST',
                    url: `${SUPABASE_URL}/rest/v1/kommo_channel_events`,
                    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                    body: { account_slug: slug, canal, ts: nowIso },
                    json: true
                });
            } catch (e) {}
        }
    }
} catch (e) {}

return $input.all();   // pasa los datos intactos al siguiente nodo (no rompe nada)
