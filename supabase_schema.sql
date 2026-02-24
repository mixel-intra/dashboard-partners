-- Script para crear la tabla de configuración de clientes
CREATE TABLE clients_config (
    id_slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    webhook_url TEXT,
    logo_url TEXT,
    investment NUMERIC DEFAULT 0,
    investment_updated_at DATE,
    sales_goal DECIMAL(12,2) DEFAULT 0,
    username TEXT,
    password TEXT,
    theme_primary TEXT DEFAULT '#7551FF',
    theme_secondary TEXT DEFAULT '#01F1E3',
    client_type TEXT DEFAULT 'otro' CHECK (client_type IN ('hotel', 'inmobiliaria', 'otro')),
    card_labels JSONB DEFAULT '{}',
    hotel_services JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE clients_config ENABLE ROW LEVEL SECURITY;

-- Crear política para permitir lectura pública (opcional, dependiendo de tu seguridad)
CREATE POLICY "Permitir lectura pública" ON clients_config FOR SELECT USING (true);

-- Crear política para permitir gestión total
CREATE POLICY "Permitir gestión total" ON clients_config FOR ALL USING (true);
