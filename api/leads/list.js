// api/leads/list.js
// Lee los leads del Panel del Director (logic-systems) desde su Supabase per-cliente
// y los devuelve como JSON al frontend, ya normalizados a las claves que espera
// src/director.js.
//
// FUENTE DE DATOS: los leads los genera y califica el agente de IA ("Camila") y se
// escriben en la tabla `leads` de la Supabase per-cliente de Logic Systems. Cada lead
// que llega aquí ya trae una demo agendada en el calendario real (Outlook):
// `accion_calendario`, `demo_inicio` y `event_id`. (Antes esto se leía de Airtable;
// esa ruta se retiró — ver historial de git.)
//
// SEGURIDAD: la conexión es 100% server-side con la SERVICE KEY (SUPABASE_SECRET_KEY),
// que NUNCA se expone al navegador. La URL/keys viven en variables de entorno
// (Vercel en prod; .env.local en local, cargado por server.js).
//
// USO (desde el dashboard):
//   GET /api/leads/list?client=logic-systems
//   → { leads: [ { id, nombre, telefono, fecha_creacion, utm_campaign, utm_medium, ... } ] }
//
// VARIABLES DE ENTORNO:
//   SUPABASE_URL           URL del proyecto Supabase per-cliente de Logic Systems.
//   SUPABASE_SECRET_KEY    Service key (sb_secret_…). Bypassa RLS, solo server-side.
//   LEADS_TABLE            (opcional) nombre de la tabla; por defecto 'leads'.

const { createClient } = require('@supabase/supabase-js');

const LEADS_TABLE = process.env.LEADS_TABLE || 'leads';
const PAGE_SIZE = 1000;

function sendCors(res) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

// Mapea una fila cruda de Supabase a las claves canónicas que consume director.js,
// conservando además los campos originales (empresa, correo, situacion, urgencia,
// accion_calendario, demo_inicio, event_id, contexto, …) por si el panel los usa.
function mapLead(row) {
    return {
        ...row,
        id:             row.id,
        nombre:         row.nombre,
        telefono:       row.telefono_contacto || row.telefono || '',
        fecha_creacion: row.created_at,
        // Dimensiones de marketing: director.js las normaliza con normSistema()/normFuente().
        // Se exponen como utm_* (además de los originales) para robustez.
        // NOTA: la columna del canal de contacto se renombró de `fuente` a `contacto`.
        // El componente "Contacto" lee `contacto`; el componente "Fuente" lee `fuente_lead`
        // (ambas llegan crudas vía el spread `...row`, categorías dinámicas / fijas en el front).
        utm_campaign:   row.sistema,
        utm_medium:     row.contacto || row.fuente,
    };
}

module.exports = async function handler(req, res) {
    sendCors(res);

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

    const SUPABASE_URL        = process.env.SUPABASE_URL;
    const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
        return res.status(500).json({
            error: 'Falta la configuración de Supabase (SUPABASE_URL / SUPABASE_SECRET_KEY) en el entorno. ' +
                   'Configúralas en Vercel → Settings → Environment Variables (o en .env.local para local).'
        });
    }

    const clientSlug = (req.query && (req.query.client || req.query.slug)) || '';
    if (!clientSlug) return res.status(400).json({ error: 'client es requerido' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // Lee todas las filas paginando (Supabase corta en 1000 por consulta por defecto).
    try {
        const leads = [];
        for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await supabase
                .from(LEADS_TABLE)
                .select('*')
                .order('created_at', { ascending: false })
                .range(from, from + PAGE_SIZE - 1);
            if (error) throw error;
            (data || []).forEach(row => leads.push(mapLead(row)));
            if (!data || data.length < PAGE_SIZE) break;
        }
        return res.status(200).json({ leads });
    } catch (error) {
        console.error('list leads (supabase) error:', error.message);
        return res.status(502).json({ error: 'No se pudieron leer los leads de Supabase: ' + (error.message || error) });
    }
};
