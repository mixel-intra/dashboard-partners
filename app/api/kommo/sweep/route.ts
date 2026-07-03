import { NextResponse, type NextRequest } from 'next/server';
import { fmtAgo, getAdmin, kommoCorsHeaders, postSlack } from '../_lib';

// Job de vencimiento del Monitor de Salud de Canales (Kommo).
// Port 1:1 de legacy/api/kommo/sweep.js. Lo dispara n8n (Schedule ~10-15 min):
//   GET  /api/kommo/sweep?secret=<CRON_SECRET>
//   POST /api/kommo/sweep?client=<slug>&secret=<CRON_SECRET>   (manual, una cuenta)
//
// Para cada (cuenta, canal) con esperado=true: si now - ultima_senal > umbral_horas
// → CAÍDA. Dedup con kommo_alerts_log (1 por cuenta+canal+día); solo alerta NUEVA
// manda Slack. La recuperación se notifica desde heartbeat.

const METHODS = 'GET, POST, OPTIONS';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: kommoCorsHeaders(METHODS) });
}

async function handleSweep(req: NextRequest) {
  // ── Auth (CRON_SECRET si está configurado) ─────────────────
  if (process.env.CRON_SECRET) {
    const provided =
      req.nextUrl.searchParams.get('secret') ||
      (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (provided !== process.env.CRON_SECRET) {
      return json({ error: 'unauthorized' }, 401);
    }
  }

  let admin;
  try {
    admin = getAdmin();
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }

  const targetSlug = req.nextUrl.searchParams.get('client') || null;
  const nowMs = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  try {
    // 1. Canales esperados (config).
    let cfgQ = admin
      .from('kommo_channel_config')
      .select('account_slug, canal, umbral_horas')
      .eq('esperado', true);
    if (targetSlug) cfgQ = cfgQ.eq('account_slug', targetSlug);
    const { data: configs, error: cErr } = await cfgQ;
    if (cErr) return json({ error: 'config: ' + cErr.message }, 500);
    if (!configs?.length) return json({ ok: true, checked: 0, alerts: [] });

    const slugs = [...new Set(configs.map((c) => c.account_slug))];

    // 2. Latidos y datos de cuenta (nombre + slack) en bloque.
    const [{ data: hbs }, { data: accts }] = await Promise.all([
      admin
        .from('kommo_channel_heartbeats')
        .select('account_slug, canal, ultima_senal, en_alerta')
        .in('account_slug', slugs),
      admin.from('clients_config').select('id_slug, name, kommo_slack_webhook_url').in('id_slug', slugs),
    ]);
    const hbMap = new Map<string, any>((hbs || []).map((h: any) => [`${h.account_slug}|${h.canal}`, h]));
    const acctMap = new Map<string, any>((accts || []).map((a: any) => [a.id_slug, a]));
    const defaultSlack = process.env.SLACK_DEFAULT_WEBHOOK_URL || null;

    const alerts: { account: string; canal: string; nueva: boolean; slack: boolean }[] = [];

    // 3. Evaluar vencimientos.
    for (const cfg of configs) {
      const key = `${cfg.account_slug}|${cfg.canal}`;
      const hb = hbMap.get(key);
      const lastMs = hb?.ultima_senal ? new Date(hb.ultima_senal).getTime() : null;
      const umbralMs = (cfg.umbral_horas || 6) * 3600 * 1000;
      const caido = lastMs === null || nowMs - lastMs > umbralMs;
      if (!caido) continue;

      const acct = acctMap.get(cfg.account_slug);
      const nombre = acct?.name || cfg.account_slug;

      // Dedup: 1 alerta de caída por cuenta+canal+día.
      // insert directo: si choca con el unique → ya se avisó hoy (code 23505).
      const { error: logErr } = await admin.from('kommo_alerts_log').insert({
        account_slug: cfg.account_slug,
        nombre,
        canal: cfg.canal,
        tipo: 'caida',
        detalle: `sin señal ${fmtAgo(hb?.ultima_senal, nowMs)} (umbral ${cfg.umbral_horas}h)`,
        fail_date: today,
      });
      const isNew = !logErr;
      if (logErr && logErr.code !== '23505') console.error('[kommo/sweep] log:', logErr.message);

      // Marcar en_alerta (crea la fila de heartbeat si no existía).
      await admin.from('kommo_channel_heartbeats').upsert(
        {
          account_slug: cfg.account_slug,
          canal: cfg.canal,
          ultima_senal: hb?.ultima_senal || null,
          en_alerta: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'account_slug,canal' }
      );

      let notified = false;
      if (isNew) {
        const url = acct?.kommo_slack_webhook_url || defaultSlack;
        const ago = hb?.ultima_senal
          ? `última actividad ${fmtAgo(hb.ultima_senal, nowMs)}`
          : 'nunca ha recibido señal';
        notified = await postSlack(
          url,
          `:red_circle: *[${nombre}] ${cfg.canal} sin señal* — ${ago} (umbral ${cfg.umbral_horas} h). ` +
            `El canal está marcado como activo pero no recibe registros. Revisar conexión en Kommo.`
        );
      }

      alerts.push({ account: cfg.account_slug, canal: cfg.canal, nueva: isNew, slack: notified });
    }

    return json({ ok: true, checked: configs.length, caidas: alerts.length, alerts });
  } catch (err: any) {
    console.error('[kommo/sweep] fatal:', err);
    return json({ error: err.message }, 500);
  }
}

export const GET = handleSweep;
export const POST = handleSweep;
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: kommoCorsHeaders(METHODS) });
}
