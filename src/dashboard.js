// --- Quantix Pro | Dashboard Logic ---
// Revised for maximum robustness and to fix empty chart/table issues

// Global State
const state = {
    leads: [],
    filteredLeads: [],
    ventas: [],
    config: {
        clientName: 'Cargando...',
        webhookUrl: '',
        investment: 0,
        sales: 0,
        themePrimary: '#7551FF',
        themeSecondary: '#01F1E3'
    },
    clientType: 'otro',
    activeTab: 'eventos',
    chartMode: 'calificados',
    charts: {},
    filters: {
        start: null,
        end: null
    },
    flatpickr: null
};

const DEFAULT_CARD_LABELS = {
    "1": { title: "Oportunidades calificadas", description: "CALIDAD" },
    "2": { title: "Tasa de Conversión", description: "Oportunidades calificadas / Leads" },
    "3": { title: "Ventas", description: "INGRESOS TOTALES" },
    "4": { title: "ROI", description: "VENTAS / INVERSIÓN" },
    "5": { title: "Total de Registros", description: "Personas que mandaron mensaje" },
    "6": { title: "Inversión", description: "" },
    "7": { title: "Costo por oportunidad calificada", description: "" }
};

// --- Loading Screen ---
function setLoaderProgress(pct) {
    const bar = document.getElementById('loader-bar');
    if (bar) bar.style.width = pct + '%';
}

function hideLoader() {
    setLoaderProgress(100);
    setTimeout(() => {
        const loader = document.getElementById('dashboard-loader');
        if (!loader) return;
        loader.classList.add('fade-out');
        setTimeout(() => loader.remove(), 650);
    }, 350);
}

// --- Initialization ---
async function init() {
    console.log('--- QUANTIX DASHBOARD INIT ---');

    // Verificación de seguridad adicional
    if (typeof checkAuth === 'function' && !checkAuth()) {
        console.log('No autenticado. Abortando carga de datos.');
        return;
    }

    try {
        setLoaderProgress(15);
        await loadConfig();
        setLoaderProgress(35);

        if (!state.config.webhookUrl) {
            console.warn('Configuración incompleta o sin cliente válido.');
            hideLoader();
            return;
        }

        await fetchData();
        setLoaderProgress(75);

        await loadVentasForDashboard();
        setLoaderProgress(92);

        applyGlobalFilters();
        hideLoader();
    } catch (err) {
        console.error('CRITICAL INIT ERROR:', err);
        hideLoader();
    }
}

// Ensure init runs when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// --- Logic Functions ---

async function loadConfig() {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client');

    if (!clientId) {
        console.warn('No se ha especificado un ID de cliente en la URL (?client=slug).');
        return;
    }

    state.clientId = clientId;

    const { data: config, error } = await supabase
        .from('clients_config')
        .select('*')
        .eq('id_slug', clientId)
        .single();

    if (error) {
        console.error('Error loading config from Supabase:', error);
        return;
    }

    if (config) {
        state.config = {
            clientName: config.name,
            webhookUrl: config.webhook_url,
            investment: config.investment,
            investmentUpdatedAt: config.investment_updated_at || null,
            sales: config.sales_goal,
            clientLogo: config.logo_url,
            themePrimary: config.theme_primary,
            themeSecondary: config.theme_secondary
        };

        state.clientType = config.client_type || 'otro';
        state.rawConfig = config;
        initHotelTabs();

        applyDynamicTheme(state.config.themePrimary, state.config.themeSecondary);
        applyCardLabels(config.card_labels || {});
        setupEventListeners();
    }
}

function applyCardLabels(customLabels) {
    for (let i = 1; i <= 7; i++) {
        const custom = customLabels[i] || customLabels[String(i)] || {};
        const defaults = DEFAULT_CARD_LABELS[String(i)];
        const titleEl = document.getElementById(`label-main-${i}`);
        const descEl = document.getElementById(`label-sub-${i}`);
        if (titleEl) titleEl.textContent = custom.title || defaults.title;
        if (descEl) descEl.textContent = custom.description !== undefined ? custom.description : defaults.description;
    }
}

