// ============================================================
// CONFIGURACIÓN DE SUPABASE
// ============================================================
// AMBIENTE ACTUAL: PRODUCCIÓN
//
// Arquitectura multi-tenant:
// - `window.supabase`        → Supabase admin (registro de clientes, config global)
// - `window.clientSupabase`  → Supabase del cliente activo (datos operacionales).
//   Se inicializa en runtime al cargar la config del cliente desde
//   `clients_config.supabase_url` y `clients_config.supabase_anon_key`.
// ============================================================

const SUPABASE_URL = 'https://zwghwruwxzttsofaezjp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2h3cnV3eHp0dHNvZmFlempwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzY3ODMsImV4cCI6MjA4Njg1Mjc4M30.c-DeJa9h4EA_oaiZPLHh_NV2fKsLO75O62VaerobToI';

// Save factory before instantiation overrides the global
window.__supabaseCreateClient = window.supabase.createClient;

// Admin master client (used for clients_config and any cross-tenant data)
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.adminSupabase = window.supabase;

// Per-client Supabase: instantiated by initializeClientSupabase() once we know
// which client we're rendering (from `?client=slug` + clients_config row).
window.clientSupabase = null;
window.initializeClientSupabase = function (url, anonKey) {
    if (!url || !anonKey) {
        console.warn('Client Supabase no configurado para este cliente; usando admin como fallback.');
        window.clientSupabase = window.adminSupabase;
        return window.clientSupabase;
    }
    window.clientSupabase = window.__supabaseCreateClient(url, anonKey);
    return window.clientSupabase;
};
