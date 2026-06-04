# 📊 Monitor de Salud de Canales (Kommo) — Resumen ejecutivo

## 1. El problema que resuelve
Las cuentas de Kommo reciben leads por varios canales (WhatsApp, Instagram, Facebook…).
Si un canal **se desconecta**, dejábamos de recibir leads **sin enterarnos** hasta que
alguien lo notaba. Ahora **el sistema avisa solo** cuando un canal deja de recibir registros.

## 2. Cómo funciona (en una frase)
> Cada lead que entra a Kommo manda un "latido" que dice *"este canal está vivo"*.
> Si un canal deja de latir más de lo normal, salta una alerta a Slack.

**El flujo:**
```
Kommo (entra un lead) → n8n manda "latido" → se guarda en Supabase
                                                 ↓
        n8n revisa cada 15 min → ¿algún canal sin registros? → 🔴 alerta a Slack
                                                 ↓
        n8n cada 6h → 📊 resumen de todas las cuentas a Slack
```

## 3. Qué recibe el equipo en Slack (canal `monitor-de-canales`)
- **🔴 Alerta inmediata** cuando un canal lleva +6h sin recibir nada
  (*"[Hotel X] WhatsApp sin registros nuevos…"*).
- **🟢 Aviso de recuperación** cuando vuelve a entrar actividad.
- **Sin spam:** 1 aviso por caída, no repetido.
- **📊 Resumen 4 veces al día** (7am, 1pm, 7pm, 1am) con TODAS las cuentas:
  estado de cada canal + **cuántos registros llegaron** (últimas 6h / 24h).
  - Sirve a **Operación** (¿qué está caído?) y a **Marketing** (¿cuántos leads por canal?).

Ejemplo del resumen:
```
📊 Resumen de Salud de Canales · 04/06, 07:00
"registros hoy" = últimas 24 h · entre paréntesis las últimas 6 h

🟢 Cuentas OK (N)
*CEFEMEX*
   🟢 WhatsApp: 40 registros hoy (9 en últimas 6h)

🔴 Cuentas con algún canal sin registros (M)
*Hotel Nik-Ché*
   🟢 WhatsApp: 12 registros hoy (3 en últimas 6h)
   🔴 Instagram: 0 registros hoy (0 en últimas 6h)  ⚠️ sin registros
```

## 4. Cobertura
- **15 cuentas** monitoreadas (hoteles Hilton/Hampton/Garden, CEFEMEX, Casa de Empeño,
  Logic Systems, Maspormarine, DoubleTree, Homewood, 107 Rooftop, Hotel Nik-Ché…).
- Canales por cuenta según corresponda (WhatsApp / Instagram / Facebook).
- *(Engel & Völkers pausado por ahora — se reactiva en cuando se requiera.)*

## 5. Dónde vive (arquitectura)
| Pieza | Tecnología | Nota |
|---|---|---|
| Latido + alertas + resumen | **n8n** (workflows) | corre solo, sin servidores extra |
| Datos (config, latidos, eventos) | **Supabase** (proyecto INTRA) | tablas `kommo_channel_*` |
| Avisos | **Slack** (Incoming Webhook) | canal `monitor-de-canales` |
| Panel visual | **Dashboard interno** (`admin.html` / `index.html`) | **solo lo ve Intra** (rol admin); el cliente final NO |

> Es **100% interno** (el cliente final nunca lo ve) y el monitoreo **no depende de Vercel** —
> todo corre en n8n + Supabase. El panel visual sí se despliega con el repo (Vercel).

## 6. Cómo se opera (para el futuro)
- **Agregar una cuenta nueva:** registrar sus canales en `kommo_channel_config` + poner el
  nodo "Latido" en su flujo de n8n (colgado de `new_message`). Se hace en minutos.
- **Pausar una cuenta:** marcar sus canales como `esperado = false` (deja de alertar).
- **Ajustar sensibilidad:** cambiar el **umbral por canal** (default 6h) — útil para canales
  de bajo volumen (ej. subir Instagram a 24h).
- **Cambiar el canal de Slack:** por cuenta (`clients_config.kommo_slack_webhook_url`) o uno
  general de respaldo (`SLACK_DEFAULT` en el nodo del sweep).

## 7. Piezas técnicas (para referencia)
| Archivo | Qué es |
|---|---|
| `migrations/admin-supabase/007_kommo_channel_health.sql` | tablas config / heartbeats / alerts_log |
| `migrations/admin-supabase/008_kommo_channel_events.sql` | tabla de eventos (conteo 6h/24h) |
| `api/kommo/n8n-heartbeat-code-node.js` | Code node del **latido** (por cuenta, auto-detecta por subdominio) |
| `api/kommo/n8n-sweep-code-node.js` | Code node del **sweep** (alertas, 1 workflow global, cada 15 min) |
| `api/kommo/n8n-digest-code-node.js` | Code node del **resumen** (1 workflow global, cron `0 1,7,13,19 * * *`) |
| `api/kommo/heartbeat.js` / `sweep.js` | endpoints Vercel (alternativa; **no** se usan en la versión n8n) |
| `index.html` + `admin.html` | panel interno "Salud de Canales" (gateado por rol admin) |

Webhooks de Slack **no van en el repo** (quedan como `PEGA_AQUI_TU_WEBHOOK`); se configuran
directamente en los nodos de n8n.

## 8. Estado actual ✅
- Latidos entrando de las 15 cuentas.
- Alertas (🔴/🟢) y resumen (📊) **probados y funcionando** en Slack.
- "Arranque limpio" aplicado (todo en verde; solo alerta por silencios reales de hoy en adelante).
- Código en producción (`main`) y panel desplegado.

## ⚠️ 3 puntos honestos
1. El sistema mide **"llegaron registros o no"**. Un silencio largo en un canal activo =
   **probable** desconexión (lo infiere, no lo confirma al 100%). Por eso el mensaje dice
   *"sin registros nuevos"*, no *"desconectado"*.
2. Canales de **bajo volumen** (IG/FB en algunos hoteles) pueden marcar 🔴 aunque estén bien,
   solo porque no llegan leads. Se afina subiendo su umbral.
3. Los 2 workflows de n8n (**sweep** + **resumen**) deben estar en **Active** para correr solos.

## 9. Pendientes operativos
- [ ] Confirmar **sweep** Active (cada 15 min).
- [ ] Confirmar **resumen** Active (cron `0 1,7,13,19 * * *`).
- [ ] Verificar el panel en `admin.html` (como admin).
- [ ] (Opcional) Afinar umbrales de IG/FB en cuentas de bajo volumen.
- [ ] (Opcional) Reactivar Engel & Völkers cuando se requiera.
