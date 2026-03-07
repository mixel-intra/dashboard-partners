// --- Quantix Pro | Dashboard Logic ---
// Revised for maximum robustness and to fix empty chart/table issues
console.log('%c DASHBOARD v2027-02-27B ', 'background:#0f0;color:#000;font-size:16px;font-weight:bold');

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
    flatpickr: null,
    // Restaurant reservations
    restaurantReservations: [],
    restaurantFilters: { status: 'all', search: '' },
    restaurantViewMode: 'cards',
    restaurantSortField: 'fechaEvento',
    restaurantSortDir: 'desc',
    restaurantNewIds: [],
    restaurantConfig: { airtableWebhookUrl: '', confirmWebhookUrl: '' }
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

        // Load restaurant config
        const restConfig = config.restaurant_config || {};
        state.restaurantConfig = {
            airtableWebhookUrl: restConfig.airtable_webhook_url || '',
            confirmWebhookUrl: restConfig.confirm_webhook_url || ''
        };

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
            reservas: 'locked',
            daypass: 'locked',
            restaurante: 'locked'
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
                // Add tiny lock if not already there
                if (!btn.querySelector('.tab-lock-icon')) {
                    const lock = document.createElement('ion-icon');
                    lock.name = 'lock-closed';
                    lock.className = 'tab-lock-icon';
                    btn.appendChild(lock);
                }
            } else {
                btn.classList.remove('hidden', 'locked');
                btn.classList.toggle('active', tabId === state.activeTab);
                const lock = btn.querySelector('.tab-lock-icon');
                if (lock) lock.remove();
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

    // Toggle between regular dashboard and restaurant panel
    const dashboardGrid = document.querySelector('.dashboard-grid');
    const restaurantPanel = document.getElementById('restaurant-panel');

    if (tab === 'restaurante') {
        if (dashboardGrid) dashboardGrid.classList.add('hidden');
        if (restaurantPanel) {
            restaurantPanel.classList.remove('hidden');
            fetchRestaurantReservations();
            markRestaurantAsSeen();
        }
    } else {
        if (dashboardGrid) dashboardGrid.classList.remove('hidden');
        if (restaurantPanel) restaurantPanel.classList.add('hidden');
        applyGlobalFilters();
    }
}

function applyGlobalFilters() {
    console.log('=== applyGlobalFilters ===',
        '| leads:', state.leads.length,
        '| activeTab:', state.activeTab,
        '| clientType:', state.clientType,
        '| filters:', JSON.stringify(state.filters));
    console.trace();

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
            const isCefemex = state.clientId === 'cefemex';
            const expectedType = TAB_SERVICE_MAP[state.activeTab];

            if (expectedType) {
                if (isCefemex) {
                    match = match && lead.tipo_servicio === expectedType;
                } else {
                    // Para otros hoteles: 
                    // Un lead calificado aparece SOLO en su pestaña correspondiente.
                    // Un lead general (no calificado) cuenta para TODAS las pestañas para sumar al total global e ingresos.
                    const isQual = isQualified(lead.estatus);
                    if (isQual) {
                        match = match && lead.tipo_servicio === expectedType;
                    } else {
                        // Es un lead general, se queda para que sume al total de registros
                        match = true;
                    }
                }
            }
        }

        return match;
    });

    console.log('filteredLeads after filter:', state.filteredLeads.length,
        '| qualified:', state.filteredLeads.filter(l => isQualified(l.estatus)).length);
    renderDashboard();

    // Re-render restaurant panel if active (uses global date filter)
    if (state.activeTab === 'restaurante' && state.restaurantReservations.length > 0) {
        renderRestaurantReservations();
    }
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

