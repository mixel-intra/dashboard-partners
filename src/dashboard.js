// --- Quantix Pro | Dashboard Logic ---
// Revised for maximum robustness and to fix empty chart/table issues
console.log('%c DASHBOARD v2027-02-27B ', 'background:#0f0;color:#000;font-size:16px;font-weight:bold');

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
    restaurantFilters: { view: 'nuevos', search: '', date: null },
    restaurantNewIds: [],
    restaurantSelectedIndex: null,
    restaurantDatePicker: null,
    restaurantConfig: { airtableWebhookUrl: '', confirmWebhookUrl: '', crmLeadUrlTemplate: '' },
    restaurantAvailability: { accepting: true, closedDates: [], dailyCapacity: 80 },
    // Hospedaje reservations (Airtable)
    hospedajeReservas: [],
    hospedajeFilters: { status: 'all', search: '' },
    hospedajeSortField: 'fecha_entrada',
    hospedajeSortDir: 'desc',
    hospedajeConfig: { apiKey: '', baseId: '', tableName: '' },
    // Eventos CRM (Airtable)
    eventosLeads: [],
    eventosFilters: { status: 'proceso', search: '' },
    eventosConfig: { apiKey: '', baseId: '', tableName: '' },
    eventosCalendarWeekOffset: 0,
    eventosCalendarSidebarOffset: 0,
    // Social listening (reseñas online)
    socialListeningReviews: [],
    socialListeningFilters: { source: '', sentiment: '', priority: '', sort: 'recent' },
    socialListeningLoaded: false
};

// Theme-aware chart colors (Linear/Vercel style)
function getChartTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return {
        gridColor: isLight ? '#E5E7EB' : 'rgba(255,255,255,0.05)',
        tickColor: isLight ? '#6B7280' : '#8E92A3',
        tooltipBg: isLight ? '#FFFFFF' : '#1E1F25',
        tooltipTitle: isLight ? '#111827' : '#fff',
        tooltipBody: isLight ? '#4B5563' : '#ccc',
        tooltipBorder: isLight ? '#E5E7EB' : 'rgba(255,255,255,0.1)',
        pointBorder: isLight ? '#FFFFFF' : '#fff',
        canvasBg: isLight ? '#FFFFFF' : '#0B0C10'
    };
}

const DEFAULT_CARD_LABELS = {
    "1": { title: "Oportunidades calificadas", description: "CALIDAD" },
    "2": { title: "Tasa de Conversión", description: "Oportunidades calificadas / Leads" },
    "3": { title: "Ventas", description: "INGRESOS TOTALES" },
    "4": { title: "ROI", description: "VENTAS / INVERSIÓN" },
    "5": { title: "Total de Registros", description: "Personas que mandaron mensaje" },
    "6": { title: "Inversión", description: "" },
    "7": { title: "Costo por oportunidad calificada", description: "" }
};

const HOTEL_CARD_LABELS = {
    "1": { title: "Cotizaciones de eventos canalizados a ventas", description: "calidad del tráfico" },
    "2": { title: "Tasa de Conversión", description: "cotizaciones de eventos / registros" },
    "3": { title: "Ventas", description: "ingresos" },
    "4": { title: "ROI", description: "Ventas / Inversión en pauta" },
    "5": { title: "Registros", description: "Personas que iniciaron una conversación" },
    "6": { title: "Inversión en Pauta", description: "Inversión en meta / google ads" },
    "7": { title: "Costo por cotización de evento canalizado a ventas", description: "inversión en pauta / total de cotizaciones" }
};

// --- Loading Screen ---
function setLoaderProgress(pct) {
    const bar = document.getElementById('loader-bar');
    if (bar) bar.style.width = pct + '%';
}

function hideLoader() {
    setLoaderProgress(100);
    // Switch from loader bg (#060410) to theme bg so overscroll matches dashboard
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const themeBg = isDark ? '#0E0B2A' : '#EEEEF8';
    document.documentElement.style.background = themeBg;
    const mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute('content', themeBg);
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

        // Activate hospedaje panel if reservas tab is active on load
        if (state.activeTab === 'reservas' && state.hospedajeConfig.apiKey) {
            const hospedajePanel = document.getElementById('hospedaje-panel');
            const leadsTableCard = document.getElementById('leads-table-card');
            if (hospedajePanel) hospedajePanel.classList.remove('hidden');
            if (leadsTableCard) leadsTableCard.classList.add('hidden');
            fetchHospedajeReservas();
        }

        // Pre-fetch eventos data in background (pipeline opens on demand)
        if (state.activeTab === 'eventos' && state.eventosConfig.apiKey) {
            fetchEventosLeads();
        }

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
            clientLogoDark: config.logo_url || null,
            clientLogoLight: config.logo_url_light || config.logo_url || null,
            themePrimary: '#7551FF',
            themeSecondary: '#01F1E3'
        };

        state.clientType = config.client_type || 'otro';
        state.rawConfig = config;

        // Initialize the per-client Supabase (operational data lives there).
        // If clients_config doesn't have URL/key for this client yet, falls
        // back to the admin client so legacy queries keep working.
        if (typeof window.initializeClientSupabase === 'function') {
            window.initializeClientSupabase(
                config.supabase_url,
                config.supabase_anon_key
            );
        }

        // Load restaurant config
        const restConfig = config.restaurant_config || {};
        state.restaurantConfig = {
            airtableWebhookUrl: restConfig.airtable_webhook_url || '',
            confirmWebhookUrl: restConfig.confirm_webhook_url || '',
            crmLeadUrlTemplate: restConfig.crm_lead_url_template || ''
        };

        // Load hospedaje config (Airtable)
        const hspConfig = config.hospedaje_config || {};
        state.hospedajeConfig = {
            apiKey: hspConfig.api_key || '',
            baseId: hspConfig.base_id || '',
            tableName: hspConfig.table_name || ''
        };

        // Load eventos config (Airtable)
        const evtConfig = config.eventos_config || {};
        state.eventosConfig = {
            apiKey: evtConfig.api_key || '',
            baseId: evtConfig.base_id || '',
            tableName: evtConfig.table_name || ''
        };

        initHotelTabs();

        applyCardLabels(config.card_labels || {});
        setupEventListeners();
    }
}

function applyCardLabels(customLabels) {
    // Use hotel template as fallback when client is hotel and has no custom labels
    const hasCustom = Object.keys(customLabels).length > 0;
    const fallback = (!hasCustom && state.clientType === 'hotel') ? HOTEL_CARD_LABELS : DEFAULT_CARD_LABELS;

    for (let i = 1; i <= 7; i++) {
        const custom = customLabels[i] || customLabels[String(i)] || {};
        const defaults = fallback[String(i)];
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
            restaurante: 'locked',
            social_listening: 'locked'
        };

        tabsContainer.classList.remove('hidden');

        // Find the first unlocked service to set as active
        const firstUnlocked = Object.keys(services).find(s => services[s] === 'unlocked');
        // Set active tab to the first unlocked service
        const activeTab = firstUnlocked || 'eventos';
        state.activeTab = activeTab;

        // Mobile: si el cliente usa principalmente Restaurante (es el único o
        // el primer servicio habilitado), mostramos el panel restaurante
        // directamente en mobile en lugar del dashboard genérico de KPIs.
        if (firstUnlocked === 'restaurante') {
            document.body.dataset.mobileMode = 'restaurant';
        } else {
            delete document.body.dataset.mobileMode;
        }

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

        // Actually switch to the first unlocked service (otherwise the user
        // sees the default dashboard until they click the tab manually)
        if (activeTab && activeTab !== 'eventos') {
            switchDashTab(activeTab);
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

    // Toggle between regular dashboard and special panels (restaurant, social listening)
    const dashboardGrid = document.querySelector('.dashboard-grid');
    const restaurantPanel = document.getElementById('restaurant-panel');
    const socialListeningPanel = document.getElementById('social-listening-panel');
    const contentHeaderRow = document.querySelector('.content-header-row');

    // Always hide the panels we are not switching to
    if (tab !== 'restaurante' && restaurantPanel) restaurantPanel.classList.add('hidden');
    if (tab !== 'social_listening' && socialListeningPanel) socialListeningPanel.classList.add('hidden');

    if (tab === 'restaurante') {
        if (dashboardGrid) dashboardGrid.classList.add('hidden');
        // Hide the leads "Dashboard / Todo el tiempo" header — not relevant in restaurant view
        if (contentHeaderRow) contentHeaderRow.classList.add('hidden');
        if (restaurantPanel) {
            restaurantPanel.classList.remove('hidden');
            fetchRestaurantReservations();
            loadRestaurantAvailability();
            markRestaurantAsSeen();
        }
    } else if (tab === 'social_listening') {
        if (dashboardGrid) dashboardGrid.classList.add('hidden');
        if (contentHeaderRow) contentHeaderRow.classList.add('hidden');
        if (socialListeningPanel) {
            socialListeningPanel.classList.remove('hidden');
            if (!state.socialListeningLoaded) fetchSocialListeningReviews();
            else renderSocialListeningPanel();
        }
    } else {
        if (dashboardGrid) dashboardGrid.classList.remove('hidden');
        if (contentHeaderRow) contentHeaderRow.classList.remove('hidden');
        applyGlobalFilters();

        // Show/hide CRM panels (replace leads table card when active)
        const hospedajePanel = document.getElementById('hospedaje-panel');
        const eventosPanel = document.getElementById('eventos-panel');
        const leadsTableCard = document.getElementById('leads-table-card');
        let crmActive = false;

        // Hospedaje
        if (hospedajePanel) {
            if (tab === 'reservas' && state.hospedajeConfig.apiKey) {
                hospedajePanel.classList.remove('hidden');
                crmActive = true;
                if (state.hospedajeReservas.length === 0) fetchHospedajeReservas();
                else renderHospedajePanel();
            } else {
                hospedajePanel.classList.add('hidden');
            }
        }

        // Eventos: always hide pipeline on tab switch, show normal dashboard
        if (eventosPanel) {
            eventosPanel.classList.add('hidden');
        }
        // Pre-fetch eventos data in background so pipeline opens fast
        if (tab === 'eventos' && state.eventosConfig.apiKey && state.eventosLeads.length === 0) {
            fetchEventosLeads();
        }

        // Show/hide "Ver Pipeline" CTA
        const pipelineCta = document.getElementById('eventos-pipeline-cta');
        if (pipelineCta) {
            if (tab === 'eventos' && state.eventosConfig.apiKey) {
                pipelineCta.classList.remove('hidden');
                const countEl = document.getElementById('evt-pipeline-cta-count');
                if (countEl && state.eventosLeads.length > 0) {
                    countEl.textContent = `${state.eventosLeads.length} leads`;
                }
            } else {
                pipelineCta.classList.add('hidden');
            }
        }

        // Hospedaje hides leads table
        if (leadsTableCard) {
            if (crmActive) leadsTableCard.classList.add('hidden');
            else leadsTableCard.classList.remove('hidden');
        }
        const splitRowGrid = document.getElementById('split-row-grid');
        if (splitRowGrid) splitRowGrid.classList.remove('crm-active');
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
            backgroundColor: getChartTheme().canvasBg,
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

function exportLeadsToExcel() {
    const leads = state.filteredLeads.filter(l => isQualified(l.estatus));
    if (!leads || leads.length === 0) {
        alert('No hay leads calificados para exportar.');
        return;
    }

    const esc = (v) => {
        if (v == null) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    const clientName = state.config.clientName || 'Dashboard';
    const dateLabel = document.getElementById('current-range-label')?.textContent || '';
    const totalLeads = leads.length;
    const today = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

    const rows = leads.map((l, i) => {
        const phone = l.telefono ? formatPhone(l.telefono) : '';
        const fecha = l.fecha_parsed ? l.fecha_parsed.toLocaleDateString('es-MX') : '';
        const isEven = i % 2 === 0;
        const rowBg = isEven ? '#ffffff' : '#f8f9fb';
        return `<tr>
            <td style="background:${rowBg}; padding:8px 12px; border:1px solid #e2e5ea; font-size:11pt;">${esc(l.nombre)}</td>
            <td style="background:${rowBg}; padding:8px 12px; border:1px solid #e2e5ea; font-size:11pt; mso-number-format:'\\@';">${esc(phone)}</td>
            <td style="background:${rowBg}; padding:8px 12px; border:1px solid #e2e5ea; font-size:11pt; text-align:center;">${fecha}</td>
            <td style="background:${rowBg}; padding:8px 12px; border:1px solid #e2e5ea; font-size:11pt;">
                <span style="background:#e8f5e9; color:#2e7d32; padding:3px 10px; border-radius:12px; font-size:9pt; font-weight:bold;">${esc(l.estatus)}</span>
            </td>
        </tr>`;
    }).join('');

    const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<style>
    td, th { font-family: Calibri, Arial, sans-serif; }
</style>
</head>
<body>
<table>
    <tr><td colspan="4" style="font-size:16pt; font-weight:bold; padding:12px; color:#1a1a2e;">${esc(clientName)}</td></tr>
    <tr><td colspan="4" style="font-size:10pt; color:#666; padding:4px 12px;">Leads calificados \u2022 ${esc(dateLabel)} \u2022 Generado: ${today}</td></tr>
    <tr><td colspan="4" style="font-size:10pt; color:#666; padding:4px 12px 12px;">Total: ${totalLeads} leads</td></tr>
    <tr>
        <th style="background:#7551FF; color:#fff; padding:10px 14px; border:1px solid #6341e0; font-size:10pt; font-weight:bold; text-align:left;">Nombre</th>
        <th style="background:#7551FF; color:#fff; padding:10px 14px; border:1px solid #6341e0; font-size:10pt; font-weight:bold; text-align:left;">Tel\u00e9fono</th>
        <th style="background:#7551FF; color:#fff; padding:10px 14px; border:1px solid #6341e0; font-size:10pt; font-weight:bold; text-align:center;">Fecha</th>
        <th style="background:#7551FF; color:#fff; padding:10px 14px; border:1px solid #6341e0; font-size:10pt; font-weight:bold; text-align:left;">Estatus</th>
    </tr>
    ${rows}
</table>
</body></html>`;

    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Leads_${state.config.clientName || 'export'}_${new Date().toISOString().split('T')[0]}.xls`;
    a.click();
    URL.revokeObjectURL(url);
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
        { estatus: 'CALIFICADO EVENTO', weight: 22 },
        { estatus: 'CALIFICADO RESERVA', weight: 18 },
        { estatus: 'CALIFICADO DAYPASS', weight: 14 },
        { estatus: 'CALIFICADO RESTAURANTE', weight: 10 },
        { estatus: 'NUEVO', weight: 15 },
        { estatus: 'CONTACTADO', weight: 12 },
        { estatus: 'EN SEGUIMIENTO', weight: 9 }
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
            if (rawSource.includes('restaurante')) tipoServicio = 'Restaurante';
            else if (rawSource.includes('daypass') || rawSource.includes('day pass')) tipoServicio = 'DayPass';
            else if (rawSource.includes('reserva')) tipoServicio = 'Reserva';
            else if (rawSource.includes('evento')) tipoServicio = 'Evento';

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
                    if (bucket < 8) lead.tipo_servicio = 'DayPass';
                    else if (bucket < 14) lead.tipo_servicio = 'Reserva';
                    else if (bucket < 18) lead.tipo_servicio = 'Evento';
                    else lead.tipo_servicio = 'Restaurante';
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
    renderMobileDashboard();
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
    const displayName = (_session && _session.name) ? _session.name : (state.config.clientName || 'Administrador');
    setTxt('welcome-name', displayName);
    // Sync topbar avatar
    const avatarName = document.getElementById('topbar-avatar-name');
    const avatarInitials = document.getElementById('topbar-avatar-initials');
    if (avatarName) avatarName.textContent = displayName;
    if (avatarInitials) avatarInitials.textContent = displayName.charAt(0).toUpperCase();

    const logoImg = document.getElementById('client-logo');
    if (logoImg) {
        const isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
        const logoUrl = isDark ? state.config.clientLogoDark : state.config.clientLogoLight;
        if (logoUrl) {
            logoImg.src = logoUrl;
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

function formatPhone(phone) {
    if (!phone) return '—';
    const raw = String(phone).trim();
    if (!raw.startsWith('+')) return raw;
    // Separar código de país (+XX) del número local
    const digits = raw.replace(/\D/g, '');
    const code = '+' + digits.slice(0, 2);
    let local = digits.slice(2);
    // México: quitar prefijo "1" de marcación móvil
    if (code === '+52' && local.length === 11 && local.startsWith('1')) {
        local = local.slice(1);
    }
    // Formato: XXX XXX XXXX
    if (local.length === 10) {
        return `[${code}] ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
    }
    return `[${code}] ${local}`;
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
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const qualified = isQualified(lead.estatus);

    let badgeStyle = '';
    if (isLight) {
        const textColor = qualified ? '#065f46' : '#991b1b';
        const bgColor = qualified ? '#d1fae5' : '#fee2e2';
        badgeStyle = `color: ${textColor}; background: ${bgColor}; border: 1px solid ${qualified ? '#a7f3d0' : '#fecaca'};`;
    } else {
        badgeStyle = `color: ${qualified ? state.config.themeSecondary : '#ef4444'}; background: rgba(255,255,255,0.05);`;
    }

    const phone = formatPhone(lead.telefono);

    return `
        <tr>
            <td style="font-weight: 600;">${lead.nombre || 'Sin nombre'}</td>
            <td style="color: var(--text-secondary); font-size: 0.82rem; font-variant-numeric: tabular-nums;">${phone}</td>
            <td style="color: var(--text-secondary);">${lead.fecha_parsed ? lead.fecha_parsed.toLocaleDateString('es-MX') : 'N/A'}</td>
            <td>
                <span class="status-badge" style="${badgeStyle} padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">
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
    // 1. Small Mini-Charts (Manual/Fake data for sparklines)
    const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
    const LIGHT_BLUE = '#2563EB';
    const sparkPrimary = isLightTheme ? LIGHT_BLUE : state.config.themePrimary;
    const sparkSecondary = isLightTheme ? '#60A5FA' : state.config.themeSecondary;

    createSmoothChart('chart-1', [12, 19, 15, 25, 22, 30, 28, 35, 40, 45, 50, 60], sparkPrimary);
    createSmoothChart('chart-2', [5, 8, 12, 10, 15, 20, 25, 22, 28, 35, 30, 40], sparkSecondary);
    createSmoothChart('chart-3', [10, 12, 14, 18, 16, 20, 22, 26, 30, 28, 35, 40], sparkPrimary);
    createSmoothChart('chart-4', [2, 3, 3.5, 3.2, 4, 4.5, 5.0, 5.2, 5.5, 6, 6.5, 7], sparkSecondary);

    // Bottom SPARKLINES
    createSmoothChart('chart-5', [100, 110, 105, 120, 130, 125, 140, 150, 160, 155, 170, 180], sparkPrimary);
    createSmoothChart('chart-6', [50, 55, 52, 60, 62, 58, 65, 70, 75, 72, 80, 85], sparkSecondary);
    createSmoothChart('chart-7', [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45], sparkPrimary);

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
                backgroundColor: hexToRgba(document.documentElement.getAttribute('data-theme') === 'light' ? '#2563EB' : state.config.themeSecondary, 0.6),
                borderColor: document.documentElement.getAttribute('data-theme') === 'light' ? '#2563EB' : state.config.themeSecondary,
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: getChartTheme().tooltipBg, titleColor: getChartTheme().tooltipTitle, bodyColor: getChartTheme().tooltipBody, borderColor: getChartTheme().tooltipBorder, borderWidth: 1 }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: getChartTheme().tickColor } },
                y: { beginAtZero: true, grid: { color: getChartTheme().gridColor }, ticks: { color: getChartTheme().tickColor, precision: 0 } }
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
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border-subtle);">
                <span style="color: var(--text-primary); font-size: 0.9rem;">${name}</span>
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

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const color = isLight ? '#2563EB' : state.config.themePrimary;
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, hexToRgba(color, isLight ? 0.15 : 0.3));
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
                pointBorderColor: getChartTheme().pointBorder,
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: getChartTheme().tooltipBg, padding: 12, titleColor: getChartTheme().tooltipTitle, bodyColor: getChartTheme().tooltipBody, borderColor: getChartTheme().tooltipBorder, borderWidth: 1 }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: getChartTheme().tickColor, font: { size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: getChartTheme().gridColor },
                    ticks: { color: getChartTheme().tickColor, precision: 0 }
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
        if (s.includes('calificado reserva')) return 'Calificado Reserva';
        if (s.includes('calificado evento')) return 'Calificado Evento';
    }

    // Specific matches to preserve names
    if (s.includes('rechazado cefemex')) {
        return state.clientType === 'hotel' ? 'Cotizado' : 'Rechazado CEFEMEX';
    }
    if (s.includes('continuidad cefemex')) return 'Continuidad CEFEMEX';
    if (s.includes('documentacion') || s.includes('documentación')) return 'Documentación / Integración E1';
    if (s.includes('financiera')) return 'Revisión Financiera / Integración E2';
    if (s.includes('comité') || s.includes('comite')) return 'Comité / Autorización';

    // Específicos ANTES del genérico 'calificado' para evitar falsos matches
    if (s.includes('no_calificado') || s === 'no calificado') return 'No Calificado';
    if (s.includes('calificado cita')) return 'Calificado Cita';
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
const MESES_MAP = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11
};

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
        renderRestaurantEmpty({
            icon: 'cog-outline',
            title: 'Restaurante en preparación',
            subtitle: 'Aún no hay un origen de reservas configurado para este entorno.'
        });
        if (state.restaurantSelectedIndex === null && document.getElementById('rest-context-content')) {
            populateContextForToday();
        }
        return;
    }

    const refreshBtn = document.getElementById('rest-refresh-btn');
    if (refreshBtn) {
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;
    }
    const board = document.getElementById('rest-board');
    if (board && !state.restaurantReservations.length) {
        board.innerHTML = `<div class="rest-empty-list">
            <ion-icon name="sync-outline" class="spin"></ion-icon>
            <div class="rest-empty-list-title">Cargando reservas…</div>
        </div>`;
    }

    try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(webhookUrl)}`;
        console.log('Fetching restaurant reservations from:', webhookUrl);
        const response = await fetch(proxyUrl);
        const rawData = await response.json().catch(() => null);

        if (!response.ok) {
            console.warn('Webhook respondió con error', response.status, rawData);
        }

        // Normaliza: el webhook puede responder array vacío, objeto vacío, null
        // o un objeto con error (n8n devuelve {error: ...} cuando no encuentra
        // nada — incluso con status 4xx/5xx). Cualquiera de estos = "sin
        // reservas todavía", no un error técnico que asuste al operador.
        let dataArray;
        if (Array.isArray(rawData)) {
            dataArray = rawData;
        } else if (rawData && typeof rawData === 'object' && !rawData.error) {
            const hasAnyRealKey = Object.keys(rawData).some(k => {
                const v = rawData[k];
                return v !== null && v !== '' && v !== undefined;
            });
            dataArray = hasAnyRealKey ? [rawData] : [];
        } else {
            dataArray = [];
        }

        state.restaurantReservations = dataArray.map(r => ({
            id: r.id || r.ID || r.record_id || '',
            kommoLeadId: r.kommo_lead_id || r.kommoLeadId || null,
            kommoChatId: r.kommo_chat_id || r.kommoChatId || '',
            nombre: r['Nombre Cliente'] || r.nombre_cliente || r.nombre || '',
            email: r.email || r.Email || '',
            telefono: r['Telefono'] || r.telefono || r.Telefono || '',
            tipoEvento: r['TipoEvento'] || r.tipo_evento || r.tipoEvento || '',
            pax: r.PAX || r.pax || 0,
            fechaEvento: r['FechaEvento'] || r.fecha_evento || r.fechaEvento || '',
            horaEvento: r['HoraEvento'] || r.hora_evento || r.horaEvento || '',
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
        refreshDatePickerDots();
        if (typeof showToast === 'function') showToast('Reservas actualizadas', 'success');
    } catch (error) {
        // Solo errores genuinos de red (fetch lanza) llegan aquí — no responses
        // 4xx/5xx, esos los normalizamos arriba como "sin reservas".
        console.error('Error fetching restaurant reservations:', error);
        renderRestaurantEmpty({
            icon: 'cloud-offline-outline',
            title: 'Sin conexión',
            subtitle: 'No pudimos contactar al servidor. Revisa tu internet y prueba "Actualizar".'
        });
        if (state.restaurantSelectedIndex === null && document.getElementById('rest-context-content')) {
            populateContextForToday();
        }
        if (typeof showToast === 'function') showToast('Sin conexión', 'error');
    } finally {
        if (refreshBtn) {
            refreshBtn.classList.remove('loading');
            refreshBtn.disabled = false;
        }
    }
}

// Returns true if reservation r matches the given view key (nuevos/confirmadas/todas/rechazadas)
function matchesRestaurantView(r, viewKey) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = r.fecha_parsed ? (() => { const x = new Date(r.fecha_parsed); x.setHours(0,0,0,0); return x; })() : null;
    const isUpcomingOrUndated = !d || d >= today;
    switch (viewKey) {
        case 'nuevos':
            // Solo los que aún son accionables (futuros o sin fecha). Los pasados sin responder son ruido histórico.
            return r.estado === 'Nuevo Lead' && isUpcomingOrUndated;
        case 'confirmadas':
            // Confirmadas futuras (la agenda operativa)
            return r.estado === 'Confirmado' && isUpcomingOrUndated;
        case 'rechazadas':
            return r.estado === 'Rechazado';
        case 'todas':
        default:
            return true;
    }
}

function renderRestaurantReservations() {
    const all = state.restaurantReservations;
    let reservations = [...all];

    // Apply view filter
    const view = state.restaurantFilters.view || 'nuevos';
    reservations = reservations.filter(r => matchesRestaurantView(r, view));

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

    // Apply date-jump filter (additive, picks exact day)
    if (state.restaurantFilters.date) {
        const target = new Date(state.restaurantFilters.date); target.setHours(0,0,0,0);
        reservations = reservations.filter(r => {
            if (!r.fecha_parsed) return false;
            const d = new Date(r.fecha_parsed); d.setHours(0,0,0,0);
            return d.getTime() === target.getTime();
        });
    }

    // Compute stats (always over the full set, not filtered)
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const todays = all.filter(r => isReservationToday(r));
    const paxToday = todays.reduce((sum, r) => sum + (Number(r.pax) || 0), 0);

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('rest-stat-hoy', todays.length);
    setEl('rest-stat-pax-hoy', paxToday);
    setEl('rest-stat-semana', all.filter(r => isReservationInWeek(r, startOfWeek, endOfWeek)).length);
    setEl('rest-stat-pendientes', all.filter(r => matchesRestaurantView(r, 'nuevos')).length);

    // Chip counts — counted over unfiltered data so the user sees what's in each bucket
    setEl('rest-count-nuevos', all.filter(r => matchesRestaurantView(r, 'nuevos')).length);
    setEl('rest-count-confirmadas', all.filter(r => matchesRestaurantView(r, 'confirmadas')).length);
    setEl('rest-count-rechazadas', all.filter(r => matchesRestaurantView(r, 'rechazadas')).length);
    setEl('rest-count-todas', all.length);

    // Apply global date filter if set (header-level range)
    if (state.filters.start || state.filters.end) {
        reservations = reservations.filter(r => {
            if (!r.fecha_parsed) return true;
            if (state.filters.start && r.fecha_parsed < state.filters.start) return false;
            if (state.filters.end && r.fecha_parsed > state.filters.end) return false;
            return true;
        });
    }

    // Smart sort: today first, future ASC, past at bottom DESC
    reservations.sort((a, b) => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const aDate = a.fecha_parsed ? new Date(a.fecha_parsed) : new Date(0);
        const bDate = b.fecha_parsed ? new Date(b.fecha_parsed) : new Date(0);
        const aDay = new Date(aDate); aDay.setHours(0, 0, 0, 0);
        const bDay = new Date(bDate); bDay.setHours(0, 0, 0, 0);
        const aPast = aDay < today;
        const bPast = bDay < today;
        if (!aPast && bPast) return -1;
        if (aPast && !bPast) return 1;
        if (aPast && bPast) return bDay - aDay;
        // same day → sort by hora ascending
        if (aDay.getTime() === bDay.getTime()) {
            const aH = a.horaEvento || ''; const bH = b.horaEvento || '';
            return aH.localeCompare(bH);
        }
        return aDay - bDay;
    });

    renderRestaurantTimeline(reservations);
    // Right rail: default to today's overview when no reservation is selected
    if (state.restaurantSelectedIndex === null && document.getElementById('rest-context-content')) {
        populateContextForToday();
    }
}

// ============================================
// BOARD VIEW (card grid grouped by day)
// ============================================
function renderRestaurantTimeline(reservations) {
    const board = document.getElementById('rest-board');
    if (!board) return;

    if (reservations.length === 0) {
        const hasData = state.restaurantReservations.length > 0;
        const view = state.restaurantFilters.view;
        let icon = 'restaurant-outline', title = 'Sin reservas todavía', sub = 'Cuando lleguen reservas calificadas las verás aquí.';
        if (hasData) {
            if (state.restaurantFilters.search || state.restaurantFilters.date) {
                icon = 'funnel-outline';
                title = 'Sin resultados';
                sub = 'Ajusta la búsqueda, la fecha o cambia de chip.';
            } else if (view === 'nuevos') {
                icon = 'checkmark-done-outline';
                title = 'Todo al día ✨';
                sub = 'No hay leads sin responder. Revisa "Confirmadas" o "Todas".';
            } else if (view === 'confirmadas') {
                icon = 'calendar-clear-outline';
                title = 'Sin reservas confirmadas';
                sub = 'Aún no has confirmado ninguna reserva.';
            } else if (view === 'rechazadas') {
                icon = 'archive-outline';
                title = 'Sin rechazadas';
                sub = 'No hay reservas rechazadas.';
            } else {
                icon = 'funnel-outline';
                title = 'Sin resultados';
                sub = 'Ajusta los filtros.';
            }
        }
        board.innerHTML = `<div class="rest-board-empty">
            <ion-icon name="${icon}"></ion-icon>
            <div class="rest-board-empty-title">${title}</div>
            <div class="rest-board-empty-sub">${sub}</div>
        </div>`;
        return;
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    const groupKey = (r) => {
        const d = r.fecha_parsed;
        if (!d) return 'zzz-sin-fecha';
        const day = new Date(d); day.setHours(0, 0, 0, 0);
        if (day < today) return 'past';
        return day.toISOString().slice(0, 10);
    };
    const groupLabel = (key, sample) => {
        if (key === 'past') return 'Histórico';
        if (key === 'zzz-sin-fecha') return 'Sin fecha';
        const d = sample.fecha_parsed;
        const day = new Date(d); day.setHours(0, 0, 0, 0);
        if (day.getTime() === today.getTime()) return 'Hoy';
        if (day.getTime() === tomorrow.getTime()) return 'Mañana';
        if (day < weekEnd) {
            return `${dayNames[d.getDay()]} ${d.getDate()} ${monthShort[d.getMonth()]}`;
        }
        return `${dayNames[d.getDay()]} ${d.getDate()} ${monthShort[d.getMonth()]} ${d.getFullYear()}`;
    };

    const groups = [];
    const groupMap = {};
    reservations.forEach(r => {
        const k = groupKey(r);
        if (!groupMap[k]) {
            groupMap[k] = { key: k, items: [], sample: r };
            groups.push(groupMap[k]);
        }
        groupMap[k].items.push(r);
    });

    const seenIds = new Set(state.restaurantNewIds || []);

    board.innerHTML = groups.map(group => {
        const isPast = group.key === 'past';
        const day = group.sample.fecha_parsed;
        const isToday = day && (() => {
            const d = new Date(day); d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
        })();
        const totalPax = group.items.reduce((s, r) => s + (parseInt(r.pax) || 0), 0);
        const dayCls = isToday ? 'is-today' : '';
        const cards = group.items.map(r => buildReservationCard(r, seenIds.has(r.id), isPast)).join('');
        return `<div class="rest-board-day ${dayCls}">
            <div class="rest-board-day-header">
                <span class="rest-board-day-label">${groupLabel(group.key, group.sample)}</span>
                <span class="rest-board-day-meta"><strong>${group.items.length}</strong> reserva${group.items.length === 1 ? '' : 's'} · <strong>${totalPax}</strong> pax</span>
            </div>
            <div class="rest-board-grid">${cards}</div>
        </div>`;
    }).join('');
}

function buildReservationCard(r, isNew, isPast) {
    const idx = state.restaurantReservations.indexOf(r);
    const cleanPhone = (r.telefono || '').replace(/[\s\-\+\(\)]/g, '');
    const isPending = r.estado === 'Nuevo Lead';
    const isConfirmed = r.estado === 'Confirmado';
    const isRejected = r.estado === 'Rechazado';
    const statusKey = isPending ? 's-pending' : isConfirmed ? 's-confirmed' : 's-rejected';
    const statusLabel = isPending ? 'Nuevo lead' : isConfirmed ? 'Confirmada' : 'Rechazada';

    const t = r.horaEvento ? formatTime(r.horaEvento) : null;
    const tipo = escapeHtml(r.tipoEvento || 'Reserva');
    const detail = (r.detalles || '').trim();
    const detailBlock = detail
        ? `<div class="rest-card-detail">${escapeHtml(detail)}</div>`
        : `<div class="rest-card-detail is-empty">Sin detalles del lead</div>`;

    const notesFlag = hasReservationNotes(r.id) ? '<span class="rest-card-notes-flag" title="Tiene notas"></span>' : '';

    const stop = "event.stopPropagation();";
    let actions = '';
    if (isPending) {
        actions += `<button class="rest-card-btn success" onclick="${stop} confirmReservation(${idx})" title="Confirmar reserva"><ion-icon name="checkmark-outline"></ion-icon> Confirmar</button>`;
        actions += `<button class="rest-card-btn danger" onclick="${stop} rejectReservation(${idx})" title="Rechazar reserva"><ion-icon name="close-outline"></ion-icon> Rechazar</button>`;
    } else {
        actions += `<button class="rest-card-btn" onclick="${stop} openEditModal(${idx})" title="Editar reserva"><ion-icon name="create-outline"></ion-icon> Editar</button>`;
    }
    if (cleanPhone) {
        actions += `<a class="rest-card-btn icon whatsapp" href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener" onclick="${stop}" title="WhatsApp"><ion-icon name="logo-whatsapp"></ion-icon></a>`;
    }

    const cardCls = ['rest-card'];
    if (isPending) cardCls.push('is-pending');
    else if (isConfirmed) cardCls.push('is-confirmed');
    else if (isRejected) cardCls.push('is-rejected');
    if (isPast) cardCls.push('is-past');

    return `<div class="${cardCls.join(' ')}" data-index="${idx}" onclick="selectReservation(${idx})">
        ${notesFlag}
        <div class="rest-card-namebox">
            <div class="rest-card-namerow">
                <span class="rest-card-name">${escapeHtml(r.nombre || 'Sin nombre')}</span>
                <span class="rest-card-pill ${statusKey}"><span class="pdot"></span>${statusLabel}</span>
            </div>
            <div class="rest-card-meta">
                <span><strong>${r.pax || 0}</strong> pax</span>
                <span class="dot">·</span>
                <span>${tipo}</span>
                ${t ? `<span class="dot">·</span><span>${t}</span>` : ''}
            </div>
        </div>
        ${detailBlock}
        <div class="rest-card-actions">${actions}</div>
    </div>`;
}

