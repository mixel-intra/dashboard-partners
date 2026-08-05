# CEFEMEX Métricas — "Días por etapa por lead" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Métricas" tab to the CEFEMEX Capital dashboard that renders the "Días por etapa por lead" report served by an n8n endpoint — no client-side calculation.

**Architecture:** New tab in the existing `#hotel-tabs` segmented control, gated to `clientId === 'cefemex'`, toggled through the existing `switchDashTab()` mechanism (same pattern as the `restaurante` / `social_listening` panels). All new behavior lives in an isolated new module, `src/metrics-cefemex.js` (plain `<script>`, loaded after `dashboard.js`), which fetches directly from the CORS-open n8n webhook and renders cards/table/footer/criterios into a static panel shell defined in `index.html`.

**Tech Stack:** Vanilla JS, flatpickr (already loaded via CDN in `index.html`), existing `card-quantix` / `table-card` design-system classes, no build step.

---

## Nota sobre esta plantilla en este repo

Este proyecto **no tiene test runner ni framework** — `CLAUDE.md` es explícito: "no build step, no framework, no bundler, no test suite... Edit a file and reload." Por eso, en vez de pasos `pytest`/`jest`, cada tarea se verifica manualmente contra `node server.js` en `http://localhost:3000/index.html?client=cefemex`. El ciclo por tarea sigue siendo escribir → verificar → commit.

Spec de referencia: `docs/superpowers/specs/2026-08-05-cefemex-metricas-dias-por-etapa-design.md`.

## File Structure

- **`index.html`** — Task 1 agrega: el botón del tab "Métricas" dentro del segmented control ya existente (`.dash-tabs-segment`), el panel estático `#cefemex-metrics-panel` (toolbar de fecha/`por`/Excel + contenedor `#cmx-content`) con su `<style>` embebido (mismo patrón que `#channel-health-panel`), y el `<script>` tag de `src/metrics-cefemex.js`.
- **`src/dashboard.js`** — Task 1 agrega 3 ediciones puntuales dentro de `initHotelTabs()` y `switchDashTab()` para mostrar el tab solo a `clientId === 'cefemex'` y togglear el panel nuevo. No se toca nada más de este archivo (7.5k líneas, se mantiene así).
- **`src/metrics-cefemex.js`** (nuevo) — Tasks 2–9 construyen aquí, incrementalmente, todo el fetch/estado/render del reporte: fetch + loading/error (Task 2), tarjetas de totales (Task 3), tabla dinámica (Task 4), heatmap (Task 5), orden por columna (Task 6), pie de tabla + descartados + criterios (Task 7), selector de fechas/`por` (Task 8), descarga Excel (Task 9).

---

### Task 1: Scaffold del tab y del panel (HTML/CSS + wiring en dashboard.js)

**Files:**
- Modify: `index.html:4683-4687` (botón del tab), `index.html:5089-5095` (panel nuevo), `index.html:6064-6066` (script tag — se agrega en Task 2, no aquí)
- Modify: `src/dashboard.js:540-546`, `src/dashboard.js:610-648`

- [ ] **Step 1: Agregar el botón "Métricas" al segmented control**

En `index.html`, dentro de `.dash-tabs-segment`, después del botón `social_listening`:

```html
                    <button class="dash-tab" data-tab="social_listening">
                        <ion-icon name="star-outline"></ion-icon><span>Reputación</span>
                        <span id="sl-new-badge" class="rest-new-badge"></span>
                    </button>
                    <button class="dash-tab hidden" data-tab="metricas" id="tab-btn-metricas">
                        <ion-icon name="bar-chart-outline"></ion-icon><span>Métricas</span>
                    </button>
                </div>
            </div>
```

(reemplaza el bloque original que terminaba en `</button>\n                </div>\n            </div>` — solo se agrega el nuevo `<button>` antes de los cierres).

- [ ] **Step 2: Agregar el panel estático `#cefemex-metrics-panel`**

En `index.html`, entre el cierre de `#eventos-panel` y el comentario de `#social-listening-panel`:

