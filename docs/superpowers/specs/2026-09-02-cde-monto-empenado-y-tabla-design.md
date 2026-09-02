# Casa de Empeño: tarjeta "Monto empeñado" y tabla de empeños del periodo

**Fecha:** 2026-09-02
**Cliente:** CEFEMEX Casa de Empeño (`casa-de-empeño`)
**Ticket:** #A34C347C "Actualización del Dashboard - Cefemex Casa de Empeños" (Cecilia Vela)

## Problema

El ticket pide tres cosas:

1. Ver el total de empeños cerrados como **cantidad** y como **monto $**.
2. Que ambos datos se vean con cualquier filtro de fechas (días o meses).
3. Que lo que muestran las tarjetas de arriba **coincida** con lo que se despliega abajo.

Hoy el dashboard ya tiene la tarjeta "Empeños cerrados" (`card-3`), que cuenta por
fecha de empeño usando el endpoint n8n `dashbord_cde_empenos`. Pero:

- Solo usa el conteo (`payload.total`); el endpoint ya devuelve también `monto` y la
  lista `leads[]` (id, nombre, precio, f_empeno_ts, f_empeno, fecha_creacion).
- No hay ninguna tarjeta con el monto empeñado del periodo.
- La tabla "Registro de leads" de abajo se filtra por **fecha de creación** del lead,
  mientras la tarjeta cuenta por **fecha de empeño**. Un lead creado en junio y
  empeñado en agosto aparece en la tarjeta de agosto pero no en la tabla.
- El monto que alimenta ROAS (`cdeTotalMontoEmpenado`) sale de `filteredLeads` (por
  fecha de creación), así que tampoco cuadra con la tarjeta.

## Decisiones tomadas con el usuario

| Pregunta | Decisión |
|---|---|
| ¿Total del rango filtrado o histórico fijo? | **Del rango filtrado.** Cambia con el filtro; siempre muestra cantidad y $. |
| ¿Cómo cuadrar la parte inferior? | **Tabla propia** "Empeños cerrados del periodo", alimentada por el mismo endpoint que las tarjetas. La tabla "Registro de leads" no se toca. |
| ¿Enriquecer `card-3` o tarjeta nueva? | **Tarjeta nueva** "Monto empeñado" junto a "Empeños cerrados". La fila pasa a 7 tarjetas. |

## Diseño

### Una sola fuente de datos

`cdeFetchEmpenos()` deja de guardar solo el conteo. Guarda la respuesta completa en un
estado único:

```js
// null = sin respuesta aún (o falló) → se usa el respaldo local
let cdeEmpenos = null; // { total, monto, leads: [{ id_lead, nombre, precio, f_empeno_ts, fecha_creacion }] }
```

Una función `cdeEmpenosActivos()` devuelve `{ total, monto, leads, origen }`:

- `origen: 'remoto'` cuando `cdeEmpenos` tiene respuesta del endpoint.
- `origen: 'local'` como respaldo: recorre `state.leads` (no `filteredLeads`) y toma
  los que tienen `f_empeno_ts` dentro de `state.filters.start/end`. `monto` es la suma
  de `precio || price`. Sustituye a `cdeEmpenosEnRango()`, que hoy solo devuelve el
  conteo.

Todo lo que se pinta (conteo, monto, ROAS y tabla) sale de esa única función, así los
cuatro siempre cuadran entre sí.

Se conserva el descarte por `reqId` de respuestas tardías y el relanzado de
`animateCounters()` al llegar la respuesta.

### Tarjetas (fila superior)

Orden final, 7 columnas:

`Total de Registros · Oportunidades calificadas · Tasa de Conversión · Empeños cerrados · Monto empeñado · ROAS · Inversión en Publicidad`

- **`card-3` "Empeños cerrados"** — sin cambios visibles: `total`, subtítulo
  "POR FECHA DE EMPEÑO".
- **`card-8` "Monto empeñado"** — tarjeta nueva en `index.html`, misma estructura
  `card-quantix` que las demás, oculta por defecto (`display:none`). `renderCdeExtra()`
  la muestra e inserta inmediatamente después de `card-3`. Valor: `$` + monto con
  separador de miles (`toLocaleString('en-US')`). Subtítulo "POR FECHA DE EMPEÑO".
  Píldora: "Suma de empeños cerrados". Icono `cash`. Color: `card-cyan` como `card-3`
  para que se lean como pareja.
