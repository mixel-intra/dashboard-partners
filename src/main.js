// Main Dashboard Logic - Cefemex Capital

// State Management
let state = {
    leads: [],
    filteredLeads: [],
    config: {
        webhookUrl: 'https://cefemexyucatan.app.n8n.cloud/webhook/ce285ee2-cc8b-424d-b8aa-288050cbd320',
        investment: 0,
        sales: 0
    },
    chart: null
};

// DOM Elements
const elements = {
    totalLeads: document.querySelector('#card-1 .metric-value'),
    qualifiedLeads: document.querySelector('#card-2 .metric-value'),
    conversionRate: document.querySelector('#card-3 .metric-value'),
    conversionProgress: document.querySelector('#card-3 .progress'),
    investment: document.querySelector('#card-4 .metric-value'),
    costPerQualified: document.querySelector('#card-5 .metric-value'),
    sales: document.querySelector('#card-6 .metric-value'),
    roi: document.querySelector('#card-7 .metric-value'),
    leadsTable: document.querySelector('#qualified-leads-table tbody'),
    dateFilter: document.getElementById('date-filter'),
    mobileToggle: document.getElementById('mobile-toggle'),
    sidebar: document.querySelector('.sidebar')
};

// Initialize Application
async function init() {
    loadConfig();
    setupEventListeners();
    await fetchData();
    renderDashboard();
}

// Configuration Persistence
function loadConfig() {
    const savedConfig = localStorage.getItem('cefemex_dashboard_config');
    if (savedConfig) {
        state.config = JSON.parse(savedConfig);
    }
}


// Data Fetching
async function fetchData() {
    try {
        const response = await fetch(state.config.webhookUrl);
        if (!response.ok) throw new Error('Error al conectar con el Webhook');
        state.leads = await response.json();
        state.filteredLeads = [...state.leads]; // Default to all
    } catch (error) {
        console.error('Error fetching data:', error);
        // Fallback or Empty State
        state.leads = [];
        state.filteredLeads = [];
    }
}

// Dashboard Rendering Logic
function renderDashboard() {
    const metrics = calculateMetrics();
    updateUI(metrics);
    renderChart();
    renderTable();
}

function calculateMetrics() {
    const total = state.filteredLeads.length;
    // Consider both "Lead Calificado" and "Lead Condicionado"
    const qualified = state.filteredLeads.filter(l =>
        l.estatus === 'Lead Calificado' || l.estatus === 'Lead Condicionado'
    ).length;
    const conversion = total > 0 ? (qualified / total) * 100 : 0;

    const investment = parseFloat(state.config.investment) || 0;
    const sales = parseFloat(state.config.sales) || 0;

    const costPerQualified = qualified > 0 ? (investment / qualified) : 0;
    const roi = investment > 0 ? (sales / investment) : 0;

    return {
        total,
        qualified,
        conversion,
        investment,
        sales,
        costPerQualified,
        roi
    };
}