function splitTime(timeStr) {
    // "8:30 PM" → { hm: "8:30", period: "PM" }
    const m = (timeStr || '').match(/^(.+?)\s*(AM|PM)?$/i);
    if (!m) return { hm: timeStr || '', period: '' };
    return { hm: m[1].trim(), period: (m[2] || '').toUpperCase() };
}

function renderSourceIcon(source) {
    const map = {
        whatsapp: '<span class="rest-item-source whatsapp" title="WhatsApp"><ion-icon name="logo-whatsapp"></ion-icon></span>',
        instagram: '<span class="rest-item-source instagram" title="Instagram"><ion-icon name="logo-instagram"></ion-icon></span>',
        web: '<span class="rest-item-source web" title="Web"><ion-icon name="globe-outline"></ion-icon></span>',
        messenger: '<span class="rest-item-source web" title="Messenger"><ion-icon name="logo-facebook"></ion-icon></span>'
    };
    return map[source] || '';
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Backward-compat noops (in case any old onclick still calls these)
function toggleRestaurantView() { /* removed in v2 */ }
function sortRestaurantTable() { /* removed in v2 */ }
function toggleTableRowDetails() { /* removed in v2 */ }

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

function isReservationPast(r) {
    const d = typeof r === 'object' ? r.fecha_parsed : parseFechaEvento(r);
    if (!d) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const resDay = new Date(d); resDay.setHours(0, 0, 0, 0);
    return resDay < today;
}

function formatTime(hora) {
    if (!hora) return '';
    const parts = hora.split(':');
    let h = parseInt(parts[0]);
    const m = parseInt(parts[1] || '0');
    if (isNaN(h)) return hora;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

// =============================================
// DRAWER (detail panel)
// =============================================
function selectReservation(index) {
    const r = state.restaurantReservations[index];
    if (!r) return;

    state.restaurantSelectedIndex = index;

    // Visual selection in board
    document.querySelectorAll('.rest-card.is-active').forEach(el => el.classList.remove('is-active'));
    const card = document.querySelector(`.rest-card[data-index="${index}"]`);
    if (card) card.classList.add('is-active');

    // Show drawer overlay
    const empty = document.getElementById('rest-drawer-empty');
    const content = document.getElementById('rest-drawer-content');
    const drawer = document.getElementById('rest-drawer');
    const backdrop = document.getElementById('rest-drawer-backdrop');
    if (empty) empty.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    if (drawer) drawer.classList.add('is-open');
    if (backdrop) backdrop.classList.add('is-visible');

    populateDrawer(r, index);
}

// Backward-compat alias
function openReservationDetail(index) { selectReservation(index); }
function toggleCardDetails(index) { selectReservation(index); }

function populateDrawer(r, index) {
    const isToday = isReservationToday(r);
    const cleanPhone = (r.telefono || '').replace(/[\s\-\+\(\)]/g, '');
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const show = (id, visible) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !visible); };

    // Headline
    set('rdm-name', r.nombre || 'Sin nombre');
    setHtml('rdm-date', `<strong>${formatReservationDate(r)}</strong>${isToday ? ' <span class="rest-today-badge">HOY</span>' : ''}`);
    set('rdm-time-meta', r.horaEvento ? formatTime(r.horaEvento) : 'Sin hora');
    set('rdm-pax-meta', r.pax || 0);

    // Source (Kommo channel)
    const sourceEl = document.getElementById('rdm-source');
    const sourceDivider = document.getElementById('rdm-source-divider');
    if (r.kommoSource) {
        sourceEl.innerHTML = `${renderSourceIcon(r.kommoSource)} ${r.kommoSource[0].toUpperCase() + r.kommoSource.slice(1)}`;
        sourceEl.style.display = '';
        if (sourceDivider) sourceDivider.style.display = '';
    } else {
        sourceEl.style.display = 'none';
        if (sourceDivider) sourceDivider.style.display = 'none';
    }

    // Status pill
    const statusKey = r.estado === 'Confirmado' ? 's-confirmed'
                    : r.estado === 'Rechazado' ? 's-rejected'
                    : 's-pending';
    const pill = document.getElementById('rdm-status-pill');
    if (pill) {
        pill.className = 'rest-drawer-status-pill ' + statusKey;
        const txt = document.getElementById('rdm-status-text');
        if (txt) txt.textContent = r.estado === 'Nuevo Lead' ? 'Nuevo Lead' : r.estado;
    }

    // Info cells
    set('rdm-tipo', r.tipoEvento || 'N/A');
    set('rdm-phone', r.telefono || '—');
    set('rdm-email', r.email || '—');
    show('rdm-phone-block', !!r.telefono);
    show('rdm-email-block', !!r.email);

    // Original conversation block (Airtable detalles fallback)
    const origText = r.detalles || r.conversacion || '';
    show('rdm-orig-block', !!origText);
    set('rdm-orig-convo', origText);

    // Notes
    const notesEl = document.getElementById('rdm-notes');
    if (notesEl) {
        notesEl.value = getReservationNotes(r.id);
        notesEl.onblur = () => saveReservationNotes(r.id, notesEl.value);
    }

    // Action buttons (status + contact)
    const showStatusActions = r.estado === 'Nuevo Lead';
    const actions = document.getElementById('rdm-actions');
    if (actions) {
        actions.innerHTML = `
            ${showStatusActions ? `
            <button onclick="confirmReservation(${index})" class="rest-action success">
                <ion-icon name="checkmark-circle-outline"></ion-icon> Confirmar
            </button>
            <button onclick="rejectReservation(${index})" class="rest-action danger">
                <ion-icon name="close-circle-outline"></ion-icon> Rechazar
            </button>
            ` : ''}
            <button onclick="openEditModal(${index})" class="rest-action primary">
                <ion-icon name="create-outline"></ion-icon> Editar
            </button>
            ${cleanPhone ? `
            <a href="https://wa.me/${cleanPhone}" target="_blank" class="rest-action whatsapp icon-only" title="WhatsApp directo">
                <ion-icon name="logo-whatsapp"></ion-icon>
            </a>
            <a href="tel:${r.telefono}" class="rest-action call icon-only" title="Llamar">
                <ion-icon name="call-outline"></ion-icon>
            </a>
            ` : ''}
        `;
    }

    // "Abrir en CRM" button: build URL from template + lead id
    populateOpenCrmButton(r);

    // Right rail: same-day overview, capacity, month heatmap
    populateContextPanel(r, index);

    // Mark as seen
    const seen = getSeenReservationIds();
    if (r.id && !seen.includes(r.id)) {
        seen.push(r.id);
        saveSeenReservationIds(seen);
        updateNewReservationsBadge();
        const item = document.querySelector(`.rest-item[data-index="${index}"]`);
        if (item) item.classList.remove('is-new');
    }
}

function closeDrawer() {
    state.restaurantSelectedIndex = null;
    const drawer = document.getElementById('rest-drawer');
    const content = document.getElementById('rest-drawer-content');
    const backdrop = document.getElementById('rest-drawer-backdrop');
    if (drawer) drawer.classList.remove('is-open');
    if (content) content.classList.add('hidden');
    if (backdrop) backdrop.classList.remove('is-visible');
    document.querySelectorAll('.rest-card.is-active').forEach(el => el.classList.remove('is-active'));
    // Right rail returns to "today" overview
    populateContextForToday();
}

// Esc key closes the drawer overlay
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const drawer = document.getElementById('rest-drawer');
        if (drawer && drawer.classList.contains('is-open')) closeDrawer();
    }
});

// Backward-compat alias for any old onclick that closed the modal
function closeDetailModal() { closeDrawer(); }

// =============================================
// OPEN IN CRM
// =============================================
function populateOpenCrmButton(r) {
    const btn = document.getElementById('rdm-open-crm');
    if (!btn) return;

    const tpl = state.restaurantConfig.crmLeadUrlTemplate;
    const leadId = r.kommoLeadId;

    if (!tpl || !leadId) {
        btn.classList.add('is-disabled');
        btn.removeAttribute('href');
        btn.title = !tpl ? 'No hay URL de CRM configurada para este cliente' : 'Este lead no tiene ID de CRM asociado';
        return;
    }

    btn.classList.remove('is-disabled');
    btn.href = tpl.replace('{lead_id}', encodeURIComponent(leadId));
    btn.title = 'Abrir este lead en el CRM en una pestaña nueva';
}