```html
            <!-- Eventos Pipeline (full-screen, toggled from dashboard) -->
            <div id="eventos-panel" class="evt-panel-full hidden" style="padding: 0 24px 24px;">
                <!-- Content injected by renderEventosPanel() -->
            </div>

            <!-- ===== PANEL DE MÉTRICAS — CEFEMEX Capital ("Días por etapa por lead") ===== -->
            <div id="cefemex-metrics-panel" class="hidden" style="padding: 0 24px 28px;">
                <style>
                    .cmx-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 20px 0 18px; }
                    .cmx-toolbar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
                    .cmx-por-toggle { display: inline-flex; padding: 3px; gap: 2px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 10px; }
                    .cmx-por-btn { padding: 6px 13px; border: none; background: transparent; color: var(--text-secondary); font-size: 0.78rem; font-weight: 600; border-radius: 7px; cursor: pointer; }
                    .cmx-por-btn.active { background: var(--accent-purple-glow); color: var(--accent-purple); }
                    .cmx-date-input { padding: 8px 12px; border-radius: 9px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-primary); font-size: 0.82rem; min-width: 220px; cursor: pointer; }
                    .cmx-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 9px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-secondary); font-size: 0.8rem; font-weight: 600; cursor: pointer; }
                    .cmx-btn:hover { background: rgba(167,139,250,0.08); border-color: rgba(167,139,250,0.3); color: #A78BFA; }
                    .cmx-note { font-size: 0.78rem; color: var(--text-muted); background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 10px 14px; margin-bottom: 18px; display: flex; gap: 8px; align-items: flex-start; }
                    .cmx-note ion-icon { font-size: 1rem; flex-shrink: 0; margin-top: 1px; color: #FBBF24; }
                    .cmx-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-bottom: 20px; }
                    .cmx-table-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 20px 22px; }
                    .cmx-table-wrapper { overflow: auto; max-height: 560px; border-radius: 12px; border: 1px solid var(--border-subtle); }
                    .cmx-table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 0.82rem; white-space: nowrap; }
                    .cmx-table thead th { position: sticky; top: 0; z-index: 3; background: #1B1836; color: var(--text-secondary); font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.4px; padding: 10px 12px; text-align: left; cursor: pointer; user-select: none; border-bottom: 1px solid var(--border-subtle); }
                    [data-theme="light"] .cmx-table thead th { background: #FFFFFF; }
                    .cmx-table thead th ion-icon { font-size: 0.75rem; margin-left: 4px; vertical-align: -1px; opacity: 0.5; }
                    .cmx-table tbody td { padding: 9px 12px; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); }
                    .cmx-table tbody tr:hover td { background: rgba(255,255,255,0.03); }
                    .cmx-col-sticky-lead, .cmx-col-sticky-result { position: sticky; background: var(--bg-app); z-index: 2; }
                    .cmx-col-sticky-lead { left: 0; width: 120px; min-width: 120px; }
                    .cmx-col-sticky-result { left: 120px; width: 100px; min-width: 100px; }
                    .cmx-table thead th.cmx-col-sticky-lead, .cmx-table thead th.cmx-col-sticky-result { z-index: 4; }
                    .cmx-day-cell { text-align: right; font-variant-numeric: tabular-nums; }
                    .cmx-day-empty { color: var(--text-muted); text-align: center; }
                    .cmx-badge-ganado { color: #16A34A; font-weight: 700; }
                    .cmx-badge-perdido { color: #DC2626; font-weight: 700; }
                    .cmx-tfoot td { padding: 9px 12px; font-weight: 600; color: var(--text-secondary); border-top: 2px solid var(--border-subtle); background: var(--bg-card); }
                    .cmx-descartados { margin-top: 12px; font-size: 0.78rem; color: var(--text-muted); }
                    .cmx-criterios { margin-top: 14px; }
                    .cmx-criterios summary { cursor: pointer; font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); padding: 8px 0; }
                    .cmx-criterios-body { padding: 10px 4px 4px; font-size: 0.8rem; color: var(--text-secondary); display: grid; gap: 6px; }
                    .cmx-criterios-body dt { font-weight: 600; color: var(--text-primary); }
                    .cmx-criterios-body dd { margin: 0 0 6px; color: var(--text-muted); }
                    .cmx-state-msg { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 0.9rem; }
                </style>

                <div class="cmx-toolbar">
                    <div class="cmx-toolbar-left">
                        <input type="text" id="cmx-date-range" class="cmx-date-input" placeholder="Mes en curso" readonly>
                        <div class="cmx-por-toggle" id="cmx-por-toggle">
                            <button type="button" class="cmx-por-btn active" data-por="cierre">Por cierre</button>
                            <button type="button" class="cmx-por-btn" data-por="creacion">Por creación</button>
                        </div>
                    </div>
                    <button type="button" class="cmx-btn" id="cmx-excel-btn" onclick="downloadCefemexMetricsExcel()">
                        <ion-icon name="download-outline"></ion-icon> Descargar Excel
                    </button>
                </div>

                <div id="cmx-content">
                    <div class="cmx-state-msg">Cargando métricas…</div>
                </div>
            </div>

            <!-- ===== PANEL DE SOCIAL LISTENING — REPUTACIÓN (Editorial Intelligence) ===== -->
            <div id="social-listening-panel" class="hidden" style="padding: 0 24px 28px;">
```

