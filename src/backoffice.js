// Back Office Admin Logic - Intra

// DOM Elements
// Permitir "DEMO" como valor válido en el campo webhook (evitar validación type=url)
const _webhookEl = document.getElementById('webhook-url');
if (_webhookEl) _webhookEl.type = 'text';
const _adminFormEl = document.getElementById('admin-form');
if (_adminFormEl) _adminFormEl.noValidate = true;

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
    clientTypeInput: document.getElementById('client-type'),
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
    hueSecondary: document.getElementById('hue-secondary'),
    hotelServicesSection: document.getElementById('hotel-services-section'),
    hotelServiceEventos: document.getElementById('hotel-service-eventos'),
    hotelServiceReservas: document.getElementById('hotel-service-reservas'),
    hotelServiceDaypass: document.getElementById('hotel-service-daypass'),
    hotelServiceRestaurante: document.getElementById('hotel-service-restaurante')
};

// State
const DEFAULT_CARD_LABELS = {
    "1": { title: "Oportunidades calificadas", description: "CALIDAD" },
    "2": { title: "Tasa de Conversión", description: "Oportunidades calificadas / Leads" },
    "3": { title: "Ventas", description: "INGRESOS TOTALES" },
    "4": { title: "ROI", description: "VENTAS / INVERSIÓN" },
    "5": { title: "Total de Registros", description: "Personas que mandaron mensaje" },
    "6": { title: "Inversión", description: "" },
    "7": { title: "Costo por oportunidad calificada", description: "" }
};

let state = {
    clients: [],
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
        .select('id_slug, webhook_url, client_type, logo_url');

    if (error) {
        console.error('Error loading registry:', error);
        return;
    }

    state.clients = data || [];
    renderClientList();
}