// =============================================
// CONTEXT PANEL (right rail): aforo, mismo día, heatmap mensual
// =============================================
function populateContextForToday() {
    // Si hay un filtro de fecha activo (Saltar a fecha o tap en heatmap),
    // el right rail debe reflejar esa fecha — no hoy. Cuando no hay filtro,
    // usa hoy.
    const target = state.restaurantFilters && state.restaurantFilters.date
        ? new Date(state.restaurantFilters.date)
        : new Date();
    const fakeAnchor = { fecha_parsed: target, fechaEvento: target.toISOString().slice(0,10) };
    const empty = document.getElementById('rest-context-empty');
    const content = document.getElementById('rest-context-content');
    if (empty) empty.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    populateContextPanel(fakeAnchor, -1);
}

function dateKey(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function populateContextPanel(r, index) {
    const empty = document.getElementById('rest-context-empty');
    const content = document.getElementById('rest-context-content');
    if (!content) return;
    if (empty) empty.classList.add('hidden');
    content.classList.remove('hidden');

    const targetDate = r.fecha_parsed || parseFechaEvento(r.fechaEvento);
    if (!targetDate) {
        content.classList.add('hidden');
        if (empty) empty.classList.remove('hidden');
        return;
    }

    const targetKey = dateKey(targetDate);

    // Same-day reservations (excluding rejected for capacity, including all for the list)
    const all = state.restaurantReservations || [];
    const sameDay = all
        .map((res, i) => ({ res, i }))
        .filter(({ res }) => {
            const d = res.fecha_parsed || parseFechaEvento(res.fechaEvento);
            return d && dateKey(d) === targetKey;
        });

    // Capacity numbers — count all non-rejected (confirmed + pending)
    const active = sameDay.filter(({ res }) => res.estado !== 'Rechazado');
    const confirmedCount = sameDay.filter(({ res }) => res.estado === 'Confirmado').length;
    const pendingCount = sameDay.filter(({ res }) => res.estado === 'Nuevo Lead').length;
    const rejectedCount = sameDay.filter(({ res }) => res.estado === 'Rechazado').length;
    const otherCount = sameDay.length - confirmedCount - pendingCount - rejectedCount;
    const paxUsed = active.reduce((sum, { res }) => sum + (parseInt(res.pax) || 0), 0);
    const dailyCap = state.restaurantAvailability && state.restaurantAvailability.dailyCapacity
        ? parseInt(state.restaurantAvailability.dailyCapacity)
        : null;

    document.getElementById('ctx-day-label').textContent = targetDate.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
    document.getElementById('ctx-cap-used').textContent = paxUsed;
    document.getElementById('ctx-cap-total').textContent = dailyCap || '∞';
    const metaEl = document.getElementById('ctx-cap-meta');
    if (metaEl) {
        const parts = [];
        parts.push(`<span><strong>${confirmedCount}</strong> confirmadas</span>`);
        parts.push(`<span><strong>${pendingCount}</strong> pendientes</span>`);
        if (rejectedCount > 0) parts.push(`<span class="rest-ctx-meta-rejected"><strong>${rejectedCount}</strong> rechazadas</span>`);
        if (otherCount > 0) parts.push(`<span><strong>${otherCount}</strong> otras</span>`);
        metaEl.innerHTML = parts.join('<span class="rest-ctx-dot">·</span>');
    }

    const fill = document.getElementById('ctx-cap-bar-fill');
    const pctEl = document.getElementById('ctx-cap-pct');
    if (dailyCap && dailyCap > 0) {
        const pct = Math.min(100, Math.round((paxUsed / dailyCap) * 100));
        fill.style.width = pct + '%';
        fill.classList.remove('warn', 'danger');
        if (pct >= 90) fill.classList.add('danger');
        else if (pct >= 70) fill.classList.add('warn');
        pctEl.textContent = pct + '%';
    } else {
        fill.style.width = paxUsed > 0 ? '40%' : '0%';
        fill.classList.remove('warn', 'danger');
        pctEl.textContent = '';
    }

    // Same-day list (sorted by time, then created)
    const list = document.getElementById('ctx-day-list');
    document.getElementById('ctx-day-count').textContent = sameDay.length;
    if (sameDay.length === 0) {
        list.innerHTML = `<div class="rest-ctx-empty-list">Sin otras reservas este día</div>`;
    } else {
        const timeKey = (res) => {
            if (!res.horaEvento) return 99999;
            const [h, m] = res.horaEvento.split(':').map(n => parseInt(n) || 0);
            return h * 60 + m;
        };
        const sorted = [...sameDay].sort((a, b) => timeKey(a.res) - timeKey(b.res));
        list.innerHTML = sorted.map(({ res, i }) => {
            const isCurrent = i === index;
            const statusKey = res.estado === 'Confirmado' ? 's-confirmed'
                            : res.estado === 'Rechazado' ? 's-rejected'
                            : 's-pending';
            const time = res.horaEvento ? formatTime(res.horaEvento) : '—';
            const pax = parseInt(res.pax) || 0;
            return `
                <div class="rest-ctx-day-row ${isCurrent ? 'is-current' : ''}" onclick="selectReservation(${i})" title="${escapeHtml(res.tipoEvento || '')}">
                    <span class="rest-ctx-day-time">${time}</span>
                    <span class="rest-ctx-day-status ${statusKey}"></span>
                    <span class="rest-ctx-day-name">${escapeHtml(res.nombre || 'Sin nombre')}</span>
                    <span class="rest-ctx-day-pax"><strong>${pax}</strong> pax</span>
                </div>
            `;
        }).join('');
    }

    // Heatmap month — initialize at the target month
    state.ctxHeatmapAnchor = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    state.ctxHeatmapCurrentKey = targetKey;
    renderContextHeatmap();
}

function renderContextHeatmap() {
    const cont = document.getElementById('ctx-heatmap');
    const label = document.getElementById('ctx-heatmap-label');
    if (!cont || !label) return;

    const anchor = state.ctxHeatmapAnchor || new Date();
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    label.textContent = anchor.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

    // Aggregate pax per date for the visible month
    const buckets = {};
    (state.restaurantReservations || []).forEach(res => {
        if (res.estado === 'Rechazado') return;
        const d = res.fecha_parsed || parseFechaEvento(res.fechaEvento);
        if (!d) return;
        if (d.getFullYear() !== year || d.getMonth() !== month) return;
        const k = dateKey(d);
        buckets[k] = (buckets[k] || 0) + (parseInt(res.pax) || 0);
    });

    // Threshold: scale by daily capacity if set, else by max bucket
    const dailyCap = state.restaurantAvailability && state.restaurantAvailability.dailyCapacity
        ? parseInt(state.restaurantAvailability.dailyCapacity) : null;
    const maxVal = Math.max(1, ...Object.values(buckets));
    const ref = dailyCap || maxVal;
    const lvl = (v) => {
        if (!v) return 0;
        const r = v / ref;
        if (r >= 0.85) return 4;
        if (r >= 0.6) return 3;
        if (r >= 0.35) return 2;
        return 1;
    };

    const closed = (state.restaurantAvailability && state.restaurantAvailability.closedDates) || [];
    const todayKey = dateKey(new Date());
    const currentKey = state.ctxHeatmapCurrentKey;

    // Build grid: dow header (L-D) + cells with leading blanks
    const dows = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const firstOfMonth = new Date(year, month, 1);
    // Convert: getDay() Sunday=0 → we want Monday=0
    const startBlank = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    dows.forEach(d => cells.push(`<div class="rest-ctx-hm-dow">${d}</div>`));
    for (let i = 0; i < startBlank; i++) cells.push(`<div class="rest-ctx-hm-cell empty"></div>`);
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const k = dateKey(d);
        const v = buckets[k] || 0;
        const cls = [`rest-ctx-hm-cell`, `lvl${lvl(v)}`];
        if (k === todayKey) cls.push('is-today');
        if (k === currentKey) cls.push('is-current');
        if (closed.includes(k)) cls.push('is-closed');
        const titleParts = [d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })];
        if (v) titleParts.push(`${v} pax`);
        if (closed.includes(k)) titleParts.push('Cerrado');
        cells.push(`<div class="${cls.join(' ')}" data-date="${k}" title="${titleParts.join(' · ')}" onclick="ctxHeatmapJumpToDate('${k}')">${day}</div>`);
    }
    cont.innerHTML = cells.join('');
}

function ctxHeatmapShift(delta) {
    const anchor = state.ctxHeatmapAnchor || new Date();
    state.ctxHeatmapAnchor = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
    renderContextHeatmap();
}

function ctxHeatmapJumpToDate(key) {
    // Aplica el filtro de fecha al board (mismo comportamiento que "Saltar a
    // fecha"). NO abre el detalle de la primera reserva: deja que el operador
    // vea la lista filtrada y elija manualmente cuál ver.
    const target = new Date(key + 'T00:00:00');
    if (isNaN(target.getTime())) return;
    if (typeof applyDateJump === 'function') {
        applyDateJump(target);
    }
    state.ctxHeatmapCurrentKey = key;
    if (typeof renderContextHeatmap === 'function') renderContextHeatmap();
    if (typeof scrollSidebarToDate === 'function') {
        scrollSidebarToDate(key);
    }
}

function renderRestaurantEmpty(opts) {
    const board = document.getElementById('rest-board');
    if (!board) return;
    const { icon = 'restaurant-outline', title = 'Sin reservas todavía', subtitle = '' } =
        typeof opts === 'string' ? { title: opts } : (opts || {});
    board.innerHTML = `<div class="rest-board-empty">
        <ion-icon name="${icon}"></ion-icon>
        <div class="rest-board-empty-title">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="rest-board-empty-sub">${escapeHtml(subtitle)}</div>` : ''}
    </div>`;
}

function formatReservationDate(input) {
    if (!input) return 'N/A';
    // Accept object with fecha_parsed or string
    const d = typeof input === 'object' && input.fecha_parsed ? input.fecha_parsed : parseFechaEvento(typeof input === 'string' ? input : input.fechaEvento);
    if (d) return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    return (typeof input === 'string' ? input : input.fechaEvento) || 'N/A';
}

function filterRestaurantByStatus(viewKey) {
    state.restaurantFilters.view = viewKey;
    document.querySelectorAll('#rest-chips .rest-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === viewKey);
    });
    renderRestaurantReservations();
}

// =============================================
// DATE JUMP (flatpickr)
// =============================================
function openDateJump(ev) {
    if (ev) ev.stopPropagation();
    const input = document.getElementById('rest-date-picker');
    if (!input) return;

    // Lazy-init flatpickr on first call
    if (!state.restaurantDatePicker && typeof flatpickr === 'function') {
        state.restaurantDatePicker = flatpickr(input, {
            locale: (typeof flatpickr.l10ns !== 'undefined' && flatpickr.l10ns.es) ? 'es' : 'default',
            dateFormat: 'Y-m-d',
            positionElement: document.getElementById('rest-date-btn'),
            onChange: (selectedDates) => {
                if (selectedDates && selectedDates[0]) {
                    applyDateJump(selectedDates[0]);
                }
            },
            onDayCreate: (dObj, dStr, fp, dayElem) => {
                const cell = dayElem.dateObj;
                if (!cell) return;
                const matches = state.restaurantReservations.filter(r => {
                    if (!r.fecha_parsed) return false;
                    const d = r.fecha_parsed;
                    return d.getFullYear() === cell.getFullYear() &&
                           d.getMonth() === cell.getMonth() &&
                           d.getDate() === cell.getDate();
                });
                if (matches.length === 0) return;
                // Pick dot color by priority: pending > confirmed > rejected
                const hasPending = matches.some(r => r.estado === 'Nuevo Lead');
                const hasConfirmed = matches.some(r => r.estado === 'Confirmado');
                const dotClass = hasPending ? 'is-pending' : hasConfirmed ? 'is-confirmed' : 'is-rejected';
                const dot = document.createElement('span');
                dot.className = 'flatpickr-day-dot ' + dotClass;
                if (matches.length > 1) dot.setAttribute('data-count', matches.length);
                dayElem.appendChild(dot);
            }
        });
    }
    if (state.restaurantDatePicker) state.restaurantDatePicker.open();
}

function refreshDatePickerDots() {
    // Force flatpickr to re-render days (used after new data loads)
    if (state.restaurantDatePicker && state.restaurantDatePicker.redraw) {
        state.restaurantDatePicker.redraw();
    }
}

function applyDateJump(date) {
    const target = new Date(date); target.setHours(0, 0, 0, 0);
    state.restaurantFilters.date = target;

    // Update button label + active state
    const btn = document.getElementById('rest-date-btn');
    const label = document.getElementById('rest-date-btn-label');
    const clearBtn = document.getElementById('rest-date-clear');
    if (btn) btn.classList.add('is-active');
    if (label) {
        const monthShort = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        label.textContent = `${target.getDate()} ${monthShort[target.getMonth()]} ${target.getFullYear()}`;
    }
    if (clearBtn) clearBtn.classList.remove('hidden');

    renderRestaurantReservations();
}

function clearDateJump() {
    state.restaurantFilters.date = null;
    if (state.restaurantDatePicker) state.restaurantDatePicker.clear();

    const btn = document.getElementById('rest-date-btn');
    const label = document.getElementById('rest-date-btn-label');
    const clearBtn = document.getElementById('rest-date-clear');
    if (btn) btn.classList.remove('is-active');
    if (label) label.textContent = 'Saltar a fecha';
    if (clearBtn) clearBtn.classList.add('hidden');

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

    // Show/hide reject reasons
    const reasonsEl = document.getElementById('confirm-modal-reject-reasons');
    if (reasonsEl) {
        reasonsEl.style.display = isConfirm ? 'none' : 'block';
        // Clear previous selection
        reasonsEl.querySelectorAll('.reject-reason-chip').forEach(c => c.classList.remove('selected'));
    }

    // Pre-fill message
    const msgField = document.getElementById('confirm-modal-message');
    if (msgField) {
        if (isConfirm) {
            const dateStr = formatReservationDate(reservation);
            const timeStr = reservation.horaEvento ? ` a las ${formatTime(reservation.horaEvento)}` : '';
            msgField.value = `¡Hola ${reservation.nombre}! Tu reserva para el ${dateStr}${timeStr} está confirmada. ¡Te esperamos en 107 Rooftop! 🍽️`;
        } else {
            msgField.value = '';
            msgField.placeholder = 'Selecciona un motivo arriba o escribe un mensaje...';
        }
    }

    modal.classList.remove('hidden');
}

function selectRejectReason(btn, key) {
    // Toggle selection
    const row = btn.closest('.reject-reasons-row');
    if (row) row.querySelectorAll('.reject-reason-chip').forEach(c => c.classList.remove('selected'));
    btn.classList.add('selected');

    const msgField = document.getElementById('confirm-modal-message');
    if (!msgField) return;

    // Get reservation name from modal
    const nombre = document.getElementById('confirm-modal-name')?.textContent || '';

    const messages = {
        'sin-disponibilidad': `Hola ${nombre}, lamentablemente no tenemos disponibilidad para esa fecha. Te invitamos a elegir otra fecha y con gusto te atendemos.`,
        'fecha-cerrada':      `Hola ${nombre}, el restaurante estará cerrado en esa fecha. Puedes consultarnos para otras fechas disponibles.`,
        'grupo-grande':       `Hola ${nombre}, el tamaño del grupo supera nuestra capacidad disponible en esa fecha. Contáctanos para explorar opciones.`,
        'otra':               ''
    };

    msgField.value = messages[key] || '';
    if (key === 'otra') msgField.focus();
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
                kommo_lead_id: reservation.kommoLeadId,
                kommo_chat_id: reservation.kommoChatId,
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

// ================================================================
//  AVAILABILITY PANEL
// ================================================================
async function loadRestaurantAvailability() {
    const db = window.clientSupabase || window.supabase;
    if (!db) return;
    try {
        const { data } = await db
            .from('restaurant_availability')
            .select('*')
            .eq('singleton', true)
            .maybeSingle();
        if (data) {
            state.restaurantAvailability = {
                accepting: data.accepting_reservations !== false,
                closedDates: data.closed_dates || [],
                dailyCapacity: data.daily_capacity || 80
            };
        }
    } catch (e) {
        console.warn('Could not load restaurant availability:', e);
    }
    renderAvailabilityPanel();
}

async function saveRestaurantAvailability() {
    const db = window.clientSupabase || window.supabase;
    if (!db) {
        showToast('No se pudo guardar: Supabase no configurado', 'error');
        return;
    }
    // Read current UI values before saving
    const capInput = document.getElementById('avail-capacity');
    if (capInput) {
        const capVal = parseInt(capInput.value);
        state.restaurantAvailability.dailyCapacity = isNaN(capVal) || capVal < 1 ? null : capVal;
    }
    try {
        const payload = {
            singleton: true,
            accepting_reservations: state.restaurantAvailability.accepting,
            closed_dates: state.restaurantAvailability.closedDates,
            daily_capacity: state.restaurantAvailability.dailyCapacity,
            updated_at: new Date().toISOString()
        };
        const { error } = await db
            .from('restaurant_availability')
            .upsert(payload, { onConflict: 'singleton' });
        if (error) throw error;
        const statusEl = document.getElementById('avail-save-status');
        if (statusEl) { statusEl.style.display = 'inline'; setTimeout(() => { statusEl.style.display = 'none'; }, 3000); }
        showToast('Disponibilidad guardada correctamente', 'success');
        updateAvailabilityButton();
    } catch (e) {
        console.error('Error saving availability:', e);
        showToast('Error al guardar: ' + e.message, 'error');
    }
}

function toggleAvailabilityPanel() {
    const panel = document.getElementById('avail-panel');
    if (!panel) return;
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) renderAvailabilityPanel();
}

function toggleAcceptingReservations() {
    state.restaurantAvailability.accepting = !state.restaurantAvailability.accepting;
    renderAvailabilityPanel();
}

function addClosedDate() {
    const input = document.getElementById('avail-new-date');
    if (!input || !input.value) return;
    const dateStr = input.value; // YYYY-MM-DD
    if (!state.restaurantAvailability.closedDates.includes(dateStr)) {
        state.restaurantAvailability.closedDates.push(dateStr);
        state.restaurantAvailability.closedDates.sort();
    }
    input.value = '';
    renderClosedDatesList();
}

function removeClosedDate(dateStr) {
    state.restaurantAvailability.closedDates = state.restaurantAvailability.closedDates.filter(d => d !== dateStr);
    renderClosedDatesList();
}

function renderClosedDatesList() {
    const list = document.getElementById('avail-dates-list');
    if (!list) return;
    const dates = state.restaurantAvailability.closedDates;
    if (!dates.length) {
        list.innerHTML = '<span style="font-size:0.78rem; color:rgba(255,255,255,0.25);">Sin fechas inhabilitadas</span>';
        return;
    }
    list.innerHTML = dates.map(d => {
        const label = new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        return `<span class="avail-date-chip">${label}<button onclick="removeClosedDate('${d}')" title="Quitar">×</button></span>`;
    }).join('');
}

function renderAvailabilityPanel() {
    const av = state.restaurantAvailability;
    const toggle = document.getElementById('avail-accept-toggle');
    const statusText = document.getElementById('avail-status-text');
    const capInput = document.getElementById('avail-capacity');

    if (toggle) {
        toggle.classList.toggle('on', av.accepting);
    }
    if (statusText) {
        statusText.textContent = av.accepting ? 'Activo' : 'Inactivo';
        statusText.className = 'avail-toggle-label ' + (av.accepting ? 'avail-status-on' : 'avail-status-off');
    }
    if (capInput && av.dailyCapacity) capInput.value = av.dailyCapacity;
    renderClosedDatesList();
    updateAvailabilityButton();
}

function updateAvailabilityButton() {
    const btn = document.getElementById('avail-toggle-btn');
    const lbl = document.getElementById('avail-btn-label');
    if (!btn) return;
    const accepting = state.restaurantAvailability.accepting;
    btn.classList.toggle('unavailable', !accepting);
    if (lbl) lbl.textContent = accepting ? 'Disponibilidad' : 'Sin disponibilidad';
}

// ================================================================
//  END AVAILABILITY PANEL
// ================================================================

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
window.selectRejectReason = selectRejectReason;
window.openReservationDetail = openReservationDetail;
window.closeDetailModal = closeDetailModal;
window.toggleAvailabilityPanel = toggleAvailabilityPanel;
window.toggleAcceptingReservations = toggleAcceptingReservations;
window.addClosedDate = addClosedDate;
window.removeClosedDate = removeClosedDate;
window.saveRestaurantAvailability = saveRestaurantAvailability;
window.loadRestaurantAvailability = loadRestaurantAvailability;

// =============================================
// MÓDULO: Panel de Reservas de Hospedaje (Airtable)
// =============================================

const HSP_STATUS_COLORS = {
    'Nuevo Lead': '#F59E0B',
    'Contactado': '#3B82F6',
    'Cotizado': '#8B5CF6',
    'Confirmado': '#10B981',
    'Check-in': '#06B6D4',
    'Check-out': '#6B7280',
    'Cancelado': '#EF4444',
    'No Show': '#EF4444'
};

function parseAirtableDate(val) {
    if (!val) return null;
    // Airtable sends "2026-05-15" (date-only) which JS parses as UTC midnight.
    // Append T12:00:00 to avoid timezone offset shifting the day.
    const str = String(val);
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + 'T12:00:00');
    return new Date(str);
}

async function fetchHospedajeReservas() {
    const { apiKey, baseId, tableName } = state.hospedajeConfig;
    if (!apiKey || !baseId || !tableName) {
        console.log('Hospedaje: No Airtable config, skipping');
        state.hospedajeReservas = [];
        renderHospedajePanel();
        return;
    }

    // Show loading
    const panel = document.getElementById('hospedaje-panel');
    if (panel) panel.innerHTML = '<div class="hsp-loading"><div class="hsp-spinner"></div><span>Cargando reservas...</span></div>';

    try {
        const encodedTable = encodeURIComponent(tableName);
        const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodedTable}`;
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(airtableUrl)}`;

        const response = await fetch(proxyUrl, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) throw new Error(`Airtable HTTP ${response.status}`);
        const data = await response.json();

        const records = data.records || [];
        state.hospedajeReservas = records.map(r => {
            const f = r.fields || {};
            return {
                airtable_id: r.id,
                sesion_id: f['SesionID'] || f['sesionid'] || '',
                nombre: f['Nombre Cliente'] || f['nombre_cliente'] || 'Sin nombre',
                email: f['email'] || f['Email'] || '',
                fecha_entrada: parseAirtableDate(f['Fecha entrada'] || f['fecha_entrada']),
                fecha_salida: parseAirtableDate(f['Fecha salida'] || f['fecha_salida']),
                adultos: parseInt(f['Cantidad Adultos'] || f['cantidad_adultos'] || 0),
                ninos: parseInt(f['Cantidad Niños'] || f['cantidad_ninos'] || f['Cantidad Ninos'] || 0),
                telefono: f['Teléfono'] || f['Telefono'] || f['telefono'] || '',
                tipo_habitacion: f['Tipo Habitación'] || f['Tipo Habitacion'] || f['tipo_habitacion'] || '',
                cantidad_habitaciones: parseInt(f['Cantidad Habitaciones'] || f['cantidad_habitaciones'] || f['Cantidad...'] || 0),
                noches: parseInt(f['Noches'] || f['noches'] || 0),
                total_estimado: parseFloat(f['Total Estimado'] || f['total_estimado'] || 0),
                estado: f['Estado'] || f['estado'] || 'Nuevo Lead',
                notas: f['Notas'] || f['notas'] || ''
            };
        });

        console.log(`Hospedaje: Loaded ${state.hospedajeReservas.length} reservas from Airtable`);
    } catch (err) {
        console.error('Hospedaje: fetchHospedajeReservas failed:', err);
        state.hospedajeReservas = [];
    }

    renderHospedajePanel();
}

const HSP_CONFIRMED_STATUSES = ['Confirmado', 'Check-in', 'Check-out'];
const HSP_PROCESS_STATUSES = ['Nuevo Lead', 'Contactado', 'Cotizado'];

function renderHospedajePanel() {
    const panel = document.getElementById('hospedaje-panel');
    if (!panel) return;

    const { apiKey, baseId, tableName } = state.hospedajeConfig;
    if (!apiKey || !baseId || !tableName) {
        panel.innerHTML = '';
        panel.classList.add('hidden');
        return;
    }

    const all = state.hospedajeReservas;
    const enProceso = all.filter(r => HSP_PROCESS_STATUSES.includes(r.estado) || r.estado === 'Cancelado' || r.estado === 'No Show');
    const confirmados = all.filter(r => HSP_CONFIRMED_STATUSES.includes(r.estado));

    const totalEstimado = enProceso.filter(r => !['Cancelado', 'No Show'].includes(r.estado))
        .reduce((s, r) => s + (r.total_estimado || 0), 0);
    const totalConfirmado = confirmados.reduce((s, r) => s + (r.total_estimado || 0), 0);

    // Apply search filter
    const q = (state.hospedajeFilters.search || '').toLowerCase();
    const filterFn = r => !q || (r.nombre || '').toLowerCase().includes(q) || (r.telefono || '').includes(q) || (r.email || '').toLowerCase().includes(q);

    const filteredProceso = enProceso.filter(filterFn);
    const filteredConfirmados = confirmados.filter(filterFn);

    panel.innerHTML = `
        <div class="hsp-header">
            <div>
                <span class="hsp-section-label">RESERVAS DE HOSPEDAJE</span>
                <h3 class="hsp-title">Solicitudes de Reservación</h3>
            </div>
            <div class="hsp-search-wrap">
                <ion-icon name="search-outline"></ion-icon>
                <input type="text" class="hsp-search" placeholder="Buscar..."
                    value="${state.hospedajeFilters.search}" oninput="searchHospedaje(this.value)">
            </div>
        </div>

        <div class="hsp-tabs">
            <button class="hsp-tab ${state.hospedajeFilters.status !== 'confirmados' ? 'active' : ''}" onclick="filterHospedaje('proceso')">
                En Proceso (${enProceso.length})
                <span class="hsp-tab-amount">$${totalEstimado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                <span class="hsp-tab-label">estimado</span>
            </button>
            <button class="hsp-tab ${state.hospedajeFilters.status === 'confirmados' ? 'active' : ''}" onclick="filterHospedaje('confirmados')">
                Confirmados (${confirmados.length})
                <span class="hsp-tab-amount">$${totalConfirmado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                <span class="hsp-tab-label">confirmado</span>
            </button>
        </div>

        <div class="hsp-table-wrap">
            <table class="hsp-table">
                <thead>
                    <tr>
                        <th>Huésped</th>
                        <th>Entrada</th>
                        <th>Salida</th>
                        <th style="text-align:center">Noches</th>
                        <th>Hab.</th>
                        <th style="text-align:right">Total</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>${renderHspRows(state.hospedajeFilters.status === 'confirmados' ? filteredConfirmados : filteredProceso)}</tbody>
            </table>
        </div>`;
}

function renderHspRows(reservas) {
    if (reservas.length === 0) return '<tr><td colspan="7" style="text-align:center;padding:20px;opacity:0.5;">Sin reservas</td></tr>';

    return reservas.map((r, i) => {
        const color = HSP_STATUS_COLORS[r.estado] || '#9CA3AF';
        const fechaIn = r.fecha_entrada instanceof Date && !isNaN(r.fecha_entrada)
            ? r.fecha_entrada.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—';
        const fechaOut = r.fecha_salida instanceof Date && !isNaN(r.fecha_salida)
            ? r.fecha_salida.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—';
        const total = r.total_estimado ? `$${r.total_estimado.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';
        const globalIdx = state.hospedajeReservas.indexOf(r);

        return `<tr class="hsp-row" onclick="openHospedajeDetail(${globalIdx}, true)" title="Ver detalle">
            <td class="hsp-td-name">${r.nombre}</td>
            <td>${fechaIn}</td>
            <td>${fechaOut}</td>
            <td style="text-align:center">${r.noches || '—'}</td>
            <td>${r.tipo_habitacion || '—'}</td>
            <td style="text-align:right">${total}</td>
            <td><span class="hsp-status-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${r.estado}</span></td>
        </tr>`;
    }).join('');
}