- [ ] **Step 3: Mostrar/ocultar el tab según el cliente, en `initHotelTabs()`**

En `src/dashboard.js`, dentro de `initHotelTabs()`, justo después del `forEach` que asigna los `click` listeners a cada `.dash-tab` (después de la línea `});` que cierra el forEach, antes del comentario `// Hotel-specific overrides`):

```js
            btn.addEventListener('click', () => {
                if (btn.classList.contains('locked')) return;
                switchDashTab(tabId);
            });
        });

        // "Métricas" es exclusivo de CEFEMEX Capital — no es un hotel_service,
        // así que se controla aparte del loop de arriba.
        const metricsTabBtn = document.getElementById('tab-btn-metricas');
        if (metricsTabBtn) {
            metricsTabBtn.classList.toggle('hidden', state.clientId !== 'cefemex');
        }

        // Hotel-specific overrides
```

- [ ] **Step 4: Togglear el panel nuevo en `switchDashTab()`**

En `src/dashboard.js`, dentro de `switchDashTab(tab)`, agregar la captura de `metricsPanel` junto a las otras y su ocultamiento condicional:

```js
    // Toggle between regular dashboard and special panels (restaurant, social listening, métricas)
    const dashboardGrid = document.querySelector('.dashboard-grid');
    const restaurantPanel = document.getElementById('restaurant-panel');
    const socialListeningPanel = document.getElementById('social-listening-panel');
    const metricsPanel = document.getElementById('cefemex-metrics-panel');
    const contentHeaderRow = document.querySelector('.content-header-row');

    // Always hide the panels we are not switching to
    if (tab !== 'restaurante' && restaurantPanel) restaurantPanel.classList.add('hidden');
    if (tab !== 'social_listening' && socialListeningPanel) socialListeningPanel.classList.add('hidden');
    if (tab !== 'metricas' && metricsPanel) metricsPanel.classList.add('hidden');
```

- [ ] **Step 5: Agregar la rama `tab === 'metricas'`**

Inmediatamente después de la rama `else if (tab === 'social_listening') { ... }` y antes del `else` final:

```js
    } else if (tab === 'social_listening') {
        if (dashboardGrid) dashboardGrid.classList.add('hidden');
        if (contentHeaderRow) contentHeaderRow.classList.add('hidden');
        if (socialListeningPanel) {
            socialListeningPanel.classList.remove('hidden');
            if (!state.socialListeningLoaded) fetchSocialListeningReviews();
            else renderSocialListeningPanel();
        }
    } else if (tab === 'metricas') {
        if (dashboardGrid) dashboardGrid.classList.add('hidden');
        if (contentHeaderRow) contentHeaderRow.classList.add('hidden');
        if (metricsPanel) {
            metricsPanel.classList.remove('hidden');
            if (typeof initCefemexMetrics === 'function') initCefemexMetrics();
        }
    } else {
```

- [ ] **Step 6: Verificar manualmente**

```bash
node server.js
```

Abrir `http://localhost:3000/index.html?client=cefemex`, iniciar sesión si hace falta, y confirmar:
- El tab "Métricas" aparece en el segmented control junto a Eventos/Reservas/etc.
- Clic en "Métricas" oculta el dashboard normal y muestra el panel (toolbar + "Cargando métricas…", sin errores en consola — `initCefemexMetrics` aún no existe, el `typeof` guard lo cubre).
- Cambiar a otro cliente hotelero (ej. `?client=<otro-slug-hotel>`) confirma que el tab "Métricas" **no** aparece.

- [ ] **Step 7: Commit**

