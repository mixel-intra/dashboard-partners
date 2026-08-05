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
    fetchCefemexMetrics();
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

function fmtFecha(iso) {
    if (!iso) return '—';
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function cmxBuildNoteHtml(totales) {
    if (!totales) return '';
    return `
        <div class="cmx-note">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <span>Comparación con poca base: ${totales.ganados} leads ganados contra ${totales.perdidos} perdidos en este rango. Cualquier lectura entre ambos grupos se apoya en muy pocos casos del lado ganador.</span>
        </div>
    `;
}

function cmxBuildCardsHtml(totales) {
    if (!totales) return '';
    const cards = [
        { label: 'Leads en el rango', sub: 'TOTAL', value: (totales.leads ?? 0).toLocaleString('es-MX'), cls: 'card-cyan', icon: 'people-outline' },
        { label: 'Ganados', sub: 'CERRADOS', value: (totales.ganados ?? 0).toLocaleString('es-MX'), cls: 'card-orange', icon: 'trophy-outline' },
        { label: 'Perdidos', sub: 'CERRADOS', value: (totales.perdidos ?? 0).toLocaleString('es-MX'), cls: 'card-pink', icon: 'close-circle-outline' },
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
    const { totales } = cefemexMetrics.data;
    content.innerHTML = `
        ${cmxBuildNoteHtml(totales)}
        ${cmxBuildCardsHtml(totales)}
        <div class="cmx-table-card" id="cmx-table-slot"></div>
    `;
}
