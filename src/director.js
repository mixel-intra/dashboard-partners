// ============================================================
// src/director.js — Panel del Director General (Logic Systems)
// ============================================================
// Dashboard EXCLUSIVO del cliente `logic-systems`. Vive dentro del shell normal
// de la app (sidebar + topbar de director.html) y reutiliza el mismo stack de datos:
//   · config.js  → window.supabase + clients_config
//   · auth.js    → sesión (getSession)
//   · /api/leads/list → trae los leads desde la Supabase per-cliente (server-side)
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
const PALETTE = ['#0A6CFF', '#1FB36B', '#F5A623', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#0EA5E9'];

// --- Campos del lead -----------------------------------------
const F = {
    nombre:   l => firstNonEmpty(l.nombre, l.contacto, l.cliente) || 'Sin nombre',
    telefono: l => firstNonEmpty(l.telefono_contacto, l.telefono, l.phone, l.celular) || '',
    estado:   l => (firstNonEmpty(l.estatus, l.estado, l.stage) || '').toString(),
    estadoId: l => Number(firstNonEmpty(l.estatus_id, l.stage_id)) || null,
    precio:   l => Number(firstNonEmpty(l.precio, l.monto, l.valor)) || 0,
    fecha:    l => parseFecha(firstNonEmpty(l.fecha_creacion, l.fecha, l.created_at)),
    // Dimensiones de marketing (UTM de Kommo), normalizadas a las dimensiones fijas del negocio.
    fuente:   l => normFuente(l)  || 'Otra',
    sistema:  l => normSistema(l) || 'Otro',
    campana:  l => normSistema(l) || 'Otro',   // alias histórico: en Logic Systems "campaña" ES el sistema
    respuesta: l => firstNonEmpty(l.respuesta_ai, l.ultimo_mensaje) || '',
};

// --- Dimensiones fijas del negocio de Logic Systems ----------
// La empresa vende demos de 4 sistemas; cada lead pide uno de ellos (chips "Sistema").
const SISTEMAS = ['CIB Financiera', 'e-SIGeN', 'CIB Casa de Empeño', 'e-SIGeN PLD'];
// Las fuentes de adquisición que se manejan siempre (chips "Fuente").
const FUENTES  = ['Facebook', 'WhatsApp', 'Instagram', 'Google'];

// Normaliza el valor crudo del lead (utm_campaign) a uno de los 4 sistemas fijos, o null si no cae.
// Ajusta los patrones cuando confirmes cómo llega el dato real desde Kommo.
function normSistema(l) {
    const s = (firstNonEmpty(l.utm_campaign, l.sistema, l.campana, l.campaign) || '').toString().toLowerCase();
    if (/empe[ñn]o|casa.?de.?emp/.test(s)) return 'CIB Casa de Empeño'; // antes que "cib"
    if (/pld/.test(s))                     return 'e-SIGeN PLD';        // antes que "sigen"
    if (/e.?sigen|sigen/.test(s))          return 'e-SIGeN';
    if (/financiera|cib/.test(s))          return 'CIB Financiera';
    return null;
}
// Normaliza la fuente cruda del lead (utm_medium/utm_source) a una de las 4 fuentes fijas, o null si no cae.
function normFuente(l) {
    const s = (firstNonEmpty(l.utm_medium, l.utm_source, l.fuente, l.canal) || '').toString().toLowerCase();
    if (/whats|wpp|\bwa\b/.test(s))             return 'WhatsApp';
    if (/insta|\big\b|ig[_-]/.test(s))          return 'Instagram';
    if (/face|\bfb\b|fb[_-]|meta/.test(s))      return 'Facebook';
    if (/google|goog|adwords|gads|\bcpc\b/.test(s)) return 'Google';
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
// Un lead "tiene demo" si el calendario la agendó/reagendó/confirmó, o si trae fecha/evento.
function tieneDemo(l) {
    if (/agend|reagend|confirm/.test(accionCal(l))) return true;
    return !!firstNonEmpty(l.demo_inicio, l.event_id);
}
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
    period: '30d',            // hoy | 7d | 30d | todo
    campanaFilter: null,
    fuenteFilter: null,
};
const PERIODS = [
    { key: 'hoy', label: 'Hoy',       days: 1 },
    { key: '7d',  label: '7 días',    days: 7 },
    { key: '30d', label: '30 días',   days: 30 },
    { key: 'trimestre', label: 'Trimestre', days: 90 },
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
function fmtDelta(cur, prev) {
    if (prev <= 0) return cur > 0 ? '100%' : '0%';
    return Math.round(((cur - prev) / prev) * 100) + '%';
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
    const def = PERIODS.find(p => p.key === period) || PERIODS[2];
    if (!def.days) return { start: null, end: null, prevStart: null, prevEnd: null };
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

// ============================================================
// INIT
// ============================================================
async function init() {
    try {
        const session = typeof getSession === 'function' ? getSession() : null;
        if (!session) { location.href = 'login.html'; return; }
        if (!(session.role === 'admin' || (session.clients || []).includes(SLUG))) { location.href = 'hub.html'; return; }
        setTxt('welcome-name', session.name || 'Administrador');

        status('Cargando datos…');
        await loadConfig();
        await fetchLeads();

        renderPeriods();
        renderChips();
        renderAll();
        status(null);
    } catch (err) {
        console.error('[director] init error', err);
        status('Error al cargar el panel: ' + (err.message || err), true);
    }
}

async function loadConfig() {
    const { data, error } = await window.supabase
        .from('clients_config').select('*').eq('id_slug', SLUG).single();
    if (error || !data) throw new Error('No se encontró la config de "' + SLUG + '" en clients_config.');
    S.config = data;
    setTxt('dg-client-name', data.name || 'Logic Systems');
    setTxt('client-name-display', data.name || 'Logic Systems');
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

// ============================================================
// RENDER
// ============================================================
function renderAll() {
    const { cur, prev } = scopedLeads();
    renderHeroYFunnel(cur, prev);
    renderDonut(cur);
    renderSources(cur);
    renderCampanas(cur, prev);
    renderTrend(cur);
    renderSeguimiento(cur);
    setAll('periodLabel', (PERIODS.find(p => p.key === S.period) || {}).label || '');
}

function renderPeriods() {
    const host = document.getElementById('periods');
    host.innerHTML = '';
    PERIODS.forEach(p => {
        const active = p.key === S.period;
        const b = document.createElement('button');
        b.textContent = p.label;
        b.style.cssText = 'font-size:12.5px; font-weight:600; padding:7px 13px; border-radius:10px; transition:all 160ms ease; ' +
            (active ? 'background:#FFFFFF; color:#0A6CFF; box-shadow:0 1px 3px rgba(16,24,40,0.12);'
                    : 'background:transparent; color:#6E6E73;');
        b.onclick = () => { S.period = p.key; renderPeriods(); renderAll(); };
        host.appendChild(b);
    });
}

function chipButton(label, active, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font-size:12.5px; font-weight:500; padding:6px 13px; border-radius:999px; transition:all 160ms ease; ' +
        (active ? 'background:#0A6CFF; color:#fff; border:1px solid #0A6CFF;'
                : 'background:#fff; color:#3A3A3C; border:1px solid #E3E3E8;');
    b.onclick = onClick;
    return b;
}
function renderChips() {
    // Chips fijos: los 4 sistemas del negocio y las 4 fuentes que se manejan siempre.
    const sysHost = document.getElementById('sysChips');
    sysHost.innerHTML = '';
    sysHost.appendChild(chipButton('Todos', !S.campanaFilter, () => { S.campanaFilter = null; renderChips(); renderAll(); }));
    SISTEMAS.forEach(k => sysHost.appendChild(chipButton(k, S.campanaFilter === k,
        () => { S.campanaFilter = (S.campanaFilter === k ? null : k); renderChips(); renderAll(); })));

    const srcHost = document.getElementById('srcChips');
    srcHost.innerHTML = '';
    srcHost.appendChild(chipButton('Todas', !S.fuenteFilter, () => { S.fuenteFilter = null; renderChips(); renderAll(); }));
    FUENTES.forEach(k => srcHost.appendChild(chipButton(k, S.fuenteFilter === k,
        () => { S.fuenteFilter = (S.fuenteFilter === k ? null : k); renderChips(); renderAll(); })));
}

// --- Hero (calificados) + funnel + descartados ---------------
function renderHeroYFunnel(cur, prev) {
    const calificados = cur.filter(esCalificado).length;
    const califPrev = prev.filter(esCalificado).length;
    const total = cur.length;
    const conResp = cur.filter(conRespuesta).length;
    const descartados = cur.filter(esDescartado).length;

    setAll('citasFmt', fmtInt(calificados));
    setAll('dCitas', fmtDelta(calificados, califPrev));
    setTxt('descartadosFmt', fmtInt(descartados) + ' leads');
    setTxt('horas', fmtInt(descartados * 0.25)); // ~15 min de calificación ahorrados por lead descartado

    // Funnel: primer mensaje → con respuesta → calificado
    const stages = [
        { name: 'Mensajes recibidos', value: total,      color: PALETTE[0] },
        { name: 'Leads calificados',  value: conResp,     color: PALETTE[3] },
        { name: 'Citas agendadas',    value: calificados, color: PALETTE[1] },
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
        </div>`).join('');

    const ultimo = [...cur].filter(esCalificado).sort((a, b) => (F.fecha(b) || 0) - (F.fecha(a) || 0))[0];
    setTxt('tickerMsg', ultimo
        ? `Nueva cita agendada · ${F.nombre(ultimo)} (${F.campana(ultimo)})`
        : 'El agente está agendando demos en tiempo real.');
}

// --- Donut: tasa de calificación (calificados / con respuesta) ---
function renderDonut(cur) {
    const conResp = cur.filter(conRespuesta).length;
    const calificados = cur.filter(esCalificado).length;
    const rate = pct(calificados, conResp);
    const r = 52, c = 2 * Math.PI * r, off = c * (1 - rate / 100);
    document.getElementById('donut').innerHTML = `
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="${r}" fill="none" stroke="#EFF1F5" stroke-width="14"/>
        <circle cx="70" cy="70" r="${r}" fill="none" stroke="#0A6CFF" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
          transform="rotate(-90 70 70)" style="transition:stroke-dashoffset 700ms cubic-bezier(0.2,0.7,0.2,1);"/>
        <text x="70" y="70" text-anchor="middle" font-family="Inter,sans-serif" font-size="30" font-weight="600" fill="#0A6CFF">${rate}%</text>
        <text x="70" y="92" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" fill="#86868B">agendan</text>
      </svg>`;
}

// --- Fuente de los leads (utm_medium) ------------------------
function renderSources(cur) {
    const total = cur.length || 1;
    const counts = {};
    cur.forEach(l => { const k = F.fuente(l); counts[k] = (counts[k] || 0) + 1; });
    // Siempre las 4 fuentes fijas, en orden, aunque alguna venga en 0.
    const top = FUENTES.map(k => ({ key: k, count: counts[k] || 0 }));
    const max = Math.max(1, ...top.map(g => g.count));
    document.getElementById('sources').innerHTML = top.map((g, i) => {
        const color = PALETTE[i % PALETTE.length];
        return `
        <div style="margin-bottom:14px; cursor:pointer;" onclick="window.__dgFilterFuente(${jsArg(g.key)})">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="display:flex; align-items:center; gap:8px; font-size:13px; color:#3A3A3C;"><span style="width:8px; height:8px; border-radius:2px; background:${color};"></span>${esc(g.key)}</span>
            <span style="font-size:13px; font-weight:600; color:#1D1D1F;">${pct(g.count, total)}%</span>
          </div>
          <div style="height:6px; border-radius:999px; background:#EFF1F5; overflow:hidden;">
            <div style="height:100%; width:${pct(g.count, max)}%; background:${color}; border-radius:999px; transition:width 600ms cubic-bezier(0.2,0.7,0.2,1);"></div>
          </div>
        </div>`;
    }).join('');
}
window.__dgFilterFuente = (k) => { S.fuenteFilter = (S.fuenteFilter === k ? null : k); renderChips(); renderAll(); };

// --- Estadísticas por campaña + campaña top ------------------
function renderCampanas(cur, prev) {
    const totalLeads = cur.length || 1;
    const curByCamp = {}, prevByCamp = {};
    cur.forEach(l => { const k = F.campana(l); curByCamp[k] = (curByCamp[k] || 0) + 1; });
    prev.forEach(l => { const k = F.campana(l); prevByCamp[k] = (prevByCamp[k] || 0) + 1; });
    // Siempre los 4 sistemas fijos, en orden, aunque alguno venga en 0.
    const groups = SISTEMAS.map(k => ({ key: k, count: curByCamp[k] || 0 }));
    const max = Math.max(1, ...groups.map(g => g.count));

    document.getElementById('products').innerHTML = groups.map((g, i) => {
        const color = PALETTE[i % PALETTE.length];
        const delta = fmtDelta(g.count, prevByCamp[g.key] || 0);
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
          <div style="margin-top:14px;"><span style="display:inline-block; padding:3px 10px; border-radius:999px; background:#E7F7EF; color:#0E8F53; font-weight:600; font-size:12px;">↑ ${delta} vs. periodo</span></div>
        </div>`;
    }).join('');

    // Sistema más solicitado = el de mayor volumen de demos.
    const topG = groups.slice().sort((a, b) => b.count - a.count)[0];
    if (topG && topG.count > 0) {
        setTxt('topShare', pct(topG.count, totalLeads) + '%');
        setTxt('topName', topG.key);
        setTxt('topValue', fmtInt(topG.count));
        setTxt('topDelta', fmtDelta(topG.count, prevByCamp[topG.key] || 0));
    } else {
        setTxt('topShare', '—'); setTxt('topName', 'Sin datos'); setTxt('topValue', '0'); setTxt('topDelta', '0%');
    }
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
    const totalDays = Math.max(1, Math.round((e - s) / 86400000) + 1);
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

    const W = 900, H = 130, padX = 14, padY = 16;
    const max = Math.max(1, ...buckets.map(b => b.count));
    const stepX = (W - padX * 2) / Math.max(1, N - 1);
    const pts = buckets.map((b, i) => [padX + i * stepX, H - padY - (b.count / max) * (H - padY * 2)]);
    const linePath = smoothPath(pts);
    const areaPath = linePath + ` L${(W - padX).toFixed(1)} ${H - padY} L${padX} ${H - padY} Z`;
    const dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="#fff" stroke="#0A6CFF" stroke-width="1.5"/>`).join('');

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
          <line class="dg-trend-guide" x1="0" y1="${padY}" x2="0" y2="${H - padY}" stroke="#0A6CFF" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
          <circle class="dg-trend-marker" r="5" fill="#0A6CFF" stroke="#fff" stroke-width="2.5" opacity="0"/>
        </svg>
        <div class="dg-trend-tip" style="position:absolute; pointer-events:none; transform:translate(-50%,-125%); background:#0B1220; color:#fff; padding:6px 10px; border-radius:8px; font-size:11.5px; font-weight:600; white-space:nowrap; opacity:0; transition:opacity 120ms; box-shadow:0 4px 14px rgba(0,0,0,0.22);"></div>
      </div>`;

    // Hover: marca la fecha con un círculo + tooltip con los calificados de esa fecha.
    const svg = host.querySelector('.dg-trend-svg');
    const wrap = host.querySelector('.dg-trend-wrap');
    const guide = host.querySelector('.dg-trend-guide');
    const marker = host.querySelector('.dg-trend-marker');
    const tip = host.querySelector('.dg-trend-tip');
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
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

// --- Prospectos en seguimiento (leads calificados recientes) -
function renderSeguimiento(cur) {
    const items = cur.filter(esCalificado)
        .map(l => ({ l, d: F.fecha(l) }))
        .filter(x => x.d)
        .sort((a, b) => b.d - a.d)
        .slice(0, 12);
    const host = document.getElementById('demoGroups');
    const empty = document.getElementById('noDemos');
    if (!items.length) { host.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    const byDay = new Map();
    items.forEach(({ l, d }) => {
        const key = d.toISOString().slice(0, 10);
        if (!byDay.has(key)) byDay.set(key, { d, arr: [] });
        byDay.get(key).arr.push(l);
    });
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    host.innerHTML = [...byDay.values()].map(group => {
        const g = group.d;
        const rows = group.arr.map((l, i) => {
            const soft = ['#F5F8FF', '#F4FBF7', '#FFF9F0'][i % 3];
            const accent = PALETTE[i % PALETTE.length];
            const atencion = esAtencion(l);
            const estColor = atencion ? '#0E8F53' : '#B7791F';
            const estLabel = atencion ? 'Atención personal' : 'En seguimiento';
            const hora = parseHora(firstNonEmpty(l.demo_inicio, l.fecha_creacion, l.fecha)) || '—';
            const precio = F.precio(l);
            const sub = [F.telefono(l), l.empresa, F.campana(l)].filter(Boolean).join(' · ');
            return `
            <div class="card-lift" style="display:flex; align-items:center; gap:16px; padding:13px 16px; border-radius:14px; background:${soft}; margin-bottom:10px;">
              <div style="flex:none; width:58px; text-align:center;">
                <div style="font-size:16px; font-weight:600; color:#1D1D1F; letter-spacing:-0.01em;">${esc(hora)}</div>
                <div style="font-size:10.5px; color:#86868B; margin-top:2px;">${precio ? '$' + fmtInt(precio) : 'lead'}</div>
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
        return `
        <div style="margin-top:22px;">
          <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #F2F2F5;">
            <span style="font-size:13.5px; font-weight:600; color:#1D1D1F;">${dias[g.getDay()]}</span>
            <span style="font-size:12.5px; color:#86868B;">${g.getDate()} ${meses[g.getMonth()]}</span>
            <span style="margin-left:auto; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#A1A1A6; white-space:nowrap;">${group.arr.length} lead${group.arr.length !== 1 ? 's' : ''}</span>
          </div>
          ${rows}
        </div>`;
    }).join('');
}

// ============================================================
// HELPERS
// ============================================================
// Serializa un string como argumento JS seguro dentro de un atributo onclick.
function jsArg(str) { return JSON.stringify(String(str)).replace(/"/g, '&quot;'); }

// ============================================================
// DEMO data (solo si webhook_url === 'DEMO')
// ============================================================
function demoLeads() {
    const fuentes = ['Facebook', 'WhatsApp', 'Instagram', 'Google'];
    const campanas = ['CIB Financiera', 'e-SIGeN', 'CIB Casa de Empeño', 'e-SIGeN PLD'];
    const nombres = ['Carlos Vega', 'Liliana Estrada', 'Jorge Herrera', 'Ana Ruiz', 'MVZ. Cesar Gamboa', 'Sci consultores'];
    const stages = [ST.RECHAZADO, ST.RECHAZADO, ST.SEGUIMIENTO, ST.SIN_RESPUESTA, ST.ATENCION, ST.RECHAZADO];
    const labels = { [ST.RECHAZADO]: 'rechazado', [ST.SEGUIMIENTO]: 'Seguimiento CAMILA', [ST.SIN_RESPUESTA]: 'SIN RESPUESTA', [ST.ATENCION]: 'atencion personalizada' };
    const out = [];
    for (let i = 0; i < 140; i++) {
        const daysAgo = Math.floor((i * 7) % 30);
        const d = new Date(); d.setDate(d.getDate() - daysAgo);
        const id = stages[i % stages.length];
        out.push({
            nombre: nombres[i % nombres.length],
            telefono: '+52199' + (1000000 + i),
            precio: [0, 0, 150000, 500000][i % 4],
            estatus: labels[id], estatus_id: id, tags: [],
            fecha_creacion: `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}, ${1 + (i % 11)}:0${i % 6}:00 p.m.`,
            utm_medium: fuentes[i % fuentes.length],
            utm_campaign: campanas[i % campanas.length],
        });
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
