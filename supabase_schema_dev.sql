-- =======================================================
-- CEFEMEX DASHBOARD - ESQUEMA COMPLETO DEV / STAGING
-- Ejecutar en el SQL Editor del proyecto: lhyeqfrkenbfgqllurip
-- Este script elimina todo y lo recrea desde cero.
-- =======================================================


-- =======================================================
-- 0. LIMPIAR TABLAS EXISTENTES
-- =======================================================
DROP TABLE IF EXISTS user_client_access CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS clients_config CASCADE;


-- =======================================================
-- 1. TABLA ORIGINAL: clients_config
-- =======================================================
CREATE TABLE clients_config (
    id_slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_type TEXT DEFAULT 'otro' CHECK (client_type IN ('hotel', 'inmobiliaria', 'otro')),
    webhook_url TEXT,
    logo_url TEXT,
    investment NUMERIC DEFAULT 0,
    sales_goal DECIMAL(12,2) DEFAULT 0,
    username TEXT,
    password TEXT,
    theme_primary TEXT DEFAULT '#7551FF',
    theme_secondary TEXT DEFAULT '#01F1E3',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE clients_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura pública" ON clients_config FOR SELECT USING (true);
CREATE POLICY "Permitir gestión total" ON clients_config FOR ALL USING (true);


-- =======================================================
-- 2. NUEVA TABLA: user_profiles
--    Usuarios del portal (admins y partners)
-- =======================================================
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'partner' CHECK (role IN ('admin', 'partner')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura pública de users" ON user_profiles FOR SELECT USING (true);
CREATE POLICY "Permitir gestión total de users" ON user_profiles FOR ALL USING (true);


-- =======================================================
-- 3. NUEVA TABLA: user_client_access
--    Relación Muchos-a-Muchos: usuario <-> cliente
-- =======================================================
CREATE TABLE user_client_access (
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    client_slug TEXT NOT NULL REFERENCES clients_config(id_slug) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, client_slug)
);

ALTER TABLE user_client_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura de accesos" ON user_client_access FOR SELECT USING (true);
CREATE POLICY "Permitir gestión de accesos" ON user_client_access FOR ALL USING (true);


-- =======================================================
-- 4. DATOS DE PRUEBA (Clientes)
-- =======================================================
INSERT INTO clients_config (id_slug, name, webhook_url, investment, sales_goal, theme_primary, theme_secondary)
VALUES
    ('cefemex', 'CEFEMEX Capital', 'https://n8n.intra.com/webhook/cefemex', 500000, 1500000, '#00AA55', '#01F1E3'),
    ('demo-client', 'Cliente Demo', 'https://n8n.intra.com/webhook/demo', 100000, 300000, '#7551FF', '#01F1E3');


-- =======================================================
-- 5. DATOS DE PRUEBA (Usuario Administrador)
-- =======================================================
INSERT INTO user_profiles (email, password, name, role)
VALUES
    ('admin@intra.mx', 'Admin.2026', 'Administrador Intra', 'admin');

-- =======================================================
-- 6. ASIGNAR ACCESOS AL ADMIN
--    Reemplaza el UUID por el que retorna Supabase.
-- =======================================================
-- Primero obtén el ID: SELECT id FROM user_profiles WHERE email = 'admin@intra.mx';
-- Luego ejecuta:
-- INSERT INTO user_client_access (user_id, client_slug)
-- VALUES
--     ('<UUID_DEL_ADMIN>', 'cefemex'),
--     ('<UUID_DEL_ADMIN>', 'demo-client');


-- =======================================================
-- FIN DEL SCRIPT
-- =======================================================
