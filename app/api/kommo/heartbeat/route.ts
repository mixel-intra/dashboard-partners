import { NextResponse, type NextRequest } from 'next/server';
import { getAdmin, kommoCorsHeaders, normalizeCanal, postSlack } from '../_lib';

// Receptor de "latidos" del Monitor de Salud de Canales (Kommo).
// Port 1:1 de legacy/api/kommo/heartbeat.js.
//
// USO (desde SalesBot/n8n):
//   POST /api/kommo/heartbeat?client=<slug>
//   X-Webhook-Secret: <KOMMO_WEBHOOK_SECRET>  (o Authorization: Bearer <secret>)
//   Body: { "canal": "whatsapp", "evento": "inbound", "ts": "..." }

const METHODS = 'POST, OPTIONS';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: kommoCorsHeaders(METHODS) });
}

export async function POST(req: NextRequest) {
  const WEBHOOK_SECRET = process.env.KOMMO_WEBHOOK_SECRET || '';

  // ── Auth con secreto compartido ────────────────────────────
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const token = req.headers.get('x-webhook-secret') || bearer;
  if (!WEBHOOK_SECRET || token !== WEBHOOK_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  // ── Parámetros ─────────────────────────────────────────────
  let body: any = {};
  try {
    body = (await req.json()) || {};
  } catch {
    body = {};
  }
  const slug = String(
    req.nextUrl.searchParams.get('client') || body.client || body.account || body.slug || ''
  ).trim();
  const canal = normalizeCanal(body.canal || body.channel || body.source);
  if (!slug) return json({ error: 'cuenta requerida (?client=<slug> o body.client)' }, 400);
  if (!canal)
    return json({ error: 'canal inválido o ausente', recibido: body.canal || body.channel || null }, 400);

  // ts opcional; si viene inválido usamos ahora.
  let ts = new Date();
  if (body.ts) {
    const d = new Date(body.ts);
    if (!isNaN(d.getTime())) ts = d;
  }
  const tsIso = ts.toISOString();

  let admin;
  try {
    admin = getAdmin();
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }

  try {
    // Validar que la cuenta existe (FK) y traer nombre + webhook de slack.
    const { data: acct, error: aErr } = await admin
      .from('clients_config')
      .select('id_slug, name, kommo_slack_webhook_url, kommo_config')
      .eq('id_slug', slug)
      .maybeSingle();
    if (aErr) return json({ error: 'admin db: ' + aErr.message }, 500);
    if (!acct) return json({ error: `cuenta "${slug}" no existe en clients_config` }, 404);

    // Estado previo del canal (para detectar recuperación y acumular volumen).
    const { data: prev } = await admin
      .from('kommo_channel_heartbeats')
      .select('total_24h, en_alerta')
      .eq('account_slug', slug)
      .eq('canal', canal)
      .maybeSingle();

    const recuperado = prev?.en_alerta === true;

    const { error: upErr } = await admin.from('kommo_channel_heartbeats').upsert(
      {
        account_slug: slug,
        canal,
        ultima_senal: tsIso,
        total_24h: (prev?.total_24h || 0) + 1,
        en_alerta: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_slug,canal' }
    );
    if (upErr) return json({ error: 'upsert: ' + upErr.message }, 500);

    // ── Recuperación: el canal estaba caído y volvió a recibir ──
    let recoveryNotified = false;
    if (recuperado) {
      const recEnabled = acct.kommo_config?.recuperacion !== false; // default ON, toggle
      // Log dedup (1 recuperación por cuenta+canal+día): insert + captura 23505.
      const { error: logErr } = await admin.from('kommo_alerts_log').insert({
        account_slug: slug,
        nombre: acct.name,
        canal,
        tipo: 'recuperacion',
        detalle: 'inbound recibido tras caída',
      });
      const isNew = !logErr;
      if (logErr && logErr.code !== '23505') console.error('[kommo/heartbeat] log:', logErr.message);
      if (recEnabled && isNew) {
        const url = acct.kommo_slack_webhook_url || process.env.SLACK_DEFAULT_WEBHOOK_URL;
        recoveryNotified = await postSlack(
          url,
          `:large_green_circle: *[${acct.name}] ${canal} recuperado* — volvió a recibir actividad.`
        );
      }
    }

    return json({ ok: true, account: slug, canal, ultima_senal: tsIso, recuperado, recoveryNotified });
  } catch (err: any) {
    console.error('[kommo/heartbeat] unexpected:', err);
    return json({ error: err.message || 'unexpected error' }, 500);
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: kommoCorsHeaders(METHODS) });
}