async function uploadLogo(clientId, file) {
    if (!file) return null;

    // Limpiamos el clientId y la extensión para evitar caracteres raros
    const cleanId = clientId.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const fileExt = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');

    // Generamos un nombre ultra-limpio
    const fileName = `${cleanId}-${Date.now()}.${fileExt}`;
    const filePath = fileName;

    const { data, error } = await supabase.storage
        .from('logos')
        .upload(filePath, file, {
            upsert: true
        });

    if (error) {
        console.error('Error detallado de Supabase Storage:', error);
        if (error.message.includes('Bucket not found')) {
            alert('Error: No se encontró el bucket "logos".');
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

function updateThemePreview() {
    const primary = elements.themePrimaryInput.value;
    const secondary = elements.themeSecondaryInput.value;

    const previewIcon = document.getElementById('preview-icon');
    const previewBadge = document.getElementById('preview-badge');
    const previewPath = document.getElementById('preview-path');
    const previewArea = document.getElementById('preview-area');
    const previewMockup = document.querySelector('.preview-card-mockup');
    const previewDot = document.getElementById('preview-dot');

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
    if (previewDot) {
        previewDot.style.background = primary;
        previewDot.style.boxShadow = `0 0 15px ${primary}`;
    }

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

    const typeLabels = { hotel: 'Hotel', inmobiliaria: 'Inmobiliaria', otro: 'Otro' };

    elements.clientsList.innerHTML = state.clients.map(client => {
        const isActive = state.currentClientId === client.id_slug;
        const typeLabel = typeLabels[client.client_type] || 'Otro';

        const logoHTML = client.logo_url
            ? `<img src="${client.logo_url}" alt="logo" style="width: 100%; height: 100%; object-fit: contain; padding: 4px; border-radius: 12px;">`
            : client.id_slug.charAt(0).toUpperCase();

        // Remove background styling slightly when showing an actual image
        const placeholderStyle = client.logo_url ? "background: transparent; box-shadow: none; border: 1px solid rgba(255,255,255,0.08);" : "";

        return `
            <div class="client-item ${isActive ? 'active' : ''}" data-id="${client.id_slug}">
                <div class="client-icon-placeholder" style="${placeholderStyle}">
                    ${logoHTML}
                </div>
                <div style="flex: 1;">
                    <span class="client-id-label">${client.id_slug}</span>
                    <span class="client-type-label">${typeLabel}</span>
                </div>
                <span class="client-meta" style="flex-shrink: 0;">${client.webhook_url ? 'Configurado' : 'Pendiente'}</span>
            </div>
        `;
    }).join('');

    // Attach click events
    document.querySelectorAll('.client-item').forEach(item => {
        item.addEventListener('click', () => selectClient(item.dataset.id));
    });
}

window.filterClients = function () {
    const term = document.getElementById('client-search').value.toLowerCase();
    const items = document.querySelectorAll('.client-item');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? 'flex' : 'none';
    });
};

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
    elements.clientTypeInput.value = currentConfig.client_type || 'otro';
    elements.themePrimaryInput.value = currentConfig.theme_primary || '#7551FF';
    elements.themeSecondaryInput.value = currentConfig.theme_secondary || '#01F1E3';

    // Handle Hotel Services visibility
    if (elements.clientTypeInput.value === 'hotel') {
        elements.hotelServicesSection.classList.remove('hidden');
    } else {
        elements.hotelServicesSection.classList.add('hidden');
    }

    // Populate Hotel Services
    const hotelServices = currentConfig.hotel_services || {
        eventos: 'unlocked',
        reservas: 'locked',
        daypass: 'locked',
        restaurante: 'locked'
    };
    elements.hotelServiceEventos.value = hotelServices.eventos || 'unlocked';
    elements.hotelServiceReservas.value = hotelServices.reservas || 'locked';
    elements.hotelServiceDaypass.value = hotelServices.daypass || 'locked';
    elements.hotelServiceRestaurante.value = hotelServices.restaurante || 'locked';

    // Sync UI Swatches and Hex
    elements.hexPrimary.value = elements.themePrimaryInput.value;
    elements.hexSecondary.value = elements.themeSecondaryInput.value;
    elements.swatchPrimary.style.background = elements.themePrimaryInput.value;
    elements.swatchSecondary.style.background = elements.themeSecondaryInput.value;

    // Populate card labels
    const cardLabels = currentConfig.card_labels || {};
    for (let i = 1; i <= 7; i++) {
        const titleInput = document.getElementById(`card-${i}-title`);
        const descInput = document.getElementById(`card-${i}-desc`);
        if (titleInput) titleInput.value = (cardLabels[i] && cardLabels[i].title) || '';
        if (descInput) descInput.value = (cardLabels[i] && cardLabels[i].description) || '';
    }

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

        elements.clientTypeInput.value = 'otro';

        // Clear card labels
        for (let i = 1; i <= 7; i++) {
            const titleInput = document.getElementById(`card-${i}-title`);
            const descInput = document.getElementById(`card-${i}-desc`);
            if (titleInput) titleInput.value = '';
            if (descInput) descInput.value = '';
        }

        // Reset Hotel Services
        elements.hotelServicesSection.classList.add('hidden');
        elements.hotelServiceEventos.value = 'unlocked';
        elements.hotelServiceReservas.value = 'locked';
        elements.hotelServiceDaypass.value = 'locked';
        elements.hotelServiceRestaurante.value = 'locked';
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

    // Toggle Hotel Services Section
    elements.clientTypeInput.addEventListener('change', () => {
        if (elements.clientTypeInput.value === 'hotel') {
            elements.hotelServicesSection.classList.remove('hidden');
        } else {
            elements.hotelServicesSection.classList.add('hidden');
        }
    });

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

            // Build card labels JSON
            const cardLabels = {};
            for (let i = 1; i <= 7; i++) {
                const titleInput = document.getElementById(`card-${i}-title`);
                const descInput = document.getElementById(`card-${i}-desc`);
                const title = titleInput ? titleInput.value.trim() : '';
                const desc = descInput ? descInput.value.trim() : '';
                if (title || desc) {
                    cardLabels[i] = {};
                    if (title) cardLabels[i].title = title;
                    if (desc) cardLabels[i].description = desc;
                }
            }

            const newConfig = {
                id_slug: clientId,
                name: elements.clientNameInput.value.trim(),
                client_type: elements.clientTypeInput.value || 'otro',
                webhook_url: elements.webhookInput.value,
                investment: parseFloat(elements.investmentInput.value) || 0,
                investment_updated_at: new Date().toISOString().split('T')[0],
                sales_goal: parseFloat(elements.salesInput.value) || 0,
                logo_url: logoUrl,
                theme_primary: elements.themePrimaryInput.value,
                theme_secondary: elements.themeSecondaryInput.value,
                card_labels: Object.keys(cardLabels).length > 0 ? cardLabels : {},
                hotel_services: {
                    eventos: elements.hotelServiceEventos.value,
                    reservas: elements.hotelServiceReservas.value,
                    daypass: elements.hotelServiceDaypass.value,
                    restaurante: elements.hotelServiceRestaurante.value
                }
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

// ============================================================
// MÓDULO DE GESTIÓN DE USUARIOS
// ============================================================

let allClients = [];
let currentUserId = null;

// --- Tab Switcher ---
function switchTab(tab) {
    const clientsTab = document.getElementById('tab-clients');
    const usersTab = document.getElementById('tab-users');
    const clientsPanel = document.getElementById('sidebar-clients-panel');
    const usersPanel = document.getElementById('sidebar-users-panel');
    const editorPlaceholder = document.getElementById('editor-placeholder');
    const clientEditor = document.getElementById('client-editor');
    const userEditor = document.getElementById('user-editor');

    if (tab === 'clients') {
        clientsTab.classList.add('active');
        usersTab.classList.remove('active');
        clientsPanel.classList.remove('hidden');
        usersPanel.classList.add('hidden');
        userEditor.classList.add('hidden');
        editorPlaceholder.classList.remove('hidden');
    } else {
        usersTab.classList.add('active');
        clientsTab.classList.remove('active');
        usersPanel.classList.remove('hidden');
        clientsPanel.classList.add('hidden');
        clientEditor.classList.add('hidden');
        userEditor.classList.add('hidden');
        editorPlaceholder.classList.remove('hidden');
        loadUsers();
    }
}

// --- Cargar lista de usuarios ---
async function loadUsers() {
    const { data: users } = await supabase
        .from('user_profiles')
        .select('id, name, email, role, is_active')
        .order('created_at', { ascending: false });

    const list = document.getElementById('users-list');
    if (!users || users.length === 0) {
        list.innerHTML = `<p style="padding: 20px; color: rgba(255,255,255,0.3); font-size: 0.85rem; text-align: center;">No hay usuarios aún.</p>`;
        return;
    }

    list.innerHTML = users.map(u => `
        <div class="client-item ${u.id === currentUserId ? 'active' : ''}" onclick="loadUserEditor('${u.id}')">
            <div>
                <div class="client-id-label">${u.name}</div>
                <div style="font-size: 0.75rem; color: rgba(255,255,255,0.3); margin-top: 2px;">${u.email}</div>
            </div>
            <span class="client-meta">${u.role === 'admin' ? '👑' : '👤'} ${u.role}</span>
        </div>
    `).join('');
}

// --- Mostrar formulario de nuevo usuario ---
async function showNewUserForm() {
    currentUserId = null;
    document.getElementById('user-id').value = '';
    document.getElementById('user-name').value = '';
    document.getElementById('user-email').value = '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-role').value = 'partner';
    document.getElementById('user-role-badge').textContent = 'Partner';
    document.getElementById('user-editor-title').textContent = 'Nuevo Usuario';
    document.getElementById('delete-user-btn').classList.add('hidden');
    document.getElementById('user-save-status').style.display = 'none';
    document.getElementById('email-copy-status').style.display = 'none';
    document.getElementById('copy-welcome-email-btn').classList.add('hidden');

    await renderClientCheckboxes([]);

    document.getElementById('editor-placeholder').classList.add('hidden');
    document.getElementById('client-editor').classList.add('hidden');
    document.getElementById('user-editor').classList.remove('hidden');
}

// --- Cargar editor de usuario existente ---
async function loadUserEditor(userId) {
    currentUserId = userId;

    const { data: user } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (!user) return;

    // Obtener accesos actuales del usuario
    const { data: access } = await supabase
        .from('user_client_access')
        .select('client_slug')
        .eq('user_id', userId);

    const assignedSlugs = (access || []).map(a => a.client_slug);

    document.getElementById('user-id').value = user.id;
    document.getElementById('user-name').value = user.name;
    document.getElementById('user-email').value = user.email;
    document.getElementById('user-password').value = user.password;
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-role-badge').textContent = user.role === 'admin' ? 'Administrador' : 'Partner';
    document.getElementById('user-editor-title').textContent = user.name;
    document.getElementById('delete-user-btn').classList.remove('hidden');
    document.getElementById('user-save-status').style.display = 'none';
    document.getElementById('email-copy-status').style.display = 'none';
    document.getElementById('copy-welcome-email-btn').classList.remove('hidden');

    await renderClientCheckboxes(assignedSlugs);

    document.getElementById('editor-placeholder').classList.add('hidden');
    document.getElementById('client-editor').classList.add('hidden');
    document.getElementById('user-editor').classList.remove('hidden');

    // Highlight en sidebar
    document.querySelectorAll('#users-list .client-item').forEach(el => el.classList.remove('active'));
    const items = document.querySelectorAll('#users-list .client-item');
    items.forEach(el => { if (el.getAttribute('onclick').includes(userId)) el.classList.add('active'); });
}

// --- Renderizar checkboxes de clientes ---
async function renderClientCheckboxes(assignedSlugs = []) {
    if (allClients.length === 0) {
        const { data } = await supabase.from('clients_config').select('id_slug, name');
        allClients = data || [];
    }

    const container = document.getElementById('client-checkboxes');
    container.innerHTML = allClients.map(client => {
        const isChecked = assignedSlugs.includes(client.id_slug);
        return `
            <label class="client-checkbox-card ${isChecked ? 'checked' : ''}" onclick="toggleCard(this)">
                <input type="checkbox" name="client_access" value="${client.id_slug}" ${isChecked ? 'checked' : ''}>
                <span style="font-size: 0.9rem; font-weight: 500;">${client.name}</span>
            </label>
        `;
    }).join('');
}

function toggleCard(label) {
    const checkbox = label.querySelector('input[type="checkbox"]');
    checkbox.checked = !checkbox.checked;
    label.classList.toggle('checked', checkbox.checked);
}

// --- Generar contraseña ---
function generateUserPass() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
    const pass = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    document.getElementById('user-password').value = pass;
}