const HSP_PIPELINE = ['Nuevo Lead', 'Contactado', 'Cotizado', 'Confirmado', 'Check-in', 'Check-out', 'Cancelado', 'No Show'];

const HSP_INTERACTION_ICONS = {
    llamada: 'call-outline',
    whatsapp: 'logo-whatsapp',
    email: 'mail-outline',
    nota: 'document-text-outline'
};

async function openHospedajeDetail(index, isGlobal) {
    const r = isGlobal ? state.hospedajeReservas[index] : state.hospedajeReservas[index];
    if (!r) return;

    state._hspDetailRecord = r;

    const modal = document.getElementById('hospedaje-detail-modal');
    const content = document.getElementById('hospedaje-detail-content');
    if (!modal || !content) return;

    // Load interactions from Supabase
    let interactions = [];
    try {
        const { data, error } = await supabase
            .from('hospedaje_interacciones')
            .select('*')
            .eq('client_slug', state.clientId)
            .eq('airtable_record_id', r.airtable_id)
            .order('created_at', { ascending: false });
        if (!error) interactions = data || [];
    } catch (err) {
        console.error('Hospedaje: loadInteractions failed:', err);
    }

    const color = HSP_STATUS_COLORS[r.estado] || '#9CA3AF';
    const fechaIn = r.fecha_entrada instanceof Date && !isNaN(r.fecha_entrada)
        ? r.fecha_entrada.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const fechaOut = r.fecha_salida instanceof Date && !isNaN(r.fecha_salida)
        ? r.fecha_salida.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const total = r.total_estimado ? `$${r.total_estimado.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';

    // Status dropdown
    const statusOptions = HSP_PIPELINE.map(s => {
        const sel = s === r.estado ? 'selected' : '';
        return `<option value="${s}" ${sel}>${s}</option>`;
    }).join('');

    // Timeline
    const timelineHtml = interactions.length === 0
        ? '<p style="opacity:0.4;text-align:center;padding:16px;">Sin interacciones registradas</p>'
        : interactions.map(ix => {
            const icon = HSP_INTERACTION_ICONS[ix.tipo] || 'chatbubble-outline';
            const tipoLabel = ix.tipo.charAt(0).toUpperCase() + ix.tipo.slice(1);
            const fecha = new Date(ix.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            return `<div class="hsp-timeline-item">
                <div class="hsp-timeline-icon" style="background:${color}22">
                    <ion-icon name="${icon}" style="color:${color}"></ion-icon>
                </div>
                <div class="hsp-timeline-content">
                    <div class="hsp-timeline-meta">${tipoLabel} &middot; ${fecha} &middot; <strong>${ix.vendedor_nombre}</strong></div>
                    <div class="hsp-timeline-text">${ix.resultado || ''}</div>
                </div>
            </div>`;
        }).join('');

    const hasHistory = interactions.length > 0;

    content.innerHTML = `
        <div class="hsp-detail-header">
            <div>
                <h2 class="hsp-detail-name">${r.nombre}</h2>
                <span class="hsp-detail-sub">
                    <span class="hsp-status-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${r.estado}</span>
                </span>
            </div>
            <button class="hsp-close-btn" onclick="closeHospedajeDetail()">&times;</button>
        </div>

        <div class="hsp-modal-layout ${hasHistory ? 'hsp-two-col' : ''}">
            <!-- LEFT: Client info -->
            <div class="hsp-modal-left">
                <div class="hsp-detail-grid">
                    <div class="hsp-detail-card">
                        <div class="hsp-detail-card-icon"><ion-icon name="calendar-outline"></ion-icon></div>
                        <div>
                            <div class="hsp-detail-label">Check-in</div>
                            <div class="hsp-detail-value">${fechaIn}</div>
                        </div>
                    </div>
                    <div class="hsp-detail-card">
                        <div class="hsp-detail-card-icon"><ion-icon name="log-out-outline"></ion-icon></div>
                        <div>
                            <div class="hsp-detail-label">Check-out</div>
                            <div class="hsp-detail-value">${fechaOut}</div>
                        </div>
                    </div>
                    <div class="hsp-detail-card">
                        <div class="hsp-detail-card-icon"><ion-icon name="moon-outline"></ion-icon></div>
                        <div>
                            <div class="hsp-detail-label">Noches</div>
                            <div class="hsp-detail-value">${r.noches || '—'}</div>
                        </div>
                    </div>
                    <div class="hsp-detail-card">
                        <div class="hsp-detail-card-icon"><ion-icon name="cash-outline"></ion-icon></div>
                        <div>
                            <div class="hsp-detail-label">Total Estimado</div>
                            <div class="hsp-detail-value">${total}</div>
                        </div>
                    </div>
                </div>

                <div class="hsp-detail-info">
                    <div class="hsp-info-item"><ion-icon name="bed-outline"></ion-icon> ${r.tipo_habitacion || '—'} ${r.cantidad_habitaciones > 1 ? '(' + r.cantidad_habitaciones + ' hab.)' : ''}</div>
                    <div class="hsp-info-item"><ion-icon name="people-outline"></ion-icon> ${r.adultos || 0} adulto(s)${r.ninos ? ', ' + r.ninos + ' niño(s)' : ''}</div>
                    <div class="hsp-info-item"><ion-icon name="call-outline"></ion-icon> ${formatPhone(r.telefono) || '—'}</div>
                    <div class="hsp-info-item"><ion-icon name="mail-outline"></ion-icon> ${r.email || '—'}</div>
                </div>

                ${r.notas ? `<div class="hsp-detail-notes"><ion-icon name="document-text-outline"></ion-icon> ${r.notas}</div>` : ''}

                <div class="hsp-detail-actions">
                    ${r.telefono ? `<a href="https://wa.me/${r.telefono.replace(/\D/g, '')}" target="_blank" class="hsp-action-btn hsp-btn-whatsapp">
                        <ion-icon name="logo-whatsapp"></ion-icon> WhatsApp
                    </a>` : ''}
                    ${r.telefono ? `<a href="tel:${r.telefono}" class="hsp-action-btn hsp-btn-call">
                        <ion-icon name="call-outline"></ion-icon> Llamar
                    </a>` : ''}
                    ${r.email ? `<a href="mailto:${r.email}" class="hsp-action-btn hsp-btn-email">
                        <ion-icon name="mail-outline"></ion-icon> Email
                    </a>` : ''}
                </div>

                <div class="hsp-interaction-form">
                    <h4 class="hsp-section-title">Actualizar Seguimiento</h4>
                    <div class="hsp-form-row" style="display:flex;gap:10px;">
                        <div style="flex:1;">
                            <label class="hsp-form-label">Estatus</label>
                            <select id="hsp-status-dropdown" class="hsp-form-select" data-original="${r.estado}"
                                onchange="hspCheckSaveEnabled()" style="border-color:${color};color:${color}">
                                ${statusOptions}
                            </select>
                        </div>
                        <div style="flex:1;">
                            <label class="hsp-form-label">Tipo de contacto</label>
                            <select id="hsp-interaction-type" class="hsp-form-select">
                                <option value="llamada">Llamada</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="email">Email</option>
                                <option value="nota">Nota</option>
                            </select>
                        </div>
                    </div>
                    <textarea id="hsp-interaction-result" class="hsp-form-textarea" rows="3"
                        placeholder="Resultado de la interacción, acuerdos, siguiente paso..."
                        oninput="hspCheckSaveEnabled()"></textarea>
                    <button id="hsp-save-all-btn" class="hsp-form-save-btn" disabled
                        onclick="saveHospedajeAll('${r.airtable_id}')">
                        <ion-icon name="save-outline"></ion-icon> Guardar
                    </button>
                </div>
            </div>

            <!-- RIGHT: Timeline (only if has history) -->
            ${hasHistory ? `
            <div class="hsp-modal-right">
                <h4 class="hsp-section-title">Historial de Seguimiento</h4>
                <div class="hsp-timeline-scroll">
                    ${timelineHtml}
                </div>
            </div>` : ''}
        </div>`;

    modal.classList.remove('hidden');
}

function closeHospedajeDetail() {
    const modal = document.getElementById('hospedaje-detail-modal');
    if (modal) modal.classList.add('hidden');
    state._hspDetailRecord = null;
}

function hspCheckSaveEnabled() {
    const btn = document.getElementById('hsp-save-all-btn');
    if (!btn) return;
    const statusDropdown = document.getElementById('hsp-status-dropdown');
    const resultado = document.getElementById('hsp-interaction-result');
    const statusChanged = statusDropdown && statusDropdown.value !== statusDropdown.dataset.original;
    const hasText = resultado && resultado.value.trim().length > 0;
    btn.disabled = !(statusChanged || hasText);
}

async function saveHospedajeAll(airtableRecordId) {
    const btn = document.getElementById('hsp-save-all-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon> Guardando...'; }

    const statusDropdown = document.getElementById('hsp-status-dropdown');
    const tipoEl = document.getElementById('hsp-interaction-type');
    const resultadoEl = document.getElementById('hsp-interaction-result');

    const newStatus = statusDropdown ? statusDropdown.value : null;
    const originalStatus = statusDropdown ? statusDropdown.dataset.original : null;
    const statusChanged = newStatus && newStatus !== originalStatus;
    const tipo = tipoEl ? tipoEl.value : 'nota';
    const resultado = resultadoEl ? resultadoEl.value.trim() : '';

    const session = typeof getSession === 'function' ? getSession() : null;
    const userName = session ? session.name : 'Desconocido';
    const userId = session ? session.id : null;

    try {
        // 1. Update status in Airtable if changed
        if (statusChanged) {
            const { apiKey, baseId, tableName } = state.hospedajeConfig;
            const encodedTable = encodeURIComponent(tableName);
            const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodedTable}/${airtableRecordId}`;
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(airtableUrl)}`;

            const response = await fetch(proxyUrl, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: { 'Estado': newStatus } })
            });
            if (!response.ok) throw new Error(`Airtable PATCH ${response.status}`);

            const lead = state.hospedajeReservas.find(r => r.airtable_id === airtableRecordId);
            if (lead) lead.estado = newStatus;

            // 1b. Auto-register venta when confirmed
            if (newStatus === 'Confirmado' && originalStatus !== 'Confirmado' && lead) {
                await supabase.from('ventas').insert([{
                    client_slug: state.clientId,
                    monto: lead.total_estimado || 0,
                    fecha: lead.fecha_entrada instanceof Date ? lead.fecha_entrada.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    descripcion: `Reserva confirmada: ${lead.nombre} - ${lead.tipo_habitacion || ''} ${lead.noches || ''} noches`,
                    registrado_por: userName
                }]);
                // Refresh ventas in dashboard
                if (typeof refreshVentasDashboard === 'function') await refreshVentasDashboard();
            }
        }

        // 2. Save interaction in Supabase
        const logText = resultado
            ? (statusChanged ? `[${originalStatus} → ${newStatus}] ${resultado}` : resultado)
            : (statusChanged ? `Estatus cambiado: ${originalStatus} → ${newStatus}` : '');

        if (logText) {
            await supabase.from('hospedaje_interacciones').insert([{
                client_slug: state.clientId,
                airtable_record_id: airtableRecordId,
                tipo: resultado ? tipo : 'nota',
                resultado: logText,
                vendedor_nombre: userName,
                vendedor_id: userId
            }]);
        }

        renderHospedajePanel();
        showToast('Cambios guardados', 'success');

        // Refresh modal
        const lead = state.hospedajeReservas.find(r => r.airtable_id === airtableRecordId);
        if (lead) {
            const idx = getFilteredHospedaje().indexOf(lead);
            if (idx >= 0) openHospedajeDetail(idx);
        }
    } catch (err) {
        console.error('Hospedaje: saveAll failed:', err);
        showToast('Error al guardar', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<ion-icon name="save-outline"></ion-icon> Guardar'; }
    }
}

function getFilteredHospedaje() {
    let reservas = [...state.hospedajeReservas];
    if (state.hospedajeFilters.status !== 'all') {
        reservas = reservas.filter(r => r.estado === state.hospedajeFilters.status);
    }
    if (state.hospedajeFilters.search) {
        const q = state.hospedajeFilters.search.toLowerCase();
        reservas = reservas.filter(r =>
            (r.nombre || '').toLowerCase().includes(q) ||
            (r.telefono || '').includes(q) ||
            (r.email || '').toLowerCase().includes(q) ||
            (r.tipo_habitacion || '').toLowerCase().includes(q)
        );
    }
    return reservas;
}

function filterHospedaje(tab) {
    state.hospedajeFilters.status = tab;
    renderHospedajePanel();
}

function searchHospedaje(query) {
    state.hospedajeFilters.search = query;
    // Only update the table body, not the full panel (to keep input focus)
    const tbody = document.querySelector('#hospedaje-panel .hsp-table tbody');
    if (!tbody) return;
    const all = state.hospedajeReservas;
    const isConfirmados = state.hospedajeFilters.status === 'confirmados';
    const base = isConfirmados
        ? all.filter(r => HSP_CONFIRMED_STATUSES.includes(r.estado))
        : all.filter(r => HSP_PROCESS_STATUSES.includes(r.estado) || r.estado === 'Cancelado' || r.estado === 'No Show');
    const q = query.toLowerCase();
    const filtered = q ? base.filter(r =>
        (r.nombre || '').toLowerCase().includes(q) ||
        (r.telefono || '').includes(q) ||
        (r.email || '').toLowerCase().includes(q)
    ) : base;
    tbody.innerHTML = renderHspRows(filtered);
}

function sortHospedaje(field) {
    if (state.hospedajeSortField === field) {
        state.hospedajeSortDir = state.hospedajeSortDir === 'desc' ? 'asc' : 'desc';
    } else {
        state.hospedajeSortField = field;
        state.hospedajeSortDir = 'desc';
    }
    renderHospedajePanel();
}

// Expose hospedaje functions globally
window.fetchHospedajeReservas = fetchHospedajeReservas;
window.openHospedajeDetail = openHospedajeDetail;
window.closeHospedajeDetail = closeHospedajeDetail;
window.filterHospedaje = filterHospedaje;
window.searchHospedaje = searchHospedaje;
window.sortHospedaje = sortHospedaje;
window.hspCheckSaveEnabled = hspCheckSaveEnabled;
window.saveHospedajeAll = saveHospedajeAll;

// =============================================
// END: Panel de Reservas de Hospedaje
// =============================================

// =============================================
// MÓDULO: Panel de Eventos CRM (Airtable)
// =============================================

const EVT_STATUS_COLORS = {
    'Nuevo Lead': '#F59E0B', 'Contactado': '#3B82F6', 'Cotizando': '#8B5CF6',
    'Cotización Enviada': '#06B6D4', 'Venta': '#10B981', 'Perdido': '#EF4444'
};
const EVT_PIPELINE = ['Nuevo Lead', 'Contactado', 'Cotizando', 'Cotización Enviada', 'Venta', 'Perdido'];
const EVT_PROCESS = ['Nuevo Lead', 'Contactado', 'Cotizando', 'Cotización Enviada'];
const EVT_CLOSED = ['Venta', 'Perdido'];

async function fetchEventosLeads() {
    const { apiKey, baseId, tableName } = state.eventosConfig;
    if (!apiKey || !baseId || !tableName) { state.eventosLeads = []; renderEventosPanel(); return; }

    const panel = document.getElementById('eventos-panel');
    if (panel) panel.innerHTML = '<div class="hsp-loading"><div class="hsp-spinner"></div><span>Cargando leads de eventos...</span></div>';

    try {
        const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        if (!response.ok) throw new Error(`Airtable HTTP ${response.status}`);
        const data = await response.json();

        state.eventosLeads = (data.records || []).map(r => {
            const f = r.fields || {};
            return {
                airtable_id: r.id,
                nombre: f['Nombre Cliente'] || 'Sin nombre',
                email: f['email'] || '',
                telefono: f['Telefono'] || '',
                tipo_evento: f['TipoEvento'] || '',
                pax: parseInt(f['PAX'] || 0),
                fecha_evento: f['FechaEvento'] || '',
                fecha_contacto: f['FechaContacto'] ? new Date(f['FechaContacto']) : null,
                total_estimado: parseFloat(f['TotalEstimado'] || 0),
                estado: f['Estado'] || 'Nuevo Lead',
                notas: f['Notas'] || '',
                detalles: f['Detalles'] || '',
                conversacion: f['Conversación'] || ''
            };
        });
        console.log(`Eventos CRM: Loaded ${state.eventosLeads.length} leads`);
    } catch (err) {
        console.error('Eventos CRM: fetch failed:', err);
        state.eventosLeads = [];
    }
    renderEventosPanel();
}

function renderEventosPanel() {
    const panel = document.getElementById('eventos-panel');
    if (!panel) return;
    const { apiKey, baseId, tableName } = state.eventosConfig;
    if (!apiKey || !baseId || !tableName) { panel.innerHTML = ''; panel.classList.add('hidden'); return; }

    const all = state.eventosLeads;
    const isCalendar = state.eventosFilters.status === 'calendario';

    const q = (state.eventosFilters.search || '').toLowerCase();
    const filterFn = r => !q || (r.nombre || '').toLowerCase().includes(q) || (r.telefono || '').includes(q) || (r.tipo_evento || '').toLowerCase().includes(q);
    const filtered = all.filter(filterFn);

    // Summary totals
    const enProceso = all.filter(r => EVT_PROCESS.includes(r.estado));
    const totalEstimado = enProceso.reduce((s, r) => s + (r.total_estimado || 0), 0);
    const ventas = all.filter(r => r.estado === 'Venta');
    const totalVentas = ventas.reduce((s, r) => s + (r.total_estimado || 0), 0);
    const totalPerdido = all.filter(r => r.estado === 'Perdido').length;
    const conversionRate = all.length > 0 ? ((ventas.length / all.length) * 100).toFixed(1) : '0';

    const calendarHtml = isCalendar ? renderEventosCalendar() : '';

    // Build kanban columns
    const kanbanHtml = !isCalendar ? EVT_PIPELINE.map(stage => {
        const color = EVT_STATUS_COLORS[stage];
        const stageLeads = filtered.filter(r => r.estado === stage);
        const stageTotal = stageLeads.reduce((s, r) => s + (r.total_estimado || 0), 0);
        const cards = stageLeads.length === 0
            ? '<div class="evt-kanban-col-empty">Sin leads</div>'
            : stageLeads.map(r => renderKanbanCard(r, color)).join('');

        return `<div class="evt-kanban-col">
            <div class="evt-kanban-col-header">
                <div class="evt-kanban-col-title" style="color:${color}">
                    <span class="evt-kanban-col-dot" style="background:${color}"></span>
                    ${stage}
                </div>
                <span class="evt-kanban-col-count">${stageLeads.length}</span>
            </div>
            <div class="evt-kanban-col-body">${cards}</div>
            ${stageTotal > 0 ? `<div class="evt-kanban-col-total">$${stageTotal.toLocaleString('en-US', { minimumFractionDigits: 0 })}</div>` : ''}
        </div>`;
    }).join('') : '';

    // Agenda tab: upcoming events list with date grouping
    const agendaUpcomingHtml = isCalendar ? (() => {
        const now = new Date();
        const upcoming = all
            .filter(l => l.fecha_contacto instanceof Date && !isNaN(l.fecha_contacto))
            .sort((a, b) => a.fecha_contacto - b.fecha_contacto);
        if (upcoming.length === 0) return '<div style="text-align:center;color:var(--text-muted);padding:40px 20px;font-size:0.85rem;">Sin eventos con fecha registrada</div>';

        // Group by date
        const groups = {};
        upcoming.forEach(l => {
            const key = l.fecha_contacto.toDateString();
            if (!groups[key]) groups[key] = { date: l.fecha_contacto, leads: [] };
            groups[key].leads.push(l);
        });

        let html = '<div class="evt-agenda-list">';
        const todayStr = now.toDateString();
        const tomorrowDate = new Date(now); tomorrowDate.setDate(now.getDate() + 1);
        const tomorrowStr = tomorrowDate.toDateString();

        Object.values(groups).forEach(group => {
            const dateKey = group.date.toDateString();
            let label;
            if (dateKey === todayStr) label = 'Hoy';
            else if (dateKey === tomorrowStr) label = 'Mañana';
            else label = group.date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });

            html += `<div class="evt-agenda-section-label">${label}</div>`;
            group.leads.forEach(l => {
                const color = EVT_STATUS_COLORS[l.estado] || '#9CA3AF';
                const idx = state.eventosLeads.indexOf(l);
                const timeStr = l.fecha_contacto.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                const total = l.total_estimado ? `$${l.total_estimado.toLocaleString('en-US', {minimumFractionDigits:0})}` : '';
                html += `<div class="evt-agenda-row" onclick="openEventoDetail(${idx})">
                    <div class="evt-agenda-dot" style="background:${color};color:${color}"></div>
                    <div class="evt-agenda-date">${timeStr}</div>
                    <div class="evt-agenda-info">
                        <div class="evt-agenda-name">${l.nombre}</div>
                        <div class="evt-agenda-meta">${l.tipo_evento || 'Evento'}${l.pax ? ` · ${l.pax} pax` : ''} · <span style="color:${color}">${l.estado}</span></div>
                    </div>
                    ${total ? `<div class="evt-agenda-amount">${total}</div>` : ''}
                </div>`;
            });
        });
        html += '</div>';
        return html;
    })() : '';

    // --- Full-screen layout ---
    panel.innerHTML = `
        <div class="evt-fs-header">
            <div class="evt-fs-header-left">
                <button class="evt-back-btn" onclick="closeEventosPipeline()" title="Volver al Dashboard">
                    <ion-icon name="arrow-back-outline"></ion-icon>
                </button>
                <div class="evt-fs-title-group">
                    <h2 class="evt-fs-title">Eventos</h2>
                    <div class="evt-fs-stats">
                        <span class="evt-fs-stat">${all.length} <span class="evt-fs-stat-label">leads</span></span>
                        <span class="evt-fs-stat-sep">·</span>
                        <span class="evt-fs-stat green">${ventas.length} <span class="evt-fs-stat-label">vendidos</span></span>
                        <span class="evt-fs-stat-sep">·</span>
                        <span class="evt-fs-stat amber">${conversionRate}%</span>
                        ${totalEstimado > 0 ? `<span class="evt-fs-stat-sep">·</span><span class="evt-fs-stat">$${totalEstimado.toLocaleString('en-US',{minimumFractionDigits:0})} <span class="evt-fs-stat-label">en proceso</span></span>` : ''}
                    </div>
                </div>
            </div>
            <div class="evt-fs-header-right">
                <div class="evt-fs-toggle">
                    <button class="evt-fs-toggle-btn ${isCalendar ? 'active' : ''}" onclick="filterEventos('calendario')">
                        <ion-icon name="calendar-outline"></ion-icon> Agenda
                    </button>
                    <button class="evt-fs-toggle-btn ${!isCalendar ? 'active' : ''}" onclick="filterEventos('proceso')">
                        <ion-icon name="git-network-outline"></ion-icon> Pipeline
                    </button>
                </div>
                <div class="evt-fs-search">
                    <ion-icon name="search-outline"></ion-icon>
                    <input type="text" placeholder="Buscar evento..." value="${state.eventosFilters.search}" oninput="searchEventos(this.value)">
                </div>
            </div>
        </div>

        <div class="evt-fs-body">
            ${isCalendar
                ? `<div class="evt-fs-calendar-layout">
                    <div class="evt-fs-calendar-main">${calendarHtml}</div>
                    <div class="evt-fs-calendar-sidebar">
                        <div style="padding:0 0 12px;flex-shrink:0;">
                            <div style="font-size:0.95rem;font-weight:700;color:var(--text-primary,#fff);margin-bottom:2px;">Próximos eventos</div>
                            <div style="font-size:0.75rem;color:var(--text-muted,rgba(255,255,255,0.38));">${all.filter(l => l.fecha_contacto instanceof Date).length} eventos programados</div>
                        </div>
                        ${agendaUpcomingHtml}
                    </div>
                </div>`
                : `<div class="evt-fs-pipeline">${kanbanHtml}</div>`
            }
        </div>`;
}

function renderKanbanCard(r, color) {
    const globalIdx = state.eventosLeads.indexOf(r);
    const total = r.total_estimado ? `$${r.total_estimado.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '';
    const fecha = r.fecha_evento || '';
    const phone = (r.telefono || '').replace(/\D/g, '');

    // Format fecha_contacto with date + time
    let fechaContactoStr = '';
    if (r.fecha_contacto instanceof Date && !isNaN(r.fecha_contacto)) {
        const dateP = r.fecha_contacto.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        const timeP = r.fecha_contacto.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        fechaContactoStr = `${dateP}, ${timeP}`;
    }

    const actions = [];
    if (r.telefono) actions.push(`<a href="https://wa.me/${phone}" target="_blank" class="evt-kanban-card-action wa" onclick="event.stopPropagation()" title="WhatsApp"><ion-icon name="logo-whatsapp"></ion-icon></a>`);
    if (r.telefono) actions.push(`<a href="tel:${r.telefono}" class="evt-kanban-card-action call" onclick="event.stopPropagation()" title="Llamar"><ion-icon name="call-outline"></ion-icon></a>`);
    if (r.email) actions.push(`<a href="mailto:${r.email}" class="evt-kanban-card-action email" onclick="event.stopPropagation()" title="Email"><ion-icon name="mail-outline"></ion-icon></a>`);

    return `<div class="evt-kanban-card" style="--card-accent:${color}" onclick="openEventoDetail(${globalIdx})" title="Ver detalle de ${r.nombre}">
        <div class="evt-kanban-card-name">${r.nombre}</div>
        <div class="evt-kanban-card-type">
            ${r.tipo_evento || 'Evento'}
        </div>
        <div class="evt-kanban-card-meta">
            ${r.pax ? `<span class="evt-kanban-card-pax"><ion-icon name="people-outline"></ion-icon> ${r.pax} pax</span>` : ''}
            ${total ? `<span class="evt-kanban-card-amount">${total}</span>` : ''}
        </div>
        ${fechaContactoStr ? `<div class="evt-kanban-card-date"><ion-icon name="time-outline"></ion-icon> ${fechaContactoStr}</div>` : (fecha ? `<div class="evt-kanban-card-date"><ion-icon name="calendar-outline"></ion-icon> ${fecha}</div>` : '')}
        ${actions.length ? `<div class="evt-kanban-card-actions">${actions.join('')}</div>` : ''}
    </div>`;
}