function setupEventListeners() {
    // Chart mode toggle (calificados / total)
    document.querySelectorAll('.chart-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.chartMode = btn.dataset.mode;
            document.querySelectorAll('.chart-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === state.chartMode));
            createMainChart();
        });
    });

    // Global Range Selector Toggle
    const rangeToggle = document.getElementById('range-picker-toggle');
    const rangeDropdown = document.getElementById('range-dropdown');

    if (rangeToggle && rangeDropdown) {
        rangeToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            rangeDropdown.classList.toggle('hidden');
            rangeToggle.querySelector('.chevron').style.transform = rangeDropdown.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        });

        document.addEventListener('click', () => {
            rangeDropdown.classList.add('hidden');
            rangeToggle.querySelector('.chevron').style.transform = 'rotate(0deg)';
        });

        rangeDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    // Predefined Ranges
    document.querySelectorAll('.range-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            const range = opt.dataset.range;
            const label = document.getElementById('current-range-label');
            label.textContent = opt.textContent;

            setPredefinedRange(range);
            rangeDropdown.classList.add('hidden');
            rangeToggle.querySelector('.chevron').style.transform = 'rotate(0deg)';
        });
    });

    // Flatpickr initialization
    const rangePickerInput = document.getElementById('date-range-picker');
    if (rangePickerInput) {
        state.flatpickr = flatpickr(rangePickerInput, {
            mode: 'range',
            locale: 'es',
            dateFormat: 'Y-m-d',
            disableMobile: "true",
            onClose: (selectedDates) => {
                if (selectedDates.length === 2) {
                    state.filters.start = selectedDates[0];
                    state.filters.end = new Date(selectedDates[1]);
                    state.filters.end.setHours(23, 59, 59, 999);

                    document.getElementById('current-range-label').textContent = 'Rango personalizado';
                    applyGlobalFilters();
                }
            }
        });
    }

    // PDF Export
    const exportBtn = document.getElementById('export-pdf-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToPDF);
    }
}

function setPredefinedRange(range) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    let start = null;
    let end = today;

    switch (range) {
        case 'today':
            start = new Date();
            start.setHours(0, 0, 0, 0);
            break;
        case '7d':
            start = new Date();
            start.setDate(today.getDate() - 7);
            break;
        case '30d':
            start = new Date();
            start.setDate(today.getDate() - 30);
            break;
        case 'this-month':
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        case 'last-month':
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
            end.setHours(23, 59, 59, 999);
            break;
        case 'all':
        default:
            start = null;
            end = null;
            break;
    }

    state.filters.start = start;
    state.filters.end = end;

    // Update inputs visual state
    if (state.flatpickr) {
        if (start && end) {
            state.flatpickr.setDate([start, end]);
        } else {
            state.flatpickr.clear();
        }
    }

    applyGlobalFilters();
}

// --- Hotel Tabs ---

const TAB_SERVICE_MAP = {
    eventos: 'Evento',
    reservas: 'Reserva',
    daypass: 'DayPass',
    restaurante: 'Restaurante'
};