```bash
git add index.html src/dashboard.js
git commit -m "feat(cefemex): scaffold del tab y panel de Métricas"
```

---

### Task 2: Módulo nuevo — fetch y estados de carga/error

**Files:**
- Create: `src/metrics-cefemex.js`
- Modify: `index.html:6064-6066` (agregar `<script>` tag)

- [ ] **Step 1: Crear `src/metrics-cefemex.js`**

```js
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
```

- [ ] **Step 2: Cargar el módulo en `index.html`**

```html
    <script src="src/dashboard.js?v=20260716-cde47"></script>
    <script src="src/metrics-cefemex.js?v=20260805-1"></script>
```

- [ ] **Step 3: Verificar manualmente**

Recargar `http://localhost:3000/index.html?client=cefemex`, abrir la pestaña Network del navegador, clic en "Métricas":
- Se dispara un `GET` a `https://cefemexyucatan.app.n8n.cloud/webhook/tiempos-leads?vista=cierres&por=cierre` (sin `desde`/`hasta`, usa el mes en curso).
- El panel muestra "Cargando métricas…" y luego "`N` leads cargados." con el número real que vino del endpoint.
- Si el endpoint no responde (ej. sin internet), se muestra el mensaje de error con botón "Reintentar", y ese botón sí reintenta el fetch.

- [ ] **Step 4: Commit**

```bash
git add index.html src/metrics-cefemex.js
git commit -m "feat(cefemex): fetch del reporte tiempos-leads con estados de carga/error"
```

---

### Task 3: Tarjetas de totales

**Files:**
- Modify: `src/metrics-cefemex.js`

- [ ] **Step 1: Reemplazar el render temporal por tarjetas reales**

Editar el final de `renderCefemexMetricsState()` (la línea `content.innerHTML = \`<div class="cmx-state-msg">${cefemexMetrics.data.leads.length} leads cargados.</div>\`;`) y agregar las funciones de render de tarjetas:

```js
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
```

- [ ] **Step 2: Verificar manualmente**

Recargar, clic en "Métricas": deben aparecer 5 tarjetas (Leads, Ganados, Perdidos, Días·Ganado, Días·Perdido) con valores reales del endpoint, más la nota amarilla de "poca base" con los números de ganados/perdidos correctos. El `#cmx-table-slot` queda vacío (esperado, es el Task 4).

- [ ] **Step 3: Commit**

```bash
git add src/metrics-cefemex.js
git commit -m "feat(cefemex): tarjetas de totales del reporte de métricas"
```

---

### Task 4: Tabla — columnas dinámicas por etapa y filas

**Files:**
- Modify: `src/metrics-cefemex.js`

- [ ] **Step 1: Agregar el render de la tabla**

Editar `renderCefemexMetricsContent()` para llamar a `cmxRenderTableSlot()`, y agregar las funciones de la tabla:

```js
    content.innerHTML = `
        ${cmxBuildNoteHtml(totales)}
        ${cmxBuildCardsHtml(totales)}
        <div class="cmx-table-card" id="cmx-table-slot"></div>
    `;
    cmxRenderTableSlot();
}

function cmxSortIcon(col) {
    return '';
}

function cmxRenderTableSlot() {
    const slot = document.getElementById('cmx-table-slot');
    if (!slot) return;
    slot.innerHTML = cmxBuildTableCardHtml();
}

function cmxBuildTableCardHtml() {
    const data = cefemexMetrics.data;
    if (!data) return '';
    const etapas = data.etapas || [];
    const leads = (data.leads || []).slice();

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
        const etapaCells = etapas.map(e => {
            const v = dxe[e.etapa];
            if (v === undefined || v === null) return `<td class="cmx-day-empty">—</td>`;
            return `<td class="cmx-day-cell">${fmtDias(v)}</td>`;
        }).join('');
        const resultClass = lead.resultado === 'Ganado' ? 'cmx-badge-ganado' : 'cmx-badge-perdido';
        return `<tr>
            <td class="cmx-col-sticky-lead">${escapeHtml(lead.lead_id)}</td>
            <td class="cmx-col-sticky-result ${resultClass}">${escapeHtml(lead.resultado || '—')}</td>
            <td>${fmtFecha(lead.creado_en)}</td>
            <td>${fmtFecha(lead.cerrado_en)}</td>
            ${etapaCells}
            <td class="cmx-day-cell">${fmtDias(lead.dias_en_proceso)}</td>
            <td>${Object.keys(dxe).length}</td>
        </tr>`;
    }).join('');

    return `
        <div class="cmx-table-wrapper">
            <table class="cmx-table" id="cmx-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
    `;
}
```

