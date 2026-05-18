-- =======================================================
-- REPLICAR CLIENTES DE PRODUCCIÓN → DEV
-- Ejecutar en el SQL Editor del proyecto DEV:
-- https://supabase.com/dashboard/project/lhyeqfrkenbfgqllurip/sql/new
-- =======================================================

-- Limpiar clientes de prueba y reemplazar con los reales
DELETE FROM user_client_access; -- Primero limpiar accesos
DELETE FROM clients_config;     -- Luego limpiar clientes

INSERT INTO clients_config 
    (id_slug, name, webhook_url, logo_url, investment, sales_goal, username, password, theme_primary, theme_secondary)
VALUES
    (
        'hamptoncarmen',
        'Hampton Inn by Hilton Ciudad del Carmen',
        'https://cefemexyucatan.app.n8n.cloud/webhook/ce285ee2-cc8b-424d-b8aa-288050cbd320',
        'https://zwghwruwxzttsofaezjp.supabase.co/storage/v1/object/public/logos/hamptoncarmen-1771347841.png',
        5000, 280000, 'esteban', 'esteban', '#0022ff', '#00a2ff'
    ),
    (
        'doubletree-by-hilton',
        'DoubleTree by Hilton Hotel México City Santa Fe',
        'https://cefemexyucatan.app.n8n.cloud/webhook/ce285ee2-cc8b-424d-b8aa-288050cbd320',
        'https://zwghwruwxzttsofaezjp.supabase.co/storage/v1/object/public/logos/doubletree-by-hilton-1771343938.png',
        7000, 350000, 'eyder', 'eyder', '#ffffff', '#00c3ff'
    ),
    (
        'doubletree-mazatlan',
        'DoubleTree By Hilton Mazatlán',
        'https://cefemexyucatan.app.n8n.cloud/webhook/ce285ee2-cc8b-424d-b8aa-288050cbd320',
        'https://zwghwruwxzttsofaezjp.supabase.co/storage/v1/object/public/logos/doubletree-mazatlan-1771433402.png',
        2500, 356000, 'paty', 'paty', '#0077ff', '#00ddff'
    ),
    (
        'hamptonvillahermosa',
        'Hampton Inn by Hilton Villahermosa',
        'https://cefemexyucatan.app.n8n.cloud/webhook/ce285ee2-cc8b-424d-b8aa-288050cbd320',
        'https://zwghwruwxzttsofaezjp.supabase.co/storage/v1/object/public/logos/hamptonvillahermosa-1771515531.png',
        1500, 100000, 'maresa', 'maresa', '#007bff', '#9eb5ff'
    ),
    (
        'cefemex',
        'CEFEMEX',
        'https://cefemexyucatan.app.n8n.cloud/webhook/ce285ee2-cc8b-424d-b8aa-288050cbd320',
        'https://zwghwruwxzttsofaezjp.supabase.co/storage/v1/object/public/logos/cefemex-1771286176.png',
        9752, 200000, 'Robert', 'Robert', '#008533', '#8de29e'
    );


-- =======================================================
-- ASIGNAR TODOS LOS CLIENTES AL ADMIN
-- UUID del admin: 586391a5-cdb4-426c-a3ee-ef8637710e5e
-- =======================================================
INSERT INTO user_client_access (user_id, client_slug)
VALUES
    ('586391a5-cdb4-426c-a3ee-ef8637710e5e', 'hamptoncarmen'),
    ('586391a5-cdb4-426c-a3ee-ef8637710e5e', 'doubletree-by-hilton'),
    ('586391a5-cdb4-426c-a3ee-ef8637710e5e', 'doubletree-mazatlan'),
    ('586391a5-cdb4-426c-a3ee-ef8637710e5e', 'hamptonvillahermosa'),
    ('586391a5-cdb4-426c-a3ee-ef8637710e5e', 'cefemex');