// --- Calendar View ---

function renderEventosCalendar() {
    const view = state.eventosCalendarView || 'week';
    const offset = state.eventosCalendarWeekOffset;
    const today = new Date();
    const leads = state.eventosLeads.filter(l => l.fecha_contacto instanceof Date && !isNaN(l.fecha_contacto));

    // View mode buttons
    const viewBtns = ['day', 'week', 'month'].map(v => {
        const labels = { day: 'Día', week: 'Semana', month: 'Mes' };
        return `<button class="evt-cal-view-btn ${view === v ? 'active' : ''}" onclick="evtCalendarView('${v}')">${labels[v]}</button>`;
    }).join('');

    if (view === 'day') return renderCalDay(today, offset, leads, viewBtns);
    if (view === 'month') return renderCalMonth(today, offset, leads, viewBtns);
    return renderCalWeek(today, offset, leads, viewBtns);
}

function renderCalWeek(today, offset, leads, viewBtns) {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (offset * 7));

    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i); days.push(d); }

    const dayColumns = days.map(day => {
        const weekday = day.toLocaleDateString('es-MX', { weekday: 'short' }).toUpperCase();
        const dayNum = day.getDate();
        const isToday = day.toDateString() === today.toDateString();
        const dayLeads = leads.filter(l => l.fecha_contacto.toDateString() === day.toDateString()).sort((a, b) => a.fecha_contacto - b.fecha_contacto);

        const cardsHtml = dayLeads.length === 0
            ? '<div class="evt-cal-empty">—</div>'
            : dayLeads.map(l => renderCalCard(l)).join('');

        return `<div class="evt-cal-day ${isToday ? 'evt-cal-today' : ''}">
            <div class="evt-cal-day-header">${weekday}<span class="evt-cal-day-num">${dayNum}</span></div>
            ${cardsHtml}
        </div>`;
    }).join('');

    const label = `${days[0].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} — ${days[6].toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    return `<div class="evt-cal-nav">
        <button class="evt-cal-nav-btn" onclick="evtCalendarNav(-1)"><ion-icon name="chevron-back-outline"></ion-icon></button>
        <span class="evt-cal-week-label">${label}</span>
        <button class="evt-cal-nav-btn" onclick="evtCalendarNav(1)"><ion-icon name="chevron-forward-outline"></ion-icon></button>
        ${offset !== 0 ? '<button class="evt-cal-nav-btn evt-cal-today-btn" onclick="evtCalendarNav(0,true)">Hoy</button>' : ''}
        <div class="evt-cal-view-toggle">${viewBtns}</div>
    </div>
    <div class="evt-cal-grid">${dayColumns}</div>`;
}

function renderCalDay(today, offset, leads, viewBtns) {
    const day = new Date(today);
    day.setDate(today.getDate() + offset);
    const isToday = day.toDateString() === today.toDateString();
    const label = day.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const dayLeads = leads.filter(l => l.fecha_contacto.toDateString() === day.toDateString()).sort((a, b) => a.fecha_contacto - b.fecha_contacto);

    // Group by hour
    const hours = {};
    for (let h = 7; h <= 20; h++) hours[h] = [];
    dayLeads.forEach(l => { const h = l.fecha_contacto.getHours(); if (!hours[h]) hours[h] = []; hours[h].push(l); });

    const slotsHtml = Object.entries(hours).map(([h, hLeads]) => {
        const hourLabel = `${String(h).padStart(2, '0')}:00`;
        const cards = hLeads.length === 0
            ? '<div class="evt-cal-empty-slot"></div>'
            : hLeads.map(l => renderCalCard(l)).join('');
        return `<div class="evt-cal-hour-row"><div class="evt-cal-hour-label">${hourLabel}</div><div class="evt-cal-hour-content">${cards}</div></div>`;
    }).join('');

    const dayNum = day.getDate();
    const weekday = day.toLocaleDateString('es-MX', { weekday: 'long' });

    return `<div class="evt-cal-nav">
        <button class="evt-cal-nav-btn" onclick="evtCalendarNav(-1)"><ion-icon name="chevron-back-outline"></ion-icon></button>
        <span class="evt-cal-week-label">${isToday ? '<span style="background:var(--accent-purple,#A78BFA);color:#fff;padding:2px 10px;border-radius:20px;margin-right:6px;">Hoy</span>' : ''}${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${dayNum} de ${day.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</span>
        <button class="evt-cal-nav-btn" onclick="evtCalendarNav(1)"><ion-icon name="chevron-forward-outline"></ion-icon></button>
        ${!isToday ? '<button class="evt-cal-nav-btn evt-cal-today-btn" onclick="evtCalendarNav(0,true)">Hoy</button>' : ''}
        <div class="evt-cal-view-toggle">${viewBtns}</div>
    </div>
    <div class="evt-cal-day-view">${slotsHtml}</div>`;
}

function renderCalMonth(today, offset, leads, viewBtns) {
    const refDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = (firstDay.getDay() + 6) % 7; // Monday = 0

    const label = refDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    const dayHeaders = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => `<div class="evt-cal-month-header">${d}</div>`).join('');

    let cells = '';
    // Padding
    for (let i = 0; i < startPad; i++) cells += '<div class="evt-cal-month-cell evt-cal-month-pad"></div>';

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const cellDate = new Date(year, month, d);
        const isToday = cellDate.toDateString() === today.toDateString();
        const dayLeads = leads.filter(l => l.fecha_contacto.toDateString() === cellDate.toDateString());
        const events = dayLeads.slice(0, 3).map(l => {
            const color = EVT_STATUS_COLORS[l.estado] || '#9CA3AF';
            return `<div class="evt-cal-month-event" style="background:${color}22;color:${color};border-left:2px solid ${color}" title="${l.nombre}">${l.nombre}</div>`;
        }).join('');
        const count = dayLeads.length > 3 ? `<span class="evt-cal-month-more">+${dayLeads.length - 3} más</span>` : '';

        cells += `<div class="evt-cal-month-cell ${isToday ? 'evt-cal-today' : ''}" onclick="evtCalendarView('day'); state.eventosCalendarWeekOffset=${Math.round((cellDate - today) / 86400000)}; renderEventosPanel();">
            <div class="evt-cal-month-day">${d}</div>
            ${events}${count}
        </div>`;
    }

    return `<div class="evt-cal-nav">
        <button class="evt-cal-nav-btn" onclick="evtCalendarNav(-1)"><ion-icon name="chevron-back-outline"></ion-icon></button>
        <span class="evt-cal-week-label">${label}</span>
        <button class="evt-cal-nav-btn" onclick="evtCalendarNav(1)"><ion-icon name="chevron-forward-outline"></ion-icon></button>
        ${offset !== 0 ? '<button class="evt-cal-nav-btn evt-cal-today-btn" onclick="evtCalendarNav(0,true)">Hoy</button>' : ''}
        <div class="evt-cal-view-toggle">${viewBtns}</div>
    </div>
    <div class="evt-cal-month-grid">${dayHeaders}${cells}</div>`;
}

function renderCalCard(l) {
    const hora = l.fecha_contacto.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const color = EVT_STATUS_COLORS[l.estado] || '#9CA3AF';
    const globalIdx = state.eventosLeads.indexOf(l);
    const total = l.total_estimado ? `<span style="color:var(--accent-green,#6EE7A0);font-weight:700;font-size:0.68rem;">$${l.total_estimado.toLocaleString('en-US',{minimumFractionDigits:0})}</span>` : '';
    return `<div class="evt-cal-card" onclick="openEventoDetail(${globalIdx})" style="border-left:3px solid ${color}">
        <div class="evt-cal-time">${hora} ${total}</div>
        <div class="evt-cal-name">${l.nombre}</div>
        <div class="evt-cal-type">${l.tipo_evento || 'Evento'}${l.pax ? ` · ${l.pax} pax` : ''}</div>
    </div>`;
}

function evtCalendarView(view) {
    state.eventosCalendarView = view;
    state.eventosCalendarWeekOffset = 0;
    renderEventosPanel();
}

function evtSidebarCalNav(dir) {
    state.eventosCalendarSidebarOffset = (state.eventosCalendarSidebarOffset || 0) + dir;
    renderEventosPanel();
}

function evtCalendarNav(dir, reset) {
    if (reset) state.eventosCalendarWeekOffset = 0;
    else state.eventosCalendarWeekOffset += dir;
    renderEventosPanel();
}

// --- Detail Modal ---

async function openEventoDetail(index) {
    const r = state.eventosLeads[index];
    if (!r) return;

    const modal = document.getElementById('eventos-detail-modal');
    const content = document.getElementById('eventos-detail-content');
    if (!modal || !content) return;

    let interactions = [];
    try {
        const { data, error } = await supabase
            .from('event_interacciones')
            .select('*')
            .eq('client_slug', state.clientId)
            .eq('airtable_record_id', r.airtable_id)
            .order('created_at', { ascending: false });
        if (!error) interactions = data || [];
    } catch (err) { console.error('Eventos: loadInteractions failed:', err); }

    const color = EVT_STATUS_COLORS[r.estado] || '#9CA3AF';
    const fechaContacto = r.fecha_contacto instanceof Date && !isNaN(r.fecha_contacto)
        ? r.fecha_contacto.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const total = r.total_estimado ? `$${r.total_estimado.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';

    const statusOptions = EVT_PIPELINE.map(s => `<option value="${s}" ${s === r.estado ? 'selected' : ''}>${s}</option>`).join('');
    const hasHistory = interactions.length > 0;

    const timelineHtml = !hasHistory
        ? '<p style="opacity:0.4;text-align:center;padding:16px;">Sin interacciones registradas</p>'
        : interactions.map(ix => {
            const icon = HSP_INTERACTION_ICONS[ix.tipo] || 'chatbubble-outline';
            const tipoLabel = ix.tipo.charAt(0).toUpperCase() + ix.tipo.slice(1);
            const fecha = new Date(ix.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            return `<div class="hsp-timeline-item">
                <div class="hsp-timeline-icon" style="background:${color}22">
                    <ion-icon name="${icon}" style="color:${color}"></ion-icon>
                </div>
                <div class="hsp-timeline-content">
                    <div class="hsp-timeline-meta">${tipoLabel} &middot; ${fecha} &middot; <strong>${ix.vendedor_nombre}</strong></div>
                    <div class="hsp-timeline-text">${ix.resultado || ''}</div>
                </div>
            </div>`;
        }).join('');

    // Upcoming call info
    const now = new Date();
    const hasUpcoming = r.fecha_contacto instanceof Date && r.fecha_contacto > now;
    const callInfo = hasUpcoming
        ? `<div class="evt-call-scheduled"><ion-icon name="alarm-outline"></ion-icon> Llamada programada: <strong>${fechaContacto}</strong></div>`
        : (r.fecha_contacto ? `<div class="evt-call-past"><ion-icon name="checkmark-circle-outline"></ion-icon> Contacto: ${fechaContacto}</div>` : '');

    content.innerHTML = `
        <div class="hsp-detail-header">
            <div>
                <h2 class="hsp-detail-name">${r.nombre}</h2>
                <span class="hsp-detail-sub">
                    ${r.tipo_evento || 'Evento'} &middot; ${r.pax || '?'} pax &middot; ${r.fecha_evento || '—'}
                    <span class="hsp-status-badge" style="background:${color}22;color:${color};border:1px solid ${color}44;margin-left:8px;">${r.estado}</span>
                </span>
            </div>
            <button class="hsp-close-btn" onclick="closeEventoDetail()">&times;</button>
        </div>

        <div class="hsp-modal-layout ${hasHistory ? 'hsp-two-col' : ''}">
            <div class="hsp-modal-left">
                <div class="hsp-detail-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));">
                    <div class="hsp-detail-card">
                        <div class="hsp-detail-card-icon"><ion-icon name="people-outline"></ion-icon></div>
                        <div><div class="hsp-detail-label">PAX</div><div class="hsp-detail-value">${r.pax || '—'}</div></div>
                    </div>
                    <div class="hsp-detail-card">
                        <div class="hsp-detail-card-icon"><ion-icon name="cash-outline"></ion-icon></div>
                        <div><div class="hsp-detail-label">Total Estimado</div><div class="hsp-detail-value">${total}</div></div>
                    </div>
                </div>

                ${callInfo}

                <div class="hsp-detail-info">
                    <div class="hsp-info-item"><ion-icon name="call-outline"></ion-icon> ${formatPhone(r.telefono) || '—'}</div>
                    <div class="hsp-info-item"><ion-icon name="mail-outline"></ion-icon> ${r.email || '—'}</div>
                </div>

                ${r.notas ? `<div class="hsp-detail-notes"><ion-icon name="document-text-outline"></ion-icon> ${r.notas}</div>` : ''}
                ${r.detalles ? `<div class="hsp-detail-notes"><ion-icon name="chatbubble-outline"></ion-icon> ${r.detalles}</div>` : ''}

                <div class="hsp-detail-actions" style="margin-bottom:20px;">
                    ${r.telefono ? `<a href="https://wa.me/${r.telefono.replace(/\D/g, '')}" target="_blank" class="hsp-action-btn hsp-btn-whatsapp"><ion-icon name="logo-whatsapp"></ion-icon> WhatsApp</a>` : ''}
                    ${r.telefono ? `<a href="tel:${r.telefono}" class="hsp-action-btn hsp-btn-call"><ion-icon name="call-outline"></ion-icon> Llamar</a>` : ''}
                    ${r.email ? `<a href="mailto:${r.email}" class="hsp-action-btn hsp-btn-email"><ion-icon name="mail-outline"></ion-icon> Email</a>` : ''}
                </div>

                <div class="hsp-interaction-form">
                    <h4 class="hsp-section-title">Actualizar Seguimiento</h4>
                    <div class="hsp-form-row" style="display:flex;gap:10px;">
                        <div style="flex:1;">
                            <label class="hsp-form-label">Estatus</label>
                            <select id="evt-status-dropdown" class="hsp-form-select" data-original="${r.estado}"
                                onchange="evtCheckSaveEnabled()" style="border-color:${color};color:${color}">
                                ${statusOptions}
                            </select>
                        </div>
                        <div style="flex:1;">
                            <label class="hsp-form-label">Tipo de contacto</label>
                            <select id="evt-interaction-type" class="hsp-form-select">
                                <option value="llamada">Llamada</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="email">Email</option>
                                <option value="nota">Nota</option>
                            </select>
                        </div>
                    </div>
                    <textarea id="evt-interaction-result" class="hsp-form-textarea" rows="3"
                        placeholder="Resultado de la interacción, acuerdos, siguiente paso..."
                        oninput="evtCheckSaveEnabled()"></textarea>
                    <button id="evt-save-all-btn" class="hsp-form-save-btn" disabled
                        onclick="saveEventoAll('${r.airtable_id}')">
                        <ion-icon name="save-outline"></ion-icon> Guardar
                    </button>
                </div>
            </div>

            ${hasHistory ? `
            <div class="hsp-modal-right">
                <h4 class="hsp-section-title">Historial de Seguimiento</h4>
                <div class="hsp-timeline-scroll">${timelineHtml}</div>
            </div>` : ''}
        </div>`;

    modal.classList.remove('hidden');
}

function closeEventoDetail() {
    const modal = document.getElementById('eventos-detail-modal');
    if (modal) modal.classList.add('hidden');
}

function evtCheckSaveEnabled() {
    const btn = document.getElementById('evt-save-all-btn');
    if (!btn) return;
    const dd = document.getElementById('evt-status-dropdown');
    const txt = document.getElementById('evt-interaction-result');
    btn.disabled = !((dd && dd.value !== dd.dataset.original) || (txt && txt.value.trim().length > 0));
}

async function saveEventoAll(airtableRecordId) {
    const btn = document.getElementById('evt-save-all-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon> Guardando...'; }

    const dd = document.getElementById('evt-status-dropdown');
    const tipoEl = document.getElementById('evt-interaction-type');
    const txtEl = document.getElementById('evt-interaction-result');

    const newStatus = dd ? dd.value : null;
    const originalStatus = dd ? dd.dataset.original : null;
    const statusChanged = newStatus && newStatus !== originalStatus;
    const tipo = tipoEl ? tipoEl.value : 'nota';
    const resultado = txtEl ? txtEl.value.trim() : '';

    const session = typeof getSession === 'function' ? getSession() : null;
    const userName = session ? session.name : 'Desconocido';
    const userId = session ? session.id : null;

    try {
        if (statusChanged) {
            const { apiKey, baseId, tableName } = state.eventosConfig;
            const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${airtableRecordId}`;
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: { 'Estado': newStatus } })
            });
            if (!response.ok) throw new Error(`Airtable PATCH ${response.status}`);

            const lead = state.eventosLeads.find(r => r.airtable_id === airtableRecordId);
            if (lead) lead.estado = newStatus;

            // Auto-register venta
            if (newStatus === 'Venta' && originalStatus !== 'Venta' && lead) {
                await supabase.from('ventas').insert([{
                    client_slug: state.clientId,
                    monto: lead.total_estimado || 0,
                    fecha: new Date().toISOString().split('T')[0],
                    descripcion: `Evento vendido: ${lead.nombre} - ${lead.tipo_evento || ''} ${lead.pax || ''} pax`,
                    registrado_por: userName
                }]);
                if (typeof refreshVentasDashboard === 'function') await refreshVentasDashboard();
            }
        }

        const logText = resultado
            ? (statusChanged ? `[${originalStatus} → ${newStatus}] ${resultado}` : resultado)
            : (statusChanged ? `Estatus cambiado: ${originalStatus} → ${newStatus}` : '');

        if (logText) {
            await supabase.from('event_interacciones').insert([{
                client_slug: state.clientId,
                airtable_record_id: airtableRecordId,
                tipo: resultado ? tipo : 'nota',
                resultado: logText,
                vendedor_nombre: userName,
                vendedor_id: userId
            }]);
        }

        renderEventosPanel();
        showToast('Cambios guardados', 'success');

        const lead = state.eventosLeads.find(r => r.airtable_id === airtableRecordId);
        if (lead) openEventoDetail(state.eventosLeads.indexOf(lead));
    } catch (err) {
        console.error('Eventos: saveAll failed:', err);
        showToast('Error al guardar', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<ion-icon name="save-outline"></ion-icon> Guardar'; }
    }
}

function openEventosPipeline() {
    const dashboardGrid = document.querySelector('.dashboard-grid');
    const eventosPanel = document.getElementById('eventos-panel');
    const pipelineCta = document.getElementById('eventos-pipeline-cta');
    if (dashboardGrid) dashboardGrid.classList.add('hidden');
    if (pipelineCta) pipelineCta.classList.add('hidden');
    if (eventosPanel) {
        eventosPanel.classList.remove('hidden');
        renderEventosPanel();
    }
}

function closeEventosPipeline() {
    const dashboardGrid = document.querySelector('.dashboard-grid');
    const eventosPanel = document.getElementById('eventos-panel');
    const pipelineCta = document.getElementById('eventos-pipeline-cta');
    if (dashboardGrid) dashboardGrid.classList.remove('hidden');
    if (eventosPanel) eventosPanel.classList.add('hidden');
    if (pipelineCta) pipelineCta.classList.remove('hidden');
}

function filterEventos(tab) {
    state.eventosFilters.status = tab;
    if (tab === 'calendario') { state.eventosCalendarWeekOffset = 0; state.eventosCalendarView = 'week'; }
    renderEventosPanel();
}

function searchEventos(query) {
    state.eventosFilters.search = query;
    renderEventosPanel();
    // Restore focus to search input after re-render
    const input = document.querySelector('#eventos-panel .hsp-search');
    if (input) { input.focus(); input.selectionStart = input.selectionEnd = input.value.length; }
}

// Expose eventos functions globally
window.fetchEventosLeads = fetchEventosLeads;
window.openEventoDetail = openEventoDetail;
window.closeEventoDetail = closeEventoDetail;
window.evtCheckSaveEnabled = evtCheckSaveEnabled;
window.saveEventoAll = saveEventoAll;
window.filterEventos = filterEventos;
window.searchEventos = searchEventos;
window.evtCalendarNav = evtCalendarNav;
window.evtCalendarView = evtCalendarView;
window.openEventosPipeline = openEventosPipeline;
window.closeEventosPipeline = closeEventosPipeline;

// =============================================
// END: Panel de Eventos CRM
// =============================================

/* ============================================================
   MOBILE DASHBOARD — MD3 Dark Glass
   ============================================================ */
let _mobChartInstance = null;

function renderMobileDashboard() {
    if (window.innerWidth > 480) return;

    // Date
    const dateEl = document.getElementById('mob-date');
    if (dateEl) {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    }

    // Name + avatar + greeting
    const _sess = typeof getSession === 'function' ? getSession() : null;
    const fullName = (_sess && _sess.name) ? _sess.name : (state.config.clientName || 'Admin');
    const firstName = fullName.split(' ')[0];
    const nameEl = document.getElementById('mob-name');
    const avatarEl = document.getElementById('mob-avatar');
    if (nameEl) nameEl.textContent = firstName;
    if (avatarEl) avatarEl.textContent = firstName.charAt(0).toUpperCase();

    const greetEl = document.getElementById('mob-greeting');
    if (greetEl) {
        const h = new Date().getHours();
        const saludo = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
        greetEl.textContent = `${saludo}, ${firstName}`;
    }

    // Client chip
    const chipEl = document.getElementById('mob-client-chip');
    if (chipEl) chipEl.textContent = state.config.clientName || 'Sistema activo';

    // Theme icon sync
    const themeIcon = document.getElementById('mob-theme-icon');
    if (themeIcon) {
        const t = document.documentElement.getAttribute('data-theme') || 'dark';
        themeIcon.setAttribute('name', t === 'light' ? 'sunny-outline' : 'moon-outline');
    }

    // Range label
    const rangeEl = document.getElementById('mob-range-label');
    if (rangeEl) {
        const desktopRange = document.getElementById('current-range-label');
        const txt = desktopRange ? desktopRange.textContent : 'Todo el tiempo';
        const span = rangeEl.querySelector('span');
        if (span) span.textContent = txt;
        else rangeEl.textContent = txt;
    }

    // KPI cards
    const kpiDefs = [
        { valueId: 'card-1-value', labelId: 'label-main-1', accent: '#FCD34D', icon: 'ribbon-outline' },
        { valueId: 'card-2-value', labelId: 'label-main-2', accent: '#A78BFA', icon: 'swap-vertical-outline' },
        { valueId: 'card-3-value', labelId: 'label-main-3', accent: '#93C5FD', icon: 'cash-outline' },
        { valueId: 'card-4-value', labelId: 'label-main-4', accent: '#F8B4C8', icon: 'rocket-outline' },
        { valueId: 'card-5-value', labelId: 'label-main-5', accent: '#FCD34D', icon: 'people-outline' },
        { valueId: 'card-6-value', labelId: 'label-main-6', accent: '#F8B4C8', icon: 'wallet-outline' },
        { valueId: 'card-7-value', labelId: 'label-main-7', accent: '#93C5FD', icon: 'pricetag-outline' },
    ];

    const kpiScroll = document.getElementById('mob-kpi-scroll');
    if (kpiScroll) {
        kpiScroll.innerHTML = kpiDefs.map(k => {
            const value = document.getElementById(k.valueId)?.textContent || '--';
            const label = document.getElementById(k.labelId)?.textContent || '';
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            const [r, g, b] = [k.accent.slice(1,3), k.accent.slice(3,5), k.accent.slice(5,7)].map(h => parseInt(h, 16));
            const cardBg = isLight ? `rgba(255,255,255,0.7)` : `rgba(${r},${g},${b},0.08)`;
            const cardBorder = isLight ? `rgba(${r},${g},${b},0.15)` : `rgba(${r},${g},${b},0.18)`;
            const cardShadow = isLight ? `0 4px 16px rgba(15,23,42,0.06)` : `0 8px 32px rgba(0,0,0,0.3)`;
            const iconBg = isLight ? `rgba(${r},${g},${b},0.1)` : `rgba(${r},${g},${b},0.15)`;
            const iconShadow = isLight ? `none` : `0 0 16px rgba(${r},${g},${b},0.3)`;
            return `<div class="mob-kpi-card" style="background:${cardBg};border:1px solid ${cardBorder};box-shadow:${cardShadow};">
                <div class="mob-kpi-icon" style="background:${iconBg};border-color:rgba(${r},${g},${b},0.25);box-shadow:${iconShadow};">
                    <ion-icon name="${k.icon}" style="color:${k.accent};font-size:1.1rem;"></ion-icon>
                </div>
                <div class="mob-kpi-label">${label}</div>
                <div class="mob-kpi-value">${value}</div>
                <div class="mob-kpi-badge" style="background:rgba(${r},${g},${b},0.12);border-color:rgba(${r},${g},${b},0.22);color:${k.accent};">
                    <ion-icon name="trending-up-outline" style="font-size:10px;"></ion-icon> Actual
                </div>
            </div>`;
        }).join('');
    }

    // Leads list (show last 6 qualified)
    const leadsList = document.getElementById('mob-leads-list');
    if (leadsList) {
        const qualified = state.filteredLeads.filter(l => typeof isQualified === 'function' ? isQualified(l.estatus) : true);
        const recent = qualified.slice(-6).reverse();
        if (recent.length === 0) {
            const emptyColor = document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(15,23,42,0.3)' : 'rgba(255,255,255,0.3)';
            leadsList.innerHTML = `<p style="color:${emptyColor};font-size:13px;text-align:center;padding:12px 0;">Sin leads recientes</p>`;
        } else {
            leadsList.innerHTML = recent.map(l => {
                const name = l.nombre || l.name || `Lead #${l.id || ''}`;
                const fecha = l.fecha_parsed instanceof Date && !isNaN(l.fecha_parsed)
                    ? l.fecha_parsed.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                    : (l.fecha ? l.fecha.slice(0, 10) : '--');
                return `<div class="mob-lead-item">
                    <div class="mob-lead-icon"><ion-icon name="person-outline"></ion-icon></div>
                    <span class="mob-lead-name">${name}</span>
                    <span class="mob-lead-date">${fecha}</span>
                </div>`;
            }).join('');
        }
    }

    // Mobile chart
    _renderMobileChart();
}

function _renderMobileChart() {
    const canvas = document.getElementById('mob-main-chart');
    if (!canvas) return;
    if (_mobChartInstance) { _mobChartInstance.destroy(); _mobChartInstance = null; }

    // Build daily data same way as main chart
    const sourceLeads = state.filteredLeads.filter(l => typeof isQualified === 'function' ? isQualified(l.estatus) : true);
    const dailyData = {};
    sourceLeads.forEach(l => {
        if (!l.fecha_parsed || isNaN(l.fecha_parsed.getTime())) return;
        const key = l.fecha_parsed.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
        dailyData[key] = (dailyData[key] || 0) + 1;
    });

    let labels = Object.keys(dailyData);
    let values = Object.values(dailyData);
    if (labels.length === 0) { labels = ['--']; values = [0]; }

    const ctx = canvas.getContext('2d');
    _mobChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: values,
                borderColor: '#A78BFA',
                borderWidth: 2.5,
                fill: true,
                backgroundColor: (context) => {
                    const chart = context.chart;
                    const { ctx: c, chartArea } = chart;
                    if (!chartArea) return 'rgba(167,139,250,0.1)';
                    const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    grad.addColorStop(0, 'rgba(167,139,250,0.38)');
                    grad.addColorStop(1, 'rgba(167,139,250,0)');
                    return grad;
                },
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#A78BFA',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(13,11,30,0.92)',
                    borderColor: 'rgba(167,139,250,0.2)',
                    borderWidth: 1,
                    titleColor: '#A78BFA',
                    bodyColor: 'rgba(255,255,255,0.9)',
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 9 } }, border: { display: false } },
                y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 9 } }, border: { display: false } }
            }
        }
    });
}

