// ============================================================
// src/director.js — Panel del Director General (Logic Systems)
// ============================================================
// Dashboard EXCLUSIVO del cliente `logic-systems`. Vive dentro del shell normal
// de la app (sidebar + topbar de director.html) y reutiliza el mismo stack de datos:
//   · config.js  → window.supabase + clients_config
//   · auth.js    → sesión (getSession)
//   · /api/leads/list → trae los leads desde la Supabase per-cliente (server-side)
//   · /api/leads/conversaciones → una conversación por persona (primer mensaje humano
//     de n8n_chat_histories), ya clasificada por fuente y dentro/fuera de horario.
//     Alimenta "Conversaciones atendidas", la tarjeta "Fuera de horario" y "Fuente".
//
// MODELO DE DATOS REAL (tabla `leads` en Supabase, generada por el agente "Camila").
// Cada lead que llega YA está calificado y con demo agendada en el calendario real
// (Outlook). Campos: nombre, empresa, correo, telefono_contacto, tipo_figura, rol,
// situacion, motivo_interes, urgencia, fuente, sistema, accion_calendario,
// demo_inicio, event_id, contexto, created_at.
// El endpoint los normaliza a claves canónicas (telefono, fecha_creacion, utm_medium
// ← fuente, utm_campaign ← sistema) conservando los originales.
//
// ⚠️ MAPEO: todo lead→panel está centralizado en `F` (campos) y en los predicados de
// calificación (tieneDemo/esCalificado/…). Ajústalos ahí si el esquema cambia.
// Los predicados soportan además el modelo viejo por estatus_id (modo demo / Kommo).
// ============================================================

const SLUG = 'logic-systems';

// Webhook de n8n que devuelve los eventos del calendario de Outlook (Microsoft Graph
// calendarView) para un rango de fechas. Fuente del CALENDARIO de demos. Requiere
// ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD. Devuelve el JSON crudo de Graph ({ value: [...] });
// mapEvento() lo normaliza. Se consume vía /api/proxy (CORS).
const EVENTOS_WEBHOOK = 'https://n8n.srv1436923.hstgr.cloud/webhook/eventos-calendario';

// --- Campos del lead -----------------------------------------
const F = {
    nombre:   l => firstNonEmpty(l.nombre, l.contacto, l.cliente) || 'Sin nombre',
    telefono: l => firstNonEmpty(l.telefono_contacto, l.telefono, l.phone, l.celular) || '',
    estado:   l => (firstNonEmpty(l.estatus, l.estado, l.stage) || '').toString(),
    estadoId: l => Number(firstNonEmpty(l.estatus_id, l.stage_id)) || null,
    precio:   l => Number(firstNonEmpty(l.precio, l.monto, l.valor)) || 0,
    // Cuándo se agendó la demo, en hora de pared CDMX (created_cdmx lo calcula el endpoint;
    // created_at es UTC). Fallback al parseo viejo para el modo demo / datos legacy.
    fecha:    l => l.created_cdmx ? (parseWall(l.created_cdmx) || {}).date || null
                                  : parseFecha(firstNonEmpty(l.fecha_creacion, l.fecha, l.created_at)),
    // Dimensiones de marketing (UTM de Kommo), normalizadas a las dimensiones fijas del negocio.
    // "Contacto": el canal por el que llegó el lead → 4 canales fijos. La columna que
    // alimenta esta dimensión se renombró de `fuente` a `contacto` en la tabla `leads`.
    fuente:   l => normFuente(l)  || 'Sin dato',
    sistema:  l => normSistema(l) || 'Otro',
    campana:  l => normSistema(l) || 'Otro',   // alias histórico: en Logic Systems "campaña" ES el sistema
    respuesta: l => firstNonEmpty(l.respuesta_ai, l.ultimo_mensaje) || '',
};

// --- Dimensiones fijas del negocio de Logic Systems ----------
// La empresa vende demos de 4 sistemas; cada lead pide uno de ellos (chips "Sistema").
const SISTEMAS = ['CIB Financiera', 'e-SIGeN', 'CIB Casa de Empeño', 'e-SIGeN PLD', 'KonektaPUI'];
// Canales de mensajería por los que escribe el lead (columna `contacto`, filtro "Canal").
// El agente guarda el `origin` que manda Kommo en cada mensaje, normalizado a
// whatsapp / facebook (Messenger) / instagram. "Google" no es un canal de mensajería
// (se confundía con Google Ads), por eso ya no aparece.
const FUENTES  = ['WhatsApp', 'Messenger', 'Instagram'];
// Fuentes de la conversación, clasificadas por el TEXTO del primer mensaje en
// api/leads/conversaciones.js (no con leads.fuente_lead, que se guardó mal). Orden fijo;
// ninguna se oculta aunque venga en 0 (Edel necesita ver Google Ads y Correo en cero).
const FUENTES_CONV = [
    { key: 'formulario', label: 'Meta · Formulario', opera: 'Hillflare' },
    { key: 'whatsapp',   label: 'Meta · WhatsApp',   opera: 'Hillflare' },
    { key: 'organico',   label: 'Orgánico',          opera: 'Redes y directo' },
    { key: 'correo',     label: 'Correo masivo',     opera: 'Logic' },
    { key: 'google',     label: 'Google Ads',        opera: 'Hillflare' },
];
const FUENTE_LABEL = Object.fromEntries(FUENTES_CONV.map(f => [f.key, f.label]));
// Dentro / fuera de horario: dos pasos de la misma rampa azul (validados con la skill
// dataviz, modo ordinal: el claro pasa 2:1 contra la tarjeta blanca). Fuera = el dato
// que importa (cobertura del agente) → tono de marca.
const C_DENTRO = '#86b6ef';
const C_FUERA  = '#0A6CFF';

// Paleta categórica por sistema (validada con la skill dataviz: banda de luminosidad,
// chroma, y separación CVD ΔE 47 ≫ 12). Colorea los eventos del calendario; la
// identidad no depende solo del color (cada evento lleva etiqueta + hay leyenda).
const SIS_COLOR = {
    'CIB Financiera':     '#2a78d6', // azul
    'e-SIGeN':            '#1baf7a', // aqua
    'CIB Casa de Empeño': '#eda100', // ámbar
    'e-SIGeN PLD':        '#4a3aa7', // violeta
    'KonektaPUI':         '#d6457a', // rosa
};
function sisColor(l) { return SIS_COLOR[F.campana(l)] || '#86868B'; }

// Normaliza el valor crudo del lead (utm_campaign) a uno de los 5 sistemas fijos, o null si no cae.
// Ajusta los patrones cuando confirmes cómo llega el dato real desde Kommo.
function normSistema(l) {
    const s = (firstNonEmpty(l.utm_campaign, l.sistema, l.campana, l.campaign) || '').toString().toLowerCase();
    if (/kon[ae][ck]ta|kpui/.test(s))      return 'KonektaPUI';         // "KonektaPUI"/"KonectaPui"
    if (/empe[ñn]o|casa.?de.?emp/.test(s)) return 'CIB Casa de Empeño'; // antes que "cib"
    if (/pld/.test(s))                     return 'e-SIGeN PLD';        // antes que "sigen"
    if (/e.?sigen|sigen/.test(s))          return 'e-SIGeN';
    if (/financiera|cib/.test(s))          return 'CIB Financiera';
    return null;
}
// Normaliza el canal de contacto del lead a uno de los canales fijos, o null si no hay dato.
// Lee la columna `contacto`; acepta también el `origin` crudo de Kommo (waba, facebook,
// instagram) y los fallbacks legacy (utm_medium/utm_source/fuente/canal) del modo demo.
function normFuente(l) {
    const s = (firstNonEmpty(l.contacto, l.utm_medium, l.utm_source, l.fuente, l.canal) || '').toString().toLowerCase();
    if (/whats|wpp|waba|amocrmwa|\bwa\b/.test(s))   return 'WhatsApp';
    if (/insta|\big\b|ig[_-]/.test(s))              return 'Instagram';
    if (/face|messenger|\bfb\b|fb[_-]/.test(s))     return 'Messenger';
    return null;
}