function initHotelTabs() {
    const tabsContainer = document.getElementById('hotel-tabs');
    if (!tabsContainer) return;

    if (state.clientType === 'hotel') {
        const config = state.rawConfig || {};
        const services = config.hotel_services || {
            eventos: 'unlocked',
            reservas: 'unlocked',
            daypass: 'unlocked',
            restaurante: 'unlocked'
        };

        tabsContainer.classList.remove('hidden');

        // Find the first unlocked service to set as active
        const firstUnlocked = Object.keys(services).find(s => services[s] === 'unlocked');
        state.activeTab = firstUnlocked || 'eventos';

        tabsContainer.querySelectorAll('.dash-tab').forEach(btn => {
            const tabId = btn.dataset.tab;
            const status = services[tabId] || 'unlocked';

            if (status === 'hidden') {
                btn.classList.add('hidden');
            } else if (status === 'locked') {
                btn.classList.add('locked');
                btn.title = "Servicio no disponible";
            } else {
                btn.classList.remove('hidden', 'locked');
                btn.classList.toggle('active', tabId === state.activeTab);
            }

            btn.addEventListener('click', () => {
                if (btn.classList.contains('locked')) return;
                switchDashTab(tabId);
            });
        });

        // Hotel-specific overrides
        document.getElementById('table-title').textContent = 'Últimas cotizaciones enviadas a ventas';
        document.getElementById('main-chart-title').textContent = 'Histórico de cotizaciones de eventos canalizados a ventas';

        const modeToggle = document.getElementById('main-chart-toggle');
        if (modeToggle) modeToggle.style.visibility = 'hidden'; // Hide the "Totales" toggle

        // Move cards - Capture all references first to avoid losing them when clearing rows
        const topRow = document.getElementById('top-cards-row');
        const bottomRow = document.getElementById('bottom-cards-row');

        const c1 = document.getElementById('card-1-wrapper'); // Cotizaciones
        const c2 = document.getElementById('card-2-wrapper'); // Tasa de Conversión
        const c3 = document.getElementById('card-3-wrapper'); // Ventas
        const c4 = document.getElementById('card-4-wrapper'); // ROI
        const c5 = document.getElementById('card-5-wrapper'); // Total de Registros
        const c6 = document.getElementById('card-6-wrapper'); // Inversión
        const c7 = document.getElementById('card-7-wrapper'); // Costo por cotización

        if (topRow && bottomRow && c1 && c2 && c3 && c4 && c5 && c6 && c7) {
            // Top Row: 1, 3, 4, 7
            topRow.appendChild(c1);
            topRow.appendChild(c3);
            topRow.appendChild(c4);
            topRow.appendChild(c7);

            // Bottom Row: 5, 6, 2 (Rightmost)
            bottomRow.appendChild(c5);
            bottomRow.appendChild(c6);
            bottomRow.appendChild(c2);

            // Grid settings
            bottomRow.style.display = 'grid';
            bottomRow.style.gridTemplateColumns = 'repeat(3, 1fr)';
            bottomRow.style.gap = '2rem';

            // Force visibility
            [c1, c2, c3, c4, c5, c6, c7].forEach(el => {
                el.style.setProperty('display', 'flex', 'important');
                el.style.setProperty('visibility', 'visible', 'important');
                el.style.setProperty('opacity', '1', 'important');
                el.classList.remove('hidden');

                // Clear any debug styles
                el.style.border = '';
                el.style.boxShadow = '';
                el.style.zIndex = '';
                const debugMsg = el.querySelector('.debug-msg');
                if (debugMsg) debugMsg.remove();
            });
        }

    } else {
        tabsContainer.classList.add('hidden');

        // Ensure all cards are visible for non-hotel types if they were hidden before
        ['card-1', 'card-2', 'card-3', 'card-4', 'card-5', 'card-6', 'card-7'].forEach(id => {
            const el = document.getElementById(`${id}-wrapper`);
            if (el) el.style.display = 'flex';
        });
    }
}

function switchDashTab(tab) {
    state.activeTab = tab;

    const tabsContainer = document.getElementById('hotel-tabs');
    if (tabsContainer) {
        tabsContainer.querySelectorAll('.dash-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
    }

    applyGlobalFilters();
}

function applyGlobalFilters() {
    console.log('Applying global filters:', state.filters);

    state.filteredLeads = state.leads.filter(lead => {
        if (!lead.fecha_parsed) return false;

        let match = true;
        if (state.filters.start) {
            match = match && lead.fecha_parsed >= state.filters.start;
        }
        if (state.filters.end) {
            match = match && lead.fecha_parsed <= state.filters.end;
        }

        // Filtrar por tipo de servicio si es hotel
        if (match && state.clientType === 'hotel') {
            const expectedType = TAB_SERVICE_MAP[state.activeTab];
            if (expectedType) {
                match = match && lead.tipo_servicio === expectedType;
            }
        }

        return match;
    });

    renderDashboard();
}

async function exportToPDF() {
    const exportBtn = document.getElementById('export-pdf-btn');
    const originalContent = exportBtn.innerHTML;
    exportBtn.disabled = true;
    exportBtn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon>';

    try {
        const { jsPDF } = window.jspdf;
        const dashboard = document.querySelector('.main-content');

        // Temporarily hide elements that shouldn't be in PDF
        const filterTabs = document.querySelector('.table-tabs');
        const viewAllBtn = document.getElementById('view-all-btn');
        if (filterTabs) filterTabs.style.visibility = 'hidden';
        if (viewAllBtn) viewAllBtn.style.visibility = 'hidden';

        const canvas = await html2canvas(dashboard, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#0B0C10',
            logging: false
        });

        if (filterTabs) filterTabs.style.visibility = 'visible';
        if (viewAllBtn) viewAllBtn.style.visibility = 'visible';

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Reporte_Intra_${state.config.clientName}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
        console.error('PDF Export Error:', err);
        alert('Error al generar el PDF. Inténtalo de nuevo.');
    } finally {
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalContent;
    }
}

