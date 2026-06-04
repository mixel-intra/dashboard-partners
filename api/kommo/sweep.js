// api/kommo/sweep.js
// Job de vencimiento del Monitor de Salud de Canales (Kommo).
// Lo dispara n8n (Schedule node) cada ~10-15 min:
//   GET https://reporteintra.vercel.app/api/kommo/sweep?secret=<CRON_SECRET>
// Manual (una cuenta):
//   POST https://reporteintra.vercel.app/api/kommo/sweep?client=<slug>&secret=<CRON_SECRET>
//
// Para cada (cuenta, canal) con esperado=true: si now - ultima_senal > umbral_horas
// → CAÍDA. Deduplica con kommo_alerts_log (1 por cuenta+canal+día) y solo si la
// alerta es NUEVA manda Slack. La recuperación se notifica desde heartbeat.js.

const { getAdmin, postSlack, fmtAgo, sendCors } = require('./_lib');

module.exports = async function handler(req, res) {
    sendCors(res, 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();

    // ── Auth (CRON_SECRET si está configurado) ─────────────────
    if (process.env.CRON_SECRET) {
        const provided = req.query?.secret
            || String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
        if (provided !== process.env.CRON_SECRET) {
            return res.status(401).json({ error: 'unauthorized' });
        }
    }

    let admin;
    try { admin = getAdmin(); }
    catch (e) { return res.status(500).json({ error: e.message }); }

    const targetSlug = req.query?.client || null;
    const nowMs = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    try {
        // 1. Canales esperados (config).
        let cfgQ = admin.from('kommo_channel_config')
            .select('account_slug, canal, umbral_horas')
            .eq('esperado', true);
        if (targetSlug) cfgQ = cfgQ.eq('account_slug', targetSlug);
        const { data: configs, error: cErr } = await cfgQ;
        if (cErr) return res.status(500).json({ error: 'config: ' + cErr.message });
        if (!configs?.length) return res.status(200).json({ ok: true, checked: 0, alerts: [] });

        const slugs = [...new Set(configs.map(c => c.account_slug))];

        // 2. Latidos y datos de cuenta (nombre + slack) en bloque.
        const [{ data: hbs }, { data: accts }] = await Promise.all([
            admin.from('kommo_channel_heartbeats')
                .select('account_slug, canal, ultima_senal, en_alerta')
                .in('account_slug', slugs),
            admin.from('clients_config')
                .select('id_slug, name, kommo_slack_webhook_url')
                .in('id_slug', slugs)
        ]);
        const hbMap = new Map((hbs || []).map(h => [`${h.account_slug}|${h.canal}`, h]));
        const acctMap = new Map((accts || []).map(a => [a.id_slug, a]));
        const defaultSlack = process.env.SLACK_DEFAULT_WEBHOOK_URL || null;

        const alerts = [];

        // 3. Evaluar vencimientos.
        for (const cfg of configs) {
            const key = `${cfg.account_slug}|${cfg.canal}`;
            const hb = hbMap.get(key);
            const lastMs = hb?.ultima_senal ? new Date(hb.ultima_senal).getTime() : null;
            const umbralMs = (cfg.umbral_horas || 6) * 3600 * 1000;
            const caido = lastMs === null || (nowMs - lastMs) > umbralMs;
            if (!caido) continue;

            const acct = acctMap.get(cfg.account_slug);
            const nombre = acct?.name || cfg.account_slug;

            // Dedup: 1 alerta de caída por cuenta+canal+día.
            // insert directo: si choca con el unique → ya se avisó hoy (code 23505).
            const { error: logErr } = await admin
                .from('kommo_alerts_log')
                .insert({
                    account_slug: cfg.account_slug, nombre, canal: cfg.canal,
                    tipo: 'caida',
                    detalle: `sin señal ${fmtAgo(hb?.ultima_senal, nowMs)} (umbral ${cfg.umbral_horas}h)`,
                    fail_date: today
                });
            const isNew = !logErr;
            if (logErr && logErr.code !== '23505') console.error('[kommo/sweep] log:', logErr.message);

            // Marcar en_alerta (crea la fila de heartbeat si no existía).
            await admin.from('kommo_channel_heartbeats')
                .upsert({
                    account_slug: cfg.account_slug, canal: cfg.canal,
                    ultima_senal: hb?.ultima_senal || null,
                    en_alerta: true, updated_at: new Date().toISOString()
                }, { onConflict: 'account_slug,canal' });

            let notified = false;
            if (isNew) {
                const url = acct?.kommo_slack_webhook_url || defaultSlack;
                const ago = hb?.ultima_senal ? `última actividad ${fmtAgo(hb.ultima_senal, nowMs)}` : 'nunca ha recibido señal';
                notified = await postSlack(url,
                    `:red_circle: *[${nombre}] ${cfg.canal} sin señal* — ${ago} (umbral ${cfg.umbral_horas} h). ` +
                    `El canal está marcado como activo pero no recibe registros. Revisar conexión en Kommo.`);
            }

            alerts.push({ account: cfg.account_slug, canal: cfg.canal, nueva: isNew, slack: notified });
        }

        return res.status(200).json({ ok: true, checked: configs.length, caidas: alerts.length, alerts });
    } catch (err) {
        console.error('[kommo/sweep] fatal:', err);
        return res.status(500).json({ error: err.message });
    }
};
