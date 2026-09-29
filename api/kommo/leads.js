// Leads desde Kommo con el token de larga duración, sin pasar por n8n.
//
// Por qué existe: el webhook de n8n de CEFEMEX Capital tardaba ~63 s para 180 días
// y se CAÍA con rangos mayores (502, y el servidor quedaba en 503 varios minutos).
// Pegándole directo a Kommo, la cuenta COMPLETA (6,772 leads) baja en ~17 s.
// Medido el 2026-09-28: leads 6.5 s + contactos 10.4 s, 61 peticiones, 0 errores.
//
// GET /api/kommo/leads?client=cefemex[&desde=<unix>&hasta=<unix>]
//   Sin desde/hasta trae toda la cuenta. El dashboard pide todo una vez y filtra
//   por fecha en el navegador, así cambiar de rango es instantáneo.
//
// Devuelve el MISMO formato que devolvía el webhook de n8n, para que el dashboard
// no note la diferencia (verificado lead por lead contra la salida de n8n).

// Kommo entrega 250 registros por página y admite ~7 peticiones por segundo por
// cuenta. Con 5 en paralelo no hubo ni un rechazo; con 8 ya aparecen.
const POR_PAGINA = 250;
const EN_PARALELO = 5;
const MAX_PAGINAS = 400;          // tope de seguridad: 100,000 leads
const CACHE_MS = 5 * 60 * 1000;   // respuesta reutilizable por instancia

// El token nunca sale del servidor. Cada cuenta declara sus ids de campo porque
// NO coinciden entre cuentas de Kommo (utm_source es 717914 en Capital y otro id
// en Casa de Empeño): copiarlos de una a otra da campos vacíos silenciosos.
const CUENTAS = {
    cefemex: {
        envToken: 'KOMMO_TOKEN_CEFEMEX',
        envSubdominio: 'KOMMO_SUBDOMAIN_CEFEMEX',
        subdominioPorDefecto: 'cefemex',
        campos: {
            utm_content: 717908,
            utm_medium: 717910,
            utm_campaign: 717912,
            utm_source: 717914,
            respuesta_ai: 3871571   // RespuestaCamila
        }
    }
};

const cache = new Map();   // clave → { expira, datos }

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

async function pedirJson(url, cabeceras, intento = 0) {
    const res = await fetch(url, { headers: cabeceras });
    // 429 = Kommo frenó la petición. Se reintenta con espera creciente; devolver
    // vacío cortaría el recorrido de páginas antes de tiempo y faltarían leads.
    if (res.status === 429 && intento < 3) {
        await esperar(1000 * (intento + 1));
        return pedirJson(url, cabeceras, intento + 1);
    }
    if (res.status === 204) return null;        // Kommo: sin resultados
    if (!res.ok) throw new Error(`Kommo ${res.status} en ${url.split('?')[0]}`);
    return res.json();
}

// Lanza las tareas de a `EN_PARALELO` para no pasarse del límite de Kommo.
async function enOleadas(tareas, tamano = EN_PARALELO) {
    const salida = [];
    for (let i = 0; i < tareas.length; i += tamano) {
        salida.push(...await Promise.all(tareas.slice(i, i + tamano).map(t => t())));
    }
    return salida;
}

// Nombre de cada etapa del embudo, para traducir status_id → texto legible.
async function leerEtapas(base, cabeceras) {
    const j = await pedirJson(`${base}/api/v4/leads/pipelines`, cabeceras);
    const nombres = {};
    for (const p of j?._embedded?.pipelines || []) {
        for (const s of p._embedded?.statuses || []) nombres[s.id] = s.name;
    }
    return nombres;
}

// Recorre las páginas de leads. Las páginas se piden en oleadas, así que el final
// se detecta cuando una página viene incompleta (o vacía).
async function leerLeads(base, cabeceras, desde, hasta) {
    const url = (pagina) => {
        const q = new URLSearchParams({ limit: String(POR_PAGINA), page: String(pagina), with: 'contacts' });
        if (desde) q.set('filter[created_at][from]', String(desde));
        if (hasta) q.set('filter[created_at][to]', String(hasta));
        return `${base}/api/v4/leads?${q}`;
    };

    const todos = [];
    let pagina = 1, seguir = true;
    while (seguir && pagina <= MAX_PAGINAS) {
        const paginas = [];
        for (let i = 0; i < EN_PARALELO; i++) paginas.push(pagina + i);
        const res = await Promise.all(paginas.map(p => pedirJson(url(p), cabeceras)));
        for (const j of res) {
            const leads = j?._embedded?.leads || [];
            todos.push(...leads);
            if (leads.length < POR_PAGINA) seguir = false;
        }
        pagina += EN_PARALELO;
    }
    return todos;
}

