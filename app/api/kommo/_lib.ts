// Utilidades compartidas del Monitor de Salud de Canales (Kommo).
// Port 1:1 de legacy/api/kommo/_lib.js. NOTA: la lógica viva del monitor corre
// en n8n (ver docs/n8n/); estos endpoints son la alternativa Vercel que se
// conserva por paridad.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Canales soportados (brief §10). Clave canónica interna.
export const ALLOWED_CANALES = [
  'whatsapp',
  'instagram',
  'facebook',
  'telegram',
  'email',
  'livechat',
  'telefonia',
];

// Mapea variantes/sinónimos del payload a la clave canónica.
// Incluye los tokens reales de Kommo (campo message[add][0][origin]):
//   waba / wz / wz_* → whatsapp · instagram_business → instagram · facebook → facebook
const CANAL_ALIASES: Record<string, string> = {
  // WhatsApp (Kommo: waba=WhatsApp Business API; wz=Wazzup; lite=WhatsApp Lite)
  wa: 'whatsapp',
  'whatsapp business': 'whatsapp',
  whatsapp_business: 'whatsapp',
  waba: 'whatsapp',
  wz: 'whatsapp',
  wapi: 'whatsapp',
  wa_lite: 'whatsapp',
  whatsapp_lite: 'whatsapp',
  // Instagram (Kommo: instagram_business)
  ig: 'instagram',
  insta: 'instagram',
  instagram_business: 'instagram',
  instagram_business_account: 'instagram',
  // Facebook / Messenger
  fb: 'facebook',
  messenger: 'facebook',
  'facebook messenger': 'facebook',
  fbmessenger: 'facebook',
  // Telegram
  tg: 'telegram',
  telegram_bot: 'telegram',
  // Email
  mail: 'email',
  correo: 'email',
  // Live chat / chat web
  'live chat': 'livechat',
  live_chat: 'livechat',
  chat: 'livechat',
  webchat: 'livechat',
  online_chat: 'livechat',
  // Telefonía
  telefono: 'telefonia',
  phone: 'telefonia',
  call: 'telefonia',
  telephony: 'telefonia',
};

// Normaliza un nombre de canal: minúsculas, sin tildes, sinónimos → canónico.
export function normalizeCanal(raw: unknown): string | null {
  if (!raw) return null;
  const k = String(raw)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const mapped = CANAL_ALIASES[k] || k;
  return ALLOWED_CANALES.includes(mapped) ? mapped : null;
}

// Cliente admin (service key, bypass RLS) — mismo patrón que scrape-reviews.
export function getAdmin(): SupabaseClient {
  const url = process.env.ADMIN_SUPABASE_URL;
  const key = process.env.ADMIN_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    const err = new Error('ADMIN_SUPABASE_URL / ADMIN_SUPABASE_SERVICE_KEY missing') as Error & {
      code?: string;
    };
    err.code = 'no_admin_env';
    throw err;
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// Envía un mensaje a un Incoming Webhook de Slack (mismo patrón del workflow n8n).
// Devuelve true si Slack respondió ok; nunca lanza (las alertas no deben tumbar el job).
export async function postSlack(webhookUrl: string | null | undefined, text: string): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) {
      console.error('[kommo] slack', r.status, (await r.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[kommo] slack error:', e.message);
    return false;
  }
}

// "hace 7 h", "hace 12 min", "sin señal previa" — para mensajes de Slack/log.
export function fmtAgo(fromIso: string | null | undefined, toMs = Date.now()): string {
  if (!fromIso) return 'sin señal previa';
  const diffMin = Math.floor((toMs - new Date(fromIso).getTime()) / 60000);
  if (diffMin < 1) return 'hace <1 min';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function kommoCorsHeaders(methods = 'POST, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Webhook-Secret',
  };
}
