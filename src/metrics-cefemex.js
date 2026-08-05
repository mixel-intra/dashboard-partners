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
    content.innerHTML = `<div class="cmx-state-msg">${cefemexMetrics.data.leads.length} leads cargados.</div>`;
}