// Kommo NO manda el nombre del contacto junto con el lead, solo su id: hay que
// pedirlos aparte. Es el 60% del tiempo total de la consulta.
async function leerContactos(base, cabeceras, ids) {
    const lotes = [];
    for (let i = 0; i < ids.length; i += 250) lotes.push(ids.slice(i, i + 250));

    const respuestas = await enOleadas(lotes.map(lote => async () => {
        const qs = lote.map(id => `filter[id][]=${id}`).join('&');
        const j = await pedirJson(`${base}/api/v4/contacts?limit=250&${qs}`, cabeceras);
        return j?._embedded?.contacts || [];
    }));

    const porId = {};
    for (const c of respuestas.flat()) {
        const tel = (c.custom_fields_values || []).find(f => f.field_code === 'PHONE');
        porId[c.id] = { nombre: c.name || null, telefono: tel?.values?.[0]?.value || null };
    }
    return porId;
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const slug = url.searchParams.get('client') || '';
    const cuenta = CUENTAS[slug];
    if (!cuenta) {
        return res.status(400).json({ error: `Cliente no soportado: "${slug}"` });
    }

    const token = process.env[cuenta.envToken];
    if (!token) {
        return res.status(500).json({ error: `Falta la variable de entorno ${cuenta.envToken}` });
    }
    const subdominio = process.env[cuenta.envSubdominio] || cuenta.subdominioPorDefecto;
    const base = `https://${subdominio}.kommo.com`;
    const cabeceras = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

    const desde = Number(url.searchParams.get('desde')) || null;
    const hasta = Number(url.searchParams.get('hasta')) || null;

    const clave = `${slug}|${desde || 0}|${hasta || 0}`;
    const guardado = cache.get(clave);
    if (guardado && guardado.expira > Date.now() && !url.searchParams.has('fresco')) {
        res.setHeader('X-Cache', 'hit');
        return res.status(200).json(guardado.datos);
    }

    try {
        const t0 = Date.now();
        const [etapas, leads] = await Promise.all([
            leerEtapas(base, cabeceras),
            leerLeads(base, cabeceras, desde, hasta)
        ]);

        const idsContacto = [...new Set(
            leads.flatMap(l => (l._embedded?.contacts || []).map(c => c.id)).filter(Boolean)
        )];
        const contactos = await leerContactos(base, cabeceras, idsContacto);

        const valor = (campos, id) => {
            const f = (campos || []).find(c => c.field_id === id);
            const v = f?.values?.[0]?.value;
            return v === undefined || v === '' ? null : v;
        };

        const salida = leads.map(l => {
            const campos = l.custom_fields_values || [];
            const idContacto = l._embedded?.contacts?.[0]?.id || null;
            const contacto = idContacto ? contactos[idContacto] : null;
            return {
                id_lead: l.id,
                id_contacto: idContacto,
                nombre: contacto?.nombre || l.name,
                telefono: contacto?.telefono || null,
                precio: l.price,
                estatus: etapas[l.status_id] || `ID: ${l.status_id}`,
                estatus_id: l.status_id,
                tags: (l._embedded?.tags || []).map(t => t.name),
                // Mismo formato que mandaba n8n; parseCustomDate del dashboard lo lee tal cual.
                fecha_creacion: new Date(l.created_at * 1000)
                    .toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
                // Fecha en que el lead se cerró (Ganado o Perdido), unix en segundos.
                // Coincide exactamente con el "cerrado_en" que calcula el reporte de
                // Métricas a partir del historial de etapas (verificado en los 18
                // ganados del histórico). La tarjeta "Ventas" cuenta por esta fecha.
                cerrado_ts: l.closed_at || null,
                utm_medium: valor(campos, cuenta.campos.utm_medium),
                utm_campaign: valor(campos, cuenta.campos.utm_campaign),
                utm_content: valor(campos, cuenta.campos.utm_content),
                utm_source: valor(campos, cuenta.campos.utm_source),
                respuesta_ai: valor(campos, cuenta.campos.respuesta_ai)
            };
        });

        cache.set(clave, { expira: Date.now() + CACHE_MS, datos: salida });
        res.setHeader('X-Cache', 'miss');
        res.setHeader('X-Duracion-Ms', String(Date.now() - t0));
        return res.status(200).json(salida);
    } catch (e) {
        console.error('[kommo/leads]', e.message);
        return res.status(502).json({ error: 'No se pudo consultar Kommo', detalle: e.message });
    }
};
