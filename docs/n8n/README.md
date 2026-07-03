# Monitor de Salud de Canales (Kommo)

Modelo **"latido" (dead-man's switch)**: cada inbound de Kommo dispara un webhook que registra
que el canal vive. Un *sweep* periódico marca en rojo + avisa a Slack los canales **esperados**
que llevan más del umbral sin señal.

## Piezas

| Pieza | Archivo | Quién lo llama |
|---|---|---|
| Receptor de latidos | `api/kommo/heartbeat.js` | SalesBot/n8n de cada cuenta, en cada inbound |
| Job de vencimiento | `api/kommo/sweep.js` | n8n Schedule node cada ~10-15 min |
| Tablas | `migrations/admin-supabase/007_kommo_channel_health.sql` | (aplicar en Supabase admin) |
| Utils | `api/kommo/_lib.js` | compartido (no es endpoint) |

Datos en el **Supabase admin (INTRA)**, multi-tenant lógico por `account_slug = clients_config.id_slug`
(mismo patrón que la tabla `reviews`).

## Variables de entorno

```
ADMIN_SUPABASE_URL=...            # ya existente (proyecto INTRA)
ADMIN_SUPABASE_SERVICE_KEY=...    # ya existente (service role, bypass RLS)
KOMMO_WEBHOOK_SECRET=...          # NUEVO: secreto del receptor de latidos
CRON_SECRET=...                   # ya existente: protege el sweep
SLACK_DEFAULT_WEBHOOK_URL=...     # NUEVO: Incoming Webhook de Slack de respaldo
```
Slack por cuenta: columna `clients_config.kommo_slack_webhook_url` (si está vacía → `SLACK_DEFAULT_WEBHOOK_URL`).

## Alta de una cuenta

1. La cuenta ya existe en `clients_config` (`id_slug`).
2. Insertar sus canales esperados en `kommo_channel_config` (umbral default 6h):
   ```sql
   insert into kommo_channel_config (account_slug, canal, esperado, umbral_horas) values
     ('maspormarine','whatsapp', true, 6),
     ('maspormarine','instagram',true, 6);
   ```
3. (Opcional) Slack propio: `update clients_config set kommo_slack_webhook_url='https://hooks.slack.com/services/...' where id_slug='maspormarine';`
4. En Kommo (SalesBot/n8n): por cada inbound, `POST` al receptor con el `canal` explícito.

## Configurar el webhook en Kommo (vía n8n)

Kommo manda el webhook a n8n (form-urlencoded). El canal viene en el campo
**`message[add][0][origin]`** con tokens propios de Kommo:

| origin de Kommo | canal canónico |
|---|---|
| `waba`, `wz`, `wa_lite` | whatsapp |
| `instagram_business` | instagram |
| `facebook` | facebook |
| `telegram` | telegram |

En n8n, tras el trigger, añade un **HTTP Request node** que reenvía el `origin`:
```
POST  https://reporteintra.vercel.app/api/kommo/heartbeat?client=<slug>
Headers:  X-Webhook-Secret: <KOMMO_WEBHOOK_SECRET>
          Content-Type: application/json
Body:     { "canal": "{{ $json.body['message[add][0][origin]'] }}", "evento": "inbound" }
```
El endpoint normaliza el `origin` al canal canónico automáticamente
(`waba`→whatsapp, `instagram_business`→instagram, etc.).
Canales canónicos: `whatsapp, instagram, facebook, telegram, email, livechat, telefonia`.

## Configurar el sweep en n8n (Schedule)

Schedule node cada 10-15 min → HTTP Request:
```
GET  https://reporteintra.vercel.app/api/kommo/sweep?secret=<CRON_SECRET>
```
El sweep deduplica (1 alerta por cuenta+canal+día) y envía Slack solo en la **primera** caída del día.
La **recuperación** la notifica `heartbeat.js` cuando vuelve a entrar un inbound del canal caído.

## Pruebas locales (requiere Node 22)

```bash
export ADMIN_SUPABASE_URL=...           # rama DEV de Supabase
export ADMIN_SUPABASE_SERVICE_KEY=...   # service key de la rama DEV
export KOMMO_WEBHOOK_SECRET=dev-secret
export CRON_SECRET=dev-cron
export SLACK_DEFAULT_WEBHOOK_URL=https://hooks.slack.com/services/...  # canal de PRUEBAS
node server.js   # http://localhost:3000

# Simular un latido de WhatsApp:
curl -X POST "http://localhost:3000/api/kommo/heartbeat?client=maspormarine" \
  -H "X-Webhook-Secret: dev-secret" -H "Content-Type: application/json" \
  -d '{"canal":"whatsapp","evento":"inbound"}'

# Correr el sweep manualmente:
curl "http://localhost:3000/api/kommo/sweep?secret=dev-cron"

# Forzar una caída: baja el umbral a 0 y corre el sweep
#   update kommo_channel_config set umbral_horas=0 where account_slug='maspormarine' and canal='whatsapp';
curl "http://localhost:3000/api/kommo/sweep?secret=dev-cron&client=maspormarine"
```