- [ ] **Step 2: Verificar manualmente**

Recargar, clic en "Métricas": la tabla debe mostrar una columna por cada etapa en `etapas[]` (mismo orden que trae el endpoint), en el orden `Lead ID · Resultado · Creado · Cerrado · [etapas] · Total en proceso · Etapas`. Confirmar contra el payload real (Network tab → response de `tiempos-leads`):
- Un lead sin una etapa en `dias_por_etapa` muestra celda vacía (`—`), no `0`.
- Un lead con `0` en una etapa muestra `0.0`, distinto de la celda vacía.
- La columna "Etapas" coincide con `Object.keys(dias_por_etapa).length` del lead, no con `etapas_recorridas`.

- [ ] **Step 3: Commit**

```bash
git add src/metrics-cefemex.js
git commit -m "feat(cefemex): tabla de días por etapa con columnas dinámicas"
```

---

### Task 5: Heatmap en las celdas de días

**Files:**
- Modify: `src/metrics-cefemex.js`

- [ ] **Step 1: Agregar `cmxHeatColor` y aplicarlo a las celdas de días**

Reemplazar el bloque de construcción de fila (`etapaCells` + `return` del `<tr>`) dentro de `cmxBuildTableCardHtml`:

```js
        const etapaCells = etapas.map(e => {
            const v = dxe[e.etapa];
            if (v === undefined || v === null) return `<td class="cmx-day-empty">—</td>`;
            return `<td class="cmx-day-cell" style="background:${cmxHeatColor(v)}">${fmtDias(v)}</td>`;
        }).join('');
        const resultClass = lead.resultado === 'Ganado' ? 'cmx-badge-ganado' : 'cmx-badge-perdido';
        const totalStyle = (lead.dias_en_proceso === null || lead.dias_en_proceso === undefined) ? '' : `style="background:${cmxHeatColor(lead.dias_en_proceso)}"`;
        return `<tr>
            <td class="cmx-col-sticky-lead">${escapeHtml(lead.lead_id)}</td>
            <td class="cmx-col-sticky-result ${resultClass}">${escapeHtml(lead.resultado || '—')}</td>
            <td>${fmtFecha(lead.creado_en)}</td>
            <td>${fmtFecha(lead.cerrado_en)}</td>
            ${etapaCells}
            <td class="cmx-day-cell" ${totalStyle}>${fmtDias(lead.dias_en_proceso)}</td>
            <td>${Object.keys(dxe).length}</td>
        </tr>`;
```

Y agregar al final del archivo:

```js
function cmxHeatColor(days) {
    const d = Number(days);
    if (d >= 30) return 'rgba(167,139,250,0.55)';
    if (d >= 15) return 'rgba(167,139,250,0.38)';
    if (d >= 5) return 'rgba(167,139,250,0.24)';
    if (d >= 1) return 'rgba(167,139,250,0.13)';
    return 'rgba(167,139,250,0.05)';
}
```

- [ ] **Step 2: Verificar manualmente**

Recargar, clic en "Métricas": las celdas con días deben tener un tono morado que se intensifica con el valor (cortes visibles en 1/5/15/30 días); el número sigue siendo legible sobre el color en ambos temas (probar toggle de tema claro/oscuro). Las celdas vacías (`—`) no llevan color de fondo.

- [ ] **Step 3: Commit**

```bash
git add src/metrics-cefemex.js
git commit -m "feat(cefemex): heatmap en las celdas de días por etapa"
```

---

### Task 6: Orden por columna (incluidas las de etapa)

**Files:**
- Modify: `src/metrics-cefemex.js`

- [ ] **Step 1: Aplicar el orden a las filas antes de construirlas**

Reemplazar la línea `const leads = (data.leads || []).slice();` dentro de `cmxBuildTableCardHtml`:

```js
    const leads = (data.leads || []).slice().sort((a, b) => {
        const av = cmxSortValue(a, cefemexMetrics.sortCol);
        const bv = cmxSortValue(b, cefemexMetrics.sortCol);
        const cmp = (typeof av === 'string' || typeof bv === 'string')
            ? String(av).localeCompare(String(bv), 'es')
            : av - bv;
        return cefemexMetrics.sortDir === 'asc' ? cmp : -cmp;
    });
```