// --- Señales de calificación / demo --------------------------
// MODELO ACTUAL (Supabase): cada lead trae accion_calendario + demo_inicio (calendario
// real de Outlook) y urgencia. MODELO VIEJO (modo demo / Kommo): estatus_id + estatus.
// Los predicados soportan ambos: si hay estatus_id se usa el pipeline de Kommo; si no,
// se derivan de accion_calendario / demo_inicio / urgencia.
const ST = {
    RECHAZADO:     100538408,  // "rechazado" — el agente descartó (sin perfil / sin garantía)
    ATENCION:      100538416,  // "atencion personalizada" — pasa a asesor humano (lead caliente)
    SEGUIMIENTO:   100605424,  // "Seguimiento CAMILA" — el agente sigue nutriendo
    SIN_RESPUESTA: 100781696,  // "SIN RESPUESTA" — el lead no contestó
};
function accionCal(l) { return (firstNonEmpty(l.accion_calendario, l.accion) || '').toString().toLowerCase(); }
// Demo agendada = accion_calendario contiene "agendada" ("agendada" / "Demo agendada").
// Misma regla que el reporte semanal (ilike '%agendada%').
function tieneDemo(l) { return /agendada/.test(accionCal(l)); }
function esDescartado(l)  { const id = F.estadoId(l); if (id) return id === ST.RECHAZADO;     return /cancel|descart|rechaz/.test(accionCal(l)); }
function esSinRespuesta(l){ const id = F.estadoId(l); if (id) return id === ST.SIN_RESPUESTA; return /sin.?respuesta|no.?contest/.test(accionCal(l)); }
function esCalificado(l)  { const id = F.estadoId(l); if (id) return (id === ST.ATENCION || id === ST.SEGUIMIENTO); return tieneDemo(l); }
function esAtencion(l)    { const id = F.estadoId(l); if (id) return id === ST.ATENCION;       return /alta|urgente/.test((firstNonEmpty(l.urgencia) || '').toString().toLowerCase()); }
function conRespuesta(l)  { return !esSinRespuesta(l); }

// ============================================================
// ESTADO
// ============================================================
const S = {
    config: {},
    leads: [],
    conversaciones: [],       // 1 por persona: { session_id, f (hora CDMX), fuente, dentro }
    eventos: [],              // eventos de Outlook (Graph) → calendario de demos
    period: 'semana',         // semana | mes | hoy | 7d | 30d | todo
    offset: -1,               // semana/mes: 0 = el actual, -1 = el anterior… (abre en la semana pasada)
    campanaFilter: null,
    fuenteFilter: null,       // filtro "Canal de mensajería" (columna contacto, 4 fijos)
    calMonth: null,           // Date del 1er día del mes mostrado en el calendario de agenda
    calSelKey: null,          // día seleccionado en el calendario ('año-mes-día', mes 0-based)
};
// Filtros de periodo. `type:'week'` = semana lunes–domingo y `type:'month'` = mes
// calendario, navegables con ‹ › (S.offset); `days` = ventana móvil que termina hoy; sin
// `days` ni `type` = todo el tiempo. El reporte semanal de Edel sale de "Semana".
const PERIODS = [
    { key: 'semana', label: 'Semana (lun–dom)', type: 'week',  defOffset: -1 },
    { key: 'mes',    label: 'Mes calendario',   type: 'month', defOffset: 0 },
    { key: 'hoy',    label: 'Hoy',              days: 1 },
    { key: '7d',     label: 'Últimos 7 días',   days: 7 },
    { key: '30d',    label: 'Últimos 30 días',  days: 30 },
    { key: 'todo',   label: 'Todo el tiempo' },
];

// ============================================================
// UTILIDADES
// ============================================================
function firstNonEmpty(...vals) {
    for (const v of vals) if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    return null;
}
function parseFecha(str) {
    if (!str) return null;
    if (str instanceof Date) return isNaN(str) ? null : str;
    // ISO 8601 (Supabase, ej. "2026-07-06T01:08:13.772066+00:00"): parseo nativo.
    // Importante hacerlo ANTES del limpiado de abajo, que elimina puntos ("p.m.") y
    // corrompería la fracción de segundos del ISO.
    if (/^\d{4}-\d{2}-\d{2}T/.test(String(str))) { const iso = new Date(str); return isNaN(iso) ? null : iso; }
    try {
        const cleaned = String(str).replace(/\./g, '').replace(/p\s*m/i, 'PM').replace(/a\s*m/i, 'AM');
        const datePart = cleaned.split(',')[0].trim();
        const [d, m, y] = datePart.split(/[\/\-]/).map(Number);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, (m || 1) - 1, d);
        const nat = new Date(cleaned);
        return isNaN(nat) ? null : nat;
    } catch { return null; }
}
// Extrae "HH:MM" de un string de fecha. Soporta el formato legacy con a.m./p.m.
// ("30/6/2026, 7:18:57 p.m.") y el ISO de Supabase ("2026-07-03T13:00:00+00:00",
// del que toma la hora literal, sin convertir zona horaria).
function parseHora(str) {
    if (!str) return '';
    const m = String(str).match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\s*\.?\s*m/i);
    if (m) {
        let h = Number(m[1]); const min = m[2]; const pm = /p/i.test(m[3]);
        if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0;
        return String(h).padStart(2, '0') + ':' + min;
    }
    const iso = String(str).match(/T(\d{2}):(\d{2})/);
    if (iso) return iso[1] + ':' + iso[2];
    return '';
}
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtInt(n) { return (Math.round(n) || 0).toLocaleString('es-MX'); }
function pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }
function deltaPct(cur, prev) { return prev <= 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100); }
function fmtDelta(cur, prev) {
    const d = deltaPct(cur, prev);
    return (d > 0 ? '↑ ' : d < 0 ? '↓ ' : '') + Math.abs(d) + '%';
}
// Colores del chip de variación: verde si sube, rojo si baja, gris si no cambia
// (antes era siempre verde con "↑", incluso en -100%).
function deltaColors(cur, prev) {
    const d = deltaPct(cur, prev);
    return d > 0 ? { bg: '#E7F7EF', fg: '#0E8F53' } : d < 0 ? { bg: '#FEF3F2', fg: '#B42318' } : { bg: '#F2F4F7', fg: '#6E6E73' };
}
function setDelta(cls, cur, prev) {
    const c = deltaColors(cur, prev);
    document.querySelectorAll('.' + cls).forEach(el => {
        el.textContent = fmtDelta(cur, prev);
        el.style.background = c.bg; el.style.color = c.fg;
    });
}
function setAll(cls, txt) { document.querySelectorAll('.' + cls).forEach(el => el.textContent = txt); }
function setTxt(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
function status(msg, isErr) {
    const el = document.getElementById('dg-status');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.textContent = msg; el.classList.toggle('err', !!isErr);
}

// ============================================================
// FILTRADO POR PERIODO / CHIPS
// ============================================================
function periodRange(period) {
    const def = PERIODS.find(p => p.key === period) || PERIODS.find(p => p.key === '30d');
    const now = new Date();
    // Semana lunes 00:00 → domingo 23:59 (S.offset semanas desde la actual); el "anterior" es la semana previa.
    if (def && def.type === 'week') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + 7 * S.offset);
        const end   = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
        const prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
        const prevEnd   = new Date(start); prevEnd.setMilliseconds(-1);
        return { start, end, prevStart, prevEnd };
    }
    // Mes calendario (S.offset meses desde el actual); el "anterior" es el mes previo.
    if (def && def.type === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth() + S.offset, 1);
        const end   = new Date(now.getFullYear(), now.getMonth() + S.offset + 1, 0, 23, 59, 59, 999);
        const prevStart = new Date(now.getFullYear(), now.getMonth() + S.offset - 1, 1);
        const prevEnd   = new Date(start); prevEnd.setMilliseconds(-1);
        return { start, end, prevStart, prevEnd };
    }
    // Todo el tiempo: sin límites (inRange devuelve true) y sin periodo anterior.
    if (!def || !def.days) return { start: null, end: null, prevStart: null, prevEnd: null };
    // Ventana móvil que termina hoy (hoy / 7 / 30 días).
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(end); start.setDate(start.getDate() - (def.days - 1)); start.setHours(0, 0, 0, 0);
    const prevEnd = new Date(start); prevEnd.setMilliseconds(-1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (def.days - 1)); prevStart.setHours(0, 0, 0, 0);
    return { start, end, prevStart, prevEnd };
}
function inRange(l, start, end) {
    if (!start || !end) return true;
    const f = F.fecha(l);
    if (!f) return true;
    return f >= start && f <= end;
}
function passesChips(l) {
    if (S.campanaFilter && F.campana(l) !== S.campanaFilter) return false;
    if (S.fuenteFilter && F.fuente(l) !== S.fuenteFilter) return false;
    return true;
}
function scopedLeads() {
    const { start, end, prevStart, prevEnd } = periodRange(S.period);
    const chip = S.leads.filter(passesChips);
    return {
        cur: chip.filter(l => inRange(l, start, end)),
        prev: chip.filter(l => inRange(l, prevStart, prevEnd)),
    };
}
// Conversaciones atendidas (personas) cuyo PRIMER mensaje cae en el periodo, sin las de
// campañas ajenas a Logic (empeño/prenda). `f` ya viene en hora de pared CDMX. No dependen
// de los filtros Sistema/Canal: el sistema solo se conoce cuando el lead agenda.
function convsDelPeriodo() {
    const { start, end } = periodRange(S.period);
    return S.conversaciones.filter(c => {
        if (c.fuente === 'excluir') return false;
        if (!start || !end) return true;
        const w = parseWall(c.f);
        return !!w && w.date >= start && w.date <= end;
    });
}

