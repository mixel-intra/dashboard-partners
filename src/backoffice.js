// Back Office Admin Logic - Cefemex Capital

// DOM Elements
const elements = {
    clientsList: document.getElementById('clients-list'),
    addClientBtn: document.getElementById('add-client-btn'),
    editorPlaceholder: document.getElementById('editor-placeholder'),
    clientEditor: document.getElementById('client-editor'),
    editorTitle: document.getElementById('editor-title'),
    adminForm: document.getElementById('admin-form'),
    clientIdInput: document.getElementById('client-id'),
    clientNameInput: document.getElementById('client-display-name'),
    webhookInput: document.getElementById('webhook-url'),
    investmentInput: document.getElementById('investment'),
    salesInput: document.getElementById('sales'),
    clientLogoInput: document.getElementById('client-logo-url'),
    clientLogoFile: document.getElementById('client-logo-file'),
    clientUserInput: document.getElementById('client-user'),
    clientPassInput: document.getElementById('client-pass'),
    generatePassBtn: document.getElementById('generate-pass-btn'),
    saveStatus: document.getElementById('save-status'),
    previewLink: document.getElementById('preview-link'),
    deleteClientBtn: document.getElementById('delete-client-btn'),
    themePrimaryInput: document.getElementById('theme-primary'),
    themeSecondaryInput: document.getElementById('theme-secondary'),
    hexPrimary: document.getElementById('hex-primary'),
    hexSecondary: document.getElementById('hex-secondary'),
    swatchPrimary: document.getElementById('swatch-primary'),
    swatchSecondary: document.getElementById('swatch-secondary'),
    huePrimary: document.getElementById('hue-primary'),
    hueSecondary: document.getElementById('hue-secondary')
};

// State
let state = {
    clients: [], // Array of client IDs (slugs)
    currentClientId: null
};

// Initialize
async function init() {
    try {
        await loadRegistry();
    } catch (err) {
        console.error('Initial load failed:', err);
        renderClientList(); // Show empty list or error state
    }

    setupEventListeners();

    // Check if a client is pre-selected via URL
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client');
    if (clientId) {
        selectClient(clientId);
    }
}

// Registry Management
async function loadRegistry() {
    const { data, error } = await supabase
        .from('clients_config')
        .select('id_slug, webhook_url');

    if (error) {
        console.error('Error loading registry:', error);
        return;
    }

    state.clients = data || [];
    renderClientList();
}

async function uploadLogo(clientId, file) {
    if (!file) return null;

    const fileExt = file.name.split('.').pop();
    const fileName = `${clientId}-${Math.round(Date.now() / 1000)}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data, error } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

    if (error) {
        console.error('Error uploading logo:', error);
        if (error.message.includes('Bucket not found')) {
            alert('Error: No se encontró el bucket "logos" en Supabase. Asegúrate de crearlo en la sección Storage.');
        } else {
            alert('Error al subir el logo: ' + error.message);
        }
        throw error;
    }

    const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

    return publicUrl;
}

function generateSecurePassword() {
    const prefix = 'Cef-';
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let random = '';
    for (let i = 0; i < 6; i++) {
        random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}${random}-${year}`;
}

function updateThemePreview() {
    const primary = elements.themePrimaryInput.value;
    const secondary = elements.themeSecondaryInput.value;

    const previewIcon = document.getElementById('preview-icon');
    const previewBadge = document.getElementById('preview-badge');
    const previewPath = document.getElementById('preview-path');
    const previewArea = document.getElementById('preview-area');
    const previewMockup = document.querySelector('.preview-card-mockup');

    if (previewIcon) {
        previewIcon.style.color = primary;
        previewIcon.style.background = `${primary}33`; // 20% opacity hex
    }
    if (previewBadge) {
        previewBadge.style.color = secondary;
        previewBadge.style.background = `${secondary}26`; // 15% opacity hex
    }
    if (previewPath) previewPath.setAttribute('stroke', primary);
    if (previewArea) previewArea.setAttribute('fill', `${primary}1a`); // 10% opacity hex
    if (previewMockup) previewMockup.style.borderLeftColor = primary;

    // Sync swatches and text inputs
    if (elements.hexPrimary) elements.hexPrimary.value = primary.toUpperCase();
    if (elements.hexSecondary) elements.hexSecondary.value = secondary.toUpperCase();
    if (elements.swatchPrimary) elements.swatchPrimary.style.background = primary;
    if (elements.swatchSecondary) elements.swatchSecondary.style.background = secondary;
}