- [ ] **Step 2: Reemplazar el stub de `cmxSortIcon` por la versión real**

```js
function cmxSortIcon(col) {
    if (cefemexMetrics.sortCol !== col) return '<ion-icon name="swap-vertical-outline"></ion-icon>';
    return cefemexMetrics.sortDir === 'asc'
        ? '<ion-icon name="chevron-up-outline"></ion-icon>'
        : '<ion-icon name="chevron-down-outline"></ion-icon>';
}
```

- [ ] **Step 3: Agregar `cmxSortValue` y `cmxSortBy`, y el listener delegado de clic en headers**

Al final del archivo:

```js
function cmxSortValue(lead, col) {
    if (col === 'lead_id') return lead.lead_id;
    if (col === 'resultado') return lead.resultado || '';
    if (col === 'creado_en') return lead.creado_en ? new Date(lead.creado_en).getTime() : -Infinity;
    if (col === 'cerrado_en') return lead.cerrado_en ? new Date(lead.cerrado_en).getTime() : -Infinity;
    if (col === 'dias_en_proceso') {
        return (lead.dias_en_proceso === null || lead.dias_en_proceso === undefined) ? -Infinity : lead.dias_en_proceso;
    }
    if (col === 'etapas_count') return Object.keys(lead.dias_por_etapa || {}).length;
    const v = (lead.dias_por_etapa || {})[col];
    return (v === undefined || v === null) ? -Infinity : v;
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
```

Y editar `initCefemexMetrics()` para registrar el listener delegado (una sola vez, sobre el panel estático que nunca se reemplaza por `innerHTML`):

```js
function initCefemexMetrics() {
    if (cefemexMetrics.initialized) return;
    cefemexMetrics.initialized = true;
    const panel = document.getElementById('cefemex-metrics-panel');
    if (panel) {
        panel.addEventListener('click', (e) => {
            const th = e.target.closest('[data-cmx-sort]');
            if (th) cmxSortBy(th.getAttribute('data-cmx-sort'));
        });
    }
    fetchCefemexMetrics();
}
```

- [ ] **Step 4: Verificar manualmente**

Recargar, clic en "Métricas": por defecto la tabla debe estar ordenada por "Total en proceso" descendente (el primer lead debe ser el de más días). Clic en cualquier header (incluidas columnas de etapa) reordena la tabla; un segundo clic en el mismo header invierte el orden; el ícono junto al header activo cambia (chevron arriba/abajo) y los demás quedan con el ícono neutral.

- [ ] **Step 5: Commit**

```bash
git add src/metrics-cefemex.js
git commit -m "feat(cefemex): orden por columna en la tabla de métricas"
```

---

### Task 7: Pie de tabla, descartados y criterios

**Files:**
- Modify: `src/metrics-cefemex.js`

- [ ] **Step 1: Agregar el `<tfoot>` y la línea de descartados**

Reemplazar el `return` final de `cmxBuildTableCardHtml`:

```js
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

function cmxMedian(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cmxBuildFooterRow(etapas, leads) {
    // Estadísticas sobre las filas visibles. No hay filtros además del
    // orden de columnas, así que "visibles" == todos los leads cargados.
    const diasValues = leads.map(l => l.dias_en_proceso).filter(v => v !== null && v !== undefined);
    const mediana = cmxMedian(diasValues);
    const promedio = diasValues.length ? diasValues.reduce((a, b) => a + b, 0) / diasValues.length : null;
    const etapaCounts = etapas.map(e => leads.filter(l => (l.dias_por_etapa || {})[e.etapa] !== undefined).length);

    return `<tfoot><tr class="cmx-tfoot">
        <td colspan="4">Mediana ${fmtDias(mediana)} · Promedio ${fmtDias(promedio)} (${leads.length} leads)</td>
        ${etapaCounts.map(c => `<td>${c} leads</td>`).join('')}
        <td></td>
        <td></td>
    </tr></tfoot>`;
}

function cmxBuildDescartadosHtml() {
    const d = cefemexMetrics.data.descartados;
    if (!d) return '';
    return `<div class="cmx-descartados">
        <ion-icon name="information-circle-outline" style="vertical-align:-2px;"></ion-icon>
        ${d.total} leads cerrados en este rango quedaron fuera de la tabla: ${escapeHtml(d.motivo || '')}
        (${d.ganados} ganados, ${d.perdidos} perdidos).
    </div>`;
}

function cmxBuildCriteriosHtml(criterios) {
    if (!criterios || typeof criterios !== 'object') return '';
    const entries = Object.entries(criterios).map(([k, v]) => `
        <dt>${escapeHtml(k)}</dt>
        <dd>${escapeHtml(v)}</dd>
    `).join('');
    return `<details class="cmx-criterios">
        <summary>Criterios de este reporte</summary>
        <dl class="cmx-criterios-body">${entries}</dl>
    </details>`;
}
```

