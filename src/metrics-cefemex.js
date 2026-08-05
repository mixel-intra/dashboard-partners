// =============================================================
// CEFEMEX CAPITAL — Métricas: "Días por etapa por lead"
// Tab exclusivo de clientId === 'cefemex'. Consume un endpoint
// n8n que ya trae los días por etapa calculados — este módulo
// solo pinta la respuesta, no calcula nada.
// =============================================================

const CMX_ENDPOINT_BASE = 'https://cefemexyucatan.app.n8n.cloud/webhook';

const cefemexMetrics = {
    initialized: false,
    loading: false,
    error: null,
    desde: null,
    hasta: null,
    por: 'cierre',
    data: null,
    sortCol: 'dias_en_proceso',
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

    const porToggle = document.getElementById('cmx-por-toggle');
    if (porToggle) {
        porToggle.querySelectorAll('.cmx-por-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                porToggle.querySelectorAll('.cmx-por-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                cefemexMetrics.por = btn.dataset.por;
                fetchCefemexMetrics();
            });
        });
    }
}

function downloadCefemexMetricsExcel() {
    window.open(buildCefemexMetricsUrl('excel'), '_blank');
}

function cmxUnixSeconds(date) {
    return Math.floor(date.getTime() / 1000);
}

function buildCefemexMetricsUrl(kind) {
    const path = kind === 'excel' ? 'tiempos-excel' : 'tiempos-leads';
    const params = new URLSearchParams();
    if (kind !== 'excel') params.set('vista', 'cierres');
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
        const res = await fetch(buildCefemexMetricsUrl('leads'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cefemexMetrics.data = await res.json();
        cefemexMetrics.loading = false;
        renderCefemexMetricsState();
    } catch (err) {
        console.error('[CEFEMEX Métricas] Error al cargar tiempos-leads:', err);
        cefemexMetrics.loading = false;
        cefemexMetrics.error = err.message || 'Error desconocido';
        renderCefemexMetricsState();
    }
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

function cmxBuildCardsHtml(totales) {
    if (!totales) return '';
    const cards = [
        { label: 'Leads en el rango', sub: 'TOTAL', value: cmxNum(totales.leads), cls: 'card-cyan', icon: 'people-outline' },
        { label: 'Ganados', sub: 'CERRADOS', value: cmxNum(totales.ganados), cls: 'card-orange', icon: 'trophy-outline' },
        { label: 'Perdidos', sub: 'CERRADOS', value: cmxNum(totales.perdidos), cls: 'card-pink', icon: 'close-circle-outline' },
        { label: 'Días en proceso · Ganado', sub: `Mediana ${fmtDias(totales.dias_en_proceso_mediana_ganado)}`, value: fmtDias(totales.dias_en_proceso_promedio_ganado), cls: 'card-purple', icon: 'trending-up-outline' },
        { label: 'Días en proceso · Perdido', sub: `Mediana ${fmtDias(totales.dias_en_proceso_mediana_perdido)}`, value: fmtDias(totales.dias_en_proceso_promedio_perdido), cls: 'card-purple', icon: 'trending-down-outline' },
    ];
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

function renderCefemexMetricsContent() {
    const content = document.getElementById('cmx-content');
    if (!content) return;
    const totales = cefemexMetrics.data.totales;
    if (!totales) {
        content.innerHTML = `<div class="cmx-state-msg">La respuesta del endpoint no trae totales.</div>`;
        return;
    }
    const hayLeads = (cefemexMetrics.data.leads || []).length > 0;
    content.innerHTML = `
        ${cmxBuildNoteHtml(totales)}
        ${cmxBuildCardsHtml(totales)}
        ${hayLeads
            ? '<div class="cmx-table-card" id="cmx-table-slot"></div>'
            : `<div class="cmx-state-msg">Sin leads cerrados en este rango.</div>${cmxBuildDescartadosHtml()}`}
        ${cmxBuildCriteriosHtml(cefemexMetrics.data.criterios)}
    `;
    if (hayLeads) cmxRenderTableSlot();
}

function cmxRenderTableSlot() {
    const slot = document.getElementById('cmx-table-slot');
    if (!slot) return;
    slot.innerHTML = cmxBuildTableCardHtml();
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

function cmxSortIcon(col) {
    if (cefemexMetrics.sortCol !== col) return '<ion-icon name="swap-vertical-outline"></ion-icon>';
    return cefemexMetrics.sortDir === 'asc'
        ? '<ion-icon name="chevron-up-outline"></ion-icon>'
        : '<ion-icon name="chevron-down-outline"></ion-icon>';
}

function cmxSortValue(lead, col) {
    if (col === 'lead_id') return Number(lead.lead_id) || 0;
    if (col === 'resultado') return lead.resultado || '';
    if (col === 'creado_en') return lead.creado_en ? new Date(lead.creado_en).getTime() : -Infinity;
    if (col === 'cerrado_en') return lead.cerrado_en ? new Date(lead.cerrado_en).getTime() : -Infinity;
    if (col === 'dias_en_proceso') {
        return (lead.dias_en_proceso === null || lead.dias_en_proceso === undefined) ? -Infinity : Number(lead.dias_en_proceso);
    }
    if (col === 'etapas_count') return Object.keys(lead.dias_por_etapa || {}).length;
    const v = (lead.dias_por_etapa || {})[col];
    return (v === undefined || v === null) ? -Infinity : Number(v);
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

function cmxMedian(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cmxBuildTableCardHtml() {
    const data = cefemexMetrics.data;
    // Las columnas salen siempre de etapas[]: la config vive en Supabase y
    // puede cambiar sin tocar este código.
    const etapas = data.etapas || [];
    const leads = (data.leads || []).slice().sort((a, b) => {
        const av = cmxSortValue(a, cefemexMetrics.sortCol);
        const bv = cmxSortValue(b, cefemexMetrics.sortCol);
        const cmp = (typeof av === 'string' || typeof bv === 'string')
            ? String(av).localeCompare(String(bv), 'es')
            : av - bv;
        return cefemexMetrics.sortDir === 'asc' ? cmp : -cmp;
    });

    const headerCells = [
        `<th class="cmx-col-sticky-lead" data-cmx-sort="lead_id">Lead ID ${cmxSortIcon('lead_id')}</th>`,
        `<th class="cmx-col-sticky-result" data-cmx-sort="resultado">Resultado ${cmxSortIcon('resultado')}</th>`,
        `<th data-cmx-sort="creado_en">Creado ${cmxSortIcon('creado_en')}</th>`,
        `<th data-cmx-sort="cerrado_en">Cerrado ${cmxSortIcon('cerrado_en')}</th>`,
        ...etapas.map(e => `<th data-cmx-sort="${escapeHtml(e.etapa)}">${escapeHtml(e.etapa)} ${cmxSortIcon(e.etapa)}</th>`),
        `<th data-cmx-sort="dias_en_proceso">Total en proceso ${cmxSortIcon('dias_en_proceso')}</th>`,
        `<th data-cmx-sort="etapas_count">Etapas ${cmxSortIcon('etapas_count')}</th>`,
    ].join('');

    const bodyRows = leads.map(lead => {
        const dxe = lead.dias_por_etapa || {};
        // Celda vacía ≠ cero: si la etapa no está en dias_por_etapa el lead
        // nunca pasó por ahí.
        const etapaCells = etapas.map(e => {
            const v = dxe[e.etapa];
            if (v === undefined || v === null) return `<td class="cmx-day-empty">—</td>`;
            return `<td class="cmx-day-cell" style="background:${cmxHeatColor(v)}">${fmtDias(v)}</td>`;
        }).join('');
        const resultClass = lead.resultado === 'Ganado' ? 'cmx-badge-ganado' : 'cmx-badge-perdido';
        const totalStyle = (lead.dias_en_proceso === null || lead.dias_en_proceso === undefined)
            ? '' : `style="background:${cmxHeatColor(lead.dias_en_proceso)}"`;
        return `<tr>
            <td class="cmx-col-sticky-lead">${escapeHtml(lead.lead_id)}</td>
            <td class="cmx-col-sticky-result ${resultClass}">${escapeHtml(lead.resultado || '—')}</td>
            <td>${fmtFecha(lead.creado_en)}</td>
            <td>${fmtFecha(lead.cerrado_en)}</td>
            ${etapaCells}
            <td class="cmx-day-cell" ${totalStyle}>${fmtDias(lead.dias_en_proceso)}</td>
            <td>${Object.keys(dxe).length}</td>
        </tr>`;
    }).join('');

    return `
        <div class="cmx-table-wrapper">
            <table class="cmx-table" id="cmx-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
                ${cmxBuildFooterRow(etapas, leads)}
            </table>
        </div>
        ${cmxBuildDescartadosHtml()}
    `;
}

function cmxBuildFooterRow(etapas, leads) {
    const diasValues = leads
        .map(l => l.dias_en_proceso)
        .filter(v => v !== null && v !== undefined)
        .map(Number);
    const mediana = cmxMedian(diasValues);
    const promedio = diasValues.length ? diasValues.reduce((a, b) => a + b, 0) / diasValues.length : null;
    const etapaCounts = etapas.map(e => leads.filter(l => (l.dias_por_etapa || {})[e.etapa] !== undefined).length);

    return `<tfoot><tr class="cmx-tfoot">
        <td colspan="4">Mediana ${fmtDias(mediana)} · Promedio ${fmtDias(promedio)} (${cmxNum(leads.length)} leads)</td>
        ${etapaCounts.map(c => `<td>${cmxNum(c)} leads</td>`).join('')}
        <td></td>
        <td></td>
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