function applyDynamicTheme(primary, secondary) {
    if (!primary || !secondary) return;

    console.log('--- APPLYING DYNAMIC THEME ---', primary, secondary);

    // Create a dynamic style element
    let styleEl = document.getElementById('dynamic-theme-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-theme-styles';
        document.head.appendChild(styleEl);
    }

    // Convert hex to rgba for the glow effect
    const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const primaryGlow = hexToRgba(primary, 0.3);
    const primaryBorder = hexToRgba(primary, 0.5);

    // Make utility globally available for charts
    window.hexToRgba = hexToRgba;

    styleEl.innerHTML = `
        :root {
            --accent-purple: ${primary};
            --accent-purple-glow: ${primaryGlow};
            --accent-green: ${secondary};
            --border-highlight: ${primaryBorder};
        }
        
        /* Apply dynamic glow to body background if needed */
        body {
            background-image:
                radial-gradient(circle at 0% 0%, ${hexToRgba(primary, 0.08)} 0%, transparent 50%),
                radial-gradient(circle at 100% 100%, ${hexToRgba(secondary, 0.05)} 0%, transparent 40%);
        }

        /* Clear specific card accents/colors from index.html */
        .card-accent-line { background: ${primary} !important; opacity: 0.8; }
        .card-accent-line.orange, .card-accent-line.purple, .card-accent-line.cyan, .card-accent-line.pink { background: ${primary} !important; }
        
        /* Icon Boxes (Overriding inline styles) */
        .icon-box { 
            background: ${hexToRgba(primary, 0.1)} !important; 
            border-color: ${hexToRgba(primary, 0.3)} !important; 
            color: ${primary} !important; 
        }
        
        /* Specific card indices if they need to vary */
        .card-quantix:nth-child(odd) .icon-box { color: ${secondary} !important; background: ${hexToRgba(secondary, 0.1)} !important; border-color: ${hexToRgba(secondary, 0.3)} !important; }
        .card-quantix:nth-child(odd) .card-accent-line { background: ${secondary} !important; }

        /* Pills and Badges */
        .pill-change { 
            background: ${hexToRgba(primary, 0.15)} !important; 
            color: ${primary} !important; 
        }
        .pill-change.pill-green { 
            background: ${hexToRgba(secondary, 0.15)} !important; 
            color: ${secondary} !important; 
        }
        
        .view-btn:hover { border-color: ${primary} !important; color: ${primary} !important; }
    `;
}

async function loadVentasForDashboard() {
    if (!state.clientId) return;
    const { data, error } = await supabase
        .from('ventas')
        .select('id, monto, fecha')
        .eq('client_slug', state.clientId);
    state.ventas = error ? [] : (data || []);
}

// Callable desde index.html para refrescar Card 3 tras guardar/eliminar una venta
async function refreshVentasDashboard() {
    await loadVentasForDashboard();
    renderDashboard();
}
window.refreshVentasDashboard = refreshVentasDashboard;

async function fetchData() {
    console.log('Fetching leads from:', state.config.webhookUrl);
    try {
        const response = await fetch(state.config.webhookUrl);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const rawData = await response.json();

        // Normalize leads immediately
        state.leads = rawData.map(lead => ({
            ...lead,
            estatus: normalizeStatus(lead.estatus),
            fecha_parsed: parseCustomDate(lead.fecha_creacion)
        }));

        // Para hoteles: asignar tipo_servicio ficticio si no existe
        // Distribución: DayPass ~40%, Reserva ~30%, Evento ~20%, Restaurante ~10%
        if (state.clientType === 'hotel') {
            const hasRealTypes = state.leads.some(l => l.tipo_servicio);
            if (!hasRealTypes) {
                state.leads.forEach((lead, i) => {
                    const bucket = i % 20;
                    if (bucket < 8) lead.tipo_servicio = 'DayPass';
                    else if (bucket < 14) lead.tipo_servicio = 'Reserva';
                    else if (bucket < 18) lead.tipo_servicio = 'Evento';
                    else lead.tipo_servicio = 'Restaurante';
                });
            }
        }

        state.filteredLeads = [...state.leads];
        console.log(`Leads Processing Complete. Total: ${state.leads.length}`);
    } catch (error) {
        console.error('Fetch Data Failed:', error);
        state.leads = [];
        state.filteredLeads = [];
    }
}

