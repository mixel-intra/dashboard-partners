// api/leads/conversaciones.js
// Conversaciones que atiende el agente de Logic Systems, para el Panel del Director
// (datos del reporte semanal: conversaciones por fuente y dentro/fuera de horario).
//
// UNIDAD = PERSONA: una fila por `session_id`, fechada con su PRIMER mensaje humano.
// El front la cuenta solo en el periodo de ese primer mensaje (si sigue escribiendo en
// semanas siguientes, no se vuelve a contar).
//
// FUENTE: se clasifica por el texto del primer mensaje (NO con leads.fuente_lead, que el
// agente guardó mal del 25 sep al 19 oct 2026). Mismas reglas que el reporte semanal
// (skill logic-reporte-semanal → references/consultas.md). Si Hillflare cambia un texto
// prellenado, actualiza clasificarFuente() Y el nodo "Clasificar fuente" del agente.
//
// ⚠️ ZONA HORARIA: n8n_chat_histories.created_at YA está en hora CDMX (timestamp sin
// zona, default now() AT TIME ZONE 'America/Mexico_City'). NO se convierte: se toma la
// hora literal del string. (En el mensual de septiembre se restaron 6 h de más por
// convertirla y el "fuera de horario" salió inflado.)
//
// PRIVACIDAD: el texto del mensaje se usa solo aquí para clasificar y NUNCA se devuelve
// (los de formulario traen nombre/correo/teléfono).
//
// USO:   GET /api/leads/conversaciones?client=logic-systems
//   →    { conversaciones: [ { session_id, f: 'YYYY-MM-DDTHH:mm:ss', fuente, dentro } ] }
//        fuente ∈ formulario | whatsapp | organico | correo | google | excluir
//
// VARIABLES DE ENTORNO: las mismas que api/leads/list.js (SUPABASE_URL, SUPABASE_SECRET_KEY).

const { createClient } = require('@supabase/supabase-js');

const CHAT_TABLE = process.env.CHAT_TABLE || 'n8n_chat_histories';
const PAGE_SIZE = 1000;

function sendCors(res) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

// Minúsculas y sin acentos (la ñ queda como n: "empeño" → "empeno").
function normTexto(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Clasificación por el primer mensaje humano. EL ORDEN IMPORTA (empeño se excluye primero).
function clasificarFuente(texto) {
    const c = normTexto(texto);
    if (/prenda|empen/.test(c))                          return 'excluir';   // campañas ajenas a Logic
    if (c.includes('informacion de cib'))                return 'whatsapp';  // Meta · WhatsApp (Hillflare)
    if (c.includes('formulario de solicitud de demo'))   return 'formulario';// Meta · Formulario (Hillflare)
    if (c.includes('correo masivo'))                     return 'correo';    // Correo masivo (Logic)
    if (c.includes('me interesa una demostracion'))      return 'google';    // Google Ads (Hillflare)
    return 'organico';
}

// Horario laboral: lunes a viernes de 8:00 a 18:30 (hora de pared CDMX, tal cual viene).
function esDentroDeHorario(wall) {
    const m = String(wall).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return false;
    const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();   // 0 = domingo
    const min = (+m[4]) * 60 + (+m[5]);
    return dow >= 1 && dow <= 5 && min >= 8 * 60 && min < 18 * 60 + 30;
}

module.exports = async function handler(req, res) {
    sendCors(res);

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

    const SUPABASE_URL        = process.env.SUPABASE_URL;
    const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
        return res.status(500).json({
            error: 'Falta la configuración de Supabase (SUPABASE_URL / SUPABASE_SECRET_KEY) en el entorno.'
        });
    }

    const clientSlug = (req.query && (req.query.client || req.query.slug)) || '';
    if (!clientSlug) return res.status(400).json({ error: 'client es requerido' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
        // Solo mensajes humanos, en orden cronológico: el primero que aparece por sesión
        // es su primer mensaje. Se pide solo el texto (no el JSON completo del mensaje).
        const primeros = new Map();
        for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await supabase
                .from(CHAT_TABLE)
                .select('id, session_id, created_at, texto:message->>content')
                .eq('message->>type', 'human')
                .order('created_at', { ascending: true })
                .order('id', { ascending: true })
                .range(from, from + PAGE_SIZE - 1);
            if (error) throw error;
            (data || []).forEach(r => { if (!primeros.has(r.session_id)) primeros.set(r.session_id, r); });
            if (!data || data.length < PAGE_SIZE) break;
        }

        const conversaciones = [...primeros.values()].map(r => ({
            session_id: r.session_id,
            f:          String(r.created_at).slice(0, 19),   // hora de pared CDMX, sin zona
            fuente:     clasificarFuente(r.texto),
            dentro:     esDentroDeHorario(r.created_at),
        }));
        return res.status(200).json({ conversaciones });
    } catch (error) {
        console.error('conversaciones (supabase) error:', error.message);
        return res.status(502).json({ error: 'No se pudieron leer las conversaciones: ' + (error.message || error) });
    }
};