// Tab bar active state
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.mob-tab').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.mob-tab').forEach(function(t) { t.classList.remove('mob-tab-active'); });
            btn.classList.add('mob-tab-active');
        });
    });
});


// ============================================================
// REST-MOBILE — UX dedicada para clientes restaurante en mobile
// Activa cuando body[data-mobile-mode="restaurant"] y viewport ≤ 480px.
// Reusa state, fetchRestaurantReservations, confirmReservation, etc.
// ============================================================

state.restMobile = state.restMobile || {
    activeTab: 'pendientes',
    monthAnchor: null,
    selectedIdx: null,
    dateFilter: null
};

function isRestMobileActive() {
    return document.body.dataset.mobileMode === 'restaurant';
}

function todayKeyMx() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateLong(d) {
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

function renderRestMobile() {
    if (!isRestMobileActive()) return;
    renderRestMobileHeader();
    renderRestMobileAforo();
    renderRestMobileBanner();
    renderRestMobileTabs();
    renderRestMobileList();
}

function renderRestMobileHeader() {
    const dateEl = document.getElementById('restm-date');
    if (dateEl) {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    const clientEl = document.getElementById('restm-client');
    if (clientEl && state.config && state.config.clientName) {
        clientEl.textContent = state.config.clientName;
    }
    const themeIcon = document.getElementById('restm-theme-icon');
    if (themeIcon) {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        themeIcon.setAttribute('name', isLight ? 'sunny-outline' : 'moon-outline');
    }
}

function renderRestMobileAforo() {
    const all = state.restaurantReservations || [];
    const todayK = todayKeyMx();
    const todays = all.filter(r => {
        const d = r.fecha_parsed || parseFechaEvento(r.fechaEvento);
        return d && dateKey(d) === todayK;
    });
    const active = todays.filter(r => r.estado !== 'Rechazado');
    const confirmed = todays.filter(r => r.estado === 'Confirmado').length;
    const pending = todays.filter(r => r.estado === 'Nuevo Lead').length;
    const paxUsed = active.reduce((sum, r) => sum + (parseInt(r.pax) || 0), 0);
    const dailyCap = state.restaurantAvailability && state.restaurantAvailability.dailyCapacity
        ? parseInt(state.restaurantAvailability.dailyCapacity) : null;

    const usedEl = document.getElementById('restm-aforo-used');
    const totalEl = document.getElementById('restm-aforo-total');
    const metaEl = document.getElementById('restm-aforo-meta');
    const ringEl = document.getElementById('restm-aforo-ring');
    const pctEl = document.getElementById('restm-aforo-pct');

    if (usedEl) usedEl.textContent = paxUsed;
    if (totalEl) totalEl.textContent = dailyCap || '∞';
    if (metaEl) {
        if (todays.length === 0) {
            metaEl.textContent = 'Sin reservas hoy';
        } else {
            const parts = [];
            if (confirmed) parts.push(`${confirmed} confirmadas`);
            if (pending) parts.push(`${pending} pendientes`);
            metaEl.textContent = parts.join(' · ') || 'Sin reservas hoy';
        }
    }
    if (ringEl && pctEl) {
        let pct = 0;
        if (dailyCap && dailyCap > 0) pct = Math.min(100, Math.round((paxUsed / dailyCap) * 100));
        ringEl.style.setProperty('--pct', pct + '%');
        ringEl.style.background = `conic-gradient(${pct >= 90 ? '#F87171' : pct >= 70 ? '#FBBF24' : '#A78BFA'} ${pct}%, rgba(255,255,255,0.08) 0)`;
        pctEl.textContent = pct + '%';
    }
}

function renderRestMobileBanner() {
    const banner = document.getElementById('restm-banner');
    if (!banner) return;
    const av = state.restaurantAvailability || {};
    const todayK = todayKeyMx();
    const closed = Array.isArray(av.closedDates) ? av.closedDates : [];
    const isClosedToday = closed.includes(todayK);
    const accepting = av.accepting !== false;

    let html = '';
    let cls = '';
    if (!accepting) {
        cls = 'danger';
        html = `<ion-icon name="alert-circle-outline"></ion-icon><span><strong>No estamos aceptando reservas.</strong> Reactiva en Disponibilidad.</span>`;
    } else if (isClosedToday) {
        cls = 'danger';
        html = `<ion-icon name="lock-closed-outline"></ion-icon><span><strong>Hoy está cerrado.</strong> No se reciben reservas para la fecha de hoy.</span>`;
    } else {
        const dailyCap = av.dailyCapacity ? parseInt(av.dailyCapacity) : null;
        if (dailyCap) {
            const all = state.restaurantReservations || [];
            const todays = all.filter(r => {
                const d = r.fecha_parsed || parseFechaEvento(r.fechaEvento);
                return d && dateKey(d) === todayK && r.estado !== 'Rechazado';
            });
            const paxUsed = todays.reduce((sum, r) => sum + (parseInt(r.pax) || 0), 0);
            if (paxUsed >= dailyCap) {
                cls = 'danger';
                html = `<ion-icon name="people-outline"></ion-icon><span><strong>Aforo lleno hoy.</strong> ${paxUsed}/${dailyCap} pax confirmados o pendientes.</span>`;
            } else if (paxUsed / dailyCap >= 0.8) {
                cls = '';
                html = `<ion-icon name="warning-outline"></ion-icon><span>Quedan pocos lugares hoy: ${dailyCap - paxUsed} de ${dailyCap}.</span>`;
            }
        }
    }

    if (html) {
        banner.className = 'restm-banner ' + cls;
        banner.innerHTML = html;
    } else {
        banner.className = 'restm-banner hidden';
        banner.innerHTML = '';
    }
}

function getRestMobileFilteredReservations() {
    const all = state.restaurantReservations || [];
    const todayK = todayKeyMx();
    const tab = state.restMobile.activeTab;
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
    const dateFilter = state.restMobile.dateFilter;

    // Cuando hay filtro de fecha activo, ignoramos los tabs y mostramos solo
    // las reservas de ese día (todos los estados).
    if (dateFilter) {
        return all.filter(r => {
            const d = r.fecha_parsed || parseFechaEvento(r.fechaEvento);
            return d && dateKey(d) === dateFilter;
        });
    }

    return all.filter(r => {
        const d = r.fecha_parsed || parseFechaEvento(r.fechaEvento);
        const dKey = d ? dateKey(d) : null;
        const isUpcoming = !d || (() => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x >= todayDate; })();
        if (tab === 'pendientes') return r.estado === 'Nuevo Lead' && isUpcoming;
        if (tab === 'hoy') return dKey === todayK;
        if (tab === 'proximas') return r.estado === 'Confirmado' && isUpcoming;
        return true;
    });
}

function renderRestMobileTabs() {
    const all = state.restaurantReservations || [];
    const todayK = todayKeyMx();
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);

    const counts = { pendientes: 0, hoy: 0, proximas: 0 };
    all.forEach(r => {
        const d = r.fecha_parsed || parseFechaEvento(r.fechaEvento);
        const dKey = d ? dateKey(d) : null;
        const isUpcoming = !d || (() => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x >= todayDate; })();
        if (r.estado === 'Nuevo Lead' && isUpcoming) counts.pendientes++;
        if (dKey === todayK) counts.hoy++;
        if (r.estado === 'Confirmado' && isUpcoming) counts.proximas++;
    });
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText('restm-count-pendientes', counts.pendientes);
    setText('restm-count-hoy', counts.hoy);
    setText('restm-count-proximas', counts.proximas);

    document.querySelectorAll('.restm-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === state.restMobile.activeTab);
    });
}