function renderDashboard() {
    const metrics = calculateMetrics();
    updateUI(metrics);
    renderAllCharts(metrics);
    renderTable();
}

function calculateMetrics() {
    const total = state.filteredLeads.length;
    const qualifiedLeads = state.filteredLeads.filter(l => isQualified(l.estatus));
    const qualified = qualifiedLeads.length;

    const investment = parseFloat(state.config.investment) || 0;

    // Filtrar ventas por el rango de fechas activo
    const filteredVentas = state.ventas.filter(v => {
        if (!v.fecha) return true;
        const ventaDate = new Date(v.fecha + 'T00:00:00');
        if (state.filters.start && ventaDate < state.filters.start) return false;
        if (state.filters.end && ventaDate > state.filters.end) return false;
        return true;
    });
    const sales = filteredVentas.reduce((sum, v) => sum + parseFloat(v.monto || 0), 0);

    const conversionRate = total > 0 ? (qualified / total) : 0;
    const roi = investment > 0 ? (sales / investment) : 0;
    const cpl = qualified > 0 ? (investment / qualified) : 0;

    return { total, qualified, investment, sales, roi, conversionRate, cpl };
}

function updateUI(m) {
    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setTxt('card-1-value', m.qualified);
    setTxt('card-2-value', (m.conversionRate * 100).toFixed(1) + '%');
    setTxt('card-3-value', `$${m.sales.toLocaleString('en-US')}`);
    setTxt('card-4-value', `${m.roi.toFixed(2)}x`);

    setTxt('card-5-value', m.total);
    setTxt('card-6-value', `$${m.investment.toLocaleString('en-US')}`);
    setTxt('card-7-value', `$${m.cpl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    // Fecha de actualización de inversión
    const card6pill = document.getElementById('card-6-date');
    if (card6pill) {
        if (state.config.investmentUpdatedAt) {
            const [y, mo, d] = state.config.investmentUpdatedAt.split('-');
            card6pill.textContent = `Actualizada al ${d}/${mo}/${y}`;
        } else {
            card6pill.textContent = 'Presupuesto';
        }
    }

    // Dynamic Welcome & Logo
    const _session = typeof getSession === 'function' ? getSession() : null;
    setTxt('welcome-name', (_session && _session.name) ? _session.name : (state.config.clientName || 'Administrador'));

    const logoImg = document.getElementById('client-logo');
    if (logoImg) {
        if (state.config.clientLogo) {
            logoImg.src = state.config.clientLogo;
            logoImg.classList.remove('hidden');
        } else {
            logoImg.classList.add('hidden');
        }
    }

    // Client Title injection
    setTxt('client-name-display', state.config.clientName || 'Cargando...');

    // Side panel inputs
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    setVal('panel-invest', `$${m.investment.toLocaleString('en-US')}`);
    setTxt('roi-txt', `${m.roi.toFixed(2)}x`);
    setTxt('cpl-txt', `$${m.cpl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}

function renderTable() {
    console.log('--- renderTable START ---');
    const tableBody = document.getElementById('leads-table-body');
    const modalTableBody = document.getElementById('modal-table-body');
    if (!tableBody) return;

    let leadsToShow = state.filteredLeads.filter(l => isQualified(l.estatus));

    if (leadsToShow.length === 0 && state.leads.length > 0) {
        leadsToShow = state.filteredLeads;
    }

    // Ordenar del más reciente al más antiguo
    leadsToShow = [...leadsToShow].sort((a, b) => (b.fecha_parsed || 0) - (a.fecha_parsed || 0));

    // Main Dashboard Table (Clean fixed view - 8 leads)
    const mainTableHTML = leadsToShow.slice(0, 8).map((lead, index) => renderLogRow(lead, index)).join('');
    tableBody.innerHTML = mainTableHTML;

    // Modal Table (Full view - All leads)
    if (modalTableBody) {
        const fullTableHTML = leadsToShow.map((lead, index) => renderLogRow(lead, index)).join('');
        modalTableBody.innerHTML = fullTableHTML;
    }

    setupModalEvents();
}

function renderLogRow(lead, index) {
    return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="color: #565969; padding: 12px 0;">${index + 1}</td>
            <td style="color: white; font-weight: 600;">
                 <div style="display:flex; align-items:center; gap:10px;">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(lead.nombre || 'L')}&background=random&color=fff" style="width:24px; border-radius:50%;">
                    ${lead.nombre || 'Lead Anonymous'}
                </div>
            </td>
            <td style="color: #8E92A3;">${lead.fecha_parsed ? lead.fecha_parsed.toLocaleDateString('es-MX') : 'N/A'}</td> 
            <td>
                <span class="status-badge" style="color: ${isQualified(lead.estatus) ? state.config.themeSecondary : '#FF4444'}; 
                      background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 6px; font-size: 0.8rem;">
                    ${lead.estatus}
                </span>
            </td>
        </tr>
    `;
}

function setupModalEvents() {
    const modal = document.getElementById('leads-modal');
    const btn = document.getElementById('view-all-btn');
    const close = document.querySelector('.close-modal');

    if (btn && modal) {
        btn.onclick = () => modal.classList.remove('hidden');
    }
    if (close && modal) {
        close.onclick = () => modal.classList.add('hidden');
    }
    window.onclick = (event) => {
        if (event.target === modal) {
            modal.classList.add('hidden');
        }
    };
}

// --- Charting ---

function renderAllCharts(metrics) {
    console.log('--- renderAllCharts START ---');
    // 1. Small Mini-Charts (Manual/Fake data for sparklines) - Using theme colors for consistency
    createSmoothChart('chart-1', [12, 19, 15, 25, 22, 30, 28, 35, 40, 45, 50, 60], state.config.themeSecondary);
    createSmoothChart('chart-2', [5, 8, 12, 10, 15, 20, 25, 22, 28, 35, 30, 40], state.config.themePrimary);
    createSmoothChart('chart-3', [10, 12, 14, 18, 16, 20, 22, 26, 30, 28, 35, 40], state.config.themeSecondary);
    createSmoothChart('chart-4', [2, 3, 3.5, 3.2, 4, 4.5, 5.0, 5.2, 5.5, 6, 6.5, 7], state.config.themePrimary);

    // Bottom SPARKLINES
    createSmoothChart('chart-5', [100, 110, 105, 120, 130, 125, 140, 150, 160, 155, 170, 180], state.config.themeSecondary);
    createSmoothChart('chart-6', [50, 55, 52, 60, 62, 58, 65, 70, 75, 72, 80, 85], state.config.themePrimary);
    createSmoothChart('chart-7', [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45], state.config.themeSecondary);

    // 2. MAIN BIG CHART (Actual Data)
    createMainChart();

    // 3. UTM CAMPAIGN CHART (New)
    createUTMChart();
}

function createUTMChart() {
    console.log('--- createUTMChart START ---');
    const canvas = document.getElementById('utm-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (state.charts['utm-chart']) state.charts['utm-chart'].destroy();

    // Grouping by Campaign (Qualified leads only for more impact)
    const campaignData = {};
    state.filteredLeads.filter(l =>
        l.estatus === 'Lead Calificado' || l.estatus === 'Lead Condicionado'
    ).forEach(l => {
        const campaign = l.utm_campaign || 'Orgánico / Otros';
        campaignData[campaign] = (campaignData[campaign] || 0) + 1;
    });

    const labels = Object.keys(campaignData);
    const values = Object.values(campaignData);

    state.charts['utm-chart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Leads Calificados',
                data: values,
                backgroundColor: hexToRgba(state.config.themeSecondary, 0.6),
                borderColor: state.config.themeSecondary,
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#1E1F25' }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#8E92A3' } },
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8E92A3', precision: 0 } }
            }
        }
    });

    // Update UTM list (Top sources/mediums)
    const listContainer = document.getElementById('utm-list');
    if (listContainer) {
        const sourceData = {};
        state.filteredLeads.forEach(l => {
            const src = l.utm_source || l.utm_medium || 'Directo/Otro';
            sourceData[src] = (sourceData[src] || 0) + 1;
        });

        const sortedSources = Object.entries(sourceData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        listContainer.innerHTML = sortedSources.map(([name, count]) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <span style="color: white; font-size: 0.9rem;">${name}</span>
                <span style="color: var(--accent-green); font-weight: 700;">${count}</span>
            </div>
        `).join('');
    }
}

