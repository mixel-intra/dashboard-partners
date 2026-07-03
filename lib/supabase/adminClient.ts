import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Cliente admin de Supabase (proyecto compartido: clients_config, user_profiles,
// reviews, kommo_*). Reemplaza a window.supabase / window.adminSupabase del legacy.
// El anon key es público por diseño (igual que hoy, hardcodeado en config.js),
// pero ahora vive en env para no tenerlo regado en el código.

let admin: SupabaseClient | null = null;

export function getAdminSupabase(): SupabaseClient {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_ADMIN_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_ADMIN_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        'Faltan NEXT_PUBLIC_ADMIN_SUPABASE_URL / NEXT_PUBLIC_ADMIN_SUPABASE_ANON_KEY en el entorno.'
      );
    }
    admin = createClient(url, key);
  }
  return admin;
}
