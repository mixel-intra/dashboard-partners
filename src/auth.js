// Auth Logic - Cefemex Capital

// Simple session check
function checkAuth() {
    const session = localStorage.getItem('cefemex_session');
    const currentPage = window.location.pathname.split('/').pop();

    // Get client from URL if exists
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client');

    if (currentPage === 'index.html') {
        if (!session) {
            window.location.href = `login.html${clientId ? '?client=' + clientId : ''}`;
        } else {
            const sessionData = JSON.parse(session);
            // If the URL client doesn't match the session client, redirect or clear
            if (clientId && sessionData.clientId !== clientId) {
                localStorage.removeItem('cefemex_session');
                window.location.href = `login.html?client=${clientId}`;
            }
        }
    }
}

// Login Handler
if (document.getElementById('login-form')) {
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-btn');
    const errorBox = document.getElementById('error-box');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

        // Get client from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('client');

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon> Verificando...';
        errorBox.style.display = 'none';

        try {
            // Simple validation against our table
            let query = supabase
                .from('clients_config')
                .select('id_slug, username, password')
                .eq('username', username)
                .eq('password', password);

            // If clientId is in URL, enforce it
            if (clientId) {
                query = query.eq('id_slug', clientId);
            }

            const { data, error } = await query.single();

            if (error || !data) {
                throw new Error('Credenciales inválidas');
            }

            // Success: save session
            const sessionData = {
                clientId: data.id_slug,
                username: data.username,
                timestamp: Date.now()
            };
            localStorage.setItem('cefemex_session', JSON.stringify(sessionData));

            // Redirect to dashboard
            window.location.href = `index.html?client=${data.id_slug}`;

        } catch (err) {
            console.error('Login error:', err);
            errorBox.style.display = 'block';
            loginBtn.disabled = false;
            loginBtn.innerHTML = 'Acceder';
        }
    });
}

// Logout function (to be called from dashboard if needed)
function logout() {
    localStorage.removeItem('cefemex_session');
    window.location.href = 'login.html';
}

// Run auth check if not on login page
const isLoginPage = window.location.pathname.split('/').pop() === 'login.html';
if (!isLoginPage) {
    checkAuth();
}