// --- Guardar usuario ---
document.getElementById('user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const userId = document.getElementById('user-id').value;
    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value.trim();
    const role = document.getElementById('user-role').value;

    const selectedClients = Array.from(
        document.querySelectorAll('input[name="client_access"]:checked')
    ).map(cb => cb.value);

    try {
        let finalUserId = userId;

        if (userId) {
            // UPDATE
            await supabase.from('user_profiles')
                .update({ name, email, password, role })
                .eq('id', userId);
        } else {
            // INSERT
            const { data: newUser, error } = await supabase.from('user_profiles')
                .insert({ name, email, password, role })
                .select('id')
                .single();

            if (error) throw error;
            finalUserId = newUser.id;
            document.getElementById('user-id').value = finalUserId;
            currentUserId = finalUserId;
        }

        // Actualizar accesos: borrar los anteriores e insertar los nuevos
        await supabase.from('user_client_access').delete().eq('user_id', finalUserId);

        if (selectedClients.length > 0) {
            const accessRows = selectedClients.map(slug => ({
                user_id: finalUserId,
                client_slug: slug
            }));
            await supabase.from('user_client_access').insert(accessRows);
        }

        document.getElementById('user-save-status').style.display = 'block';
        document.getElementById('user-editor-title').textContent = name;
        document.getElementById('copy-welcome-email-btn').classList.remove('hidden');
        await loadUsers();

    } catch (err) {
        console.error('Error guardando usuario:', err);
        alert('Error: ' + (err.message || 'No se pudo guardar el usuario'));
    }
});