- [ ] **Step 2: Agregar el desplegable de criterios al contenido**

Editar `renderCefemexMetricsContent()`:

```js
    content.innerHTML = `
        ${cmxBuildNoteHtml(totales)}
        ${cmxBuildCardsHtml(totales)}
        <div class="cmx-table-card" id="cmx-table-slot"></div>
        ${cmxBuildCriteriosHtml(cefemexMetrics.data.criterios)}
    `;
    cmxRenderTableSlot();
}
```

- [ ] **Step 3: Verificar manualmente**

Recargar, clic en "Métricas":
- Debajo de la tabla aparece la fila de pie con mediana, promedio y leads-por-etapa; los números de leads-por-etapa deben coincidir con cuántas filas tienen esa columna no-vacía.
- Debajo de la tabla, la línea de descartados muestra el `total` y `motivo` tal cual vienen del endpoint.
- Al fondo del panel, el desplegable "Criterios de este reporte" muestra el objeto `criterios` completo (clave → texto), sin texto hardcodeado.

- [ ] **Step 4: Commit**

```bash
git add src/metrics-cefemex.js
git commit -m "feat(cefemex): pie de tabla, descartados y criterios del reporte"
```

---

### Task 8: Selector de fechas y toggle "por cierre/creación"

**Files:**
- Modify: `src/metrics-cefemex.js`

- [ ] **Step 1: Agregar `setupCefemexMetricsControls` y llamarla desde `initCefemexMetrics`**

Editar `initCefemexMetrics()`:

```js
function initCefemexMetrics() {
    if (cefemexMetrics.initialized) return;
    cefemexMetrics.initialized = true;
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
```

Y agregar al final del archivo:

```js
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
```

- [ ] **Step 2: Verificar manualmente**

Recargar, clic en "Métricas": el input de fecha debe abrir un calendario (flatpickr, en español) al hacer clic; seleccionar un rango de dos fechas dispara un nuevo fetch (ver Network tab: la URL ahora trae `desde`/`hasta` en unix seconds correctos para las fechas elegidas) y refresca tarjetas + tabla. Clic en "Por creación" cambia `por=creacion` en la siguiente llamada y vuelve a refrescar todo; clic en "Por cierre" regresa a `por=cierre`.

- [ ] **Step 3: Commit**

```bash
git add src/metrics-cefemex.js
git commit -m "feat(cefemex): selector de rango de fechas y toggle cierre/creación"
```

---

### Task 9: Descarga a Excel

**Files:**
- Modify: `src/metrics-cefemex.js`

- [ ] **Step 1: Agregar `downloadCefemexMetricsExcel`**

Al final del archivo:

```js
function downloadCefemexMetricsExcel() {
    window.open(buildCefemexMetricsUrl('excel'), '_blank');
}
```

(El botón `#cmx-excel-btn` en `index.html` ya tiene `onclick="downloadCefemexMetricsExcel()"` desde el Task 1.)

- [ ] **Step 2: Verificar manualmente**

Con un rango de fechas y un `por` seleccionados, clic en "Descargar Excel": debe abrir/descargar un archivo `.xlsx` correspondiente al mismo rango y filtro actualmente aplicados en la tabla (confirmar comparando `desde`/`hasta`/`por` de la URL abierta contra los controles).

- [ ] **Step 3: Commit**

```bash
git add src/metrics-cefemex.js
git commit -m "feat(cefemex): descarga a Excel del reporte de métricas"
```

---

### Task 10: Cache-bust, QA manual completa y cierre

**Files:**
- Modify: `index.html:6065-6066`

- [ ] **Step 1: Bump del cache-bust**

