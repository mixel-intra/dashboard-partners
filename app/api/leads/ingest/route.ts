import { type NextRequest } from 'next/server';
import { corsJson, corsPreflight } from '@/lib/api/cors';
import { requireEnv } from '@/lib/api/env';
import { ingestClient } from '@/lib/api/supabaseServer';

// Endpoint que n8n llama cuando un lead pasa a etapa calificada.
// Port 1:1 de legacy/api/leads/ingest.js. Persiste el payload en
// qualified_leads (onConflict lead_id) para que /lead?id=<lead_id> renderice
// sin depender del webhook. OJO: usa SUPABASE_URL (proyecto per-cliente),
// NO el proyecto admin. El secret ya NO tiene fallback de dev.
//
// USO desde n8n:
//   POST /api/leads/ingest
//   Authorization: Bearer <LEADS_INGEST_SECRET>
//   Body: { client_id, lead_id, payload{...}, sucursal?, estatus? }

const METHODS = 'POST, OPTIONS';

export async function POST(req: NextRequest) {
  let ingestSecret: string;
  try {
    ingestSecret = requireEnv('LEADS_INGEST_SECRET');
  } catch (e: any) {
    return corsJson({ error: e.message }, 500, METHODS);
  }

  // ── Auth con secret compartido ─────────────────────────────
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== ingestSecret) {
    return corsJson({ error: 'unauthorized' }, 401, METHODS);
  }

  // ── Body ───────────────────────────────────────────────────
  let body: any = {};
  try {
    body = (await req.json()) || {};
  } catch {
    body = {};
  }
  const client_id = body.client_id || body.client || body.entorno;
  const lead_id = body.lead_id || body.id || body.leadId;
  const payload = body.payload || body.data || {};

  if (!client_id || !lead_id) {
    return corsJson({ error: 'client_id y lead_id son requeridos' }, 400, METHODS);
  }
  if (typeof payload !== 'object' || payload === null) {
    return corsJson({ error: 'payload debe ser un objeto JSON' }, 400, METHODS);
  }

  // Permite override explícito de sucursal/estatus; si no, los extrae del payload.
  const sucursal =
    body.sucursal != null ? String(body.sucursal) : payload.sucursal_sugerida || payload.sucursal || null;
  const estatus =
    body.estatus != null ? String(body.estatus) : payload.estatus || payload.estado || null;

  const row = {
    lead_id: String(lead_id),
    client_id: String(client_id),
    payload,
    sucursal,
    estatus,
    updated_at: new Date().toISOString(),
  };

  try {
    const supabase = ingestClient();
    const { error } = await supabase.from('qualified_leads').upsert(row, { onConflict: 'lead_id' });

    if (error) {
      console.error('[leads-ingest] supabase error:', error);
      return corsJson({ error: error.message }, 500, METHODS);
    }

    return corsJson(
      {
        ok: true,
        lead_id: row.lead_id,
        share_url: `https://reporteintra.vercel.app/lead?id=${encodeURIComponent(row.lead_id)}`,
      },
      200,
      METHODS
    );
  } catch (err: any) {
    console.error('[leads-ingest] unexpected:', err);
    return corsJson({ error: err.message || 'unexpected error' }, 500, METHODS);
  }
}

export function OPTIONS() {
  return corsPreflight(METHODS);
}
