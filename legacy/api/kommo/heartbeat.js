// api/kommo/heartbeat.js
// Receptor de "latidos" del Monitor de Salud de Canales (Kommo).
// Cada inbound de Kommo (vía SalesBot/n8n) llama aquí → registramos que el canal vive.
//
// USO (desde SalesBot/n8n, HTTP Request node):
//   POST https://reporteintra.vercel.app/api/kommo/heartbeat?client=<slug>
//   Headers:
//     X-Webhook-Secret: <KOMMO_WEBHOOK_SECRET>   (o  Authorization: Bearer <secret>)
//     Content-Type: application/json
//   Body JSON:
//     { "canal": "whatsapp", "evento": "inbound", "ts": "2026-06-02T15:00:00Z" }
//   (la cuenta puede ir en ?client=<slug> o en body.client)

const { normalizeCanal, getAdmin, postSlack, sendCors } = require('./_lib');

const WEBHOOK_SECRET = process.env.KOMMO_WEBHOOK_SECRET || '';

module.exports = async function handler(req, res) {
    sendCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    // ── Auth con secreto compartido ────────────────────────────
    const bearer = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const token  = req.headers['x-webhook-secret'] || bearer;
    if (!WEBHOOK_SECRET || token !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'unauthorized' });
    }

    // ── Parámetros ─────────────────────────────────────────────
    const body  = req.body || {};
    const slug  = String(req.query?.client || body.client || body.account || body.slug || '').trim();
    const canal = normalizeCanal(body.canal || body.channel || body.source);
    if (!slug)  return res.status(400).json({ error: 'cuenta requerida (?client=<slug> o body.client)' });
    if (!canal) return res.status(400).json({ error: 'canal inválido o ausente', recibido: body.canal || body.channel || null });

    // ts opcional; si viene inválido usamos ahora.
    let ts = new Date();
    if (body.ts) { const d = new Date(body.ts); if (!isNaN(d.getTime())) ts = d; }
    const tsIso = ts.toISOString();

    let admin;
    try { admin = getAdmin(); }
    catch (e) { return res.status(500).json({ error: e.message }); }

    try {
        // Validar que la cuenta existe (FK) y traer nombre + webhook de slack.
        const { data: acct, error: aErr } = await admin
            .from('clients_config')
            .select('id_slug, name, kommo_slack_webhook_url, kommo_config')
            .eq('id_slug', slug)
            .maybeSingle();
        if (aErr) return res.status(500).json({ error: 'admin db: ' + aErr.message });
        if (!acct) return res.status(404).json({ error: `cuenta "${slug}" no existe en clients_config` });

        // Estado previo del canal (para detectar recuperación y acumular volumen).
        const { data: prev } = await admin
            .from('kommo_channel_heartbeats')
            .select('total_24h, en_alerta')
            .eq('account_slug', slug)
            .eq('canal', canal)
            .maybeSingle();

        const recuperado = prev?.en_alerta === true;

        const { error: upErr } = await admin
            .from('kommo_channel_heartbeats')
            .upsert({
                account_slug: slug,
                canal,
                ultima_senal: tsIso,
                total_24h: (prev?.total_24h || 0) + 1,
                en_alerta: false,
                updated_at: new Date().toISOString()
            }, { onConflict: 'account_slug,canal' });
        if (upErr) return res.status(500).json({ error: 'upsert: ' + upErr.message });

        // ── Recuperación: el canal estaba caído y volvió a recibir ──
        let recoveryNotified = false;
        if (recuperado) {
            const recEnabled = acct.kommo_config?.recuperacion !== false; // default ON, toggle
            // Log dedup (1 recuperación por cuenta+canal+día): insert + captura 23505.
            const { error: logErr } = await admin
                .from('kommo_alerts_log')
                .insert({
                    account_slug: slug, nombre: acct.name, canal,
                    tipo: 'recuperacion', detalle: 'inbound recibido tras caída'
                });
            const isNew = !logErr;
            if (logErr && logErr.code !== '23505') console.error('[kommo/heartbeat] log:', logErr.message);
            if (recEnabled && isNew) {
                const url = acct.kommo_slack_webhook_url || process.env.SLACK_DEFAULT_WEBHOOK_URL;
                recoveryNotified = await postSlack(url,
                    `:large_green_circle: *[${acct.name}] ${canal} recuperado* — volvió a recibir actividad.`);
            }
        }

        return res.status(200).json({ ok: true, account: slug, canal, ultima_senal: tsIso, recuperado, recoveryNotified });
    } catch (err) {
        console.error('[kommo/heartbeat] unexpected:', err);
        return res.status(500).json({ error: err.message || 'unexpected error' });
    }
};
