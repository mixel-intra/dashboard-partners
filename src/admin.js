// Back Office Admin Logic - Cefemex Capital

// DOM Elements
const elements = {
    adminForm: document.getElementById('admin-form'),
    webhookInput: document.getElementById('webhook-url'),
    investmentInput: document.getElementById('investment'),
    salesInput: document.getElementById('sales'),
    saveStatus: document.getElementById('save-status')
};

// Initialize
function init() {
    loadConfig();
    setupEventListeners();
}

function loadConfig() {
    const savedConfig = localStorage.getItem('cefemex_dashboard_config');
    const config = savedConfig ? JSON.parse(savedConfig) : {
        webhookUrl: 'https://cefemexyucatan.app.n8n.cloud/webhook/ce285ee2-cc8b-424d-b8aa-288050cbd320',
        investment: 0,
        sales: 0
    };

    elements.webhookInput.value = config.webhookUrl;
    elements.investmentInput.value = config.investment;
    elements.salesInput.value = config.sales;
}

function setupEventListeners() {
    elements.adminForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const newConfig = {
            webhookUrl: elements.webhookInput.value,
            investment: elements.investmentInput.value,
            sales: elements.salesInput.value,
            lastUpdated: new Date().toISOString()
        };

        localStorage.setItem('cefemex_dashboard_config', JSON.stringify(newConfig));

        // Show success message
        elements.saveStatus.style.display = 'block';
        setTimeout(() => {
            elements.saveStatus.style.display = 'none';
        }, 3000);
    });
}

init();