function createSmoothChart(canvasId, dataPoints, colorHex) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 100);
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.25)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    if (state.charts[canvasId]) state.charts[canvasId].destroy();

    state.charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dataPoints.map((_, i) => i),
            datasets: [{
                data: dataPoints,
                borderColor: colorHex,
                backgroundColor: gradient,
                borderWidth: 2.5,
                tension: 0.45,
                pointRadius: 0,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } },
            elements: { line: { borderJoinStyle: 'round' } }
        }
    });
}

function createMainChart() {
    console.log('--- createMainChart START ---');
    const canvas = document.getElementById('main-chart');
    if (!canvas) {
        console.warn('Main chart canvas not found!');
        return;
    }
    const ctx = canvas.getContext('2d');

    if (state.charts['main-chart']) state.charts['main-chart'].destroy();

    // Grouping by Date
    const dailyData = {};
    const sourceLeads = state.chartMode === 'calificados'
        ? state.filteredLeads.filter(l => isQualified(l.estatus))
        : state.filteredLeads;
    const sorted = [...sourceLeads].sort((a, b) => a.fecha_parsed - b.fecha_parsed);

    sorted.forEach(l => {
        if (!l.fecha_parsed || isNaN(l.fecha_parsed.getTime())) return;
        const key = l.fecha_parsed.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
        dailyData[key] = (dailyData[key] || 0) + 1;
    });

    let labels = Object.keys(dailyData);
    let values = Object.values(dailyData);
    console.log('Main Chart Data - Labels:', labels.length, 'Values SUM:', values.reduce((a, b) => a + b, 0));

    if (labels.length === 0) {
        labels = ['N/A'];
        values = [0];
    }

    const color = state.config.themePrimary;
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, hexToRgba(color, 0.3));
    gradient.addColorStop(1, hexToRgba(color, 0));

    state.charts['main-chart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Leads',
                data: values,
                borderColor: color,
                borderWidth: 4,
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#1E1F25', padding: 12, titleColor: '#fff', bodyColor: '#ccc' }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#8E92A3', font: { size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#8E92A3', precision: 0 }
                }
            }
        }
    });
}

