// =============================================================
// CEFEMEX CAPITAL — Métricas: "Tiempos por lead"
// Tab exclusivo de clientId === 'cefemex'. Dos vistas sobre el
// embudo de crédito:
//   · Cerrados — leads Ganados/Perdidos y días por etapa.
//   · Activos  — leads que siguen en el proceso y sus relojes.
// El endpoint n8n ya entrega todo calculado: este módulo solo
// pinta la respuesta, no calcula nada.
//
// Nota multi-cliente: el endpoint sirve SOLO a CEFEMEX (el
// subdominio de Kommo está fijo del lado de n8n), por eso la URL
// vive aquí y el tab está gateado a clientId === 'cefemex'. Si
// otro partner necesita este reporte, hay que parametrizar la
// ruta (p.ej. desde clients_config) antes de reutilizar esto.
// =============================================================

const CMX_ENDPOINT_BASE = 'https://cefemexyucatan.app.n8n.cloud/webhook';

// Cada vista tiene su propio "por" (un lead activo no tiene fecha de cierre)
// y su propia columna de orden por defecto.
const CMX_VISTAS = {
    cierres: {
        porOpciones: [
            { value: 'cierre', label: 'Por cierre' },
            { value: 'creacion', label: 'Por creación' },
        ],
        porDefault: 'cierre',
        sortDefault: 'dias_en_proceso',
    },
    activos: {
        porOpciones: [
            { value: 'entrada', label: 'Por entrada' },
            { value: 'creacion', label: 'Por creación' },
        ],
        porDefault: 'entrada',
        sortDefault: 'dias_activo',
    },
};

const cefemexMetrics = {
    initialized: false,
    loading: false,
    error: null,
    vista: 'cierres',
    desde: null,
    hasta: null,
    por: CMX_VISTAS.cierres.porDefault,
    data: null,
    sortCol: CMX_VISTAS.cierres.sortDefault,
    sortDir: 'desc',
    flatpickr: null,
};

function initCefemexMetrics() {
    if (cefemexMetrics.initialized) return;
    cefemexMetrics.initialized = true;

    // Delegado sobre el panel estático: el contenido se re-pinta con innerHTML
    // en cada render, así que no se puede escuchar directo en los <th>.
    const panel = document.getElementById('cefemex-metrics-panel');
    if (panel) {
        panel.addEventListener('click', (e) => {
            const th = e.target.closest('[data-cmx-sort]');
            if (th) cmxSortBy(th.getAttribute('data-cmx-sort'));
        });
    }

    setupCefemexMetricsControls();
    fetchCefemexMetrics();
}

function setupCefemexMetricsControls() {
    const input = document.getElementById('cmx-date-range');
    if (input && typeof flatpickr === 'function') {
        cefemexMetrics.flatpickr = flatpickr(input, {
            mode: 'range',
            locale: 'es',
            dateFormat: 'Y-m-d',
            disableMobile: 'true',
            onClose: (selectedDates) => {
                if (selectedDates.length === 2) {
                    cefemexMetrics.desde = selectedDates[0];
                    const hasta = new Date(selectedDates[1]);
                    hasta.setHours(23, 59, 59, 999);
                    cefemexMetrics.hasta = hasta;
                    fetchCefemexMetrics();
                } else if (selectedDates.length === 0) {
                    cefemexMetrics.desde = null;
                    cefemexMetrics.hasta = null;
                    fetchCefemexMetrics();
                }
            }
        });
    }

    const vistaToggle = document.getElementById('cmx-vista-toggle');
    if (vistaToggle) {
        vistaToggle.querySelectorAll('[data-vista]').forEach(btn => {
            btn.addEventListener('click', () => cmxSetVista(btn.dataset.vista));
        });
    }

    cmxRenderPorToggle();
}

function cmxSetVista(vista) {
    if (!CMX_VISTAS[vista] || cefemexMetrics.vista === vista) return;
    cefemexMetrics.vista = vista;
    // El "por" y la columna de orden de la vista anterior no aplican aquí.
    cefemexMetrics.por = CMX_VISTAS[vista].porDefault;
    cefemexMetrics.sortCol = CMX_VISTAS[vista].sortDefault;
    cefemexMetrics.sortDir = 'desc';

    const vistaToggle = document.getElementById('cmx-vista-toggle');
    if (vistaToggle) {
        vistaToggle.querySelectorAll('[data-vista]').forEach(b => {
            b.classList.toggle('active', b.dataset.vista === vista);
        });
    }
    cmxRenderPorToggle();
    fetchCefemexMetrics();
}

