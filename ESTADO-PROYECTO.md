# 📌 Estado del proyecto — Dashboard Partners (Intra)

> Última actualización: 2026-06-04. Documento de checkpoint para retomar/explicar el trabajo.
> Resume **dos features** construidas en esta etapa: el **Monitor de Salud de Canales (Kommo)**
> y los **ajustes al dashboard de CEFEMEX Casa de Empeño**.

---

## 0. Cómo correr el proyecto en localhost

- Requiere **Node 22** (https://nodejs.org → LTS .pkg). El servidor estático (Python) NO sirve
  los leads (vienen por `/api/proxy`).
```bash
cd /Users/david/Downloads/dashboard-partners-main
npm install
node server.js          # http://localhost:3000
```
- Entrar: `http://localhost:3000/login.html` (usuario admin/Intra) →
  `http://localhost:3000/index.html?client=casa-de-empeño`
- **Deploy:** push a `main` en GitHub (`mixel-intra/dashboard-partners`) → Vercel auto-despliega.

### ⚠️ Pendiente importante
Hay **12 commits locales sin push** (todo el trabajo de CDE + doc del monitor).
Para publicar en producción:
```bash
git push origin main
```

---

## 1. Monitor de Salud de Canales (Kommo)  ✅ en producción

Detecta cuándo un canal de Kommo (WhatsApp/Instagram/Facebook…) deja de recibir leads y avisa a Slack.

- **Cómo funciona:** cada inbound de Kommo → n8n manda un "latido" → Supabase. Un sweep
  (cada 15 min) detecta canales sin registros > umbral (6h) → alerta 🔴/🟢 a Slack. Un resumen
  (4×/día: 7am, 1pm, 7pm, 1am) manda el semáforo de todas las cuentas.
- **Vive en:** n8n + Supabase (proyecto INTRA) + Slack. **100% interno** (panel solo rol admin).
- **15 cuentas** latiendo. Engel & Völkers pausado.
- **Doc detallada:** ver [api/kommo/RESUMEN-EJECUTIVO.md](api/kommo/RESUMEN-EJECUTIVO.md).

### Archivos
| Archivo | Qué es |
|---|---|
| `migrations/admin-supabase/007_kommo_channel_health.sql` | tablas config/heartbeats/alerts_log |
| `migrations/admin-supabase/008_kommo_channel_events.sql` | eventos (conteo 6h/24h) |
| `api/kommo/n8n-heartbeat-code-node.js` | latido (n8n, auto-detecta cuenta por subdominio) |
| `api/kommo/n8n-sweep-code-node.js` | sweep de alertas (n8n, 1 global, 15 min) |
| `api/kommo/n8n-digest-code-node.js` | resumen 4×/día (n8n, cron `0 1,7,13,19 * * *`) |
| `api/kommo/heartbeat.js` / `sweep.js` / `_lib.js` | endpoints Vercel (alternativa, NO usados) |
| `admin.html` + `index.html` | panel "Salud de Canales" (gateado por rol admin) |

### Pendiente (tu lado, en n8n)
- [ ] Activar el workflow **Sweep** (cada 15 min) — `Active`.
- [ ] Activar el workflow **Resumen** (cron `0 1,7,13,19 * * *`) — `Active`.
- [ ] (Opcional) Subir umbral de IG/FB en cuentas de bajo volumen.

---

## 2. Dashboard CEFEMEX Casa de Empeño  🛠️ (solo `casa-de-empeño`, gateado)

Todos estos cambios aplican **únicamente** al dashboard de `casa-de-empeño` (no afecta otras cuentas).
Viven en `index.html` + `src/dashboard.js` (funciones `cde*` / `renderCdeExtra`) y la tabla `ad_spend`.

### Cambios implementados
1. **Oportunidades calificadas** = total del funnel **incluyendo "Venta perdida"** (antes la excluía).
2. **"Ventas" → "Empeños cerrados"** = conteo de leads en estado `EMPEÑADO` (antes mostraba $0 de ingresos).
3. **ROAS** (`empeños ÷ gasto total`) + **costo/empeño**. El **gasto lo captura SOLO Intra** (rol admin)
   con **selector de mes (Mayo–Diciembre 2026)**; el cliente VE el ROAS pero no edita.
4. **Pie "Motivos de venta perdida"** — el motivo se saca del campo `EstatusLead` (texto libre) en el
   webhook `dashbord_cde` de n8n y se **categoriza** en los 8 motivos. Muestra "X de N (%)" + total.
5. **Cada lead se muestra en su etapa real** + dropdown con las 6 etapas del funnel siempre visibles
   (Lead Empeño Oro, Rescate/Empeño Otros, Cita agendada, Reagendar, Empeñado, Venta perdida).
6. **Número grande** del total por estado filtrado dentro del recuadro de "Registro de leads".
7. **6 KPIs en una sola fila** (Total de Registros primero · Oportunidades · Conversión · Empeños
   cerrados · ROI · Inversión). Se ocultó "Costo por oportunidad calificada".
8. Se **eliminó** la sección "Funnel completo" (las 6 fichas) por ahora.

### Datos / Kommo
- Webhook de leads del dashboard: `https://n8n.srv1436923.hstgr.cloud/webhook/dashbord_cde`
  (workflow n8n con nodo **"Procesa Todos los Leads"** — ahí se agregó `motivo_perdida`).
- Etapas reales del pipeline Kommo (casa-de-empeño): CONTACTO INICIAL, INFORMACIÓN GENERAL,
  VALIDANDO KO, SEGUIMIENTO, SIN RESPUESTA, CONTACTAR FUTURO, RECHAZADO, LEAD EMPEÑO ORO,
  RESCATE DE PRENDA (= "Lead empeño Otros"), RECLUTAMIENTO, CITA AGENDADA, REAGENDAR, EMPEÑADO, PERDIDO.
- El campo estructurado "RAZONES DE PÉRDIDAS" (dropdown con 8 opciones) **no se está llenando**;
  por eso se categoriza el texto libre de `EstatusLead`. Si el equipo empieza a llenar el dropdown,
  el código ya lo usa automáticamente (match por enum_id).
- Tabla nueva: `migrations/admin-supabase/009_ad_spend.sql` (gasto de publicidad por mes).

### Pendiente / ideas
- [ ] Bajar el **"Otros: 12"** del pie afinando palabras clave (requiere ver más textos de `EstatusLead`).
- [ ] (Mejor calidad de datos) que el equipo llene el dropdown "RAZONES DE PÉRDIDAS" en Kommo.
- [ ] Decidir si ROAS usa gasto total (actual) o el del periodo filtrado.
- [ ] Verificar todo en el deploy de Vercel (los leads solo cargan con server real, no estático).

---

## 3. Notas técnicas
- `dashboard.js` se carga con `?v=20260604-cdeN` (cache-busting); se sube el número al cambiar el JS.
- Supabase admin = proyecto **INTRA** (`zwghwruwxzttsofaezjp`). RLS abierta (igual que el resto del app).
- Los webhooks de Slack **no van en el repo** (placeholder `PEGA_AQUI_TU_WEBHOOK`); se ponen en n8n.
- Auth: `auth.js` — `role: 'admin'` = Intra (ve todo, incl. paneles internos); `partner` = cliente.

## 4. Checklist para producción
- [ ] `git push origin main` (12 commits pendientes) → Vercel despliega.
- [ ] Verificar `admin.html` (Salud de Canales) y `index.html?client=casa-de-empeño` en el deploy.
- [ ] Activar los 2 schedules de n8n (sweep + resumen).
- [ ] Confirmar que el nodo "Procesa Todos los Leads" (dashbord_cde) está publicado con `motivo_perdida`.