// --- Helpers ---

function parseCustomDate(str) {
    if (!str) return new Date();
    try {
        // Handle "3/2/2026, 5:37:27 p.m."
        const cleaned = str.replace(/\./g, '').replace(/p\s*m/i, 'PM').replace(/a\s*m/i, 'AM');
        const parts = cleaned.split(',');
        const datePart = parts[0].trim();
        const [d, m, y] = datePart.split('/').map(Number);

        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
            return new Date(y, m - 1, d);
        }
        return new Date(cleaned);
    } catch (e) {
        return new Date();
    }
}

function normalizeStatus(status) {
    if (!status) return 'Desconocido';
    const s = status.toLowerCase().trim();

    // Specific matches to preserve names
    if (s.includes('rechazado cefemex')) return 'Rechazado CEFEMEX';
    if (s.includes('documentacion') || s.includes('documentación')) return 'Documentación / Integración E1';
    if (s.includes('financiera')) return 'Revisión Financiera / Integración E2';
    if (s.includes('comité') || s.includes('comite')) return 'Comité / Autorización';

    if (s.includes('calificado')) return 'Lead Calificado';
    if (s.includes('condicionado')) return 'Lead Condicionado';
    if (s.includes('rechazado')) return 'Rechazado';

    return status.charAt(0).toUpperCase() + status.slice(1);
}

function isQualified(status) {
    if (!status) return false;
    const s = status.toLowerCase();
    const qualifiedTerms = [
        'calificado',
        'condicionado',
        'rechazado cefemex',
        'documentación',
        'documentacion',
        'integración',
        'integracion',
        'financiera',
        'comité',
        'comite',
        'autorización',
        'autorizacion'
    ];
    return qualifiedTerms.some(term => s.includes(term));
}