// ============================================================
// INIT
// ============================================================
async function init() {
    // Failsafe: pase lo que pase, el spinner nunca debe quedar cubriendo la pantalla.
    setTimeout(hideLoader, 7000);
    try {
        const session = typeof getSession === 'function' ? getSession() : null;
        if (!session) { hideLoader(); location.href = 'login.html'; return; }
        if (!(session.role === 'admin' || (session.clients || []).includes(SLUG))) { hideLoader(); location.href = 'hub.html'; return; }

        await loadConfig();
        // Fuentes en paralelo: Supabase (leads + conversaciones) y webhook de Outlook
        // (calendario de demos, best-effort: si falla, el calendario cae a los leads).
        await Promise.all([fetchLeads(), fetchConversaciones(), fetchEventos()]);

        renderPeriods();
        renderChips();
        renderAll();
        status(null);
        hideLoader();
    } catch (err) {
        console.error('[director] init error', err);
        status('Error al cargar el panel: ' + (err.message || err), true);
        hideLoader();
    }
}

// Oculta el spinner de carga inicial (con fade) una vez que el panel ya renderizó.
function hideLoader() {
    const ld = document.getElementById('dg-loader');
    if (!ld) return;
    ld.classList.add('hidden');
    setTimeout(() => { ld.style.display = 'none'; }, 340);
}

async function loadConfig() {
    const { data, error } = await window.supabase
        .from('clients_config').select('*').eq('id_slug', SLUG).single();
    if (error || !data) throw new Error('No se encontró la config de "' + SLUG + '" en clients_config.');
    S.config = data;
    setTxt('dg-client-name', data.name || 'Logic Systems');
    // Logo en el topbar (si el cliente tiene uno configurado)
    const logo = document.getElementById('client-logo');
    if (logo && data.logo_url) { logo.src = data.logo_url; logo.classList.remove('hidden'); }
    if (typeof window.initializeClientSupabase === 'function') {
        window.initializeClientSupabase(data.supabase_url, data.supabase_anon_key);
    }
}

async function fetchLeads() {
    // Modo demo (datos ficticios) SOLO si se fuerza con ?demo=1 en la URL. Por defecto
    // el panel usa datos reales; el flag histórico webhook_url='DEMO' ya se ignora aquí.
    if (new URLSearchParams(location.search).has('demo')) { S.leads = demoLeads(); return; }

    // Fuente de datos: la Supabase per-cliente de Logic Systems, vía /api/leads/list
    // (endpoint server-side que lee con la SERVICE KEY y normaliza los campos). El
    // service key NUNCA toca el navegador.
    const res = await fetch('/api/leads/list?client=' + encodeURIComponent(SLUG));

    // Sin configurar (faltan env vars) o error de lectura: no es fatal, se muestra el
    // panel vacío con la guía que devuelve el endpoint.
    if (!res.ok) {
        S.leads = [];
        const msg = await res.json().catch(() => ({}));
        status(msg.error || ('El origen de leads respondió ' + res.status), true);
        return;
    }

    const raw = await res.json();
    S.leads = Array.isArray(raw) ? raw : (raw.leads || raw.data || []);
    console.log('[director] leads cargados:', S.leads.length);
}

// Trae las conversaciones (una por persona, con su primer mensaje ya clasificado) desde
// /api/leads/conversaciones. Si falla, los bloques de conversaciones quedan en cero con aviso.
async function fetchConversaciones() {
    if (new URLSearchParams(location.search).has('demo')) { S.conversaciones = demoConversaciones(); return; }
    try {
        const res = await fetch('/api/leads/conversaciones?client=' + encodeURIComponent(SLUG));
        const raw = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(raw.error || ('respondió ' + res.status));
        S.conversaciones = raw.conversaciones || [];
        console.log('[director] conversaciones cargadas:', S.conversaciones.length);
    } catch (err) {
        console.warn('[director] no se pudieron leer las conversaciones:', err.message);
        S.conversaciones = [];
        status('No se pudieron cargar las conversaciones: ' + err.message, true);
    }
}

// Normaliza un evento crudo de Microsoft Graph (calendarView) al modelo que consume el
// calendario. `start.dateTime` ya viene en hora local de México (ver `timeZone` del evento),
// así que `demo_inicio` se toma literal — igual que parseWall, sin convertir zona horaria.
// Devuelve null para eventos que no son demos agendables (todo el día / cancelados).
function mapEvento(ev) {
    const inicio = ev && ev.start && ev.start.dateTime;
    if (!inicio) return null;
    if (ev.isAllDay) return null;
    const subject = (ev.subject || '').trim();
    if (/^cancelad/i.test(subject)) return null;   // "Cancelado: ..." → no cuenta como cita
    return {
        id:          ev.id,
        event_id:    ev.id,
        nombre:      subject || 'Sin asunto',
        demo_inicio: inicio,
        demo_fin:    ev.end && ev.end.dateTime,
        // Outlook no trae un campo de "sistema" limpio: se deriva por regex del asunto
        // (normSistema mira `sistema`). Lo que no cae en los 4 patrones → "Otro".
        sistema:     subject,
        empresa:     '',
        accion_calendario: 'agendada',
        weblink:     ev.webLink || '',
    };
}

// Rango de fechas a pedir al webhook de eventos. Depende del filtro de periodo y del mes
// visible del calendario: para "todo el tiempo" trae una ventana amplia (~1 año atrás →
// 3 meses adelante); para el resto, el mes del calendario (S.calMonth, o el actual) con un
// mes de margen a cada lado, para cubrir los días de meses vecinos que asoman en la grilla
// y permitir navegar. La navegación (‹ ›) y el cambio de periodo vuelven a llamar fetchEventos.
function eventosRange() {
    const now  = new Date();
    if (S.period === 'todo') {
        return { from: new Date(now.getFullYear() - 1, now.getMonth(), 1),
                 to:   new Date(now.getFullYear(), now.getMonth() + 3, 0) };
    }
    const base = S.calMonth || new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: new Date(base.getFullYear(), base.getMonth() - 1, 1),
             to:   new Date(base.getFullYear(), base.getMonth() + 2, 0) };
}

