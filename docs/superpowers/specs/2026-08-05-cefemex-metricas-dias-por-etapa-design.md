# Métricas CEFEMEX — "Días por etapa por lead"

Fecha: 2026-08-05
Cliente: CEFEMEX Capital (`clientId === 'cefemex'`)

## Objetivo

Agregar una sección "Métricas" al dashboard de CEFEMEX que muestre, para cada lead
cerrado, cuántos días pasó en cada etapa del proceso de crédito. Los datos ya vienen
calculados desde un endpoint n8n — el frontend solo consume y pinta, no calcula nada.

## Endpoint

```
GET https://cefemexyucatan.app.n8n.cloud/webhook/tiempos-leads?vista=cierres&desde=<unix>&hasta=<unix>&por=cierre
```

- `vista=cierres` fijo para este reporte.
- `desde` / `hasta`: unix seconds. Si se omiten, el endpoint usa el mes en curso.
- `por`: `cierre` (default) o `creacion`.
- CORS abierto, refleja `Origin` → **fetch directo desde el navegador**, sin pasar por
  `/api/proxy`.
- ~4s / ~130KB para un rango de 6 meses. No pagina.
- Endpoint hermano para Excel: misma URL, `tiempos-excel` en vez de `tiempos-leads`,
  mismos `desde/hasta/por`.

Ver forma completa de la respuesta y la nota crítica sobre `dias_por_etapa` (objeto
disperso, indexado por nombre de etapa) en la conversación original / ticket. Reglas
clave:
- Armar columnas de etapas siempre recorriendo `etapas[]` (ya viene en orden), nunca
  hardcodeadas — la config de etapas vive en Supabase y puede cambiar.
- Celda vacía cuando la etapa no está en `dias_por_etapa` (el lead no pasó por ahí) —
  no es lo mismo que 0.
- `etapas_recorridas` cuenta pasos (incluye reingresos); para "etapas distintas" usar
  `Object.keys(dias_por_etapa).length`.

## Arquitectura

### Ubicación en la app
Nuevo tab **"Métricas"** dentro del segmented control que ya existe en el header
(`#hotel-tabs` / `.dash-tabs-segment`, mecanismo `switchDashTab()` en `dashboard.js`).
Visible **solo** cuando `state.clientId === 'cefemex'` (no para `casa-de-empeño`, que
es un funnel distinto sin este reporte).

Al activar el tab: se oculta `.dashboard-grid` (igual que hacen hoy `restaurant-panel`
y `social-listening-panel`) y se muestra un panel nuevo `#cefemex-metrics-panel`.

### Archivo nuevo
`src/metrics-cefemex.js`, cargado en `index.html` después de `dashboard.js`:

```html
<script src="src/dashboard.js?v=..."></script>
<script src="src/metrics-cefemex.js?v=20260805-1"></script>
```

Aislado del resto de `dashboard.js` (7.5k líneas) — mismo criterio que `director.js`
para `logic-systems`: feature client-specific, módulo propio.

Cambios mínimos requeridos en archivos existentes:
- `index.html`: botón del tab en el segmented control + `<div id="cefemex-metrics-panel">`
  vacío donde `metrics-cefemex.js` inyecta su HTML/CSS.
- `dashboard.js`: en `initHotelTabs()` / `switchDashTab()`, mostrar el botón del tab
  solo si `clientId === 'cefemex'`, y en la rama `tab === 'metricas'` ocultar
  `dashboard-grid` + `contentHeaderRow` y mostrar `cefemex-metrics-panel` (llamando al
  init del módulo nuevo la primera vez).

### Fetch y estado
Estado propio del módulo, no mezclado con `state` global:

```js
const cefemexMetrics = {
  desde: null, hasta: null, por: 'cierre',
  data: null, sortCol: 'dias_en_proceso', sortDir: 'desc',
  loading: false, error: null,
};
```