const hueToHex = (h) => {
    let s = 1, v = 1;
    let i = Math.floor(h / 60);
    let f = h / 60 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// UI Rendering
function renderClientList() {
    if (state.clients.length === 0) {
        elements.clientsList.innerHTML = '<div class="loading-text">No hay clientes registrados</div>';
        return;
    }

    elements.clientsList.innerHTML = state.clients.map(client => {
        const isActive = state.currentClientId === client.id_slug;

        return `
            <div class="client-item ${isActive ? 'active' : ''}" data-id="${client.id_slug}">
                <span class="client-id-label">${client.id_slug}</span>
                <span class="client-meta">${client.webhook_url ? 'Configurado' : 'Pendiente'}</span>
            </div>
        `;
    }).join('');

    // Attach click events
    document.querySelectorAll('.client-item').forEach(item => {
        item.addEventListener('click', () => selectClient(item.dataset.id));
    });
}

async function selectClient(clientId) {
    state.currentClientId = clientId;
    renderClientList();

    // Show editor, hide placeholder
    elements.editorPlaceholder.classList.add('hidden');
    elements.clientEditor.classList.remove('hidden');
    elements.editorTitle.textContent = `Gestión: ${clientId}`;

    // Fill form
    elements.clientIdInput.value = clientId;
    elements.clientIdInput.readOnly = true; // Protect ID after creation

    const { data: config, error } = await supabase
        .from('clients_config')
        .select('*')
        .eq('id_slug', clientId)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is not found
        console.error('Error fetching client config:', error);
        return;
    }

    const currentConfig = config || {
        webhook_url: '',
        investment: 0,
        sales_goal: 0
    };

    elements.webhookInput.value = currentConfig.webhook_url || '';
    elements.clientNameInput.value = currentConfig.name || '';
    elements.investmentInput.value = currentConfig.investment || 0;
    elements.salesInput.value = currentConfig.sales_goal || 0;
    elements.clientLogoInput.value = currentConfig.logo_url || '';
    elements.clientUserInput.value = currentConfig.username || '';
    elements.clientPassInput.value = currentConfig.password || '';
    elements.themePrimaryInput.value = currentConfig.theme_primary || '#7551FF';
    elements.themeSecondaryInput.value = currentConfig.theme_secondary || '#01F1E3';

    // Sync UI Swatches and Hex
    elements.hexPrimary.value = elements.themePrimaryInput.value;
    elements.hexSecondary.value = elements.themeSecondaryInput.value;
    elements.swatchPrimary.style.background = elements.themePrimaryInput.value;
    elements.swatchSecondary.style.background = elements.themeSecondaryInput.value;

    updateThemePreview();
    updatePreviewLink(clientId);

    // Update URL
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('client', clientId);
    window.history.pushState({}, '', newUrl);
}

function updatePreviewLink(clientId) {
    const urlText = document.getElementById('dashboard-url-text');
    const copyBtn = document.getElementById('copy-link-btn');

    if (clientId) {
        const fullUrl = `${window.location.origin}${window.location.pathname.replace('admin.html', 'index.html')}?client=${clientId}`;
        const relativeUrl = `index.html?client=${clientId}`;

        if (urlText) urlText.textContent = relativeUrl;
        if (elements.previewLink) {
            elements.previewLink.href = relativeUrl;
            elements.previewLink.style.visibility = 'visible';
        }

        // Copy logic
        if (copyBtn) {
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(fullUrl).then(() => {
                    const originalHTML = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon>';
                    copyBtn.style.color = '#10B981';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalHTML;
                        copyBtn.style.color = '';
                    }, 2000);
                });
            };
        }
    } else {
        if (elements.previewLink) elements.previewLink.style.visibility = 'hidden';
    }
}