- `renderCdeExtra()` cambia `grid-template-columns` a `repeat(7, minmax(0,1fr))`.
  Cuando se sale de Casa de Empeño (`state.clientId !== CDE_SLUG`) se vuelve a ocultar
  `card-8`, igual que hoy se restaura el resto del layout.
- Si el endpoint aún no respondió, ambas tarjetas muestran el respaldo local y se
  actualizan al llegar la respuesta.

### ROAS consistente

`cdeTotalMontoEmpenado()` pasa a devolver `cdeEmpenosActivos().monto`. Así la píldora
de ROAS ("$monto ÷ $inversión") usa exactamente el número de la tarjeta nueva.
`cdeFetchEmpenos()` vuelve a llamar `cdeUpdateMonthView()` al recibir la respuesta para
que ROAS se recalcule con el monto remoto.

### Tabla "Empeños cerrados del periodo"

Nueva tarjeta `#cde-empenos-card` (clase `table-card`, mismo estilo que
`#leads-table-card`) dentro de `<section id="cde-extra">`. Se coloca **debajo de las
gráficas y encima de "Registro de leads"**; el JS que hoy mueve `#leads-table-card`
mantiene ese orden.

Columnas: **Cliente · Monto · Fecha de empeño · Fecha de registro**.

- Cliente: `nombre` tal cual llega (Kommo manda "Lead #id" cuando no hay contacto).
- Monto: `$` con separador de miles; `—` si es 0.
- Fechas: formateadas en el navegador a partir de `f_empeno_ts` (empeño) y de
  `fecha_creacion` (registro), formato `dd/mm/aaaa`. Zona horaria del navegador; los
  datos remotos ya vienen calculados en `America/Mexico_City`.
- Orden: fecha de empeño descendente.
- **Pie de tabla**: fila fija "N empeños · $X" con los mismos `total` y `monto` de las
  tarjetas. Es la comprobación visual del punto 3 del ticket.

Estados:

| Estado | Qué se ve |
|---|---|
| Petición en vuelo | Fila única "Cargando empeños del periodo…" |
| Respuesta vacía (`total = 0`) | Fila única "Sin empeños en el periodo" |
| Endpoint falló | Se pinta la lista local y una nota discreta bajo el título: "Datos locales: solo leads registrados en el periodo" |

Se renderiza con `cdeRenderEmpenosTable()` desde `renderCdeExtra()` (estado inicial)
y desde `cdeFetchEmpenos()` (al resolver). Usa **`textContent`/creación de nodos**
para nombre y valores: `nombre` viene de Kommo y no se inyecta como HTML.

### Fuera de alcance

- No se toca el workflow n8n ni Supabase.
- No se toca la tabla "Registro de leads" ni el filtro de estado.
- No se agrega export ni buscador a la tabla nueva.
- No se muestra total histórico fijo (el usuario eligió rango filtrado).

## Archivos

- `index.html`: markup de `card-8` en `#top-cards-row`; markup de `#cde-empenos-card`
  en `#cde-extra`; CSS mínimo para el pie de tabla; bump de
  `dashboard.js?v=20260902-cde6`.
- `src/dashboard.js`: `cdeEmpenos`, `cdeEmpenosActivos()`, cambios en
  `cdeFetchEmpenos()`, `cdeTotalMontoEmpenado()`, `renderCdeExtra()`, nueva
  `cdeRenderEmpenosTable()`.

## Verificación

No hay suite de pruebas; se verifica en el navegador con `node server.js` y Playwright
(`?client=casa-de-empeño`, sesión admin), en los rangos **Hoy, Últimos 7 días,
Últimos 30 días, Este mes, Todo el tiempo**:

1. Filas de la tabla = valor de "Empeños cerrados".
2. Suma de la columna Monto = valor de "Monto empeñado" = pie de tabla.
3. Ambos coinciden con `total`/`monto` del endpoint llamado a mano con el mismo
   `desde`/`hasta`.
4. Cambiar de rango rápido dos veces deja el rango final (no el abandonado).
5. Con el endpoint bloqueado (ruta interceptada en Playwright) se ve el respaldo local
   y la nota, sin errores en consola.
6. Cliente `cefemex` (Capital) y un hotel no muestran `card-8` ni la tabla nueva.
