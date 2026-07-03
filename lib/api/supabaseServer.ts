import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireAnyEnv, requireEnv } from './env';

// Clientes Supabase server-side. Cada endpoint conserva EXACTAMENTE la misma
// resolución de proyecto que su versión legacy:
// - leads/list y reservations/create → proyecto admin (ADMIN_SUPABASE_URL || SUPABASE_URL)
// - leads/ingest → proyecto per-cliente (SUPABASE_URL, ¡no el admin!)
// - scrape-reviews y kommo/* → admin con SERVICE key (bypass RLS)

export function adminAnonClient(): SupabaseClient {
  return createClient(
    requireAnyEnv('ADMIN_SUPABASE_URL', 'SUPABASE_URL'),
    requireEnv('SUPABASE_ANON_KEY')
  );
}

export function ingestClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'));
}

export function adminServiceClient(): SupabaseClient {
  return createClient(requireEnv('ADMIN_SUPABASE_URL'), requireEnv('ADMIN_SUPABASE_SERVICE_KEY'), {
    auth: { persistSession: false },
  });
}
