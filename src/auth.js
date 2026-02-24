// ============================================================
// Auth.js v2.0 - Sistema de Usuarios Multi-Cliente
// ============================================================

// ============================================================
// GESTIÓN DE SESIÓN
// ============================================================

function getSession() {
    try {
        const raw = localStorage.getItem('intra_session_v2');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveSession(userData) {
    localStorage.setItem('intra_session_v2', JSON.stringify({
        ...userData,
        timestamp: Date.now()
    }));
}

function clearSession() {
    localStorage.removeItem('intra_session_v2');
}

// ============================================================
// VALIDACIÓN DE AUTENTICACIÓN
// ============================================================

function getCurrentPage() {
    const raw = window.location.pathname.split('/').pop() || 'index';
    return raw.replace(/\.html$/, '') || 'index';
}

function checkAuth() {
    const session = getSession();
    const currentPage = getCurrentPage();
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client');

    if (!session) {
        if (currentPage !== 'login') {
            window.location.href = 'login.html';
        }
        return false;
    }

    const SESSION_DURATION = 24 * 60 * 60 * 1000;
    if (Date.now() - session.timestamp > SESSION_DURATION) {
        clearSession();
        window.location.href = 'login.html';
        return false;
    }

    if (currentPage === 'index' && clientId) {
        const hasAccess = session.role === 'admin' ||
            (session.clients && session.clients.includes(clientId));

        if (!hasAccess) {
            window.location.href = 'hub.html';
            return false;
        }
    }

    if (currentPage === 'index' && !clientId) {
        if (session.clients && session.clients.length === 1) {
            window.location.href = `index.html?client=${session.clients[0]}`;
        } else {
            window.location.href = 'hub.html';
        }
        return false;
    }

    return true;
}

// ============================================================
// LÓGICA DE LOGIN
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        const loginBtn = document.getElementById('login-btn');
        const errorBox = document.getElementById('error-box');

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();

            loginBtn.disabled = true;
            loginBtn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon> Verificando...';
            errorBox.style.display = 'none';

            try {
                const { data: user, error: userError } = await supabase
                    .from('user_profiles')
                    .select('id, email, name, role, is_active')
                    .eq('email', email)
                    .eq('password', password)
                    .eq('is_active', true)
                    .single();

                if (userError || !user) throw new Error('Credenciales inválidas');

                let accessibleClients = [];
                if (user.role === 'admin') {
                    const { data: allClients } = await supabase.from('clients_config').select('id_slug');
                    accessibleClients = (allClients || []).map(c => c.id_slug);
                } else {
                    const { data: access } = await supabase.from('user_client_access').select('client_slug').eq('user_id', user.id);
                    accessibleClients = (access || []).map(a => a.client_slug);
                }

                if (accessibleClients.length === 0) throw new Error('Sin acceso a clientes.');

                saveSession({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    clients: accessibleClients
                });

                window.location.href = accessibleClients.length === 1 ? `index.html?client=${accessibleClients[0]}` : 'hub.html';

            } catch (err) {
                errorBox.textContent = err.message || 'Error al ingresar';
                errorBox.style.display = 'block';
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<span>Acceder</span>';
            }
        });
    }

    // LÓGICA DE CAMBIO DE CONTRASEÑA
    const changePassForm = document.getElementById('change-pass-form');
    if (changePassForm) {
        changePassForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const newPass = document.getElementById('new-password').value.trim();
            const confirmPass = document.getElementById('confirm-password').value.trim();
            const errorBox = document.getElementById('change-pass-error');
            const successBox = document.getElementById('change-pass-success');
            const submitBtn = document.getElementById('submit-change-pass');

            errorBox.style.display = 'none';
            if (newPass.length < 6) {
                errorBox.textContent = 'Mínimo 6 caracteres';
                errorBox.style.display = 'block';
                return;
            }
            if (newPass !== confirmPass) {
                errorBox.textContent = 'No coinciden';
                errorBox.style.display = 'block';
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon>...';

            try {
                const session = getSession();
                if (!session || !session.id) {
                    alert('Sesión expirada. Por favor reingresa.');
                    location.reload();
                    return;
                }

                const { error } = await supabase
                    .from('user_profiles')
                    .update({ password: newPass })
                    .eq('id', session.id);

                if (error) throw error;

                saveSession({ ...session, timestamp: Date.now() });

                successBox.style.display = 'block';
                submitBtn.innerHTML = '¡Listo!';
                submitBtn.style.background = '#30D158';

                setTimeout(() => {
                    closeChangePasswordModal();
                    submitBtn.disabled = false;
                    submitBtn.style.background = '#7551FF';
                    submitBtn.innerHTML = 'Actualizar Clave';
                    successBox.style.display = 'none';
                }, 2000);

            } catch (err) {
                alert('Error: ' + err.message);
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Actualizar Clave';
            }
        });
    }
});

// ============================================================
// FUNCIONES GLOBALES
// ============================================================

function logout() {
    clearSession();
    window.location.href = 'login.html';
}

function openChangePasswordModal() {
    const modal = document.getElementById('change-pass-modal');
    if (modal) {
        modal.style.display = 'flex';
        const err = document.getElementById('change-pass-error');
        const succ = document.getElementById('change-pass-success');
        if (err) err.style.display = 'none';
        if (succ) succ.style.display = 'none';
        document.getElementById('change-pass-form')?.reset();
    }
}

function closeChangePasswordModal() {
    const modal = document.getElementById('change-pass-modal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// VERIFICACIÓN AUTOMÁTICA
// ============================================================

const _currentPage = getCurrentPage();
if (_currentPage === 'admin') {
    const _session = getSession();
    if (!_session) window.location.href = 'login.html';
    else if (_session.role !== 'admin') window.location.href = 'hub.html';
} else if (_currentPage !== 'login') {
    checkAuth();
}