function cmxRenderPorToggle() {
    const cont = document.getElementById('cmx-por-toggle');
    if (!cont) return;
    const opciones = CMX_VISTAS[cefemexMetrics.vista].porOpciones;
    cont.innerHTML = opciones.map(o => `
        <button type="button" class="cmx-por-btn ${o.value === cefemexMetrics.por ? 'active' : ''}" data-por="${o.value}">${escapeHtml(o.label)}</button>
    `).join('');
    cont.querySelectorAll('[data-por]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (cefemexMetrics.por === btn.dataset.por) return;
            cefemexMetrics.por = btn.dataset.por;
            cont.querySelectorAll('[data-por]').forEach(b => b.classList.toggle('active', b === btn));
            fetchCefemexMetrics();
        });
    });
}

function cmxUnixSeconds(date) {
    return Math.floor(date.getTime() / 1000);
}

function buildCefemexMetricsUrl(kind) {
    const path = kind === 'excel' ? 'tiempos-excel' : 'tiempos-leads';
    const params = new URLSearchParams();
    params.set('vista', cefemexMetrics.vista);
    if (cefemexMetrics.desde) params.set('desde', cmxUnixSeconds(cefemexMetrics.desde));
    if (cefemexMetrics.hasta) params.set('hasta', cmxUnixSeconds(cefemexMetrics.hasta));
    params.set('por', cefemexMetrics.por);
    return `${CMX_ENDPOINT_BASE}/${path}?${params.toString()}`;
}

