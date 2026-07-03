// ============================================================
// n8n · Code node · SWEEP (vencimiento + Slack) — Salud de Canales Kommo
// ============================================================
// Workflow nuevo:  [Schedule Trigger cada 10 min]  ->  [Code node con esto]
// Modo: Run Once for All Items. No usa Vercel.
//
// Qué hace, en TODAS las cuentas con canales esperados:
//  - Si un canal lleva más de su umbral sin señal y NO estaba alertado -> Slack 🔴 + en_alerta=true
//  - Si un canal estaba alertado y volvió a recibir señal -> Slack 🟢 + en_alerta=false
// Dedup natural: usa el flag en_alerta (1 aviso por caída, sin spam).
// ------------------------------------------------------------

const SUPABASE_URL = 'https://zwghwruwxzttsofaezjp.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2h3cnV3eHp0dHNvZmFlempwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzY3ODMsImV4cCI6MjA4Njg1Mjc4M30.c-DeJa9h4EA_oaiZPLHh_NV2fKsLO75O62VaerobToI';
const SLACK_DEFAULT = 'https://hooks.slack.com/services/PEGA_AQUI_TU_WEBHOOK'; // <- canal de respaldo

const H = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
const http = (opts) => this.helpers.httpRequest(opts);
const get = (path) => http({ method: 'GET', url: `${SUPABASE_URL}/rest/v1/${path}`, headers: H, json: true });
const slack = async (url, text) => { if (!url || url.includes('PEGA_AQUI')) return false; try { await http({ method: 'POST', url, headers: { 'Content-Type': 'application/json' }, body: { text }, json: true }); return true; } catch (e) { return false; } };

const ago = (iso, now) => {
    if (!iso) return 'sin señal previa';
    const m = Math.floor((now - new Date(iso).getTime()) / 60000);
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60); return h < 48 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
};

const configs = await get('kommo_channel_config?esperado=eq.true&select=account_slug,canal,umbral_horas');
if (!configs.length) return [{ json: { checked: 0, alerts: [] } }];

const slugs = [...new Set(configs.map(c => c.account_slug))];
const inList = '(' + slugs.map(s => `"${s}"`).join(',') + ')';
const hbs = await get(`kommo_channel_heartbeats?account_slug=in.${encodeURIComponent(inList)}&select=account_slug,canal,ultima_senal,en_alerta`);
const accts = await get(`clients_config?id_slug=in.${encodeURIComponent(inList)}&select=id_slug,name,kommo_slack_webhook_url`);

const hbMap = new Map(hbs.map(h => [h.account_slug + '|' + h.canal, h]));
const acctMap = new Map(accts.map(a => [a.id_slug, a]));
const now = Date.now();
const alerts = [];

const setAlerta = (slug, canal, ultima, val) => http({
    method: 'POST',
    url: `${SUPABASE_URL}/rest/v1/kommo_channel_heartbeats?on_conflict=account_slug,canal`,
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { account_slug: slug, canal, ultima_senal: ultima || null, en_alerta: val },
    json: true
});
const logAlert = (slug, nombre, canal, tipo, detalle) => http({
    method: 'POST', url: `${SUPABASE_URL}/rest/v1/kommo_alerts_log`,
    headers: { ...H, Prefer: 'return=minimal' },
    body: { account_slug: slug, nombre, canal, tipo, detalle }, json: true
}).catch(() => {}); // historial best-effort (ignora duplicado del día)

for (const c of configs) {
    const hb = hbMap.get(c.account_slug + '|' + c.canal);
    const last = hb && hb.ultima_senal ? new Date(hb.ultima_senal).getTime() : null;
    const caido = last === null || (now - last) > (c.umbral_horas || 6) * 3600000;
    const wasAlert = !!(hb && hb.en_alerta);
    const acct = acctMap.get(c.account_slug) || {};
    const nombre = acct.name || c.account_slug;
    const slackUrl = acct.kommo_slack_webhook_url || SLACK_DEFAULT;

    if (caido && !wasAlert) {
        await setAlerta(c.account_slug, c.canal, hb && hb.ultima_senal, true);
        await logAlert(c.account_slug, nombre, c.canal, 'caida', `sin señal ${ago(hb && hb.ultima_senal, now)} (umbral ${c.umbral_horas}h)`);
        await slack(slackUrl, `:red_circle: *[${nombre}] ${c.canal} sin registros nuevos* — último ${ago(hb && hb.ultima_senal, now)} (umbral ${c.umbral_horas} h). No entran leads por este canal; revisar conexión en Kommo.`);
        alerts.push({ account: c.account_slug, canal: c.canal, tipo: 'caida' });
    } else if (!caido && wasAlert) {
        await setAlerta(c.account_slug, c.canal, hb && hb.ultima_senal, false);
        await logAlert(c.account_slug, nombre, c.canal, 'recuperacion', 'volvió a recibir actividad');
        await slack(slackUrl, `:large_green_circle: *[${nombre}] ${c.canal} recuperado* — volvió a recibir actividad.`);
        alerts.push({ account: c.account_slug, canal: c.canal, tipo: 'recuperacion' });
    }
}

return [{ json: { checked: configs.length, alerts } }];