function setupEventListeners() {
    // Add Client Flow
    elements.addClientBtn.addEventListener('click', () => {
        state.currentClientId = null;
        renderClientList();

        elements.editorPlaceholder.classList.add('hidden');
        elements.clientEditor.classList.remove('hidden');
        elements.editorTitle.textContent = 'Nuevo Cliente';

        elements.adminForm.reset();
        elements.clientIdInput.readOnly = false;
        elements.clientIdInput.focus();
        elements.previewLink.style.visibility = 'hidden';

        elements.clientUserInput.value = '';
        elements.clientPassInput.value = '';
    });

    // Password generator
    elements.generatePassBtn.addEventListener('click', () => {
        elements.clientPassInput.value = generateSecurePassword();
    });

    // Hue Slider Sync
    elements.huePrimary.addEventListener('input', () => {
        elements.themePrimaryInput.value = hueToHex(elements.huePrimary.value);
        updateThemePreview();
    });
    elements.hueSecondary.addEventListener('input', () => {
        elements.themeSecondaryInput.value = hueToHex(elements.hueSecondary.value);
        updateThemePreview();
    });

    elements.themePrimaryInput.addEventListener('input', updateThemePreview);
    elements.themeSecondaryInput.addEventListener('input', updateThemePreview);

    // Sync Hex Text -> Color Picker
    const syncHex = (hexEl, pickerEl) => {
        let val = hexEl.value.trim();
        if (val && !val.startsWith('#')) val = '#' + val;
        if (/^#[0-9A-F]{6}$/i.test(val)) {
            pickerEl.value = val;
            updateThemePreview();
        }
    };
    elements.hexPrimary.addEventListener('input', () => syncHex(elements.hexPrimary, elements.themePrimaryInput));
    elements.hexSecondary.addEventListener('input', () => syncHex(elements.hexSecondary, elements.themeSecondaryInput));

    // Presets
    document.querySelectorAll('.preset-dot').forEach(btn => {
        btn.onclick = () => {
            elements.themePrimaryInput.value = btn.dataset.p;
            elements.themeSecondaryInput.value = btn.dataset.s;
            updateThemePreview();
        };
    });

    // Save Logic
    elements.adminForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const clientId = elements.clientIdInput.value.trim().toLowerCase().replace(/\s+/g, '-');
        if (!clientId) return;

        // Visual feedback: find button (it's outside the form using form="admin-form")
        const submitBtn = document.querySelector('button[type="submit"][form="admin-form"]') ||
            elements.adminForm.querySelector('button[type="submit"]');

        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span><ion-icon name="sync-outline" class="spin"></ion-icon> Guardando...</span>';
        }

        try {
            let logoUrl = elements.clientLogoInput.value;

            // Handle file upload if present
            if (elements.clientLogoFile.files && elements.clientLogoFile.files[0]) {
                logoUrl = await uploadLogo(clientId, elements.clientLogoFile.files[0]);
            }

            const newConfig = {
                id_slug: clientId,
                name: elements.clientNameInput.value.trim(),
                webhook_url: elements.webhookInput.value,
                investment: parseFloat(elements.investmentInput.value) || 0,
                sales_goal: parseFloat(elements.salesInput.value) || 0,
                logo_url: logoUrl,
                username: elements.clientUserInput.value.trim(),
                password: elements.clientPassInput.value.trim(),
                theme_primary: elements.themePrimaryInput.value,
                theme_secondary: elements.themeSecondaryInput.value
            };

            const { error } = await supabase
                .from('clients_config')
                .upsert(newConfig);

            if (error) {
                console.error('Error saving config:', error);
                alert('Error al guardar: ' + error.message);
                return;
            }

            // Reset file input and update hidden input
            elements.clientLogoFile.value = '';
            elements.clientLogoInput.value = logoUrl;

            // Feedback
            elements.saveStatus.style.display = 'block';
            setTimeout(() => {
                elements.saveStatus.style.display = 'none';
            }, 3000);

            await loadRegistry();
            selectClient(clientId);
        } catch (err) {
            console.error('Save Flow Error:', err);
            alert('Error en el proceso de guardado');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });

    // Delete Logic
    elements.deleteClientBtn.addEventListener('click', async () => {
        if (!state.currentClientId) return;

        if (confirm(`¿Estás seguro de que quieres eliminar a "${state.currentClientId}"? Se perderán todos sus datos en la nube.`)) {
            const idToDelete = state.currentClientId;

            const { error } = await supabase
                .from('clients_config')
                .delete()
                .eq('id_slug', idToDelete);

            if (error) {
                console.error('Error deleting client:', error);
                alert('Error al eliminar: ' + error.message);
                return;
            }

            // Reload registry
            await loadRegistry();

            // Reset UI
            state.currentClientId = null;
            elements.clientEditor.classList.add('hidden');
            elements.editorPlaceholder.classList.remove('hidden');
        }
    });
}

init();