async function fetchCefemexMetrics() {
    cefemexMetrics.loading = true;
    cefemexMetrics.error = null;
    renderCefemexMetricsState();
    try {
        const res = await fetch(buildCefemexMetricsUrl('leads'), { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cefemexMetrics.data = await res.json();
        cefemexMetrics.loading = false;
        renderCefemexMetricsState();
    } catch (err) {
        console.error('[CEFEMEX Métricas] Error al cargar tiempos-leads:', err);
        cefemexMetrics.loading = false;
        cefemexMetrics.error = err.name === 'TimeoutError' ? 'el endpoint tardó demasiado' : (err.message || 'Error desconocido');
        renderCefemexMetricsState();
    }
}

function downloadCefemexMetricsExcel() {
    window.open(buildCefemexMetricsUrl('excel'), '_blank');
}

function renderCefemexMetricsState() {
    const content = document.getElementById('cmx-content');
    if (!content) return;
    if (cefemexMetrics.loading) {
        content.innerHTML = `<div class="cmx-state-msg">Cargando métricas…</div>`;
        return;
    }
    if (cefemexMetrics.error) {
        content.innerHTML = `<div class="cmx-state-msg">No se pudo cargar el reporte (${escapeHtml(cefemexMetrics.error)}).<br><button type="button" class="cmx-btn" style="margin-top:10px;" onclick="fetchCefemexMetrics()">Reintentar</button></div>`;
        return;
    }
    if (!cefemexMetrics.data) {
        content.innerHTML = `<div class="cmx-state-msg">Sin datos.</div>`;
        return;
    }
    renderCefemexMetricsContent();
}

// ---------- formato ----------

function fmtDias(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Fecha fijada a CDMX: el endpoint entrega instantes UTC y varios cierres caen
// entre 00:00 y 06:00 UTC, que en la zona del cliente son el día anterior.
function fmtFecha(iso) {
    if (!iso) return '—';
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric' });
}

function cmxNum(v) {
    return Number(v ?? 0).toLocaleString('es-MX');
}

function cmxMonto(v) {
    const n = Number(v);
    if (!n || Number.isNaN(n)) return '—';
    return '$' + n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

// Escala de un solo tono; los cortes (1/5/15/30 días) los definió el reporte.
function cmxHeatColor(days) {
    const d = Number(days);
    if (d >= 30) return 'rgba(167,139,250,0.55)';
    if (d >= 15) return 'rgba(167,139,250,0.38)';
    if (d >= 5) return 'rgba(167,139,250,0.24)';
    if (d >= 1) return 'rgba(167,139,250,0.13)';
    return 'rgba(167,139,250,0.05)';
}

// ---------- contenido ----------

function renderCefemexMetricsContent() {
    const content = document.getElementById('cmx-content');
    if (!content) return;
    const totales = cefemexMetrics.data.totales;
    if (!totales) {
        content.innerHTML = `<div class="cmx-state-msg">La respuesta del endpoint no trae totales.</div>`;
        return;
    }
    const esActivos = cefemexMetrics.vista === 'activos';
    const hayLeads = (cefemexMetrics.data.leads || []).length > 0;
    const vacio = esActivos
        ? 'Sin leads activos en este rango.'
        : 'Sin leads cerrados en este rango.';

    content.innerHTML = `
        ${esActivos ? '' : cmxBuildNoteHtml(totales)}
        ${esActivos ? cmxBuildCardsActivosHtml(totales) : cmxBuildCardsHtml(totales)}
        ${hayLeads
            ? '<div class="cmx-table-card" id="cmx-table-slot"></div>'
            : `<div class="cmx-state-msg">${vacio}</div>${esActivos ? '' : cmxBuildDescartadosHtml()}`}
        ${cmxBuildCriteriosHtml(cefemexMetrics.data.criterios)}
    `;
    if (hayLeads) cmxRenderTableSlot();
}

function cmxRenderTableSlot() {
    const slot = document.getElementById('cmx-table-slot');
    if (!slot) return;
    slot.innerHTML = cefemexMetrics.vista === 'activos'
        ? cmxBuildTableActivosHtml()
        : cmxBuildTableCierresHtml();
}

// ---------- tarjetas ----------

function cmxBuildNoteHtml(totales) {
    if (!totales) return '';
    const ganados = Number(totales.ganados) || 0;
    const perdidos = Number(totales.perdidos) || 0;
    // Solo advertir cuando la comparación existe y el lado ganador es la base chica.
    if (ganados === 0 && perdidos === 0) return '';
    if (ganados >= perdidos || ganados >= 30) return '';
    return `
        <div class="cmx-note">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <span>Comparación con poca base: ${cmxNum(ganados)} leads ganados contra ${cmxNum(perdidos)} perdidos en este rango. Cualquier lectura entre ambos grupos se apoya en muy pocos casos del lado ganador.</span>
        </div>
    `;
}

function cmxRenderCards(cards) {
    return `<div class="cmx-cards">${cards.map(c => `
        <div class="card-quantix ${c.cls}">
            <div class="kpi-card-top">
                <div class="label-group">
                    <span class="label-main">${escapeHtml(c.label)}</span>
                    <span class="label-sub">${escapeHtml(c.sub)}</span>
                </div>
                <div class="icon-box"><ion-icon name="${c.icon}"></ion-icon></div>
            </div>
            <div class="value-big">${c.value}</div>
        </div>
    `).join('')}</div>`;
}

function cmxBuildCardsHtml(totales) {
    if (!totales) return '';
    return cmxRenderCards([
        { label: 'Leads en el rango', sub: 'TOTAL', value: cmxNum(totales.leads), cls: 'card-cyan', icon: 'people-outline' },
        { label: 'Ganados', sub: 'CERRADOS', value: cmxNum(totales.ganados), cls: 'card-orange', icon: 'trophy-outline' },
        { label: 'Perdidos', sub: 'CERRADOS', value: cmxNum(totales.perdidos), cls: 'card-pink', icon: 'close-circle-outline' },
        { label: 'Días en proceso · Ganado', sub: `Mediana ${fmtDias(totales.dias_en_proceso_mediana_ganado)}`, value: fmtDias(totales.dias_en_proceso_promedio_ganado), cls: 'card-purple', icon: 'trending-up-outline' },
        { label: 'Días en proceso · Perdido', sub: `Mediana ${fmtDias(totales.dias_en_proceso_mediana_perdido)}`, value: fmtDias(totales.dias_en_proceso_promedio_perdido), cls: 'card-purple', icon: 'trending-down-outline' },
    ]);
}

function cmxBuildCardsActivosHtml(totales) {
    if (!totales) return '';
    return cmxRenderCards([
        { label: 'Leads activos', sub: 'EN EL PROCESO', value: cmxNum(totales.leads), cls: 'card-cyan', icon: 'people-outline' },
        { label: 'Monto en el embudo', sub: 'DINERO EXPUESTO', value: cmxMonto(totales.monto_total), cls: 'card-orange', icon: 'cash-outline' },
        { label: 'Días activo · promedio', sub: `Mediana ${fmtDias(totales.dias_activo_mediana)}`, value: fmtDias(totales.dias_activo_promedio), cls: 'card-purple', icon: 'time-outline' },
        { label: 'Días activo · máximo', sub: 'EL MÁS ESTANCADO', value: fmtDias(totales.dias_activo_max), cls: 'card-pink', icon: 'hourglass-outline' },
        { label: 'Leads que rebotaron', sub: 'SALIERON Y VOLVIERON', value: cmxNum(totales.leads_que_rebotaron), cls: 'card-orange', icon: 'repeat-outline' },
    ]);
}

// ---------- orden ----------

function cmxSortIcon(col) {
    if (cefemexMetrics.sortCol !== col) return '<ion-icon name="swap-vertical-outline"></ion-icon>';
    return cefemexMetrics.sortDir === 'asc'
        ? '<ion-icon name="chevron-up-outline"></ion-icon>'
        : '<ion-icon name="chevron-down-outline"></ion-icon>';
}

function cmxSortValue(lead, col) {
    switch (col) {
        case 'lead_id': return Number(lead.lead_id) || 0;
        case 'resultado': return lead.resultado || '';
        case 'etapa_actual': return lead.etapa_actual || '';
        case 'creado_en': return lead.creado_en ? new Date(lead.creado_en).getTime() : -Infinity;
        case 'cerrado_en': return lead.cerrado_en ? new Date(lead.cerrado_en).getTime() : -Infinity;
        case 'entro_al_proceso_en': return lead.entro_al_proceso_en ? new Date(lead.entro_al_proceso_en).getTime() : -Infinity;
        case 'precio': return Number(lead.precio) || 0;
        case 'etapas_count': return Object.keys(lead.dias_por_etapa || {}).length;
        case 'dias_en_proceso':
        case 'dias_activo': {
            const v = lead[col];
            return (v === null || v === undefined) ? -Infinity : Number(v);
        }
        default: {
            const v = (lead.dias_por_etapa || {})[col];
            return (v === undefined || v === null) ? -Infinity : Number(v);
        }
    }
}

function cmxSortBy(col) {
    if (cefemexMetrics.sortCol === col) {
        cefemexMetrics.sortDir = cefemexMetrics.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        cefemexMetrics.sortCol = col;
        cefemexMetrics.sortDir = 'desc';
    }
    cmxRenderTableSlot();
}

function cmxSortedLeads() {
    return (cefemexMetrics.data.leads || []).slice().sort((a, b) => {
        const av = cmxSortValue(a, cefemexMetrics.sortCol);
        const bv = cmxSortValue(b, cefemexMetrics.sortCol);
        const cmp = (typeof av === 'string' || typeof bv === 'string')
            ? String(av).localeCompare(String(bv), 'es')
            : av - bv;
        return cefemexMetrics.sortDir === 'asc' ? cmp : -cmp;
    });
}

// ---------- tablas ----------

// Las columnas de etapa salen SIEMPRE de etapas[]: la config vive en Supabase
// y puede cambiar sin tocar este código.
function cmxEtapaHeaderCells(etapas) {
    return etapas.map(e => `<th data-cmx-sort="${escapeHtml(e.etapa)}">${escapeHtml(e.etapa)} ${cmxSortIcon(e.etapa)}</th>`).join('');
}

// Celda vacía ≠ cero: si la etapa no está en dias_por_etapa el lead nunca pasó
// por ahí. `enCurso` marca la etapa actual, cuyo número sigue creciendo.
function cmxEtapaBodyCells(etapas, dxe, enCurso) {
    return etapas.map(e => {
        const v = dxe[e.etapa];
        if (v === undefined || v === null) return `<td class="cmx-day-empty">—</td>`;
        const cls = e.etapa === enCurso ? 'cmx-day-cell cmx-en-curso' : 'cmx-day-cell';
        const title = e.etapa === enCurso ? ' title="Etapa en curso: este número sigue creciendo"' : '';
        return `<td class="${cls}" style="background:${cmxHeatColor(v)}"${title}>${fmtDias(v)}</td>`;
    }).join('');
}

function cmxBuildTableCierresHtml() {
    const etapas = cefemexMetrics.data.etapas || [];
    const leads = cmxSortedLeads();

    const headerCells = [
        `<th class="cmx-col-sticky-lead" data-cmx-sort="lead_id">Lead ID ${cmxSortIcon('lead_id')}</th>`,
        `<th class="cmx-col-sticky-result" data-cmx-sort="resultado">Resultado ${cmxSortIcon('resultado')}</th>`,
        `<th data-cmx-sort="creado_en">Creado ${cmxSortIcon('creado_en')}</th>`,
        `<th data-cmx-sort="cerrado_en">Cerrado ${cmxSortIcon('cerrado_en')}</th>`,
        cmxEtapaHeaderCells(etapas),
        `<th data-cmx-sort="dias_en_proceso">Total en proceso ${cmxSortIcon('dias_en_proceso')}</th>`,
        `<th data-cmx-sort="etapas_count">Etapas ${cmxSortIcon('etapas_count')}</th>`,
    ].join('');

    const bodyRows = leads.map(lead => {
        const dxe = lead.dias_por_etapa || {};
        const resultClass = lead.resultado === 'Ganado' ? 'cmx-badge-ganado' : 'cmx-badge-perdido';
        const totalStyle = (lead.dias_en_proceso === null || lead.dias_en_proceso === undefined)
            ? '' : `style="background:${cmxHeatColor(lead.dias_en_proceso)}"`;
        return `<tr>
            <td class="cmx-col-sticky-lead">${escapeHtml(lead.lead_id)}</td>
            <td class="cmx-col-sticky-result ${resultClass}">${escapeHtml(lead.resultado || '—')}</td>
            <td>${fmtFecha(lead.creado_en)}</td>
            <td>${fmtFecha(lead.cerrado_en)}</td>
            ${cmxEtapaBodyCells(etapas, dxe, null)}
            <td class="cmx-day-cell" ${totalStyle}>${fmtDias(lead.dias_en_proceso)}</td>
            <td>${Object.keys(dxe).length}</td>
        </tr>`;
    }).join('');

    // colspan 4 = Lead, Resultado, Creado, Cerrado (las columnas previas a etapas).
    const foot = cmxBuildFooterRow(etapas, leads, 'dias_en_proceso', 4, 2);

    return `
        <div class="cmx-table-wrapper">
            <table class="cmx-table" id="cmx-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
                ${foot}
            </table>
        </div>
        ${cmxBuildDescartadosHtml()}
    `;
}

function cmxBuildTableActivosHtml() {
    const etapas = cefemexMetrics.data.etapas || [];
    const leads = cmxSortedLeads();

    const headerCells = [
        `<th class="cmx-col-sticky-lead" data-cmx-sort="lead_id">Lead ID ${cmxSortIcon('lead_id')}</th>`,
        `<th class="cmx-col-sticky-etapa" data-cmx-sort="etapa_actual">Etapa actual ${cmxSortIcon('etapa_actual')}</th>`,
        `<th data-cmx-sort="entro_al_proceso_en">Entró al proceso ${cmxSortIcon('entro_al_proceso_en')}</th>`,
        cmxEtapaHeaderCells(etapas),
        `<th data-cmx-sort="dias_activo">Días activo ${cmxSortIcon('dias_activo')}</th>`,
        `<th data-cmx-sort="precio">Monto ${cmxSortIcon('precio')}</th>`,
    ].join('');

    let rebotados = 0;
    const bodyRows = leads.map(lead => {
        const dxe = lead.dias_por_etapa || {};
        // Rebote: pasó tiempo fuera del alcance, así que sus columnas de etapa
        // no suman los días activo. Se marca para que no parezca error.
        const reboto = Number(lead.dias_fuera_del_proceso) > 1;
        if (reboto) rebotados++;
        const marca = reboto
            ? `<span class="cmx-rebote" title="Rebotó: ${fmtDias(lead.dias_fuera_del_proceso)} días fuera del proceso">*</span>`
            : '';
        const totalStyle = (lead.dias_activo === null || lead.dias_activo === undefined)
            ? '' : `style="background:${cmxHeatColor(lead.dias_activo)}"`;
        return `<tr>
            <td class="cmx-col-sticky-lead">${escapeHtml(lead.lead_id)}${marca}</td>
            <td class="cmx-col-sticky-etapa" title="${escapeHtml(lead.etapa_actual || '')}">${escapeHtml(lead.etapa_actual || '—')}</td>
            <td>${fmtFecha(lead.entro_al_proceso_en)}</td>
            ${cmxEtapaBodyCells(etapas, dxe, lead.etapa_actual)}
            <td class="cmx-day-cell" ${totalStyle}>${fmtDias(lead.dias_activo)}</td>
            <td class="cmx-day-cell">${cmxMonto(lead.precio)}</td>
        </tr>`;
    }).join('');

    // colspan 3 = Lead, Etapa actual, Entró al proceso.
    const foot = cmxBuildFooterRow(etapas, leads, 'dias_activo', 3, 2);

    return `
        <div class="cmx-table-wrapper">
            <table class="cmx-table" id="cmx-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
                ${foot}
            </table>
        </div>
        ${cmxBuildActivosNotasHtml(rebotados)}
    `;
}

function cmxMedian(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// `colspanInicial` debe coincidir con las columnas previas a las de etapa, o
// los promedios quedan bajo la etapa equivocada. `colsFinales` son las que van
// después (total + etapas/monto).
function cmxBuildFooterRow(etapas, leads, campoTotal, colspanInicial, colsFinales) {
    const valores = leads
        .map(l => l[campoTotal])
        .filter(v => v !== null && v !== undefined)
        .map(Number);
    const mediana = cmxMedian(valores);
    const promedio = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
    const etapaCounts = etapas.map(e => leads.filter(l => (l.dias_por_etapa || {})[e.etapa] !== undefined).length);

    return `<tfoot><tr class="cmx-tfoot">
        <td colspan="${colspanInicial}">Mediana ${fmtDias(mediana)} · Promedio ${fmtDias(promedio)} (${cmxNum(leads.length)} leads)</td>
        ${etapaCounts.map(c => `<td>${cmxNum(c)} leads</td>`).join('')}
        ${'<td></td>'.repeat(colsFinales)}
    </tr></tfoot>`;
}

// Obligatorio: son leads cerrados en el rango que nunca entraron al proceso,
// así que no están en leads[] y sin esta línea el total no cuadra contra Kommo.
function cmxBuildDescartadosHtml() {
    const d = cefemexMetrics.data.descartados;
    if (!d) return '';
    return `<div class="cmx-descartados">
        <ion-icon name="information-circle-outline" style="vertical-align:-2px;"></ion-icon>
        ${cmxNum(d.total)} leads cerrados en este rango quedaron fuera de la tabla: ${escapeHtml(d.motivo || '')}
        (${cmxNum(d.ganados)} ganados, ${cmxNum(d.perdidos)} perdidos).
    </div>`;
}

// Sin estas notas, una fila con rebote parece un error de cálculo y la etapa
// en curso parece un tiempo cerrado.
function cmxBuildActivosNotasHtml(rebotados) {
    const notas = [];
    if (rebotados > 0) {
        notas.push(`<span><b>*</b> ${cmxNum(rebotados)} leads salieron del proceso y regresaron. En ellos los días por etapa no suman los días activo: la diferencia la pasaron en etapas fuera del alcance (por ejemplo "atención personalizada", que es triage previo y no cuenta como tiempo de etapa).</span>`);
    }
    notas.push('<span>El punto ámbar marca la etapa en curso: ese número no está cerrado y crece cada día que el lead siga ahí.</span>');
    return notas.map(n => `<div class="cmx-footnote"><ion-icon name="information-circle-outline"></ion-icon>${n}</div>`).join('');
}

// El texto viene del endpoint a propósito: si cambian las reglas del reporte,
// se actualiza solo.
function cmxBuildCriteriosHtml(criterios) {
    if (!criterios || typeof criterios !== 'object') return '';
    const entries = Object.entries(criterios).map(([k, v]) => `
        <dt>${escapeHtml(k)}</dt>
        <dd>${escapeHtml(v)}</dd>
    `).join('');
    if (!entries) return '';
    return `<details class="cmx-criterios">
        <summary>Criterios de este reporte</summary>
        <dl class="cmx-criterios-body">${entries}</dl>
    </details>`;
}