// --- Eliminar usuario ---
async function deleteUser() {
    if (!currentUserId) return;
    if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;

    await supabase.from('user_profiles').delete().eq('id', currentUserId);

    currentUserId = null;
    document.getElementById('user-editor').classList.add('hidden');
    document.getElementById('editor-placeholder').classList.remove('hidden');
    await loadUsers();
}

// --- Copiar Correo de Bienvenida ---
document.getElementById('copy-welcome-email-btn')?.addEventListener('click', () => {
    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value.trim();
    const currentUrl = window.location.href;
    const loginUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/')) + '/login.html';

    const emailTemplate = `
Hola ${name},

¡Bienvenido a tu Dashboard de Partners!

Te escribo para informarte que hemos generado tus credenciales de acceso para que puedas comenzar a visualizar tus métricas y leads en tiempo real.

Tus datos de acceso son:
------------------------------------------
📧 Correo: ${email}
🔑 Contraseña: ${password}
------------------------------------------

Puedes acceder desde el siguiente enlace:
${loginUrl}

Si tienes alguna duda con el uso de la plataforma, por favor házmelo saber.

Saludos.
    `.trim();

    navigator.clipboard.writeText(emailTemplate).then(() => {
        const copyStatus = document.getElementById('email-copy-status');
        copyStatus.style.display = 'block';
        setTimeout(() => {
            copyStatus.style.display = 'none';
        }, 3000);
    });
});