// Trae los eventos del calendario de Outlook (vía el proxy CORS) para el rango que
// corresponde al periodo/mes actual (ver eventosRange). Best-effort: si falla, el
// calendario cae a la fuente actual (S.leads) sin romper el panel.
async function fetchEventos() {
    if (new URLSearchParams(location.search).has('demo')) { S.eventos = []; return; }
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    try {
        const { from, to } = eventosRange();
        const target = EVENTOS_WEBHOOK + '?startDate=' + ymd(from) + '&endDate=' + ymd(to);
        const res = await fetch('/api/proxy?url=' + encodeURIComponent(target));
        if (!res.ok) throw new Error('el proxy respondió ' + res.status);
        const raw  = await res.json();
        const rows = Array.isArray(raw) ? raw : (raw.value || raw.leads || raw.data || []);
        S.eventos = rows.map(mapEvento).filter(Boolean);
        console.log('[director] eventos (Outlook) cargados:', S.eventos.length);
    } catch (err) {
        console.warn('[director] no se pudo leer el webhook de eventos:', err.message);
        S.eventos = [];
    }
}

// ============================================================
// RENDER
// ============================================================
function renderAll() {
    const { cur, prev } = scopedLeads();
    const convs = convsDelPeriodo();
    renderPeriodHead();
    renderHeroYFunnel(cur, prev, convs);
    renderDonut(cur, convs);
    renderSources(cur);
    renderFueraHorario(cur, convs);
    renderFuentes(cur, convs);
    renderCampanas(cur, prev);
    renderTrend(cur);
    renderAgenda();
    setAll('periodLabel', periodoCorto());
}

// Rellena un <select> con opciones y sincroniza el valor seleccionado.
function fillSelect(host, options, selectedValue) {
    if (!host) return;
    host.innerHTML = options.map(o =>
        `<option value="${esc(o.value)}"${o.value === selectedValue ? ' selected' : ''}>${esc(o.label)}</option>`
    ).join('');
    host.value = selectedValue;
}

function periodDef() { return PERIODS.find(p => p.key === S.period) || PERIODS[0]; }

// El calendario de la agenda sigue al periodo: semana/mes saltan al mes donde empiezan;
// los demás vuelven al mes actual. Luego se re-piden los eventos del rango.
async function syncCalendario() {
    const { start } = periodRange(S.period);
    S.calMonth = periodDef().type && start ? new Date(start.getFullYear(), start.getMonth(), 1) : null;
    S.calSelKey = null;
    await fetchEventos();
    renderAgenda();
}

function renderPeriods() {
    const host = document.getElementById('periodSelect');
    if (!host) return;
    fillSelect(host, PERIODS.map(p => ({ value: p.key, label: p.label })), S.period);
    host.onchange = async () => {
        const p = PERIODS.find(x => x.key === host.value) || PERIODS[0];
        S.period = p.key;
        S.offset = p.defOffset || 0;
        renderAll();           // pinta stats de inmediato con el nuevo periodo
        await syncCalendario();
    };
}
// ‹ › entre semanas / meses. No se avanza más allá del periodo en curso.
window.__dgPeriodMove = async (delta) => {
    if (!periodDef().type) return;
    S.offset = Math.min(0, S.offset + delta);
    renderAll();
    await syncCalendario();
};

// --- Fechas en español ---------------------------------------
const MESES_LG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_LG  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CT  = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function fmtDiaCorto(d) { return DIAS_CT[d.getDay()] + ' ' + d.getDate(); }   // "vie 16"
// Horario laboral: L–V 8:00 a 18:30 (misma regla que api/leads/conversaciones.js).
function enHorario(d) {
    const dow = d.getDay(), min = d.getHours() * 60 + d.getMinutes();
    return dow >= 1 && dow <= 5 && min >= 480 && min < 1110;
}

// Rango del periodo en palabras ("Lunes 12 – domingo 18 de octubre 2026").
function periodoLargo() {
    const def = periodDef();
    const { start, end } = periodRange(S.period);
    if (!start) return 'Todo el tiempo';
    if (def.type === 'month') return cap(MESES_LG[start.getMonth()]) + ' ' + start.getFullYear();
    const e = def.type === 'week' ? end : new Date();
    if (def.type === 'week') {
        const mismoMes = start.getMonth() === e.getMonth();
        const ini = 'Lunes ' + start.getDate() + (mismoMes ? '' : ' de ' + MESES_LG[start.getMonth()]) +
                    (start.getFullYear() !== e.getFullYear() ? ' ' + start.getFullYear() : '');
        return ini + ' – domingo ' + e.getDate() + ' de ' + MESES_LG[e.getMonth()] + ' ' + e.getFullYear();
    }
    if (def.days === 1) return cap(DIAS_LG[e.getDay()]) + ' ' + e.getDate() + ' de ' + MESES_LG[e.getMonth()] + ' ' + e.getFullYear();
    return start.getDate() + ' ' + MESES_CT[start.getMonth()] + ' – ' + e.getDate() + ' ' + MESES_CT[e.getMonth()] + ' ' + e.getFullYear();
}
// Etiqueta corta para títulos ("Semana pasada", "Octubre 2026", "Últimos 30 días").
function periodoCorto() {
    const def = periodDef();
    if (def.type === 'week')  return S.offset === 0 ? 'Esta semana' : S.offset === -1 ? 'Semana pasada' : periodoLargo().replace(/ – domingo /, '–').replace(/^Lunes /, '');
    if (def.type === 'month') return periodoLargo();
    return def.label;
}
function periodoNombre() {
    const t = periodDef().type;
    return t === 'week' ? 'esta semana' : t === 'month' ? 'este mes' : 'en el periodo';
}

// Rango de fechas bajo el nombre del cliente + estado de las flechas ‹ ›.
function renderPeriodHead() {
    const def = periodDef();
    const enCurso = def.type && S.offset === 0;
    setTxt('periodRange', periodoLargo());
    setTxt('periodNote', enCurso ? (def.type === 'week' ? 'Semana en curso' : 'Mes en curso') : '');
    const nav = document.querySelectorAll('.dg-pnav');
    nav.forEach(b => { b.style.display = def.type ? '' : 'none'; });
    const next = document.getElementById('periodNext');
    if (next) next.disabled = S.offset >= 0;
}

function renderChips() {
    // Dropdowns fijos: los sistemas del negocio y los 4 canales de mensajería.
    // El valor "" es "Todos/Todas" (sin filtro). __dgFilter* llama a renderChips() para
    // re-sincronizar el <select> cuando el filtro cambia desde las tarjetas.
    const sysHost = document.getElementById('sysSelect');
    fillSelect(sysHost, [{ value: '', label: 'Todos' }, ...SISTEMAS.map(k => ({ value: k, label: k }))], S.campanaFilter || '');
    if (sysHost) sysHost.onchange = () => { S.campanaFilter = sysHost.value || null; renderAll(); };

    const srcHost = document.getElementById('srcSelect');
    fillSelect(srcHost, [{ value: '', label: 'Todos' }, ...FUENTES.map(k => ({ value: k, label: k }))], S.fuenteFilter || '');
    if (srcHost) srcHost.onchange = () => { S.fuenteFilter = srcHost.value || null; renderAll(); };
}

