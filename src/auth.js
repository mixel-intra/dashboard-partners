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

// Normaliza el nombre de página para funcionar tanto en local (.html)
// como en Vercel/hosting que omite la extensión (ej: /login en vez de /login.html)
function getCurrentPage() {
    const raw = window.location.pathname.split('/').pop() || 'index';
    return raw.replace(/\.html$/, '') || 'index';
}

function checkAuth() {
    const session = getSession();
    const currentPage = getCurrentPage();
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client');

    // Si no hay sesión, redirigir a login
    if (!session) {
        if (currentPage !== 'login') {
            window.location.href = 'login.html';
        }
        return false;
    }

    // Verificar que el tiempo de sesión no haya expirado (24 horas)
    const SESSION_DURATION = 24 * 60 * 60 * 1000;
    if (Date.now() - session.timestamp > SESSION_DURATION) {
        clearSession();
        window.location.href = 'login.html';
        return false;
    }

    // Si estamos en el dashboard y hay un clientId en la URL,
    // verificar que este usuario tenga acceso a ese cliente
    if (currentPage === 'index' && clientId) {
        const hasAccess = session.role === 'admin' ||
            (session.clients && session.clients.includes(clientId));

        if (!hasAccess) {
            console.warn('Acceso denegado al cliente:', clientId);
            window.location.href = 'hub.html';
            return false;
        }
    }

    // Si está en index sin cliente en URL, ir al hub o al dashboard directo
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

if (document.getElementById('login-form')) {
    const loginForm = document.getElementById('login-form');
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
            // 1. Buscar usuario en user_profiles
            const { data: user, error: userError } = await supabase
                .from('user_profiles')
                .select('id, email, name, role, is_active')
                .eq('email', email)
                .eq('password', password)
                .eq('is_active', true)
                .single();

            if (userError || !user) {
                throw new Error('Credenciales inválidas');
            }

            // 2. Obtener los clientes a los que tiene acceso
            let accessibleClients = [];

            if (user.role === 'admin') {
                // Los admins tienen acceso a todos los clientes
                const { data: allClients } = await supabase
                    .from('clients_config')
                    .select('id_slug');
                accessibleClients = (allClients || []).map(c => c.id_slug);
            } else {
                // Los partners solo tienen acceso a sus clientes asignados
                const { data: access } = await supabase
                    .from('user_client_access')
                    .select('client_slug')
                    .eq('user_id', user.id);
                accessibleClients = (access || []).map(a => a.client_slug);
            }

            if (accessibleClients.length === 0) {
                throw new Error('Tu cuenta no tiene acceso a ningún cliente. Contacta al administrador.');
            }

            // 3. Guardar sesión
            saveSession({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                clients: accessibleClients
            });

            // 4. Redirigir
            if (accessibleClients.length === 1) {
                // Acceso directo al único dashboard
                window.location.href = `index.html?client=${accessibleClients[0]}`;
            } else {
                // Ir al hub de selección de clientes
                window.location.href = 'hub.html';
            }

        } catch (err) {
            console.error('Login error:', err);
            errorBox.textContent = err.message || 'Usuario o contraseña incorrectos';
            errorBox.style.display = 'block';
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span>Acceder</span>';
        }
    });
}

// ============================================================
// LOGOUT
// ============================================================

function logout() {
    clearSession();
    window.location.href = 'login.html';
}

// ============================================================
// VERIFICACIÓN AUTOMÁTICA (en páginas protegidas)
// ============================================================

const _currentPage = getCurrentPage();

if (_currentPage === 'admin') {
    // El panel admin solo es accesible para administradores
    const _session = getSession();
    if (!_session) {
        window.location.href = 'login.html';
    } else if (_session.role !== 'admin') {
        // Si es partner, lo mandamos a su hub (no tiene acceso al admin)
        console.warn('Acceso denegado al panel admin. Redirigiendo...');
        window.location.href = 'hub.html';
    }
} else if (_currentPage !== 'login') {
    checkAuth();
}

// ============================================================
// LÓGICA DE CAMBIO DE CONTRASEÑA
// ============================================================

function openChangePasswordModal() {
    const modal = document.getElementById('change-pass-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('change-pass-error').style.display = 'none';
        document.getElementById('change-pass-success').style.display = 'none';
        document.getElementById('change-pass-form').reset();
    }
}

function closeChangePasswordModal() {
    const modal = document.getElementById('change-pass-modal');
    if (modal) modal.style.display = 'none';
}

if (document.getElementById('change-pass-form')) {
    const changePassForm = document.getElementById('change-pass-form');
    changePassForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newPass = document.getElementById('new-password').value.trim();
        const confirmPass = document.getElementById('confirm-password').value.trim();
        const errorBox = document.getElementById('change-pass-error');
        const successBox = document.getElementById('change-pass-success');
        const submitBtn = document.getElementById('submit-change-pass');

        errorBox.style.display = 'none';
        successBox.style.display = 'none';

        if (newPass.length < 6) {
            errorBox.textContent = 'La contraseña debe tener al menos 6 caracteres';
            errorBox.style.display = 'block';
            return;
        }

        if (newPass !== confirmPass) {
            errorBox.textContent = 'Las contraseñas no coinciden';
            errorBox.style.display = 'block';
            return;
        }

        const session = getSession();
        if (!session || !session.id) {
            errorBox.textContent = 'Sesión no válida';
            errorBox.style.display = 'block';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon> Actualizando...';

        try {
            console.log('Intentando actualizar contraseña para ID:', session.id);

            // Actualizar en la base de datos
            const { data, error, status } = await supabase
                .from('user_profiles')
                .update({ password: newPass })
                .eq('id', session.id)
                .select();

            if (error) {
                console.error('Error de Supabase:', error);
                throw error;
            }

            console.log('Respuesta de Supabase:', { status, data });

            if (!data || data.length === 0) {
                throw new Error('No se afectó ninguna fila. Verifica que tu ID de usuario sea correcto.');
            }

            // Actualizar el timestamp de la sesión local
            saveSession({
                ...session,
                timestamp: Date.now()
            });

            successBox.style.display = 'block';
            submitBtn.innerHTML = '¡Actualizado!';
            submitBtn.style.background = '#30D158';

            setTimeout(() => {
                closeChangePasswordModal();
                submitBtn.disabled = false;
                submitBtn.style.background = '#7551FF';
                submitBtn.innerHTML = 'Actualizar Clave';
            }, 2000);

        } catch (err) {
            console.error('Error detallado al cambiar contraseña:', err);
            errorBox.textContent = 'Error: ' + (err.message || 'No se pudo actualizar.');
            errorBox.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Actualizar Clave';
        }
    });
}