function restMobileSetTab(tab) {
    state.restMobile.activeTab = tab;
    state.restMobile.dateFilter = null;
    renderRestMobileTabs();
    renderRestMobileList();
}

function restMobileClearDateFilter() {
    state.restMobile.dateFilter = null;
    renderRestMobile();
}

function renderRestMobileList() {
    const list = document.getElementById('restm-list');
    if (!list) return;

    const filtered = getRestMobileFilteredReservations();
    const todayK = todayKeyMx();
    const dateFilter = state.restMobile.dateFilter;

    // Chip de filtro activo (cuando se saltó a una fecha desde el calendario)
    let filterChipHtml = '';
    if (dateFilter) {
        const fDate = new Date(dateFilter + 'T00:00:00');
        const fLabel = fDate.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'long' });
        filterChipHtml = `<button class="restm-filter-chip" onclick="restMobileClearDateFilter()">
            <ion-icon name="calendar-outline"></ion-icon>
            <span>${escapeHtml(fLabel)}</span>
            <ion-icon name="close-outline" class="restm-filter-chip-x"></ion-icon>
        </button>`;
    }

    if (filtered.length === 0) {
        const tab = state.restMobile.activeTab;
        let empty;
        if (dateFilter) {
            const fDate = new Date(dateFilter + 'T00:00:00');
            const fLabel = fDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
            empty = { icon: 'calendar-clear-outline', title: 'Sin reservas este día', sub: `No hay reservas para ${fLabel}.` };
        } else {
            const emptyByTab = {
                pendientes: { icon: 'checkmark-done-outline', title: 'Todo al día ✨', sub: 'No hay reservas pendientes por responder.' },
                hoy: { icon: 'restaurant-outline', title: 'Sin reservas hoy', sub: 'Cuando lleguen reservas para hoy las verás aquí.' },
                proximas: { icon: 'calendar-clear-outline', title: 'Sin próximas', sub: 'Todavía no hay reservas confirmadas a futuro.' }
            };
            empty = emptyByTab[tab] || emptyByTab.pendientes;
        }
        list.innerHTML = filterChipHtml + `<div class="restm-empty">
            <ion-icon name="${empty.icon}"></ion-icon>
            <div class="restm-empty-title">${escapeHtml(empty.title)}</div>
            <div class="restm-empty-sub">${escapeHtml(empty.sub)}</div>
        </div>`;
        return;
    }

    // Sort: today first, future ASC, past at bottom
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
    filtered.sort((a, b) => {
        const aD = a.fecha_parsed ? new Date(a.fecha_parsed) : new Date(0);
        const bD = b.fecha_parsed ? new Date(b.fecha_parsed) : new Date(0);
        aD.setHours(0, 0, 0, 0); bD.setHours(0, 0, 0, 0);
        const aPast = aD < todayDate, bPast = bD < todayDate;
        if (!aPast && bPast) return -1;
        if (aPast && !bPast) return 1;
        if (aD.getTime() === bD.getTime()) {
            return (a.horaEvento || '').localeCompare(b.horaEvento || '');
        }
        return aPast ? bD - aD : aD - bD;
    });

    // Group by day
    const groups = new Map();
    filtered.forEach(r => {
        const d = r.fecha_parsed || parseFechaEvento(r.fechaEvento);
        const k = d ? dateKey(d) : 'sin-fecha';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
    });

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const tomorrow = new Date(todayDate); tomorrow.setDate(tomorrow.getDate() + 1);

    const groupLabel = (k) => {
        if (k === 'sin-fecha') return 'Sin fecha';
        const d = new Date(k + 'T00:00:00');
        const day = new Date(d); day.setHours(0, 0, 0, 0);
        if (day.getTime() === todayDate.getTime()) return 'Hoy';
        if (day.getTime() === tomorrow.getTime()) return 'Mañana';
        return `${dayNames[d.getDay()]} ${d.getDate()} ${monthShort[d.getMonth()]}`;
    };

    let html = filterChipHtml;
    groups.forEach((items, k) => {
        const isToday = k === todayK;
        html += `<div class="restm-day-label ${isToday ? 'is-today' : ''}">${escapeHtml(groupLabel(k))}</div>`;
        items.forEach(r => {
            const idx = state.restaurantReservations.indexOf(r);
            html += renderRestMobileCard(r, idx);
        });
    });

    list.innerHTML = html;
    attachRestMobileSwipeHandlers();
}

function renderRestMobileCard(r, idx) {
    const time = r.horaEvento ? formatTime(r.horaEvento) : '—';
    const [hh, mm] = (time || '').split(':');
    const stateCls = r.estado === 'Confirmado' ? 'confirmed' : (r.estado === 'Rechazado' ? 'rejected' : '');
    const tipo = r.tipoEvento || 'Reserva';
    const pax = parseInt(r.pax) || 0;
    return `<div class="restm-card-wrap">
        <div class="restm-card-actions">
            <div class="restm-card-action confirm"><ion-icon name="checkmark-outline"></ion-icon><span>Confirmar</span></div>
            <div class="restm-card-action reject"><span>Rechazar</span><ion-icon name="close-outline"></ion-icon></div>
        </div>
        <div class="restm-card" data-idx="${idx}" onclick="openRestMobileSheet(${idx})">
            <div class="restm-card-time">
                <div class="restm-card-time-h">${hh && hh !== '—' ? hh : '—'}</div>
                <div class="restm-card-time-m">${mm || ''}</div>
            </div>
            <div class="restm-card-info">
                <div class="restm-card-name">${escapeHtml(r.nombre || 'Sin nombre')}</div>
                <div class="restm-card-meta">
                    <span><strong>${pax}</strong> pax</span>
                    <span class="restm-card-dot"></span>
                    <span>${escapeHtml(tipo)}</span>
                </div>
            </div>
            <div class="restm-card-state ${stateCls}"></div>
        </div>
    </div>`;
}

// Swipe gestures: swipe right → confirmar, swipe left → rechazar
function attachRestMobileSwipeHandlers() {
    const cards = document.querySelectorAll('#restm-list .restm-card');
    cards.forEach(card => {
        if (card.dataset.swipeBound === '1') return;
        card.dataset.swipeBound = '1';
        const wrap = card.closest('.restm-card-wrap');

        let startX = 0, startY = 0, currentX = 0, dragging = false, locked = null;
        const threshold = 80;

        const clearSwipeClasses = () => {
            if (!wrap) return;
            wrap.classList.remove('is-swiping-right', 'is-swiping-left');
        };

        card.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            currentX = 0;
            dragging = true;
            locked = null;
            card.classList.add('is-swiping');
        }, { passive: true });

        card.addEventListener('touchmove', e => {
            if (!dragging) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (locked === null) {
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                    locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
                }
            }
            if (locked !== 'x') return;
            currentX = dx;
            card.style.transform = `translateX(${dx}px)`;
            if (wrap) {
                if (dx > 8) {
                    wrap.classList.add('is-swiping-right');
                    wrap.classList.remove('is-swiping-left');
                } else if (dx < -8) {
                    wrap.classList.add('is-swiping-left');
                    wrap.classList.remove('is-swiping-right');
                } else {
                    clearSwipeClasses();
                }
            }
        }, { passive: true });

        card.addEventListener('touchend', () => {
            if (!dragging) return;
            dragging = false;
            card.classList.remove('is-swiping');
            const dx = currentX;
            if (Math.abs(dx) >= threshold && locked === 'x') {
                const idx = parseInt(card.dataset.idx);
                if (dx > 0) {
                    card.style.transform = 'translateX(110%)';
                    setTimeout(() => { card.style.transform = ''; clearSwipeClasses(); restMobileQuickConfirm(idx); }, 220);
                } else {
                    card.style.transform = 'translateX(-110%)';
                    setTimeout(() => { card.style.transform = ''; clearSwipeClasses(); restMobileQuickReject(idx); }, 220);
                }
            } else {
                card.style.transform = '';
                clearSwipeClasses();
            }
        });

        card.addEventListener('touchcancel', () => {
            dragging = false;
            card.classList.remove('is-swiping');
            card.style.transform = '';
            clearSwipeClasses();
        });
    });
}

function restMobileQuickConfirm(idx) { confirmReservation(idx); }
function restMobileQuickReject(idx) { rejectReservation(idx); }

// Refresh
function restMobileRefresh() {
    const icon = document.getElementById('restm-sync-icon');
    if (icon) icon.classList.add('spinning');
    Promise.resolve(fetchRestaurantReservations()).finally(() => {
        setTimeout(() => { if (icon) icon.classList.remove('spinning'); }, 400);
    });
}

// ============================================================
// Bottom sheet — detalle de reserva
// ============================================================
function openRestMobileSheet(idx) {
    const r = state.restaurantReservations[idx];
    if (!r) return;
    state.restMobile.selectedIdx = idx;
    const content = document.getElementById('restm-sheet-content');
    if (!content) return;

    const fechaTxt = formatReservationDate(r);
    const time = r.horaEvento ? formatTime(r.horaEvento) : null;
    const stateCls = r.estado === 'Confirmado' ? 'success' : (r.estado === 'Rechazado' ? 'danger' : 'warn');
    const stateIcon = r.estado === 'Confirmado' ? 'checkmark-circle-outline' : (r.estado === 'Rechazado' ? 'close-circle-outline' : 'time-outline');
    const isResolved = r.estado === 'Confirmado' || r.estado === 'Rechazado';

    const tel = (r.telefono || '').replace(/[^\d+]/g, '');
    const waLink = tel ? `https://wa.me/${tel.replace(/^\+/, '')}` : null;
    const callLink = tel ? `tel:${tel}` : null;

    content.innerHTML = `
        <div class="restm-detail-head">
            <div class="restm-detail-name">${escapeHtml(r.nombre || 'Sin nombre')}</div>
            <div class="restm-detail-meta">
                <span class="restm-pill ${stateCls}"><ion-icon name="${stateIcon}"></ion-icon>${escapeHtml(r.estado || 'Nuevo Lead')}</span>
                <span class="restm-pill"><ion-icon name="calendar-outline"></ion-icon>${escapeHtml(fechaTxt)}</span>
                ${time ? `<span class="restm-pill"><ion-icon name="time-outline"></ion-icon>${escapeHtml(time)}</span>` : ''}
                <span class="restm-pill"><ion-icon name="people-outline"></ion-icon>${parseInt(r.pax) || 0} pax</span>
                ${r.tipoEvento ? `<span class="restm-pill"><ion-icon name="pricetag-outline"></ion-icon>${escapeHtml(r.tipoEvento)}</span>` : ''}
            </div>
        </div>

        <div class="restm-channels">
            <a class="restm-channel call ${callLink ? '' : 'disabled'}" ${callLink ? `href="${callLink}"` : ''}>
                <ion-icon name="call-outline"></ion-icon><span>Llamar</span>
            </a>
            <a class="restm-channel whatsapp ${waLink ? '' : 'disabled'}" ${waLink ? `href="${waLink}" target="_blank" rel="noopener"` : ''}>
                <ion-icon name="logo-whatsapp"></ion-icon><span>WhatsApp</span>
            </a>
        </div>

        ${r.detalles ? `<div class="restm-section">
            <h4>Detalles</h4>
            <div class="restm-detail-text">${escapeHtml(r.detalles)}</div>
        </div>` : ''}

        ${r.conversacion ? `<div class="restm-section">
            <h4>Conversación</h4>
            <div class="restm-detail-text">${escapeHtml(r.conversacion)}</div>
        </div>` : ''}

        <div class="restm-actions-row">
            <button class="restm-action-btn reject" ${isResolved ? 'disabled' : ''} onclick="closeRestMobileSheet(); rejectReservation(${idx});">
                <ion-icon name="close-outline"></ion-icon> Rechazar
            </button>
            <button class="restm-action-btn confirm" ${isResolved ? 'disabled' : ''} onclick="closeRestMobileSheet(); confirmReservation(${idx});">
                <ion-icon name="checkmark-outline"></ion-icon> Confirmar
            </button>
        </div>
    `;

    const sheet = document.getElementById('restm-sheet');
    if (sheet) sheet.dataset.active = 'true';
}

function closeRestMobileSheet() {
    const sheet = document.getElementById('restm-sheet');
    if (sheet) sheet.dataset.active = 'false';
    state.restMobile.selectedIdx = null;
}