- Primera carga: sin `desde/hasta` (usa el default del endpoint = mes en curso).
- Selector de fechas: reusa **flatpickr** (mismo patrón que `#date-range-picker` en el
  header global) + toggle `cierre`/`creación` para `por`. Cambiar cualquiera de los dos
  dispara un re-fetch completo (el cálculo lo hace el endpoint, no el cliente).
- Loading: spinner/estado explícito (el fetch puede tardar ~4s). Error: mensaje claro
  si falla o no responde, sin tronar el resto del dashboard.

## UI

1. **Tarjetas de totales** (estilo `card-quantix`, igual que las del dashboard
   principal): leads, ganados, perdidos, `dias_en_proceso_promedio_ganado`,
   `dias_en_proceso_promedio_perdido` (mediana también visible, en texto secundario de
   la tarjeta o tooltip). Nota visible: con 12 ganados contra 193 perdidos, cualquier
   comparación entre ambos grupos se apoya en muy pocos casos del lado ganador.

2. **Tabla**, un renglón por lead:
   `Lead ID · Resultado · Creado · Cerrado` + una columna por cada etapa de `etapas[]`
   (orden dinámico, generado desde la respuesta, nunca hardcodeado) + `Total en
   proceso` (`dias_en_proceso`) + `Etapas` (`Object.keys(dias_por_etapa).length`).
   - Columnas `Lead` y `Resultado` fijas (`position: sticky; left: …`) con ancho
     explícito para no tapar la siguiente columna al hacer scroll horizontal.
   - Celdas de días: heatmap de un solo tono, cortes en 1 / 5 / 15 / 30 días. El
     número siempre visible, el color acompaña. Celda vacía (no "0") cuando la etapa
     no está en `dias_por_etapa` para ese lead.
   - Ordenable por cualquier columna (incluidas las de etapas), click en header.
     Default: `Total en proceso` descendente.
   - Sticky header de la tabla (mismo patrón que `.leads-thead` en el dashboard
     principal) para que los headers no se pierdan al hacer scroll vertical.

3. **Pie de tabla**: mediana, promedio y cuántos leads pasaron por cada etapa,
   calculado sobre las filas **visibles** (el orden no cambia el set de filas, así
   que en la práctica es sobre todos los leads cargados — se deja el cálculo
   parametrizado por si en el futuro se agregan filtros que sí reduzcan el set).

4. **Línea de descartados**, fija al pie de la tabla: `descartados.total` +
   `descartados.motivo`, tal cual vienen del endpoint. Obligatorio — si no se muestra,
   el total no cuadra contra Kommo.

5. **Desplegable de criterios**: un `<details>` con el objeto `criterios`
   (clave → texto) pintado dinámicamente, sin copiar el texto al código — si el
   endpoint cambia las reglas del reporte, el texto se actualiza solo.

6. **Botón "Descargar Excel"**: abre/descarga la URL hermana (`tiempos-excel`) con los
   `desde/hasta/por` actualmente seleccionados.

## Testing

- Todo se prueba en `http://localhost:3000/index.html?client=cefemex` (`node
  server.js`) antes de tocar `main`. No hay deploy hasta confirmación explícita del
  usuario.
- Verificar manualmente: tab visible solo para `cefemex`; columnas de etapas
  coinciden con `etapas[]` de la respuesta real; celdas vacías vs. `0` se distinguen;
  sort funciona en columnas de etapa; sticky columns no tapan contenido en scroll
  horizontal; línea de `descartados` y desplegable de `criterios` presentes; botón de
  Excel dispara la descarga correcta; cambiar rango de fechas / `por` dispara re-fetch
  y refresca todo (tarjetas, tabla, pie, descartados).

## Fuera de alcance

- No se muestra este tab para `casa-de-empeño` ni ningún otro cliente.
- No se calcula nada del lado del cliente — todo viene del endpoint.
- No se hardcodean nombres/orden de etapas ni el contenido de `criterios`.