function updateUI(m) {
    elements.totalLeads.textContent = m.total;
    elements.qualifiedLeads.textContent = m.qualified;
    elements.conversionRate.textContent = `${m.conversion.toFixed(1)}%`;
    elements.conversionProgress.style.width = `${m.conversion}%`;

    elements.investment.textContent = `$${m.investment.toLocaleString()}`;
    elements.sales.textContent = `$${m.sales.toLocaleString()}`;

    elements.costPerQualified.textContent = `$${m.costPerQualified.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    elements.roi.textContent = `${m.roi.toFixed(2)}x`;
}

// Helper for Date Parsing (Handles "p.m./a.m." and Spanish format)
function parseLeadDate(dateStr) {
    if (!dateStr) return new Date();

    // Normalize p.m./a.m. to PM/AM for standard JS parsing
    let normalized = dateStr
        .replace(/\s*p\.m\./i, ' PM')
        .replace(/\s*a\.m\./i, ' AM');

    // Check if it's DD/MM/YYYY or MM/DD/YYYY
    // Based on the sample: "3/2/2026" (Feb 3rd or March 2nd?) 
    // Usually these webhooks follow the locale of the sender. 
    // I'll try to split and rearrange if standard parsing fails.
    let date = new Date(normalized);

    if (isNaN(date.getTime())) {
        // Fallback for tricky formats (e.g., DD/MM/YYYY)
        const parts = normalized.split(/[\/\s,:]+/);
        if (parts.length >= 3) {
            // Assume DD/MM/YYYY HH:MM:SS
            const day = parts[0];
            const month = parts[1];
            const year = parts[2];
            // Reconstruct in a more friendly way
            date = new Date(`${year}-${month}-${day} ${parts.slice(3).join(':')}`);
        }
    }

    return isNaN(date.getTime()) ? new Date() : date;
}

function renderTable() {
    const qualifiedLeads = state.filteredLeads
        .filter(l => l.estatus === 'Lead Calificado' || l.estatus === 'Lead Condicionado')
        .slice(0, 10); // Show last 10

    elements.leadsTable.innerHTML = qualifiedLeads.map(lead => `
        <tr>
            <td>${lead.nombre}</td>
            <td>${parseLeadDate(lead.fecha_creacion).toLocaleDateString()}</td>
            <td>${lead.utm_medium || 'Directo'}</td>
            <td><span class="status-badge ${lead.estatus === 'Lead Condicionado' ? 'condicionado' : 'calificado'}">${lead.estatus === 'Lead Condicionado' ? 'Condicionado' : 'Calificado'}</span></td>
        </tr>
    `).join('');
}

function renderChart() {
    const ctx = document.getElementById('leads-chart').getContext('2d');

    // Group leads by date for the chart
    const dailyData = state.filteredLeads.reduce((acc, lead) => {
        const date = parseLeadDate(lead.fecha_creacion).toLocaleDateString();
        acc[date] = (acc[date] || 0) + 1;
        return acc;
    }, {});

    const labels = Object.keys(dailyData).sort();
    const data = labels.map(label => dailyData[label]);

    if (state.chart) state.chart.destroy();

    // Create Gradient for Chart
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(255, 0, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(255, 0, 255, 0)');

    state.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Leads por Día',
                data: data,
                borderColor: '#ff00ff',
                backgroundColor: gradient,
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ff00ff',
                pointBorderColor: 'rgba(255, 0, 255, 0.3)',
                pointBorderWidth: 6,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#161a1f',
                    titleColor: '#8a8d91',
                    bodyColor: '#ffffff',
                    displayColors: false,
                    padding: 12,
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.03)', drawBorder: false },
                    ticks: { color: '#5e6268', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#5e6268', font: { size: 10 } }
                }
            }
        }
    });
}

// Event Listeners
function setupEventListeners() {
    // Mobile Sidebar Toggle
    if (elements.mobileToggle) {
        elements.mobileToggle.addEventListener('click', () => {
            elements.sidebar.classList.toggle('mobile-active');
            elements.mobileToggle.classList.toggle('active');
        });
    }

    // Close sidebar on tap outside
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!elements.sidebar.contains(e.target) && !elements.mobileToggle.contains(e.target)) {
                elements.sidebar.classList.remove('mobile-active');
                elements.mobileToggle.classList.remove('active');
            }
        }
    });

    // Date Filter
    elements.dateFilter.addEventListener('change', (e) => {
        const selectedDate = e.target.value;
        if (!selectedDate) {
            state.filteredLeads = [...state.leads];
        } else {
            state.filteredLeads = state.leads.filter(lead => {
                const leadDate = parseLeadDate(lead.fecha_creacion);
                const filterDate = new Date(selectedDate);
                // Adjust timezone mismatch for comparison
                return leadDate.toDateString() === new Date(selectedDate + 'T00:00:00').toDateString();
            });
        }
        renderDashboard();
    });
}

// Start App
init();