`dashboard.js` se modificó en el Task 1 y `metrics-cefemex.js` se modificó en los Tasks 2–9; subir ambos tags a la misma fecha final:

```html
    <script src="src/dashboard.js?v=20260805-cmx1"></script>
    <script src="src/metrics-cefemex.js?v=20260805-cmx1"></script>
```

- [ ] **Step 2: QA manual completa contra el endpoint real**

Con `node server.js` corriendo y `http://localhost:3000/index.html?client=cefemex`, recorrer el checklist completo del spec:

- [ ] El tab "Métricas" solo es visible para `?client=cefemex` (probar con `casa-de-empeño` y con un cliente hotelero cualquiera — no debe aparecer en ninguno).
- [ ] Las columnas de etapa coinciden exactamente con `etapas[]` de la respuesta real, en el mismo orden.
- [ ] Celdas vacías (`—`) vs. `0.0` se distinguen visualmente y no se confunden.
- [ ] El orden por columna funciona en las columnas de etapa, no solo en las fijas.
- [ ] Las columnas `Lead ID` y `Resultado` quedan fijas al hacer scroll horizontal y no tapan la siguiente columna.
- [ ] El heatmap se intensifica en los cortes de 1/5/15/30 días, en ambos temas (claro/oscuro).
- [ ] La línea de `descartados` (total + motivo) está presente y visible sin interacción extra.
- [ ] El desplegable de `criterios` muestra el texto real del endpoint.
- [ ] El botón de Excel descarga el archivo correcto para el rango/`por` actuales.
- [ ] Cambiar el rango de fechas o el toggle `por` dispara un re-fetch completo y refresca tarjetas, tabla, pie y descartados coherentemente.
- [ ] No hay errores en consola durante todo el flujo.

- [ ] **Step 3: Commit final**

```bash
git add index.html
git commit -m "chore(cefemex): bump cache-bust tras QA de Métricas"
```

**No hacer `git push` en este task ni en ninguno anterior — el usuario confirmó que quiere probar todo en local antes de publicar a producción. El deploy (`git push origin main`) requiere confirmación explícita aparte.**

---

## Self-Review

**Spec coverage:**
- Endpoint + parámetros → Task 2 (`buildCefemexMetricsUrl`).
- Fetch directo sin proxy → Task 2.
- Columnas dinámicas desde `etapas[]`, nunca hardcodeadas → Task 4.
- Vacío vs. `0` en `dias_por_etapa` → Task 4.
- `Object.keys(dias_por_etapa).length` para "Etapas" → Task 4.
- Tabla ordenable incluidas columnas de etapa, default total descendente → Task 6.
- Heatmap 1/5/15/30 → Task 5.
- Columnas Lead/Resultado fijas con ancho explícito → Task 1 (CSS) + Task 4 (clases aplicadas).
- Pie de tabla (mediana/promedio/leads por etapa) sobre filas visibles → Task 7.
- Tarjetas de `totales` → Task 3.
- `descartados` obligatorio y visible → Task 7.
- `criterios` en desplegable, sin hardcodear texto → Task 7.
- Advertencia de poca base (12 ganados vs 193 perdidos) → Task 3 (`cmxBuildNoteHtml`, calculado de `totales`, no hardcodeado).
- Botón de descarga Excel → Task 9.
- Probar todo en local antes de prod → Nota en cada task + Task 10 explícito, sin `git push`.

**Placeholder scan:** sin TBD/TODO; todos los pasos traen código completo.

**Type consistency:** `cefemexMetrics` (state), `cmxBuildTableCardHtml`, `cmxRenderTableSlot`, `cmxSortValue`/`cmxSortBy`/`cmxSortIcon`, `cmxHeatColor`, `cmxBuildFooterRow`/`cmxMedian`, `cmxBuildDescartadosHtml`, `cmxBuildCriteriosHtml`, `cmxBuildNoteHtml`/`cmxBuildCardsHtml`, `fmtDias`/`fmtFecha`, `setupCefemexMetricsControls`, `downloadCefemexMetricsExcel`, `buildCefemexMetricsUrl`/`cmxUnixSeconds`, `fetchCefemexMetrics`, `renderCefemexMetricsState`/`renderCefemexMetricsContent`, `initCefemexMetrics` — nombres usados de forma consistente en todas las tareas donde aparecen.