// --- Fake Data Generator (modo DEMO para hoteles sin webhook real) ---
function generateFakeHotelLeads() {
    const nombres = [
        'María González', 'Carlos Hernández', 'Ana López', 'Roberto Martínez',
        'Laura García', 'Fernando Rodríguez', 'Patricia Sánchez', 'Miguel Ángel Torres',
        'Gabriela Ramírez', 'José Luis Flores', 'Claudia Morales', 'Alejandro Díaz',
        'Verónica Cruz', 'Ricardo Mendoza', 'Isabel Ortega', 'Daniel Vargas',
        'Sofía Castillo', 'Eduardo Ríos', 'Carmen Jiménez', 'Andrés Navarro',
        'Mariana Ruiz', 'Juan Pablo Reyes', 'Diana Guerrero', 'Héctor Medina',
        'Valeria Peña', 'Francisco Aguilar', 'Lucía Domínguez', 'Sergio Romero',
        'Paulina Herrera', 'Raúl Estrada', 'Natalia Bautista', 'Óscar Delgado',
        'Andrea Vega', 'Luis Enrique Salazar', 'Mónica Acosta', 'Jorge Contreras',
        'Teresa Fuentes', 'Emilio Guzmán', 'Adriana Campos', 'Pablo Sandoval',
        'Daniela Ibarra', 'Arturo Espinoza', 'Renata Figueroa', 'Iván Lara',
        'Fernanda Cabrera', 'Ximena Palacios', 'Gustavo Cervantes', 'Rosa Elena Soto'
    ];

    const statuses = [
        { estatus: 'CALIFICADO EVENTO',       weight: 22 },
        { estatus: 'CALIFICADO RESERVA',       weight: 18 },
        { estatus: 'CALIFICADO DAYPASS',       weight: 14 },
        { estatus: 'CALIFICADO RESTAURANTE',   weight: 10 },
        { estatus: 'NUEVO',                    weight: 15 },
        { estatus: 'CONTACTADO',               weight: 12 },
        { estatus: 'EN SEGUIMIENTO',           weight: 9 }
    ];

    const utmSources = ['facebook', 'google', 'instagram', 'tiktok', null, null];
    const utmMediums = ['cpc', 'social', 'organic', 'referral', null, null];
    const utmCampaigns = ['promo-verano', 'bodas-2026', 'daypass-especial', 'hotel-branding', null, null, null];

    const totalLeads = 48 + Math.floor(Math.random() * 15); // 48-62 leads
    const leads = [];
    const totalWeight = statuses.reduce((s, st) => s + st.weight, 0);

    for (let i = 0; i < totalLeads; i++) {
        // Fecha aleatoria dentro de los últimos 45 días
        const daysAgo = Math.floor(Math.random() * 45);
        const hour = 8 + Math.floor(Math.random() * 12);
        const min = Math.floor(Math.random() * 60);
        const sec = Math.floor(Math.random() * 60);
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        d.setHours(hour, min, sec, 0);

        const dayStr = d.getDate();
        const monStr = d.getMonth() + 1;
        const yearStr = d.getFullYear();
        const ampm = hour >= 12 ? 'p.m.' : 'a.m.';
        const h12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        const fecha = `${dayStr}/${monStr}/${yearStr}, ${h12}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')} ${ampm}`;

        // Seleccionar estatus por peso
        let rand = Math.random() * totalWeight;
        let estatus = statuses[0].estatus;
        for (const st of statuses) {
            rand -= st.weight;
            if (rand <= 0) { estatus = st.estatus; break; }
        }

        leads.push({
            id_lead: 20900000 + i,
            nombre: nombres[i % nombres.length],
            precio: 0,
            estatus: estatus,
            estatus_id: 100000000 + i,
            fecha_creacion: fecha,
            utm_source: utmSources[Math.floor(Math.random() * utmSources.length)],
            utm_medium: utmMediums[Math.floor(Math.random() * utmMediums.length)],
            utm_campaign: utmCampaigns[Math.floor(Math.random() * utmCampaigns.length)],
            utm_content: null,
            respuesta_ai: null
        });
    }

    return leads;
}