// ============================================================
// Bottom sheet — calendario mensual
// ============================================================
function openRestMobileMonthSheet() {
    if (!state.restMobile.monthAnchor) {
        const now = new Date();
        state.restMobile.monthAnchor = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    renderRestMobileMonthSheet();
    const sheet = document.getElementById('restm-month-sheet');
    if (sheet) sheet.dataset.active = 'true';
}

function closeRestMobileMonthSheet() {
    const sheet = document.getElementById('restm-month-sheet');
    if (sheet) sheet.dataset.active = 'false';
}

function restMobileMonthShift(delta) {
    const a = state.restMobile.monthAnchor || new Date();
    state.restMobile.monthAnchor = new Date(a.getFullYear(), a.getMonth() + delta, 1);
    renderRestMobileMonthSheet();
}

function renderRestMobileMonthSheet() {
    const cont = document.getElementById('restm-month-sheet-content');
    if (!cont) return;
    const anchor = state.restMobile.monthAnchor;
    const year = anchor.getFullYear(), month = anchor.getMonth();
    const monthLabel = anchor.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

    const buckets = {};
    (state.restaurantReservations || []).forEach(res => {
        if (res.estado === 'Rechazado') return;
        const d = res.fecha_parsed || parseFechaEvento(res.fechaEvento);
        if (!d || d.getFullYear() !== year || d.getMonth() !== month) return;
        const k = dateKey(d);
        buckets[k] = (buckets[k] || 0) + (parseInt(res.pax) || 0);
    });

    const dailyCap = state.restaurantAvailability && state.restaurantAvailability.dailyCapacity
        ? parseInt(state.restaurantAvailability.dailyCapacity) : null;
    const maxVal = Math.max(1, ...Object.values(buckets));
    const ref = dailyCap || maxVal;
    const lvl = (v) => {
        if (!v) return 0;
        const r = v / ref;
        if (r >= 0.85) return 4;
        if (r >= 0.6) return 3;
        if (r >= 0.35) return 2;
        return 1;
    };

    const closed = (state.restaurantAvailability && state.restaurantAvailability.closedDates) || [];
    const todayK = todayKeyMx();
    const dows = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const firstOfMonth = new Date(year, month, 1);
    const startBlank = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let cells = '';
    dows.forEach(d => cells += `<div class="restm-month-dow">${d}</div>`);
    for (let i = 0; i < startBlank; i++) cells += `<div class="restm-month-cell empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const k = dateKey(d);
        const v = buckets[k] || 0;
        const cls = ['restm-month-cell', `lvl${lvl(v)}`];
        if (k === todayK) cls.push('is-today');
        if (closed.includes(k)) cls.push('is-closed');
        cells += `<button class="${cls.join(' ')}" onclick="restMobileJumpToDate('${k}')">${day}</button>`;
    }

    cont.innerHTML = `
        <div class="restm-month-head">
            <button class="restm-month-nav" onclick="restMobileMonthShift(-1)"><ion-icon name="chevron-back-outline"></ion-icon></button>
            <div class="restm-month-title">${escapeHtml(monthLabel)}</div>
            <button class="restm-month-nav" onclick="restMobileMonthShift(1)"><ion-icon name="chevron-forward-outline"></ion-icon></button>
        </div>
        <div class="restm-month-grid">${cells}</div>
        <div class="restm-month-legend">
            <span class="restm-month-legend-dot" style="background:rgba(167,139,250,0.18);"></span><span>Pocas</span>
            <span class="restm-month-legend-dot" style="background:rgba(167,139,250,0.55);margin-left:6px;"></span><span>Llenándose</span>
            <span class="restm-month-legend-dot" style="background:rgba(167,139,250,0.85);margin-left:6px;"></span><span>Casi lleno</span>
            <span class="restm-month-legend-dot" style="background:rgba(239,68,68,0.4);margin-left:6px;"></span><span>Cerrado</span>
        </div>
    `;
}

function restMobileJumpToDate(key) {
    closeRestMobileMonthSheet();
    state.restMobile.dateFilter = key;
    setTimeout(() => {
        renderRestMobile();
        const wrap = document.querySelector('.restm-list-wrap');
        if (wrap) wrap.scrollTo({ top: 0, behavior: 'smooth' });
    }, 220);
}

// ============================================================
// Bottom sheet — disponibilidad
// ============================================================
function openRestMobileAforoSheet() {
    renderRestMobileAforoSheet();
    const sheet = document.getElementById('restm-month-sheet');
    // Reuse the month sheet container by repurposing its content? No — we
    // use its own sheet element. Open a dedicated availability sheet via the
    // menu sheet container? Cleaner: open a fresh sheet using #restm-sheet
    // momentarily. Simpler: render into restm-sheet-content with an availability layout.
    const main = document.getElementById('restm-sheet-content');
    const mainSheet = document.getElementById('restm-sheet');
    if (!main || !mainSheet) return;
    main.innerHTML = renderRestMobileAforoHTML();
    mainSheet.dataset.active = 'true';
    mainSheet.dataset.kind = 'availability';
    bindRestMobileAforoEvents();
}

function renderRestMobileAforoHTML() {
    const av = state.restaurantAvailability || { accepting: true, closedDates: [], dailyCapacity: null };
    const accepting = av.accepting !== false;
    const cap = av.dailyCapacity || '';
    const closed = Array.isArray(av.closedDates) ? [...av.closedDates].sort() : [];
    return `
        <h3 class="restm-sheet-title">Disponibilidad</h3>
        <div class="restm-avail-row">
            <div class="restm-avail-info">
                <div class="restm-avail-label">Aceptar reservas</div>
                <div class="restm-avail-sub">Si lo apagas, el agente IA dirá que no hay disponibilidad.</div>
            </div>
            <label class="restm-toggle">
                <input type="checkbox" id="restm-av-toggle" ${accepting ? 'checked' : ''}>
                <span class="restm-toggle-track"><span class="restm-toggle-thumb"></span></span>
            </label>
        </div>
        <div class="restm-avail-row">
            <div class="restm-avail-info">
                <div class="restm-avail-label">Aforo diario</div>
                <div class="restm-avail-sub">Pax máximos por día. Vacío = sin límite.</div>
            </div>
            <input type="number" min="1" placeholder="∞" value="${cap}" class="restm-input" id="restm-av-cap">
        </div>
        <div class="restm-section">
            <h4>Fechas cerradas</h4>
            <div class="restm-closed-list" id="restm-av-closed">
                ${closed.length ? closed.map(d => `<span class="restm-closed-chip" data-date="${d}">${escapeHtml(new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }))} <ion-icon name="close-outline"></ion-icon></span>`).join('') : '<span style="font-size:12px;opacity:0.5;">Sin fechas cerradas configuradas.</span>'}
            </div>
            <input type="date" id="restm-av-newdate" class="restm-add-date" style="text-align:left;">
        </div>
        <div class="restm-actions-row">
            <button class="restm-action-btn reject" onclick="closeRestMobileSheet();">Cancelar</button>
            <button class="restm-action-btn confirm" id="restm-av-save">Guardar</button>
        </div>
    `;
}

function bindRestMobileAforoEvents() {
    const closedList = document.getElementById('restm-av-closed');
    if (closedList) {
        closedList.querySelectorAll('.restm-closed-chip').forEach(chip => {
            chip.addEventListener('click', () => chip.remove());
        });
    }
    const newDate = document.getElementById('restm-av-newdate');
    if (newDate) {
        newDate.addEventListener('change', () => {
            const v = newDate.value;
            if (!v) return;
            if (closedList && !closedList.querySelector(`[data-date="${v}"]`)) {
                const placeholder = closedList.querySelector('span[style]');
                if (placeholder) placeholder.remove();
                const chip = document.createElement('span');
                chip.className = 'restm-closed-chip';
                chip.dataset.date = v;
                chip.innerHTML = `${new Date(v + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} <ion-icon name="close-outline"></ion-icon>`;
                chip.addEventListener('click', () => chip.remove());
                closedList.appendChild(chip);
            }
            newDate.value = '';
        });
    }
    const saveBtn = document.getElementById('restm-av-save');
    if (saveBtn) saveBtn.addEventListener('click', restMobileSaveAvailability);
}

async function restMobileSaveAvailability() {
    const toggle = document.getElementById('restm-av-toggle');
    const capInput = document.getElementById('restm-av-cap');
    const closedList = document.getElementById('restm-av-closed');
    const accepting = toggle ? toggle.checked : true;
    const capVal = capInput ? parseInt(capInput.value) : NaN;
    const dailyCapacity = isNaN(capVal) || capVal < 1 ? null : capVal;
    const closedDates = closedList ? Array.from(closedList.querySelectorAll('.restm-closed-chip')).map(c => c.dataset.date) : [];

    state.restaurantAvailability = state.restaurantAvailability || {};
    state.restaurantAvailability.accepting = accepting;
    state.restaurantAvailability.closedDates = closedDates;
    state.restaurantAvailability.dailyCapacity = dailyCapacity;

    const saveBtn = document.getElementById('restm-av-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando...'; }

    try {
        const db = window.clientSupabase || window.supabase;
        if (!db) throw new Error('Supabase no inicializado');
        const { error } = await db.from('restaurant_availability').upsert({
            singleton: true,
            accepting_reservations: accepting,
            closed_dates: closedDates,
            daily_capacity: dailyCapacity
        }, { onConflict: 'singleton' });
        if (error) throw error;
        if (typeof showToast === 'function') showToast('Disponibilidad actualizada', 'success');
        closeRestMobileSheet();
        renderRestMobile();
    } catch (e) {
        console.error('Error saving availability:', e);
        if (typeof showToast === 'function') showToast('No se pudo guardar', 'error');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Guardar'; }
    }
}

// ============================================================
// Menu sheet
// ============================================================
function openRestMobileMenuSheet() {
    const sheet = document.getElementById('restm-menu-sheet');
    if (sheet) sheet.dataset.active = 'true';
}
function closeRestMobileMenuSheet() {
    const sheet = document.getElementById('restm-menu-sheet');
    if (sheet) sheet.dataset.active = 'false';
}

// Bottom navigation router
function restMobileBottomNav(view) {
    document.querySelectorAll('.restm-bb-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    if (view === 'calendario') openRestMobileMonthSheet();
    else if (view === 'disponibilidad') openRestMobileAforoSheet();
    else if (view === 'reservas') {
        // already showing
        const list = document.getElementById('restm-list-wrap');
    }
    // Reset to "reservas" after sheet close
    if (view !== 'reservas') {
        setTimeout(() => {
            document.querySelectorAll('.restm-bb-item').forEach(b => b.classList.toggle('active', b.dataset.view === 'reservas'));
        }, 350);
    }
}

// Hook: render rest-mobile after fetching reservations
const _origFetchRest = fetchRestaurantReservations;
window.__restMobileBootstrapped = window.__restMobileBootstrapped || false;
function bootstrapRestMobile() {
    if (window.__restMobileBootstrapped) return;
    window.__restMobileBootstrapped = true;
    const orig = window.fetchRestaurantReservations;
    window.fetchRestaurantReservations = async function(...args) {
        const res = await orig.apply(this, args);
        try { renderRestMobile(); } catch (e) { console.warn('renderRestMobile error', e); }
        return res;
    };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapRestMobile);
} else {
    bootstrapRestMobile();
}

// Re-render when theme changes
document.addEventListener('click', e => {
    if (e.target && e.target.closest && e.target.closest('[onclick*="toggleTheme"]')) {
        setTimeout(renderRestMobileHeader, 10);
    }
});

// Expose
window.restMobileSetTab = restMobileSetTab;
window.restMobileClearDateFilter = restMobileClearDateFilter;
window.restMobileBottomNav = restMobileBottomNav;
window.restMobileRefresh = restMobileRefresh;
window.openRestMobileSheet = openRestMobileSheet;
window.closeRestMobileSheet = closeRestMobileSheet;
window.openRestMobileMonthSheet = openRestMobileMonthSheet;
window.closeRestMobileMonthSheet = closeRestMobileMonthSheet;
window.restMobileMonthShift = restMobileMonthShift;
window.restMobileJumpToDate = restMobileJumpToDate;
window.openRestMobileAforoSheet = openRestMobileAforoSheet;
window.openRestMobileMenuSheet = openRestMobileMenuSheet;
window.closeRestMobileMenuSheet = closeRestMobileMenuSheet;
window.renderRestMobile = renderRestMobile;

// ============================================================
// SOCIAL LISTENING — Panel de Reputación (reseñas Google/TripAdvisor/Booking)
// ============================================================
async function fetchSocialListeningReviews() {
    // Las reviews viven en una tabla única del admin Supabase, filtradas por hotel_id.
    const db = window.adminSupabase || window.supabase;
    if (!db || !state.clientId) return;
    try {
        const { data, error } = await db
            .from('reviews')
            .select('*')
            .eq('hotel_id', state.clientId)
            .order('review_date', { ascending: false })
            .limit(500);
        if (error) {
            console.error('social_listening fetch:', error);
            state.socialListeningReviews = [];
        } else {
            state.socialListeningReviews = data || [];
        }
        state.socialListeningLoaded = true;
        wireSocialListeningFilters();
        renderSocialListeningPanel();
    } catch (e) {
        console.error('social_listening fetch fatal:', e);
        state.socialListeningReviews = [];
        renderSocialListeningPanel();
    }
}

// ─────────────────────────────────────────────────────────────────────
// Wiring de filtros (sentiment tabs + secondary selects)
// ─────────────────────────────────────────────────────────────────────
let _slFiltersWired = false;
function wireSocialListeningFilters() {
    if (_slFiltersWired) return;
    const tabs = document.getElementById('sl-sentiment-tabs');
    const src = document.getElementById('sl-filter-source');
    const sort = document.getElementById('sl-filter-sort');
    if (!tabs || !src || !sort) return;

    // Sentiment tabs (sentimientos + tab especial de urgentes)
    tabs.querySelectorAll('.sl-stab').forEach(btn => {
        btn.addEventListener('click', () => {
            tabs.querySelectorAll('.sl-stab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const sentiment = btn.dataset.sentiment || '';
            const priority  = btn.dataset.priority  || '';
            state.socialListeningFilters = {
                ...state.socialListeningFilters,
                sentiment,
                priority
            };
            renderReviewsList();
        });
    });

    src.addEventListener('change', () => {
        state.socialListeningFilters.source = src.value;
        renderReviewsList();
    });
    sort.addEventListener('change', () => {
        state.socialListeningFilters.sort = sort.value;
        renderReviewsList();
    });

    _slFiltersWired = true;
}

// ─────────────────────────────────────────────────────────────────────
// Análisis: extrae fortalezas / áreas de mejora / urgentes / top topics
// desde las reviews reales (computado localmente, sin llamar a Claude
// porque el análisis por review ya viene pre-procesado en la BD).
// ─────────────────────────────────────────────────────────────────────
function analyzeReviews(all) {
    // Topic frequency by sentiment
    const topicStats = new Map();   // topic → { total, pos, neu, neg }
    const categoryStats = new Map(); // category → { total, neg, pos }

    for (const r of all) {
        const sentiment = r.sentiment || 'neutral';
        (r.topics || []).forEach(t => {
            const key = String(t).toLowerCase().trim();
            if (!key) return;
            const cur = topicStats.get(key) || { topic: key, total: 0, pos: 0, neu: 0, neg: 0 };
            cur.total++;
            if (sentiment === 'positive') cur.pos++;
            else if (sentiment === 'negative') cur.neg++;
            else cur.neu++;
            topicStats.set(key, cur);
        });
        if (r.category) {
            const c = categoryStats.get(r.category) || { category: r.category, total: 0, pos: 0, neg: 0 };
            c.total++;
            if (sentiment === 'positive') c.pos++;
            if (sentiment === 'negative') c.neg++;
            categoryStats.set(r.category, c);
        }
    }

    const topics = [...topicStats.values()];
    topics.forEach(t => {
        t.score = (t.pos - t.neg) / Math.max(1, t.total);
        t.sentiment = t.pos > t.neg ? 'positive' : t.neg > t.pos ? 'negative' : 'neutral';
    });

    // Strengths: topics mostly positive, sorted by absolute positive count
    const strengths = topics
        .filter(t => t.pos >= 2 && t.score > 0)
        .sort((a, b) => b.pos - a.pos)
        .slice(0, 4);

    // Improvements: topics mostly negative (or with at least 2 negatives)
    const improvements = topics
        .filter(t => t.neg >= 2 || (t.neg >= 1 && t.score < 0))
        .sort((a, b) => b.neg - a.neg)
        .slice(0, 4);

    // Urgent: reviews flagged high priority (use their summary)
    const urgent = all
        .filter(r => r.priority === 'high')
        .sort((a, b) => new Date(b.review_date || 0) - new Date(a.review_date || 0))
        .slice(0, 4);

    // Recommendation: generate a contextual action sentence
    const topNegativeCategory = [...categoryStats.values()]
        .filter(c => c.neg >= 2)
        .sort((a, b) => b.neg - a.neg)[0];
    const urgentCount = urgent.length;

    const categoryLabels = {
        service: 'servicio al huésped',
        cleanliness: 'limpieza y mantenimiento',
        location: 'ubicación',
        food: 'desayuno y alimentos',
        price: 'política de precios y cargos extra',
        rooms: 'estado de habitaciones',
        amenities: 'amenidades y servicios complementarios',
        other: 'experiencia general'
    };

    let recommendation;
    if (urgentCount >= 3 && topNegativeCategory) {
        recommendation = `Priorizar revisión de ${categoryLabels[topNegativeCategory.category]} — ${urgentCount} reseñas urgentes recientes señalan problemas críticos. Considerar respuesta directa a los huéspedes afectados y plan de acción a 30 días con el equipo operativo.`;
    } else if (urgentCount >= 1 && topNegativeCategory) {
        recommendation = `Atender prioritariamente las ${urgentCount} reseña${urgentCount > 1 ? 's' : ''} urgente${urgentCount > 1 ? 's' : ''} y reforzar protocolo de ${categoryLabels[topNegativeCategory.category]}.`;
    } else if (topNegativeCategory) {
        recommendation = `Revisar el área de ${categoryLabels[topNegativeCategory.category]}, donde se concentran ${topNegativeCategory.neg} comentarios negativos. Sin urgencias críticas, pero patrón claro a corregir.`;
    } else if (strengths.length > 0) {
        recommendation = `Reputación estable sin patrones críticos. Capitalizar las fortalezas (${strengths.slice(0, 2).map(s => s.topic).join(', ')}) en marketing y mantener consistencia operativa.`;
    } else {
        recommendation = 'Datos insuficientes para una recomendación específica. Aumentar volumen de reseñas para análisis más profundo.';
    }

    // Top topics for chips (all, sorted by total)
    const topTopics = topics
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);

    return { strengths, improvements, urgent, topTopics, recommendation };
}

// ─────────────────────────────────────────────────────────────────────
// Filtros + orden
// ─────────────────────────────────────────────────────────────────────
function getFilteredSocialListeningReviews() {
    const f = state.socialListeningFilters;
    let arr = state.socialListeningReviews.filter(r => {
        if (f.source && r.source !== f.source) return false;
        if (f.sentiment && r.sentiment !== f.sentiment) return false;
        if (f.priority && r.priority !== f.priority) return false;
        return true;
    });
    const sortMode = f.sort || 'recent';
    arr = arr.slice().sort((a, b) => {
        if (sortMode === 'recent') return new Date(b.review_date || 0) - new Date(a.review_date || 0);
        if (sortMode === 'oldest') return new Date(a.review_date || 0) - new Date(b.review_date || 0);
        if (sortMode === 'worst')  return (a.rating || 0) - (b.rating || 0);
        if (sortMode === 'best')   return (b.rating || 0) - (a.rating || 0);
        return 0;
    });
    return arr;
}

// ─────────────────────────────────────────────────────────────────────
// Render principal
// ─────────────────────────────────────────────────────────────────────
function renderSocialListeningPanel() {
    const all = state.socialListeningReviews;
    if (!all) return;

    // Stats globales
    const ratings = all.map(r => r.rating).filter(v => typeof v === 'number');
    const avg = ratings.length
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length)
        : null;
    const pos = all.filter(r => r.sentiment === 'positive').length;
    const neu = all.filter(r => r.sentiment === 'neutral').length;
    const neg = all.filter(r => r.sentiment === 'negative').length;
    const urgent = all.filter(r => r.priority === 'high').length;

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setHTML = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

    setText('sl-avg-rating', avg ? avg.toFixed(1) : '—');
    setText('sl-total', all.length);
    setText('sl-positive', pos);
    setText('sl-neutral', neu);
    setText('sl-negative', neg);
    setHTML('sl-hero-stars', renderStars(avg || 0));

    // Distribution bar
    const total = Math.max(1, pos + neu + neg);
    const distBar = document.getElementById('sl-dist-bar');
    if (distBar) {
        const pct = (n) => Math.round((n / total) * 100);
        distBar.innerHTML = `
            ${pos > 0 ? `<div class="sl-dist-segment positive" style="flex-grow:${pos};" title="${pos} positivas">${pct(pos)}%</div>` : ''}
            ${neu > 0 ? `<div class="sl-dist-segment neutral"  style="flex-grow:${neu};" title="${neu} neutras">${pct(neu)}%</div>` : ''}
            ${neg > 0 ? `<div class="sl-dist-segment negative" style="flex-grow:${neg};" title="${neg} negativas">${pct(neg)}%</div>` : ''}
        `;
    }
    setText('sl-dist-summary', `${all.length} reseñas`);

    // Sources breakdown
    const sourcesList = document.getElementById('sl-sources-list');
    if (sourcesList) {
        const sourceLabels = { google: 'Google Maps', tripadvisor: 'TripAdvisor', booking: 'Booking.com' };
        const sourceIcons  = { google: 'G', tripadvisor: 'T', booking: 'B' };
        const bySrc = {};
        for (const r of all) {
            const s = r.source;
            if (!bySrc[s]) bySrc[s] = { total: 0, sum: 0, n: 0 };
            bySrc[s].total++;
            if (typeof r.rating === 'number') {
                bySrc[s].sum += r.rating;
                bySrc[s].n++;
            }
        }
        const order = ['google', 'tripadvisor', 'booking'];
        sourcesList.innerHTML = order.filter(s => bySrc[s]).map(s => {
            const info = bySrc[s];
            const r = info.n ? (info.sum / info.n).toFixed(1) : '—';
            return `
                <div class="sl-source-row">
                    <div class="sl-source-icon ${s}">${sourceIcons[s]}</div>
                    <div class="sl-source-info">
                        <div class="sl-source-name">${sourceLabels[s]}</div>
                        <div class="sl-source-count">${info.total} reseña${info.total > 1 ? 's' : ''}</div>
                    </div>
                    <div class="sl-source-rating">${r}<small> / 5</small></div>
                </div>
            `;
        }).join('') || '<div style="color:var(--sl-text-dim);font-size:0.82rem;">Sin datos</div>';
    }

    // AI Summary — cards visuales
    const analysis = analyzeReviews(all);

    const fmtTopicCards = (items, kind) => {
        if (!items.length) return '<div class="sl-ai-empty-card">Sin datos suficientes</div>';
        const maxCount = Math.max(...items.map(i => kind === 'pos' ? i.pos : i.neg));
        return `<div class="sl-ai-grid">
            ${items.slice(0, 4).map(i => {
                const count = kind === 'pos' ? i.pos : i.neg;
                const total = i.total;
                const pctOfMax = Math.max(15, Math.round((count / maxCount) * 100));
                const label = kind === 'pos' ? 'mención' : 'queja';
                const sub = kind === 'pos'
                    ? `${total} reseña${total > 1 ? 's' : ''} mencionan este tema`
                    : `${total} reseña${total > 1 ? 's' : ''} reportan este tema`;
                return `
                    <div class="sl-ai-stat-card ${kind === 'pos' ? 'pos' : 'neg'}">
                        <div class="sl-ai-stat-num">${count}<small>${count > 1 ? label + 's' : label}</small></div>
                        <div class="sl-ai-stat-label">${escapeHtml(i.topic)}</div>
                        <div class="sl-ai-stat-sub">${sub}</div>
                        <div class="sl-ai-stat-bar"><span style="width:${pctOfMax}%"></span></div>
                    </div>
                `;
            }).join('')}
        </div>`;
    };

    const fmtUrgentCards = (items) => {
        if (!items.length) return '<div class="sl-ai-empty-card">Sin reseñas urgentes ✓</div>';
        const sourceLabels = { google: 'Google', tripadvisor: 'TripAdvisor', booking: 'Booking' };
        return `<div class="sl-ai-urgent-list">
            ${items.slice(0, 4).map(r => {
                const initials = (r.author || '?').trim().split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
                const stars = typeof r.rating === 'number'
                    ? '★'.repeat(Math.round(r.rating)) + `<span class="star-empty">${'★'.repeat(5 - Math.round(r.rating))}</span>`
                    : '';
                const summary = r.summary || r.title || (r.body || '').slice(0, 90) + '…';
                return `
                    <div class="sl-ai-urgent-row">
                        <div class="sl-ai-urgent-head">
                            <div class="sl-ai-urgent-avatar">${escapeHtml(initials)}</div>
                            <div class="sl-ai-urgent-info">
                                <div class="sl-ai-urgent-name">${escapeHtml(r.author || 'Anónimo')}</div>
                                <div class="sl-ai-urgent-meta">
                                    <span class="sl-ai-urgent-stars">${stars}</span>
                                    <span class="sl-ai-urgent-source">${sourceLabels[r.source] || r.source}</span>
                                </div>
                            </div>
                        </div>
                        <div class="sl-ai-urgent-summary">${escapeHtml(summary)}</div>
                    </div>
                `;
            }).join('')}
        </div>`;
    };

    setHTML('sl-ai-strengths',    fmtTopicCards(analysis.strengths,    'pos'));
    setHTML('sl-ai-improvements', fmtTopicCards(analysis.improvements, 'neg'));
    setHTML('sl-ai-urgent',       fmtUrgentCards(analysis.urgent));
    setText('sl-ai-recommendation', analysis.recommendation);

    // Top topics
    const topicChips = document.getElementById('sl-topic-chips');
    if (topicChips) {
        topicChips.innerHTML = analysis.topTopics.length
            ? analysis.topTopics.map(t => `<span class="sl-topic-chip ${t.sentiment}">${escapeHtml(t.topic)} <em>${t.total}</em></span>`).join('')
            : '<span style="color:var(--sl-text-dim);font-size:0.82rem;">Sin temas identificados</span>';
    }
    setText('sl-topics-count', `${analysis.topTopics.length} temas`);

    // Tab counts
    setText('sl-tab-count-all', all.length);
    setText('sl-tab-count-pos', pos);
    setText('sl-tab-count-neu', neu);
    setText('sl-tab-count-neg', neg);
    setText('sl-tab-count-urgent', urgent);

    // Reviews
    renderReviewsList();
}

function renderReviewsList() {
    const list = document.getElementById('sl-reviews-list');
    const empty = document.getElementById('sl-empty');
    if (!list || !empty) return;
    const filtered = getFilteredSocialListeningReviews();
    if (filtered.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');
    list.innerHTML = filtered.map(renderSocialReviewCard).join('');
    list.querySelectorAll('.sl-review-toggle').forEach(btn => {
        btn.addEventListener('click', e => {
            const card = e.target.closest('.sl-review');
            if (!card) return;
            const expanded = card.classList.toggle('expanded');
            btn.textContent = expanded ? 'Ver menos' : 'Ver más';
        });
    });
}

function renderStars(rating) {
    const full = Math.round(rating);
    return '★'.repeat(full) + `<span class="star-empty">${'★'.repeat(5 - full)}</span>`;
}

function renderSocialReviewCard(r) {
    const sourceLabels = { google: 'Google', tripadvisor: 'TripAdvisor', booking: 'Booking' };
    const categoryLabels = {
        service: 'Servicio', cleanliness: 'Limpieza', location: 'Ubicación',
        food: 'Comida', price: 'Precio', rooms: 'Habitaciones',
        amenities: 'Amenidades', other: 'Otro'
    };
    const sentimentLabels = { positive: 'Positivo', neutral: 'Neutral', negative: 'Negativo' };

    const rating = typeof r.rating === 'number'
        ? renderStars(r.rating)
        : '';
    const ratingNum = typeof r.rating === 'number' ? r.rating.toFixed(1) : '—';
    const dateStr = r.review_date
        ? new Date(r.review_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';
    const body = r.body || '';
    const needsToggle = body.length > 240;
    const initials = (r.author || '?').trim().split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
    const cardClasses = ['sl-review'];
    if (r.sentiment) cardClasses.push('sl-sentiment-' + r.sentiment);
    if (r.priority === 'high') cardClasses.push('sl-priority-high');

    return `
        <article class="${cardClasses.join(' ')}">
            <div class="sl-review-head">
                <div class="sl-review-author-block">
                    ${r.author_avatar_url
                        ? `<img class="sl-review-avatar" src="${escapeHtml(r.author_avatar_url)}" alt="">`
                        : `<div class="sl-review-avatar">${escapeHtml(initials)}</div>`}
                    <div class="sl-review-author-info">
                        <div class="sl-review-author">${escapeHtml(r.author || 'Anónimo')}</div>
                        <div class="sl-review-date">${dateStr}</div>
                    </div>
                </div>
                <span class="sl-review-source sl-source-${r.source}">${sourceLabels[r.source] || r.source}</span>
            </div>
            <div class="sl-review-rating-row">
                <span class="sl-review-rating">${rating}</span>
                <span class="sl-review-rating-num">${ratingNum}</span>
            </div>
            ${r.title ? `<h4 class="sl-review-title">${escapeHtml(r.title)}</h4>` : ''}
            <p class="sl-review-body">${escapeHtml(body)}</p>
            ${needsToggle ? '<button class="sl-review-toggle">Ver más</button>' : ''}
            ${r.summary ? `<div class="sl-summary"><span class="sl-summary-label">Resumen IA</span>${escapeHtml(r.summary)}</div>` : ''}
            <div class="sl-review-tags">
                ${r.sentiment ? `<span class="sl-tag sl-tag-${r.sentiment === 'positive' ? 'pos' : r.sentiment === 'neutral' ? 'neu' : 'neg'}">${sentimentLabels[r.sentiment]}</span>` : ''}
                ${r.category ? `<span class="sl-tag sl-tag-category">${categoryLabels[r.category] || r.category}</span>` : ''}
                ${r.priority === 'high' ? `<span class="sl-tag sl-tag-urgent">Urgente</span>` : ''}
                ${(r.topics || []).slice(0, 3).map(t => `<span class="sl-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
            ${r.review_url ? `<a class="sl-review-link" href="${escapeHtml(r.review_url)}" target="_blank" rel="noopener">Ver en ${sourceLabels[r.source] || 'fuente'} ↗</a>` : ''}
        </article>
    `;
}
