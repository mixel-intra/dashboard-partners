// ============================================================
// n8n · Code node · RESUMEN (digest) — Salud de Canales Kommo
// ============================================================
// Workflow:  [Schedule Trigger]  ->  [Code node con esto]
// Modo: Run Once for All Items. No usa Vercel.
// Cron recomendado (7am, 1pm, 7pm, 1am CDMX):  0 1,7,13,19 * * *
// (Timezone del workflow: America/Mexico_City)
//
// UN solo mensaje a Slack con, por cada cuenta y canal:
//   - estado (🟢 conectado / 🔴 sin registros en el umbral)  -> vista OPS
//   - registros recibidos (6h / 24h)                          -> vista MARKETING
// Al final limpia eventos > 48h (retención corta).
// ------------------------------------------------------------

const SUPABASE_URL = 'https://zwghwruwxzttsofaezjp.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2h3cnV3eHp0dHNvZmFlempwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzY3ODMsImV4cCI6MjA4Njg1Mjc4M30.c-DeJa9h4EA_oaiZPLHh_NV2fKsLO75O62VaerobToI';
const SLACK_DIGEST = 'https://hooks.slack.com/services/PEGA_AQUI_TU_WEBHOOK'; // <- pégalo en n8n, NO en el repo

const LABEL = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', telegram: 'Telegram', email: 'Email', livechat: 'Live Chat', telefonia: 'Telefonía' };
const H = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
const http = (opts) => this.helpers.httpRequest(opts);
const get = (path) => http({ method: 'GET', url: `${SUPABASE_URL}/rest/v1/${path}`, headers: H, json: true });

const now = Date.now();
const iso6 = new Date(now - 6 * 3600000).toISOString();
const iso24 = new Date(now - 24 * 3600000).toISOString();

const configs = await get('kommo_channel_config?esperado=eq.true&select=account_slug,canal,umbral_horas');
if (!configs.length) return [{ json: { skipped: 'sin canales configurados' } }];

const slugs = [...new Set(configs.map(c => c.account_slug))];
const inList = '(' + slugs.map(s => `"${s}"`).join(',') + ')';
const enc = encodeURIComponent(inList);

const hbs = await get(`kommo_channel_heartbeats?account_slug=in.${enc}&select=account_slug,canal,ultima_senal`);
const accts = await get(`clients_config?id_slug=in.${enc}&select=id_slug,name`);
const events = await get(`kommo_channel_events?account_slug=in.${enc}&ts=gte.${iso24}&select=account_slug,canal,ts`);

const hbMap = new Map(hbs.map(h => [h.account_slug + '|' + h.canal, h]));
const nameMap = new Map(accts.map(a => [a.id_slug, a.name]));

// Conteo por (cuenta|canal) en 6h y 24h
const cnt = {};
for (const e of events) {
    const k = e.account_slug + '|' + e.canal;
    if (!cnt[k]) cnt[k] = { c6: 0, c24: 0 };
    cnt[k].c24++;
    if (e.ts >= iso6) cnt[k].c6++;
}

// Agrupar por cuenta — una línea por canal, con texto claro
const byAcct = {};
for (const c of configs) {
    const k = c.account_slug + '|' + c.canal;
    const hb = hbMap.get(k);
    const last = hb && hb.ultima_senal ? new Date(hb.ultima_senal).getTime() : null;
    const caido = last === null || (now - last) > (c.umbral_horas || 6) * 3600000;
    const cc = cnt[k] || { c6: 0, c24: 0 };
    (byAcct[c.account_slug] = byAcct[c.account_slug] || { caido: false, lines: [] });
    if (caido) byAcct[c.account_slug].caido = true;
    const emoji = caido ? ':red_circle:' : ':large_green_circle:';
    const aviso = caido ? '  ⚠️ sin registros' : '';
    byAcct[c.account_slug].lines.push(`   ${emoji} ${LABEL[c.canal] || c.canal}: *${cc.c24}* registros hoy (${cc.c6} en últimas 6h)${aviso}`);
}

const conProblema = [], ok = [];
for (const slug of Object.keys(byAcct)) {
    const nombre = nameMap.get(slug) || slug;
    const block = `*${nombre}*\n` + byAcct[slug].lines.join('\n');
    (byAcct[slug].caido ? conProblema : ok).push(block);
}

const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' });
let text = `:bar_chart: *Resumen de Salud de Canales* · ${fecha}\n`;
text += `_"registros hoy" = últimas 24 h · entre paréntesis las últimas 6 h_\n\n`;
if (conProblema.length) text += `:red_circle: *Cuentas con algún canal sin registros (${conProblema.length})*\n\n` + conProblema.join('\n\n') + `\n\n`;
if (ok.length) text += `:large_green_circle: *Cuentas OK (${ok.length})*\n\n` + ok.join('\n\n');
if (!conProblema.length && !ok.length) text += '_Sin cuentas monitoreadas._';

await http({ method: 'POST', url: SLACK_DIGEST, headers: { 'Content-Type': 'application/json' }, body: { text }, json: true });

// Retención: borrar eventos de más de 48h (best-effort)
const iso48 = new Date(now - 48 * 3600000).toISOString();
await http({ method: 'DELETE', url: `${SUPABASE_URL}/rest/v1/kommo_channel_events?ts=lt.${iso48}`, headers: { ...H, Prefer: 'return=minimal' }, json: true }).catch(() => {});

return [{ json: { conProblema: conProblema.length, ok: ok.length, eventos24h: events.length } }];