// --- Hero (citas agendadas) + funnel --------------------------
// Funnel: conversaciones atendidas (personas únicas, sin empeño) → demos agendadas.
// Mismo tono en dos pasos: lo que importa (demos) en el azul de marca.
function renderHeroYFunnel(cur, prev, convs) {
    const calificados = cur.filter(esCalificado).length;
    const califPrev = prev.filter(esCalificado).length;
    const total = convs.length;

    setAll('citasFmt', fmtInt(calificados));
    setDelta('dCitas', calificados, califPrev);

    const stages = [
        { name: 'Conversaciones atendidas', value: total, color: C_DENTRO },
        { name: 'Demos agendadas', value: calificados, color: C_FUERA },
    ];
    const max = Math.max(1, total);
    document.getElementById('funnel').innerHTML = stages.map(s => `
        <div style="margin-bottom:15px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
            <span style="font-size:12.5px; color:#6E6E73;">${esc(s.name)}</span>
            <span style="font-size:15px; font-weight:600; color:#1D1D1F;">${fmtInt(s.value)}</span>
          </div>
          <div style="height:8px; border-radius:999px; background:#EFF1F5; overflow:hidden;">
            <div style="height:100%; border-radius:999px; width:${pct(s.value, max)}%; background:${s.color}; transition:width 600ms cubic-bezier(0.2,0.7,0.2,1);"></div>
          </div>
        </div>`).join('') + `<div style="font-size:11.5px; color:#A1A1A6; margin-top:-2px;">Personas únicas · sin campañas ajenas a Logic</div>`;
}

// --- Donut: tasa de agendamiento (demos agendadas / conversaciones atendidas) ---
// El denominador son las personas que escribieron por primera vez en el periodo, ya sin
// las conversaciones de campañas ajenas (empeño). Track en un paso claro de la misma
// rampa azul (meter), no en gris.
function renderDonut(cur, convs) {
    const total = convs.length;
    const calificados = cur.filter(esCalificado).length;
    const rate = pct(calificados, total);
    const r = 52, c = 2 * Math.PI * r, off = c * (1 - rate / 100);
    document.getElementById('donut').innerHTML = `
      <svg width="150" height="150" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r="${r}" fill="none" stroke="#E4EEFC" stroke-width="14"/>
        <circle cx="75" cy="75" r="${r}" fill="none" stroke="#0A6CFF" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
          transform="rotate(-90 75 75)" style="transition:stroke-dashoffset 700ms cubic-bezier(0.2,0.7,0.2,1);"/>
        <text x="75" y="72" text-anchor="middle" font-family="Inter,sans-serif" font-size="29" font-weight="600" fill="#0A6CFF">${rate}%</text>
        <text x="75" y="97" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" letter-spacing="0.02em" fill="#86868B">agendan</text>
      </svg>`;
}

// --- Canal de mensajería (columna `contacto`, 4 canales fijos) ----------
// Una sola medida sobre categorías sin orden → un solo color para todas las barras
// (antes cada canal tenía un color distinto que no codificaba nada).
function renderSources(cur) {
    const total = cur.length || 1;
    const counts = {};
    cur.forEach(l => { const k = F.fuente(l); counts[k] = (counts[k] || 0) + 1; });
    // Siempre los canales fijos, en orden, aunque alguno venga en 0; "Sin dato" solo si hay.
    const top = FUENTES.map(k => ({ key: k, count: counts[k] || 0 }));
    if (counts['Sin dato']) top.push({ key: 'Sin dato', count: counts['Sin dato'] });
    const max = Math.max(1, ...top.map(g => g.count));
    document.getElementById('sources').innerHTML = top.map(g => {
        const sel = S.fuenteFilter === g.key;
        return `
        <div style="margin-bottom:14px; cursor:pointer;" onclick="window.__dgFilterFuente(${jsArg(g.key)})" title="Filtrar por ${esc(g.key)}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-size:13px; color:#3A3A3C; ${sel ? 'font-weight:600;' : ''}">${esc(g.key)}</span>
            <span style="font-size:13px; font-weight:600; color:#1D1D1F;">${pct(g.count, total)}%</span>
          </div>
          <div style="height:6px; border-radius:999px; background:#EFF1F5; overflow:hidden;">
            <div style="height:100%; width:${pct(g.count, max)}%; background:${C_FUERA}; border-radius:999px; transition:width 600ms cubic-bezier(0.2,0.7,0.2,1);"></div>
          </div>
        </div>`;
    }).join('');
}
window.__dgFilterFuente = (k) => { S.fuenteFilter = (S.fuenteFilter === k ? null : k); renderChips(); renderAll(); };

// Barra apilada dentro / fuera de horario: 2px de superficie entre segmentos, extremo de
// datos redondeado (4px) y base recta. `ancho` = % del carril que ocupa la barra completa.
function barraHorario(dentro, fuera, alto) {
    const segs = [];
    if (dentro) segs.push(`<div title="${dentro} dentro de horario" style="flex:${dentro} 1 0; min-width:3px; background:${C_DENTRO};${fuera ? '' : ' border-radius:0 4px 4px 0;'}"></div>`);
    if (fuera)  segs.push(`<div title="${fuera} fuera de horario" style="flex:${fuera} 1 0; min-width:3px; background:${C_FUERA}; border-radius:0 4px 4px 0;"></div>`);
    return `<div style="display:flex; gap:2px; height:${alto}px; width:100%;">${segs.join('')}</div>`;
}
function leyendaHorario() {
    const sw = c => `<span style="width:9px; height:9px; border-radius:2px; background:${c}; display:inline-block;"></span>`;
    return `<span style="display:inline-flex; align-items:center; gap:6px;">${sw(C_DENTRO)}Dentro de horario</span>
            <span style="display:inline-flex; align-items:center; gap:6px;">${sw(C_FUERA)}Fuera de horario</span>`;
}

// Demos del periodo (respetan los filtros Sistema/Canal), cada una con la fuente de su
// conversación. Sin chat o de una campaña excluida → Orgánico (misma regla que el reporte).
function demosConFuente(cur) {
    const porSesion = new Map(S.conversaciones.map(c => [c.session_id, c.fuente]));
    return cur.filter(esCalificado).map(l => {
        let fuente = porSesion.get(l.session_id);
        if (!FUENTE_LABEL[fuente]) fuente = 'organico';
        const ag = F.fecha(l);
        const dw = parseWall(firstNonEmpty(l.demo_cdmx, l.demo_inicio));
        return { l, fuente, fuera: ag ? !enHorario(ag) : false, demo: dw ? dw.date : null };
    });
}

// --- Fuera de horario (tarjeta) -------------------------------
// Qué tanto del trabajo del agente cae fuera de L–V 8:00–18:30, por la hora del primer
// mensaje de cada conversación. Stat + barra apilada (parte de un todo, 2 segmentos).
function renderFueraHorario(cur, convs) {
    const host = document.getElementById('fueraHorario');
    if (!host) return;
    const total = convs.length;
    const fuera = convs.filter(c => !c.dentro).length;
    const dentro = total - fuera;
    const demos = demosConFuente(cur);
    const demosFuera = demos.filter(d => d.fuera).length;
    if (!total) {
        host.innerHTML = `<div style="font-size:44px; font-weight:600; letter-spacing:-0.03em; color:#C7C7CC; margin-top:6px;">—</div>
          <div style="font-size:12.5px; color:#86868B; margin-top:10px;">Sin conversaciones ${periodoNombre()}.</div>`;
        return;
    }
    host.innerHTML = `
      <div style="font-size:44px; line-height:1; font-weight:600; letter-spacing:-0.03em; color:#1D1D1F; margin-top:4px;">${pct(fuera, total)}%</div>
      <div style="font-size:12.5px; color:#3A3A3C; margin-top:8px;">${fmtInt(fuera)} de ${fmtInt(total)} conversaciones</div>
      <div style="margin-top:16px;">${barraHorario(dentro, fuera, 10)}</div>
      <div style="display:flex; justify-content:space-between; gap:8px; margin-top:8px; font-size:12px; color:#6E6E73;">
        <span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:9px; height:9px; border-radius:2px; background:${C_DENTRO};"></span>Dentro ${fmtInt(dentro)}</span>
        <span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:9px; height:9px; border-radius:2px; background:${C_FUERA};"></span>Fuera ${fmtInt(fuera)}</span>
      </div>
      <div style="margin-top:auto; padding-top:14px; border-top:1px solid #F2F2F5; font-size:12px; color:#86868B; line-height:1.5;">
        ${demos.length ? `Demos agendadas fuera de horario: <b style="color:#1D1D1F;">${demosFuera} de ${demos.length}</b><br>` : ''}Horario laboral: L–V 8:00 a 18:30
      </div>`;
}