async function fetchData() {
    const isDemoMode = state.config.webhookUrl === 'DEMO';
    console.log(isDemoMode ? 'MODO DEMO — Generando datos ficticios' : 'Fetching leads from (via proxy): ' + state.config.webhookUrl);

    try {
        let rawData;

        if (isDemoMode) {
            rawData = generateFakeHotelLeads();
        } else {
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(state.config.webhookUrl)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            rawData = await response.json();
        }

        // Normalize leads — extraer tipo_servicio del campo crudo (tipo_servicio o estatus)
        state.leads = rawData.map(lead => {
            const rawSource = (lead.tipo_servicio || lead.estatus || '').toLowerCase();
            let tipoServicio = null;
            if (rawSource.includes('restaurante'))                                    tipoServicio = 'Restaurante';
            else if (rawSource.includes('daypass') || rawSource.includes('day pass')) tipoServicio = 'DayPass';
            else if (rawSource.includes('reserva'))                                   tipoServicio = 'Reserva';
            else if (rawSource.includes('evento'))                                    tipoServicio = 'Evento';

            return {
                ...lead,
                tipo_servicio: tipoServicio,
                estatus: normalizeStatus(lead.estatus),
                fecha_parsed: parseCustomDate(lead.fecha_creacion)
            };
        });

        // Para hoteles: fallback si el lead no tiene tipo_servicio identificable
        if (state.clientType === 'hotel') {
            state.leads.forEach((lead, i) => {
                if (!lead.tipo_servicio) {
                    const bucket = i % 20;
                    if (bucket < 8)       lead.tipo_servicio = 'DayPass';
                    else if (bucket < 14) lead.tipo_servicio = 'Reserva';
                    else if (bucket < 18) lead.tipo_servicio = 'Evento';
                    else                  lead.tipo_servicio = 'Restaurante';
                }
            });
        }

        state.filteredLeads = [...state.leads];
        console.log(`Leads Processing Complete. Total: ${state.leads.length}` + (isDemoMode ? ' (DEMO)' : ''));
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

    // --- NORMALIZACIÓN PARA HOTELES (EXCEPTO CEFEMEX) ---
    // Soporta tanto singular ("CALIFICADO RESERVA") como plural ("CALIFICADO RESERVAS")
    const isHotel = state.clientType === 'hotel' && state.clientId !== 'cefemex';
    if (isHotel) {
        if (s.includes('calificado restaurante')) return 'Calificado Restaurante';
        if (s.includes('calificado daypass') || s.includes('calificado day pass')) return 'Calificado DayPass';
        if (s.includes('calificado reserva'))     return 'Calificado Reserva';
        if (s.includes('calificado evento'))      return 'Calificado Evento';
    }

    // Specific matches to preserve names
    if (s.includes('rechazado cefemex')) {
        return state.clientType === 'hotel' ? 'Cotizado' : 'Rechazado CEFEMEX';
    }
    if (s.includes('continuidad cefemex')) return 'Continuidad CEFEMEX';
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

    // --- HOTELES (excepto CEFEMEX) ---
    if (state.clientType === 'hotel' && state.clientId !== 'cefemex') {
        return s.startsWith('calificado');
    }

    // --- INMOBILIARIA / REAL ESTATE ---
    // Solo cuenta "calificado cita" — el genérico "lead calificado" NO cuenta
    if (state.clientType === 'inmobiliaria') {
        return s.includes('calificado cita');
    }

    // --- POLÍTICA GENERAL / CEFEMEX ---
    return [
        'calificado',
        'condicionado',
        'continuidad cefemex',
        'rechazado cefemex',
        'cotizado',
        'documentación',
        'documentacion',
        'integración',
        'integracion',
        'financiera',
        'comité',
        'comite',
        'autorización',
        'autorizacion'
    ].some(term => s.includes(term));
}

// =============================================
// MÓDULO: Panel de Reservas de Restaurante
// =============================================

// --- Toast notifications ---
function showToast(message, type = 'success', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: 'checkmark-circle', error: 'alert-circle', warning: 'warning' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<ion-icon name="${icons[type] || icons.success}-outline"></ion-icon><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// --- Parsing de fechas en español ---
const MESES_MAP = { enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5, julio:6, agosto:7, septiembre:8, octubre:9, noviembre:10, diciembre:11,
    ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, sept:8, oct:9, nov:10, dic:11 };

function applyTime(date, match) {
    let h = parseInt(match[1]);
    const m = parseInt(match[2] || '0');
    const ampm = (match[3] || '').toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    date.setHours(h, m, 0, 0);
}

function parseFechaEvento(dateStr) {
    if (!dateStr) return null;
    const str = dateStr.trim();

    // Intentar parseo nativo ISO / standard
    const native = new Date(str);
    if (!isNaN(native.getTime()) && native.getFullYear() > 2000) return native;

    const lower = str.toLowerCase();
    const now = new Date();
    const currentYear = now.getFullYear();

    // "mañana" / "manana" + hora opcional
    if (/^ma[nñ]ana/.test(lower)) {
        const d = new Date(now); d.setDate(d.getDate() + 1);
        const timeMatch = lower.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
        if (timeMatch) applyTime(d, timeMatch);
        return d;
    }

    // "hoy" + hora opcional
    if (/^hoy/.test(lower)) {
        const d = new Date(now);
        const timeMatch = lower.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
        if (timeMatch) applyTime(d, timeMatch);
        return d;
    }

    // "DD de MONTH [de YYYY]" — "14 de marzo", "27 de junio de 2026"
    const p1 = lower.match(/(\d{1,2})\s+de\s+(\w+)(?:\s+(?:de\s+)?(\d{4}))?/);
    if (p1) {
        const day = parseInt(p1[1]);
        const mes = MESES_MAP[p1[2]];
        if (mes !== undefined) return new Date(p1[3] ? parseInt(p1[3]) : currentYear, mes, day);
    }

    // "Día, DD de MONTH" — "Miércoles, 14 de marzo"
    const p2 = lower.match(/\w+,?\s+(\d{1,2})\s+de\s+(\w+)/);
    if (p2) {
        const day = parseInt(p2[1]);
        const mes = MESES_MAP[p2[2]];
        if (mes !== undefined) return new Date(currentYear, mes, day);
    }

    // "DD MON YYYY" — "05 mar 2026", "28 feb 2024"
    const p3 = lower.match(/(\d{1,2})\s+(\w{3,})\s+(\d{4})/);
    if (p3) {
        const day = parseInt(p3[1]);
        const mes = MESES_MAP[p3[2]];
        const year = parseInt(p3[3]);
        if (mes !== undefined) return new Date(year, mes, day);
    }

    // "DD MON" sin año — "28 feb"
    const p4 = lower.match(/^(\d{1,2})\s+(\w{3,})$/);
    if (p4) {
        const day = parseInt(p4[1]);
        const mes = MESES_MAP[p4[2]];
        if (mes !== undefined) return new Date(currentYear, mes, day);
    }

    return null;
}

// --- Notas internas (localStorage) ---
function getReservationNotes(reservationId) {
    if (!reservationId) return '';
    return localStorage.getItem(`rest_notes_${state.clientId}_${reservationId}`) || '';
}

function saveReservationNotes(reservationId, text) {
    if (!reservationId) return;
    const key = `rest_notes_${state.clientId}_${reservationId}`;
    if (text.trim()) {
        localStorage.setItem(key, text);
    } else {
        localStorage.removeItem(key);
    }
    renderRestaurantReservations();
}

function hasReservationNotes(reservationId) {
    if (!reservationId) return false;
    return !!localStorage.getItem(`rest_notes_${state.clientId}_${reservationId}`);
}

// --- Badge de nuevas reservaciones ---
function getSeenReservationIds() {
    try { return JSON.parse(localStorage.getItem(`rest_seen_${state.clientId}`) || '[]'); }
    catch { return []; }
}

function saveSeenReservationIds(ids) {
    localStorage.setItem(`rest_seen_${state.clientId}`, JSON.stringify(ids));
}

function updateNewReservationsBadge() {
    const seen = getSeenReservationIds();
    const allIds = state.restaurantReservations.map(r => r.id).filter(Boolean);
    const newIds = allIds.filter(id => !seen.includes(id));
    state.restaurantNewIds = newIds;
    const badge = document.getElementById('rest-new-badge');
    if (badge) badge.textContent = newIds.length > 0 ? newIds.length : '';
}

function markRestaurantAsSeen() {
    const allIds = state.restaurantReservations.map(r => r.id).filter(Boolean);
    saveSeenReservationIds(allIds);
    state.restaurantNewIds = [];
    const badge = document.getElementById('rest-new-badge');
    if (badge) badge.textContent = '';
}

// --- Editar reservación ---
function openEditModal(index) {
    const r = state.restaurantReservations[index];
    if (!r) return;
    document.getElementById('edit-modal-index').value = index;
    document.getElementById('edit-modal-pax').value = r.pax || '';
    document.getElementById('edit-modal-tipo').value = r.tipoEvento || '';
    document.getElementById('edit-modal-telefono').value = r.telefono || '';
    document.getElementById('edit-modal-email').value = r.email || '';
    const warning = document.getElementById('edit-modal-warning');
    if (warning) warning.classList.toggle('hidden', !!state.restaurantConfig.confirmWebhookUrl);
    document.getElementById('restaurant-edit-modal').classList.remove('hidden');
}

function closeEditModal() {
    const modal = document.getElementById('restaurant-edit-modal');
    if (modal) modal.classList.add('hidden');
}

async function saveEditedReservation() {
    const index = parseInt(document.getElementById('edit-modal-index').value);
    const r = state.restaurantReservations[index];
    if (!r) return;

    const newData = {
        pax: parseInt(document.getElementById('edit-modal-pax').value) || r.pax,
        tipoEvento: document.getElementById('edit-modal-tipo').value || r.tipoEvento,
        telefono: document.getElementById('edit-modal-telefono').value || r.telefono,
        email: document.getElementById('edit-modal-email').value || r.email
    };

    const saveBtn = document.getElementById('edit-modal-save-btn');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon> Guardando...';

    const webhookUrl = state.restaurantConfig.confirmWebhookUrl;
    if (webhookUrl) {
        try {
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(webhookUrl)}`;
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: r.id, action: 'update', ...newData,
                    clientSlug: state.clientId, hotelName: state.config.clientName
                })
            });
            if (!response.ok) throw new Error(`Error del servidor: ${response.status}`);
            showToast('Reservación actualizada correctamente', 'success');
        } catch (error) {
            console.error('Error actualizando reservación:', error);
            showToast('Error al enviar al servidor: ' + error.message, 'error');
        }
    } else {
        showToast('Cambios guardados localmente (sin webhook)', 'warning');
    }

    Object.assign(state.restaurantReservations[index], newData);
    closeEditModal();
    renderRestaurantReservations();
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
}

async function fetchRestaurantReservations() {
    const webhookUrl = state.restaurantConfig.airtableWebhookUrl;
    if (!webhookUrl) {
        renderRestaurantEmpty('No hay webhook de AirTable configurado para restaurante.');
        return;
    }

    const container = document.getElementById('rest-cards-container');
    if (container) {
        container.innerHTML = `<div class="rest-empty-state" style="grid-column:1/-1;">
            <ion-icon name="sync-outline" class="spin" style="font-size:2rem;"></ion-icon>
            <div style="margin-top:12px; font-size:0.9rem;">Cargando reservas...</div>
        </div>`;
    }

    try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(webhookUrl)}`;
        console.log('Fetching restaurant reservations from:', webhookUrl);
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            console.error('Proxy error detail:', errBody);
            throw new Error(errBody.error || `HTTP Error: ${response.status}`);
        }
        const rawData = await response.json();

        state.restaurantReservations = (Array.isArray(rawData) ? rawData : [rawData]).map(r => ({
            id: r.id || r.ID || r.record_id || '',
            nombre: r['Nombre Cliente'] || r.nombre_cliente || r.nombre || '',
            email: r.email || r.Email || '',
            telefono: r['Telefono'] || r.telefono || r.Telefono || '',
            tipoEvento: r['TipoEvento'] || r.tipo_evento || r.tipoEvento || '',
            pax: r.PAX || r.pax || 0,
            fechaEvento: r['FechaEvento'] || r.fecha_evento || r.fechaEvento || '',
            estado: r.Estado || r.estado || 'Nuevo Lead',
            detalles: r.Detalles || r.detalles || '',
            conversacion: r.Conversacion || r.conversacion || ''
        }));

        // Parsear fechas
        state.restaurantReservations.forEach(r => {
            r.fecha_parsed = parseFechaEvento(r.fechaEvento);
        });

        renderRestaurantReservations();
        updateNewReservationsBadge();
    } catch (error) {
        console.error('Error fetching restaurant reservations:', error);
        renderRestaurantEmpty('Error al cargar las reservas. Intenta de nuevo.');
    }
}

function renderRestaurantReservations() {
    const all = state.restaurantReservations;
    let reservations = [...all];

    // Apply status filter
    if (state.restaurantFilters.status !== 'all') {
        reservations = reservations.filter(r => r.estado === state.restaurantFilters.status);
    }

    // Apply search filter
    const q = state.restaurantFilters.search.trim().toLowerCase();
    if (q) {
        reservations = reservations.filter(r =>
            (r.nombre || '').toLowerCase().includes(q) ||
            (r.telefono || '').toLowerCase().includes(q) ||
            (r.email || '').toLowerCase().includes(q) ||
            (r.tipoEvento || '').toLowerCase().includes(q)
        );
    }

    // Compute stats
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('rest-stat-hoy', all.filter(r => isReservationToday(r)).length);
    setEl('rest-stat-semana', all.filter(r => isReservationInWeek(r, startOfWeek, endOfWeek)).length);
    setEl('rest-stat-pendientes', all.filter(r => r.estado === 'Nuevo Lead').length);
    setEl('rest-count-all', all.length);
    setEl('rest-count-nuevo', all.filter(r => r.estado === 'Nuevo Lead').length);
    setEl('rest-count-confirmado', all.filter(r => r.estado === 'Confirmado').length);
    setEl('rest-count-rechazado', all.filter(r => r.estado === 'Rechazado').length);

    // Apply global date filter if set
    if (state.filters.start || state.filters.end) {
        reservations = reservations.filter(r => {
            if (!r.fecha_parsed) return true;
            if (state.filters.start && r.fecha_parsed < state.filters.start) return false;
            if (state.filters.end && r.fecha_parsed > state.filters.end) return false;
            return true;
        });
    }

    // Sort: today first, then by fecha_parsed
    reservations.sort((a, b) => {
        const aToday = isReservationToday(a) ? 0 : 1;
        const bToday = isReservationToday(b) ? 0 : 1;
        if (aToday !== bToday) return aToday - bToday;
        const aDate = a.fecha_parsed ? a.fecha_parsed.getTime() : 0;
        const bDate = b.fecha_parsed ? b.fecha_parsed.getTime() : 0;
        return bDate - aDate;
    });

    // Dispatch to current view mode
    const cardsEl = document.getElementById('rest-cards-container');
    const tableEl = document.getElementById('rest-table-container');

    if (state.restaurantViewMode === 'table') {
        if (cardsEl) cardsEl.classList.add('hidden');
        if (tableEl) tableEl.classList.remove('hidden');
        renderRestaurantTable(reservations);
    } else {
        if (tableEl) tableEl.classList.add('hidden');
        if (cardsEl) cardsEl.classList.remove('hidden');
        renderRestaurantCards(reservations);
    }
}

// ---- CARDS VIEW ----
function renderRestaurantCards(reservations) {
    const container = document.getElementById('rest-cards-container');
    if (!container) return;
    if (reservations.length === 0) {
        container.innerHTML = `<div class="rest-empty-state" style="grid-column:1/-1;">
            <ion-icon name="restaurant-outline"></ion-icon>
            <div style="font-size:1rem; margin-bottom:4px;">No hay reservas con este filtro</div>
        </div>`;
        return;
    }
    container.innerHTML = reservations.map(r => buildReservationCard(r)).join('');
}

function buildReservationCard(r) {
    const idx = state.restaurantReservations.indexOf(r);
    const statusClass = r.estado === 'Confirmado' ? 'status-confirmado' : r.estado === 'Rechazado' ? 'status-rechazado' : 'status-nuevo';
    const statusColor = r.estado === 'Confirmado' ? '#10B981' : r.estado === 'Rechazado' ? '#FF4444' : '#F59E0B';
    const statusBg = r.estado === 'Confirmado' ? 'rgba(16,185,129,0.12)' : r.estado === 'Rechazado' ? 'rgba(255,68,68,0.12)' : 'rgba(245,158,11,0.12)';
    const isToday = isReservationToday(r);
    const cleanPhone = (r.telefono || '').replace(/[\s\-\+\(\)]/g, '');
    const showActions = r.estado === 'Nuevo Lead';
    const notesDot = hasReservationNotes(r.id) ? '<span class="rest-has-notes-dot" title="Tiene notas"></span>' : '';

    return `<div class="rest-card ${statusClass}${isToday ? ' is-today' : ''}" onclick="toggleCardDetails(${idx})">
        <div class="rest-card-main">
            <div class="rest-card-top">
                <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                    <span class="rest-card-name">${r.nombre || 'Sin nombre'}${notesDot}</span>
                    ${isToday ? '<span class="rest-today-badge">HOY</span>' : ''}
                </div>
                <span class="rest-card-status-pill" style="color:${statusColor}; background:${statusBg};">${r.estado}</span>
            </div>
            <div class="rest-card-meta">
                <strong>${formatReservationDate(r)}</strong> &middot; <strong>${r.pax}</strong> personas &middot; ${r.tipoEvento || 'N/A'}
            </div>
        </div>
        <div class="rest-card-details" id="details-${idx}">
            <div class="rest-card-details-inner">
                ${r.telefono ? `<div class="rest-card-detail-row"><span class="rest-card-detail-label">Teléfono</span><span class="rest-card-detail-value">${r.telefono}</span></div>` : ''}
                ${r.email ? `<div class="rest-card-detail-row"><span class="rest-card-detail-label">Email</span><span class="rest-card-detail-value">${r.email}</span></div>` : ''}
                ${(r.detalles || r.conversacion) ? `<div class="rest-card-convo">${r.detalles || r.conversacion}</div>` : ''}
                <div style="margin-top:10px;" onclick="event.stopPropagation();">
                    <label style="font-size:0.72rem; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:0.5px;">Notas internas</label>
                    <textarea class="rest-notes-area" placeholder="Agregar notas del staff..."
                              onblur="saveReservationNotes('${r.id}', this.value)">${getReservationNotes(r.id)}</textarea>
                </div>
            </div>
            <div class="rest-card-actions">
                ${cleanPhone ? `
                    <a href="https://wa.me/${cleanPhone}" target="_blank" class="rest-card-action-btn whatsapp" onclick="event.stopPropagation();">
                        <ion-icon name="logo-whatsapp"></ion-icon> WhatsApp
                    </a>
                    <a href="tel:${r.telefono}" class="rest-card-action-btn call" onclick="event.stopPropagation();">
                        <ion-icon name="call-outline"></ion-icon> Llamar
                    </a>
                ` : ''}
                ${showActions ? `
                    <button onclick="event.stopPropagation(); confirmReservation(${idx})" class="rest-card-action-btn confirm">
                        <ion-icon name="checkmark-circle-outline"></ion-icon> Confirmar
                    </button>
                    <button onclick="event.stopPropagation(); rejectReservation(${idx})" class="rest-card-action-btn reject">
                        <ion-icon name="close-circle-outline"></ion-icon> Rechazar
                    </button>
                ` : ''}
                <button onclick="event.stopPropagation(); openEditModal(${idx})" class="rest-card-action-btn edit">
                    <ion-icon name="create-outline"></ion-icon> Editar
                </button>
            </div>
        </div>
    </div>`;
}

// ---- TABLE VIEW ----
function renderRestaurantTable(reservations) {
    const tbody = document.getElementById('rest-table-body');
    if (!tbody) return;

    // Apply sorting
    const sorted = [...reservations].sort((a, b) => {
        const field = state.restaurantSortField;
        let valA = a[field] || '';
        let valB = b[field] || '';
        if (field === 'pax') { valA = Number(valA) || 0; valB = Number(valB) || 0; }
        else { valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase(); }
        const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
        return state.restaurantSortDir === 'asc' ? cmp : -cmp;
    });

    // Update active header
    document.querySelectorAll('.rest-th-sortable').forEach(th => {
        th.classList.toggle('active', th.dataset.sort === state.restaurantSortField);
        const arrow = state.restaurantSortDir === 'asc' ? ' ↑' : ' ↓';
        const base = th.textContent.replace(/ [↑↓]$/, '');
        th.textContent = th.dataset.sort === state.restaurantSortField ? base + arrow : base;
    });

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:rgba(255,255,255,0.35);">No hay reservas con este filtro</td></tr>`;
        return;
    }

    tbody.innerHTML = sorted.map(r => {
        const idx = state.restaurantReservations.indexOf(r);
        const statusColor = r.estado === 'Confirmado' ? '#10B981' : r.estado === 'Rechazado' ? '#FF4444' : '#F59E0B';
        const statusBg = r.estado === 'Confirmado' ? 'rgba(16,185,129,0.12)' : r.estado === 'Rechazado' ? 'rgba(255,68,68,0.12)' : 'rgba(245,158,11,0.12)';
        const isToday = isReservationToday(r);
        const cleanPhone = (r.telefono || '').replace(/[\s\-\+\(\)]/g, '');
        const showActions = r.estado === 'Nuevo Lead';
        const notesDot = hasReservationNotes(r.id) ? '<span class="rest-has-notes-dot" title="Tiene notas"></span>' : '';

        return `<tr class="rest-row" onclick="toggleTableRowDetails(${idx})">
            <td><span style="color:${statusColor}; background:${statusBg}; padding:3px 9px; border-radius:8px; font-size:0.78rem; font-weight:600; white-space:nowrap;">${r.estado}</span></td>
            <td style="color:#fff; font-weight:500;">${r.nombre || 'Sin nombre'}${notesDot}</td>
            <td>${formatReservationDate(r)} ${isToday ? '<span class="rest-today-badge">HOY</span>' : ''}</td>
            <td style="text-align:center; font-weight:600; color:#fff;">${r.pax}</td>
            <td>${r.tipoEvento || 'N/A'}</td>
            <td onclick="event.stopPropagation();">
                <div style="display:flex; gap:6px;">
                    ${cleanPhone ? `
                        <a href="https://wa.me/${cleanPhone}" target="_blank" class="rest-table-action-icon whatsapp" title="WhatsApp"><ion-icon name="logo-whatsapp"></ion-icon></a>
                        <a href="tel:${r.telefono}" class="rest-table-action-icon call" title="Llamar"><ion-icon name="call-outline"></ion-icon></a>
                    ` : ''}
                </div>
            </td>
        </tr>
        <tr class="rest-table-detail-row hidden" id="table-detail-${idx}">
            <td colspan="6">
                <div style="display:flex; gap:24px; flex-wrap:wrap; margin-bottom:12px;">
                    ${r.telefono ? `<div><span style="color:rgba(255,255,255,0.4); font-size:0.8rem;">Teléfono</span><div style="color:#fff; font-weight:500;">${r.telefono}</div></div>` : ''}
                    ${r.email ? `<div><span style="color:rgba(255,255,255,0.4); font-size:0.8rem;">Email</span><div style="color:#fff; font-weight:500;">${r.email}</div></div>` : ''}
                </div>
                ${(r.detalles || r.conversacion) ? `<div class="rest-card-convo" style="margin-bottom:12px;">${r.detalles || r.conversacion}</div>` : ''}
                <div style="margin-bottom:12px;" onclick="event.stopPropagation();">
                    <label style="font-size:0.72rem; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:0.5px;">Notas internas</label>
                    <textarea class="rest-notes-area" placeholder="Agregar notas del staff..."
                              onblur="saveReservationNotes('${r.id}', this.value)">${getReservationNotes(r.id)}</textarea>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    ${showActions ? `
                        <button onclick="event.stopPropagation(); confirmReservation(${idx})" class="rest-card-action-btn confirm"><ion-icon name="checkmark-circle-outline"></ion-icon> Confirmar</button>
                        <button onclick="event.stopPropagation(); rejectReservation(${idx})" class="rest-card-action-btn reject"><ion-icon name="close-circle-outline"></ion-icon> Rechazar</button>
                    ` : ''}
                    <button onclick="event.stopPropagation(); openEditModal(${idx})" class="rest-card-action-btn edit"><ion-icon name="create-outline"></ion-icon> Editar</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function toggleRestaurantView(mode) {
    state.restaurantViewMode = mode;
    document.querySelectorAll('.rest-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });
    renderRestaurantReservations();
}

function sortRestaurantTable(field) {
    if (state.restaurantSortField === field) {
        state.restaurantSortDir = state.restaurantSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        state.restaurantSortField = field;
        state.restaurantSortDir = 'asc';
    }
    renderRestaurantReservations();
}

function toggleTableRowDetails(index) {
    const row = document.getElementById(`table-detail-${index}`);
    if (!row) return;
    const isVisible = !row.classList.contains('hidden');
    // Close all others
    document.querySelectorAll('.rest-table-detail-row').forEach(el => el.classList.add('hidden'));
    if (!isVisible) row.classList.remove('hidden');
}

// ---- HELPERS ----
function isReservationToday(r) {
    const d = typeof r === 'object' ? r.fecha_parsed : parseFechaEvento(r);
    if (!d) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isReservationInWeek(r, start, end) {
    const d = typeof r === 'object' ? r.fecha_parsed : parseFechaEvento(r);
    if (!d) return false;
    return d >= start && d <= end;
}

function toggleCardDetails(index) {
    const details = document.getElementById(`details-${index}`);
    if (!details) return;
    const isExpanded = details.classList.contains('expanded');
    document.querySelectorAll('.rest-card-details.expanded').forEach(el => el.classList.remove('expanded'));
    if (!isExpanded) details.classList.add('expanded');
}

function renderRestaurantEmpty(message) {
    const container = document.getElementById('rest-cards-container');
    if (container) {
        container.innerHTML = `<div class="rest-empty-state" style="grid-column:1/-1;">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <div style="font-size:1rem; margin-bottom:4px;">${message}</div>
        </div>`;
    }
    const tableBody = document.getElementById('rest-table-body');
    if (tableBody) tableBody.innerHTML = '';
}

function formatReservationDate(input) {
    if (!input) return 'N/A';
    // Accept object with fecha_parsed or string
    const d = typeof input === 'object' && input.fecha_parsed ? input.fecha_parsed : parseFechaEvento(typeof input === 'string' ? input : input.fechaEvento);
    if (d) return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    return (typeof input === 'string' ? input : input.fechaEvento) || 'N/A';
}

function filterRestaurantByStatus(status) {
    state.restaurantFilters.status = status;
    document.querySelectorAll('.rest-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });
    renderRestaurantReservations();
}

function searchRestaurantReservations(value) {
    state.restaurantFilters.search = value;
    renderRestaurantReservations();
}

function confirmReservation(index) {
    const reservation = state.restaurantReservations[index];
    if (!reservation) return;
    showConfirmModal(reservation, 'Confirmado');
}

function rejectReservation(index) {
    const reservation = state.restaurantReservations[index];
    if (!reservation) return;
    showConfirmModal(reservation, 'Rechazado');
}

function showConfirmModal(reservation, action) {
    const modal = document.getElementById('restaurant-confirm-modal');
    if (!modal) return;

    const isConfirm = action === 'Confirmado';

    document.getElementById('confirm-modal-title').textContent =
        `${isConfirm ? 'Confirmar' : 'Rechazar'} Reserva`;
    document.getElementById('confirm-modal-name').textContent = reservation.nombre;
    document.getElementById('confirm-modal-pax').textContent = `${reservation.pax} personas`;
    document.getElementById('confirm-modal-date').textContent = formatReservationDate(reservation.fechaEvento);
    document.getElementById('confirm-modal-type').textContent = reservation.tipoEvento;

    const confirmBtn = document.getElementById('confirm-modal-action-btn');
    confirmBtn.textContent = isConfirm ? 'Confirmar Reserva' : 'Rechazar Reserva';
    confirmBtn.style.background = isConfirm ? '#10B981' : '#FF4444';
    confirmBtn.onclick = () => executeReservationAction(reservation, action);

    // Limpiar textarea de mensaje
    const msgField = document.getElementById('confirm-modal-message');
    if (msgField) msgField.value = '';

    modal.classList.remove('hidden');
}

function closeConfirmModal() {
    const modal = document.getElementById('restaurant-confirm-modal');
    if (modal) modal.classList.add('hidden');
}

async function executeReservationAction(reservation, newStatus) {
    const confirmBtn = document.getElementById('confirm-modal-action-btn');
    const originalText = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon> Enviando...';

    try {
        const webhookUrl = state.restaurantConfig.confirmWebhookUrl;
        if (!webhookUrl) throw new Error('No hay webhook de confirmación configurado');

        const proxyUrl = `/api/proxy?url=${encodeURIComponent(webhookUrl)}`;
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: reservation.id,
                nombre: reservation.nombre,
                email: reservation.email,
                telefono: reservation.telefono,
                tipoEvento: reservation.tipoEvento,
                pax: reservation.pax,
                fechaEvento: reservation.fechaEvento,
                detalles: reservation.detalles,
                nuevoEstado: newStatus,
                mensajeCliente: document.getElementById('confirm-modal-message')?.value || '',
                clientSlug: state.clientId,
                hotelName: state.config.clientName
            })
        });

        if (!response.ok) throw new Error(`Error del servidor: ${response.status}`);

        // Update local state
        const idx = state.restaurantReservations.findIndex(r => r.id === reservation.id);
        if (idx !== -1) state.restaurantReservations[idx].estado = newStatus;

        closeConfirmModal();
        showToast(newStatus === 'Confirmado' ? 'Reserva confirmada exitosamente' : 'Reserva rechazada', newStatus === 'Confirmado' ? 'success' : 'warning');
        renderRestaurantReservations();

    } catch (error) {
        console.error('Error en acción de reserva:', error);
        showToast('Error al procesar la reserva: ' + error.message, 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
    }
}

function viewConversation(index) {
    const reservation = state.restaurantReservations[index];
    if (!reservation) return;

    const modal = document.getElementById('conversation-modal');
    if (!modal) return;

    document.getElementById('convo-modal-name').textContent = reservation.nombre;
    document.getElementById('convo-modal-content').textContent =
        reservation.detalles || reservation.conversacion || 'No hay detalles registrados para esta reserva.';

    modal.classList.remove('hidden');
}

function closeConversationModal() {
    const modal = document.getElementById('conversation-modal');
    if (modal) modal.classList.add('hidden');
}

// Expose restaurant functions globally
window.confirmReservation = confirmReservation;
window.rejectReservation = rejectReservation;
window.viewConversation = viewConversation;
window.filterRestaurantByStatus = filterRestaurantByStatus;
window.closeConfirmModal = closeConfirmModal;
window.closeConversationModal = closeConversationModal;
window.fetchRestaurantReservations = fetchRestaurantReservations;
window.toggleCardDetails = toggleCardDetails;
window.toggleRestaurantView = toggleRestaurantView;
window.sortRestaurantTable = sortRestaurantTable;
window.toggleTableRowDetails = toggleTableRowDetails;
window.searchRestaurantReservations = searchRestaurantReservations;
window.showToast = showToast;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEditedReservation = saveEditedReservation;
window.saveReservationNotes = saveReservationNotes;
window.markRestaurantAsSeen = markRestaurantAsSeen;
