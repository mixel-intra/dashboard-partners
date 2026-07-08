# 📌 Estado del proyecto — Dashboard Partners (Intra)

> Última actualización: 2026-07-02. Documento de checkpoint para retomar/explicar el trabajo.
> Resume las features construidas: el **Monitor de Salud de Canales (Kommo)**,
> los **ajustes al dashboard de CEFEMEX Casa de Empeño** y el nuevo
> **Panel del Director General (Logic Systems)** — ver sección 5.

---

## 0. Cómo correr el proyecto en localhost

- Requiere **Node 22** (https://nodejs.org → LTS .pkg). El servidor estático (Python) NO sirve
  los leads (vienen por `/api/proxy`).
```bash
cd /Users/david/Downloads/dashboard-partners-main
pnpm install
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
3. **Tarjeta ROI** (card-4) + **tarjeta ROAS** (reutiliza card-7) ubicada **entre "Empeños cerrados"
   y "ROI"**. **ROAS = monto empeñado (Presupuesto Kommo, por fecha) ÷ Inversión en publicidad.**
   La "Inversión en publicidad" es un **campo nuevo en admin → Identidad** (columna
   `clients_config.ad_investment`, migración `010_ad_investment.sql`), lo captura SOLO Intra.
   *(Se retiró la captura mensual de gasto anterior — `cdeRenderRoas`/`cdeSaveSpend` eliminadas;
   la tabla `ad_spend` queda sin uso.)*
4. **Pie "Razones de venta perdida"** rediseñado: paleta sobria, **% dentro de cada rebanada**,
   leyenda abajo con "Motivo · N (%)", total en el eyebrow, tipografía igual a "Comportamiento".
   El motivo se saca del campo `EstatusLead` (texto libre) en el webhook `dashbord_cde` y se
   **categoriza** en los 8 motivos.
5. **Cada lead se muestra en su etapa real** + dropdown con las 6 etapas del funnel siempre visibles
   (Lead Empeño Oro, Rescate/Empeño Otros, Cita agendada, Reagendar, Empeñado, Venta perdida).
6. **Número grande** del total por estado filtrado dentro del recuadro de "Registro de leads".
7. **6 KPIs en una sola fila** (Total de Registros primero · Oportunidades · Conversión · Empeños
   cerrados · ROI · Inversión). Se ocultó "Costo por oportunidad calificada".
8. **Reorganización del layout**: el pie sube y se **alinea junto a "Comportamiento"** (grid 2-col)
   y el bloque **"Registro de leads" baja a todo el ancho, debajo de las gráficas**. El título cambió
   a "Detalle de leads por etapa" (sin el subtítulo "Últimas cotizaciones a ventas") y la tabla suma
   columnas **Monto** y **Motivo**. Todo gateado a `casa-de-empeño`.

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

## 5. Panel del Director General — Logic Systems  🆕 (solo `logic-systems`, gateado)

Dashboard **exclusivo** del cliente `logic-systems`, con un diseño propio (bento grid claro,
enfoque "generación de demanda") distinto al dashboard estándar. **No afecta a ningún otro cliente.**

### Cómo funciona
- **Ruteo:** `index.html` tiene un guard en `<head>` que, si `?client=logic-systems`, redirige a
  `director.html` (y `director.html` redirige de vuelta a `index.html` cualquier otro cliente).
  Así el dashboard estándar (`dashboard.js`, 7.4k líneas) ni siquiera se carga para este cliente.
- **Layout:** es una **página standalone** (bento grid claro, autocontenido con estilos inline),
  independiente del shell del dashboard estándar. Solo carga Inter + Phosphor; no usa `style.css`
  ni el sidebar/topbar de la app.
- **Datos:** mismo pipeline que el resto → `clients_config.webhook_url` → `/api/proxy` → leads de Kommo.
  Sin framework (vanilla JS), igual que el resto del repo.

### Archivos
| Archivo | Qué es |
|---|---|
| `director.html` | Página standalone del panel (bento grid con estilos inline del diseño). |
| `src/director.js` | Capa de datos + render. Todo el mapeo lead→panel está en `F` (campos) y `ST` (etapas). |
| `index.html` (1 edit) | Guard de ruteo en `<head>` hacia `director.html`. |

### Mapeo de datos (leads de Kommo)
El diseño original era un placeholder B2B ("demos", "sistemas"); se **remapeó** a los datos reales:
- **Hero "Leads calificados"** = leads en `atencion personalizada` (id 100538416) + `Seguimiento CAMILA`
  (id 100605424). **Descartados** = `rechazado` (id 100538408). **Sin respuesta** = id 100781696.
- **Funnel:** Primer mensaje (total) → Con respuesta (no "SIN RESPUESTA") → Calificado.
- **Fuente de los leads** = `utm_medium`. **Estadísticas / filtro "Campaña"** = `utm_campaign`.
- **Tasa de calificación** (donut) = calificados ÷ con respuesta. **Prospectos en seguimiento** =
  leads calificados recientes (nombre, teléfono, campaña, estado).
- Las **etapas se detectan por `estatus_id`** (robusto), con fallback al texto de `estatus`.
  Si el pipeline de Kommo agrega etapas, actualizar el objeto `ST` en `director.js`.

### Pendiente / notas
- [ ] **Configurar `webhook_url` de `logic-systems`** en admin → Identidad. Sin él, el panel
  carga vacío con un aviso (no truena). Es la causa del error "no tiene webhook_url configurado".
- [ ] Confirmar el **slug real** en `clients_config` (se asume `logic-systems`).
- [ ] Verificar en navegador con datos reales (labels/umbrales de etapas ajustables en `director.js`).
- [ ] `director.js` se carga con `?v=YYYYMMDD-N` (cache-busting); subir el número al cambiar el JS.

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