// --- Fuente (conversaciones y demos por fuente) ---------------
// La fuente sale del TEXTO del primer mensaje (no de leads.fuente_lead). Filas fijas en
// orden; las vacías se atenúan, no se ocultan. Barra = conversaciones (largo) partida en
// dentro/fuera de horario; a la derecha, demos y conversión (se resalta la mejor).
function renderFuentes(cur, convs) {
    const host = document.getElementById('fuentes');
    if (!host) return;
    const demos = demosConFuente(cur);
    const filas = FUENTES_CONV.map(f => {
        const cs = convs.filter(c => c.fuente === f.key);
        const ds = demos.filter(d => d.fuente === f.key).sort((a, b) => (a.demo || 0) - (b.demo || 0));
        return { ...f, conv: cs.length, fuera: cs.filter(c => !c.dentro).length, dentro: cs.filter(c => c.dentro).length, demos: ds };
    });
    const maxConv = Math.max(1, ...filas.map(f => f.conv));
    const candidatas = filas.filter(f => f.conv && f.demos.length);
    const mejor = candidatas.length > 1
        ? candidatas.reduce((a, b) => (b.demos.length / b.conv > a.demos.length / a.conv ? b : a)) : null;

    const lbl = t => `<span class="dg-fu-mlabel">${t}</span>`;
    const head = `
      <div class="dg-fu-row dg-fu-head">
        <div>Fuente</div><div>Conversaciones</div><div>Fuera de horario</div><div>Demos agendadas</div><div>Conversión a demo</div>
      </div>`;
    const rows = filas.map(f => {
        const n = f.demos.length;
        const fechas = f.demos.filter(d => d.demo).map(d => 'demo ' + fmtDiaCorto(d.demo));
        const vacia = !f.conv && !n;
        const esMejor = mejor === f;
        return `
        <div class="dg-fu-row${vacia ? ' vacia' : ''}">
          <div class="dg-fu-name">
            <div style="font-size:13.5px; font-weight:600; color:#1D1D1F;">${esc(f.label)}</div>
            <div style="font-size:11.5px; color:#86868B; margin-top:2px;">${esc(f.opera)}</div>
          </div>
          <div class="dg-fu-bar">
            ${f.conv ? `
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="flex:0 1 ${pct(f.conv, maxConv)}%; min-width:6px;">${barraHorario(f.dentro, f.fuera, 12)}</div>
                <span style="flex:none; font-size:15px; font-weight:600; color:#1D1D1F;">${fmtInt(f.conv)}</span>
              </div>`
              : `<span style="font-size:12.5px; color:#86868B;">Sin conversaciones ${periodoNombre()}</span>`}
          </div>
          <div>${lbl('Fuera de horario')}${f.conv
              ? `<div class="dg-fu-num">${pct(f.fuera, f.conv)}%</div><div class="dg-fu-sub">${f.fuera} de ${f.conv}</div>`
              : `<div class="dg-fu-num" style="color:#C7C7CC;">—</div>`}</div>
          <div>${lbl('Demos agendadas')}<div class="dg-fu-num">${fmtInt(n)}</div>${fechas.length ? `<div class="dg-fu-sub">${esc(fechas.join(' · '))}</div>` : ''}</div>
          <div>${lbl('Conversión a demo')}${f.conv
              ? `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                   <span class="dg-fu-num">${pct(n, f.conv)}%</span>
                   ${esMejor ? `<span style="padding:2px 8px; border-radius:999px; background:#EAF2FF; color:#0A4FC0; font-size:11px; font-weight:600;">Mejor conversión</span>` : ''}
                 </div><div class="dg-fu-sub">${n} de ${f.conv}</div>`
              : `<div class="dg-fu-num" style="color:#C7C7CC;">—</div>`}</div>
        </div>`;
    }).join('');

    const filtrado = S.campanaFilter || S.fuenteFilter;
    host.innerHTML = head + rows + `
      <div style="font-size:11.5px; color:#A1A1A6; margin-top:14px;">Cifras expresadas en personas únicas.${filtrado
        ? ' Con el filtro de sistema o canal activo, solo las demos se filtran; las conversaciones no (el sistema se conoce hasta que el lead agenda).' : ''}</div>`;
    const ley = document.getElementById('fuentesLeyenda');
    if (ley) ley.innerHTML = leyendaHorario();
}

// --- Estadísticas por campaña + campaña top ------------------
function renderCampanas(cur, prev) {
    const totalLeads = cur.length || 1;
    const curByCamp = {}, prevByCamp = {};
    cur.forEach(l => { const k = F.campana(l); curByCamp[k] = (curByCamp[k] || 0) + 1; });
    prev.forEach(l => { const k = F.campana(l); prevByCamp[k] = (prevByCamp[k] || 0) + 1; });
    // Siempre los 4 sistemas fijos, en orden, aunque alguno venga en 0.
    const groups = SISTEMAS.map(k => ({ key: k, count: curByCamp[k] || 0 }));
    const max = Math.max(1, ...groups.map(g => g.count));

    document.getElementById('products').innerHTML = groups.map(g => {
        // Color de la ENTIDAD (el mismo del calendario), no de la posición.
        const color = SIS_COLOR[g.key] || '#86868B';
        const delta = fmtDelta(g.count, prevByCamp[g.key] || 0);
        const dc = deltaColors(g.count, prevByCamp[g.key] || 0);
        return `
        <div class="card-lift" style="background:#FBFBFD; border:1px solid #EEF0F3; border-radius:18px; padding:20px; cursor:pointer;" onclick="window.__dgFilterCampana(${jsArg(g.key)})">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <span style="width:10px; height:10px; border-radius:3px; background:${color}; flex:none;"></span>
            <span style="font-size:13px; font-weight:600; color:#1D1D1F; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(g.key)}</span>
          </div>
          <div style="font-size:40px; font-weight:600; letter-spacing:-0.03em; color:#0A6CFF; line-height:1;">${fmtInt(g.count)}</div>
          <div style="font-size:12px; color:#86868B; margin-top:8px;">demos agendadas · ${pct(g.count, totalLeads)}%</div>
          <div style="height:6px; border-radius:999px; background:#E9ECF1; overflow:hidden; margin-top:14px;">
            <div style="height:100%; width:${pct(g.count, max)}%; background:${color}; border-radius:999px; transition:width 600ms cubic-bezier(0.2,0.7,0.2,1);"></div>
          </div>
          <div style="margin-top:14px;"><span style="display:inline-block; padding:3px 10px; border-radius:999px; background:${dc.bg}; color:${dc.fg}; font-weight:600; font-size:12px;">${delta} vs. periodo anterior</span></div>
        </div>`;
    }).join('');
}
window.__dgFilterCampana = (k) => { S.campanaFilter = (S.campanaFilter === k ? null : k); renderChips(); renderAll(); };

// Curva suave (Catmull-Rom → bézier) para que la línea no se vea de picos.
function smoothPath(pts) {
    if (pts.length < 2) return pts.length ? `M${pts[0][0]} ${pts[0][1]}` : '';
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
}

// --- Tendencia de calificación (línea suave + hover con círculo y conteo) ---
function renderTrend(cur) {
    const { start, end } = periodRange(S.period);
    const e = end || new Date();
    const s = start || new Date(e.getTime() - 90 * 86400000);
    const totalDays = Math.max(1, Math.ceil((e - s) / 86400000));   // semana = 7 puntos, uno por día
    // Repartir el periodo en hasta 12 puntos → curva legible (no un pico por día).
    const N = Math.min(Math.max(totalDays, 2), 12);
    const spanMs = (e - s) / N;
    const buckets = Array.from({ length: N }, (_, i) => ({
        count: 0, date: new Date(s.getTime() + spanMs * (i + 0.5)),
    }));
    cur.filter(esCalificado).forEach(l => {
        const f = F.fecha(l); if (!f) return;
        let idx = Math.floor((f - s) / spanMs);
        if (idx >= 0 && idx < N) buckets[idx].count++;
    });

    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    // padBot deja aire abajo para las etiquetas de fecha (siempre visibles).
    const W = 900, H = 160, padX = 16, padTop = 18, padBot = 42;
    const baseY = H - padBot;
    const max = Math.max(1, ...buckets.map(b => b.count));
    const stepX = (W - padX * 2) / Math.max(1, N - 1);
    const pts = buckets.map((b, i) => [padX + i * stepX, baseY - (b.count / max) * (baseY - padTop)]);
    const linePath = smoothPath(pts);
    const areaPath = linePath + ` L${(W - padX).toFixed(1)} ${baseY} L${padX} ${baseY} Z`;
    const dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="#fff" stroke="#0A6CFF" stroke-width="1.5"/>`).join('');
    // Etiquetas de fecha bajo cada punto — visibles siempre, no solo en hover.
    const labels = pts.map((p, i) => {
        const b = buckets[i];
        return `<text x="${p[0].toFixed(1)}" y="${H - 14}" text-anchor="middle" font-family="Inter,sans-serif" font-size="13" fill="#A1A1A6">${b.date.getDate()} ${meses[b.date.getMonth()]}</text>`;
    }).join('');

    const host = document.getElementById('trendBig');
    host.innerHTML = `
      <div class="dg-trend-wrap" style="position:relative;">
        <svg class="dg-trend-svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block; height:auto; overflow:visible;">
          <defs><linearGradient id="dgTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#0A6CFF" stop-opacity="0.16"/><stop offset="1" stop-color="#0A6CFF" stop-opacity="0"/>
          </linearGradient></defs>
          <path d="${areaPath}" fill="url(#dgTrendFill)"/>
          <path d="${linePath}" fill="none" stroke="#0A6CFF" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
          ${dots}
          ${labels}
          <line class="dg-trend-guide" x1="0" y1="${padTop}" x2="0" y2="${baseY}" stroke="#0A6CFF" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
          <circle class="dg-trend-marker" r="5" fill="#0A6CFF" stroke="#fff" stroke-width="2.5" opacity="0"/>
        </svg>
        <div class="dg-trend-tip" style="position:absolute; pointer-events:none; transform:translate(-50%,-125%); background:#0B1220; color:#fff; padding:6px 10px; border-radius:8px; font-size:11.5px; font-weight:600; white-space:nowrap; opacity:0; transition:opacity 120ms; box-shadow:0 4px 14px rgba(0,0,0,0.22);"></div>
      </div>`;

    // Hover: marca la fecha con un círculo + tooltip con el conteo de esa fecha.
    const svg = host.querySelector('.dg-trend-svg');
    const wrap = host.querySelector('.dg-trend-wrap');
    const guide = host.querySelector('.dg-trend-guide');
    const marker = host.querySelector('.dg-trend-marker');
    const tip = host.querySelector('.dg-trend-tip');
    function onMove(ev) {
        const rect = svg.getBoundingClientRect();
        const vx = ((ev.clientX - rect.left) / rect.width) * W;
        let idx = Math.round((vx - padX) / stepX);
        idx = Math.max(0, Math.min(N - 1, idx));
        const p = pts[idx], b = buckets[idx];
        marker.setAttribute('cx', p[0]); marker.setAttribute('cy', p[1]); marker.setAttribute('opacity', '1');
        guide.setAttribute('x1', p[0]); guide.setAttribute('x2', p[0]); guide.setAttribute('opacity', '0.45');
        tip.textContent = `${b.count} ${b.count === 1 ? 'demo' : 'demos'} · ${b.date.getDate()} ${meses[b.date.getMonth()]}`;
        tip.style.left = (p[0] / W * 100) + '%';
        tip.style.top = (p[1] / H * 100) + '%';
        tip.style.opacity = '1';
    }
    function onLeave() { marker.setAttribute('opacity', '0'); guide.setAttribute('opacity', '0'); tip.style.opacity = '0'; }
    svg.addEventListener('mousemove', onMove);
    wrap.addEventListener('mouseleave', onLeave);
}

// --- Agenda de demos -----------------------------------------
// Se ordena por la fecha de la DEMO (demo_inicio), no por la del lead: próximas
// primero (ascendente) y luego las recientes (descendente). Respeta los chips
// (sistema/fuente) pero NO el filtro de periodo — una agenda mira fechas de demo.
// La hora se toma LITERAL del string (parseWall): los datos guardan la hora local del
// cliente con sufijo "+00:00", así que convertir por zona horaria la desplazaría.
function parseWall(str) {
    const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return null;
    return { h: +m[4], mi: +m[5], date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) };
}
// Agrupa las demos (chip-filtered, con fecha) por día. Clave: 'año-mes-día' (mes 0-based).
function demosPorDia() {
    const byDay = new Map();
    // Fuente del calendario: los eventos reales de Outlook si cargaron; si no (modo demo o
    // webhook caído), cae a los leads con su demo en hora CDMX (demo_cdmx; demo_inicio es UTC).
    const src = S.eventos.length ? S.eventos : S.leads;
    src.filter(passesChips).forEach(l => {
        const w = parseWall(firstNonEmpty(l.demo_cdmx, l.demo_inicio));
        if (!w) return;
        const key = w.date.getFullYear() + '-' + w.date.getMonth() + '-' + w.date.getDate();
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push({ l, w });
    });
    return byDay;
}

function renderAgenda() {
    const host    = document.getElementById('demoCal');
    const dayHost = document.getElementById('demoDay');
    const empty   = document.getElementById('noDemos');
    const byDay = demosPorDia();

    const total = [...byDay.values()].reduce((a, arr) => a + arr.length, 0);
    if (!total) {
        host.innerHTML = ''; dayHost.innerHTML = ''; setTxt('calMonthLabel', '—');
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    if (!S.calMonth) S.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const y = S.calMonth.getFullYear(), m = S.calMonth.getMonth();

    const mesesLg = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    setTxt('calMonthLabel', mesesLg[m] + ' ' + y);

    // Cuadrícula completa tipo Google Calendar (semana inicia LUNES); incluye días de
    // meses vecinos, atenuados, para no dejar huecos.
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;   // 0 = lunes
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const weeks = Math.ceil((firstDow + daysInMonth) / 7);
    const gridStart = new Date(y, m, 1 - firstDow);
    const MAX = 3;  // eventos visibles por celda antes de "+N más"

    const diasCortos = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const head = diasCortos.map(d => `<div>${d}</div>`).join('');

    let cellsHtml = '';
    for (let i = 0; i < weeks * 7; i++) {
        const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        const key = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
        const arr = (byDay.get(key) || []).slice().sort((a, b) => a.w.date - b.w.date);
        const isOther = date.getMonth() !== m;
        const isToday = date.getTime() === todayStart.getTime();

        const cls = ['dg-cal-cell'];
        if (isOther) cls.push('other');
        if (isToday) cls.push('today');
        if (arr.length) cls.push('has');
        if (S.calSelKey === key) cls.push('sel');

        const evs = arr.slice(0, MAX).map(({ l, w }) => {
            const hora = String(w.h).padStart(2, '0') + ':' + String(w.mi).padStart(2, '0');
            return `<div class="dg-cal-ev"><span class="dg-cal-ev-dot" style="background:${sisColor(l)};"></span><span class="dg-cal-ev-time">${hora}</span><span class="dg-cal-ev-name">${esc(F.nombre(l))}</span></div>`;
        }).join('');
        const more = arr.length > MAX ? `<div class="dg-cal-more">+${arr.length - MAX} más</div>` : '';
        const dots = arr.length ? `<div class="dg-cal-dots">${arr.slice(0, 5).map(({ l }) => `<span style="background:${sisColor(l)};"></span>`).join('')}</div>` : '';
        const onclick = arr.length ? ` onclick="window.__dgSelDay('${key}')"` : '';

        cellsHtml += `<div class="${cls.join(' ')}"${onclick}><span class="dg-cal-daynum">${date.getDate()}</span><div class="dg-cal-events">${evs}${more}</div>${dots}</div>`;
    }

    // Leyenda de sistemas (la identidad no es solo-color).
    const legend = `<div class="dg-legend">${SISTEMAS.map(s =>
        `<span class="dg-legend-item"><span class="dg-legend-dot" style="background:${SIS_COLOR[s]};"></span>${esc(s)}</span>`).join('')}</div>`;

    host.innerHTML = `${legend}<div class="dg-cal"><div class="dg-cal-weekdays">${head}</div><div class="dg-cal-grid">${cellsHtml}</div></div>`;
    renderDaySel(byDay);
}

// Panel de detalle: lista las demos del día seleccionado (o una guía si no hay selección).
function renderDaySel(byDay) {
    const dayHost = document.getElementById('demoDay');
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const dias  = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    if (!S.calSelKey || !byDay.has(S.calSelKey)) {
        dayHost.innerHTML = `<div style="margin-top:16px; padding-top:16px; border-top:1px solid #F2F2F5; text-align:center; color:#A1A1A6; font-size:12.5px;">Selecciona un día con demos para ver el detalle.</div>`;
        return;
    }

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const finDeHoy = new Date(todayStart.getTime() + 86400000);
    const arr = byDay.get(S.calSelKey).slice().sort((a, b) => a.w.date - b.w.date);
    const [yy, mm, dd] = S.calSelKey.split('-').map(Number);
    const gd = new Date(yy, mm, dd);

    const rows = arr.map(({ l, w }) => {
        const accent = sisColor(l);
        let estColor = '#0E8F53', estLabel = 'Próxima';
        if (w.date >= todayStart && w.date < finDeHoy) { estColor = '#0A6CFF'; estLabel = 'Hoy'; }
        else if (w.date < now)                         { estColor = '#86868B'; estLabel = 'Realizada'; }
        const hora = String(w.h).padStart(2, '0') + ':' + String(w.mi).padStart(2, '0');
        const sub = [F.telefono(l), l.empresa, F.campana(l)].filter(Boolean).join(' · ');
        return `
        <div class="card-lift" style="display:flex; align-items:center; gap:16px; padding:13px 16px; border-radius:14px; background:#F5F8FF; margin-bottom:10px;">
          <div style="flex:none; width:58px; text-align:center;">
            <div style="font-size:16px; font-weight:600; color:#1D1D1F; letter-spacing:-0.01em;">${esc(hora)}</div>
            <div style="font-size:10.5px; color:#86868B; margin-top:2px;">90 min</div>
          </div>
          <div style="flex:none; width:4px; height:40px; border-radius:999px; background:${accent};"></div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:14px; font-weight:600; color:#1D1D1F; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(F.nombre(l))}</div>
            <div style="font-size:12px; color:#6E6E73; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(sub)}</div>
          </div>
          <div style="flex:none; display:flex; align-items:center; gap:6px; padding:5px 11px; border-radius:999px; background:#FFFFFF; box-shadow:0 1px 2px rgba(16,24,40,0.05);">
            <span style="width:6px; height:6px; border-radius:999px; background:${estColor};"></span>
            <span style="font-size:11.5px; font-weight:600; color:${estColor};">${estLabel}</span>
          </div>
        </div>`;
    }).join('');

    dayHost.innerHTML = `
      <div style="margin-top:18px; padding-top:16px; border-top:1px solid #F2F2F5;">
        <div style="font-size:13px; font-weight:600; color:#1D1D1F; margin-bottom:12px;">${dias[gd.getDay()]} ${dd} ${meses[mm]} · ${arr.length} demo${arr.length !== 1 ? 's' : ''}</div>
        ${rows}
      </div>`;
}

// Seleccionar/deseleccionar un día del calendario.
window.__dgSelDay = (key) => { S.calSelKey = (S.calSelKey === key ? null : key); renderAgenda(); };
// Navegar meses; "Hoy" vuelve al mes actual. Cada cambio de mes re-consulta el webhook
// para el nuevo rango (ver eventosRange) y luego re-pinta el calendario.
window.__dgCalMove = async (delta) => {
    const base = S.calMonth || new Date();
    S.calMonth = new Date(base.getFullYear(), base.getMonth() + delta, 1);
    S.calSelKey = null;
    await fetchEventos();
    renderAgenda();
};
window.__dgCalHoy = async () => { S.calMonth = null; S.calSelKey = null; await fetchEventos(); renderAgenda(); };

// ============================================================
// HELPERS
// ============================================================
// Serializa un string como argumento JS seguro dentro de un atributo onclick.
function jsArg(str) { return JSON.stringify(String(str)).replace(/"/g, '&quot;'); }

// ============================================================
// DEMO data (solo si webhook_url === 'DEMO')
// ============================================================
function demoLeads() {
    const fuentes = ['facebook', 'waba', 'instagram', 'waba'];
    // Valores de ejemplo para la columna `fuente_lead` (categorías dinámicas del componente "Fuente").
    const fuentesLead = ['Campaña Meta Ads', 'Orgánico', 'Referido', 'Landing page', 'Google Ads'];
    const campanas = ['CIB Financiera', 'e-SIGeN', 'CIB Casa de Empeño', 'e-SIGeN PLD'];
    const nombres = ['Carlos Vega', 'Liliana Estrada', 'Jorge Herrera', 'Ana Ruiz', 'MVZ. Cesar Gamboa', 'Sci consultores'];
    const stages = [ST.RECHAZADO, ST.RECHAZADO, ST.SEGUIMIENTO, ST.SIN_RESPUESTA, ST.ATENCION, ST.RECHAZADO];
    const labels = { [ST.RECHAZADO]: 'rechazado', [ST.SEGUIMIENTO]: 'Seguimiento CAMILA', [ST.SIN_RESPUESTA]: 'SIN RESPUESTA', [ST.ATENCION]: 'atencion personalizada' };
    const pad = n => String(n).padStart(2, '0');
    const out = [];
    for (let i = 0; i < 140; i++) {
        const daysAgo = Math.floor((i * 7) % 30);
        const d = new Date(); d.setDate(d.getDate() - daysAgo);
        const id = stages[i % stages.length];
        // demo_inicio en formato "de pared" (mismo que Supabase) para poblar el calendario.
        const demoIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(9 + (i % 8))}:00:00+00:00`;
        out.push({
            nombre: nombres[i % nombres.length],
            empresa: 'Empresa ' + (i % 20 + 1),
            telefono: '+52199' + (1000000 + i),
            precio: [0, 0, 150000, 500000][i % 4],
            estatus: labels[id], estatus_id: id, tags: [],
            fecha_creacion: `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}, ${1 + (i % 11)}:0${i % 6}:00 p.m.`,
            contacto: fuentes[i % fuentes.length],
            fuente_lead: fuentesLead[i % fuentesLead.length],
            utm_medium: fuentes[i % fuentes.length],
            utm_campaign: campanas[i % campanas.length],
            demo_inicio: demoIso,
            session_id: 'demo-' + i,
            accion_calendario: 'agendada',
        });
    }
    return out;
}

// Conversaciones ficticias (modo demo): una por cada lead demo + otras sin demo.
function demoConversaciones() {
    const fuentes = ['whatsapp', 'whatsapp', 'formulario', 'organico', 'whatsapp', 'formulario', 'google', 'correo'];
    const pad = n => String(n).padStart(2, '0');
    const out = [];
    for (let i = 0; i < 420; i++) {
        const d = new Date(); d.setDate(d.getDate() - Math.floor((i * 3) % 45)); d.setHours((i * 5) % 24, (i * 7) % 60);
        const f = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
        out.push({ session_id: 'demo-' + i, f, fuente: i % 37 === 0 ? 'excluir' : fuentes[i % fuentes.length], dentro: enHorario(d) });
    }
    return out;
}

// ============================================================
// ARRANQUE
// ============================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
