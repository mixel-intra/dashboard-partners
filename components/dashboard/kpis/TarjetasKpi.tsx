'use client';

// Tarjetas KPI 1-7 del dashboard principal — port de las cards de
// legacy/index.html + updateUI()/calculateMetrics()/applyCardLabels()/
// renderAllCharts() (sparklines) de legacy/src/dashboard.js.
//
// Mismos ids/clases que el markup legacy para que styles/dashboard.css y
// styles/style.css apliquen sin cambios. La matemática de los KPIs vive en
// lib/dashboard/filtros.ts (calcularMetricas) — NO recalcular aquí.
//
// Montaje (en DashboardClient) — el orden del DOM legacy es:
//   top-cards-row → split-row-grid (chart+tabla) → bottom-cards-row,
// así que se monta DOS veces con `fila`:
//   <TarjetasKpi fila="top"    leads={filteredLeads} ventas={ventas} filtros={filtros} />
//   …split-row-grid…
//   <TarjetasKpi fila="bottom" leads={filteredLeads} ventas={ventas} filtros={filtros} />
// donde `leads` YA pasó por applyGlobalFilters. Sin `fila` renderea ambas filas.

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  type ScriptableContext,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { useTemaDocumento } from '@/lib/charts/temaChart';
import { calcularMetricas, type FiltrosGlobales, type Lead, type Venta } from '@/lib/dashboard/filtros';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

// --- Labels por defecto (port de DEFAULT_CARD_LABELS / HOTEL_CARD_LABELS) ---

const DEFAULT_CARD_LABELS: Record<string, { title: string; description: string }> = {
  '1': { title: 'Oportunidades calificadas', description: 'CALIDAD' },
  '2': { title: 'Tasa de Conversión', description: 'Oportunidades calificadas / Leads' },
  '3': { title: 'Ventas', description: 'INGRESOS TOTALES' },
  '4': { title: 'ROI', description: 'VENTAS / INVERSIÓN' },
  '5': { title: 'Total de Registros', description: 'Personas que mandaron mensaje' },
  '6': { title: 'Inversión', description: '' },
  '7': { title: 'Costo por oportunidad calificada', description: '' },
};

const HOTEL_CARD_LABELS: Record<string, { title: string; description: string }> = {
  '1': { title: 'Cotizaciones de eventos canalizados a ventas', description: 'calidad del tráfico' },
  '2': { title: 'Tasa de Conversión', description: 'cotizaciones de eventos / registros' },
  '3': { title: 'Ventas', description: 'ingresos' },
  '4': { title: 'ROI', description: 'Ventas / Inversión en pauta' },
  '5': { title: 'Registros', description: 'Personas que iniciaron una conversación' },
  '6': { title: 'Inversión en Pauta', description: 'Inversión en meta / google ads' },
  '7': { title: 'Costo por cotización de evento canalizado a ventas', description: 'inversión en pauta / total de cotizaciones' },
};

// --- Sparklines (datos fijos, port de renderAllCharts) ---

const SPARK_DATA: Record<number, number[]> = {
  1: [12, 19, 15, 25, 22, 30, 28, 35, 40, 45, 50, 60],
  2: [5, 8, 12, 10, 15, 20, 25, 22, 28, 35, 30, 40],
  3: [10, 12, 14, 18, 16, 20, 22, 26, 30, 28, 35, 40],
  4: [2, 3, 3.5, 3.2, 4, 4.5, 5.0, 5.2, 5.5, 6, 6.5, 7],
  5: [100, 110, 105, 120, 130, 125, 140, 150, 160, 155, 170, 180],
  6: [50, 55, 52, 60, 62, 58, 65, 70, 75, 72, 80, 85],
  7: [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45],
};

// Cards impares usan el color primario; pares el secundario (paridad).
const SPARK_USA_PRIMARIO: Record<number, boolean> = { 1: true, 2: false, 3: true, 4: false, 5: true, 6: false, 7: true };

// Port de createSmoothChart(canvasId, dataPoints, colorHex) con react-chartjs-2.
function Sparkline({ id, dataPoints, colorHex }: { id: string; dataPoints: number[]; colorHex: string }) {
  const r = parseInt(colorHex.slice(1, 3), 16);
  const g = parseInt(colorHex.slice(3, 5), 16);
  const b = parseInt(colorHex.slice(5, 7), 16);

  const data = {
    labels: dataPoints.map((_, i) => i),
    datasets: [
      {
        data: dataPoints,
        borderColor: colorHex,
        backgroundColor: (context: ScriptableContext<'line'>) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 100);
          gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.25)`);
          gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          return gradient;
        },
        borderWidth: 2.5,
        tension: 0.45,
        pointRadius: 0,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false } },
    elements: { line: { borderJoinStyle: 'round' as const } },
  };

  // El contenedor viene con display:none en el markup legado (los sparklines
  // existen pero no se muestran); se conserva por paridad visual/CSS.
  return (
    <div className="card-chart-container" style={{ display: 'none' }}>
      <Line id={id} data={data} options={options} />
    </div>
  );
}

// --- Metadatos visuales de cada card (icon-box + pill, port del markup) ---

interface CardMeta {
  cardClass: string;
  icon: string;
  iconBoxStyle: React.CSSProperties;
  pill: React.ReactNode; // contenido del pill (sin el card-6-date, que es dinámico)
}

function iconBox(rgb: string, color: string): React.CSSProperties {
  return {
    background: `rgba(${rgb},0.15)`,
    borderColor: `rgba(${rgb},0.25)`,
    color,
    boxShadow: `0 0 20px rgba(${rgb},0.2)`,
  };
}

const CARD_META: Record<number, CardMeta> = {
  1: {
    cardClass: 'card-orange',
    icon: 'ribbon',
    iconBoxStyle: iconBox('252,211,77', '#FCD34D'),
    pill: (
      <div className="pill-change pill-green" id="pill-1">
        <ion-icon name="trending-up"></ion-icon> <span id="pill-1-text">Calificados</span>
      </div>
    ),
  },
  2: {
    cardClass: 'card-purple',
    icon: 'swap-vertical',
    iconBoxStyle: iconBox('196,168,255', '#C4A8FF'),
    pill: (
      <div className="pill-change pill-green" id="pill-2">
        <ion-icon name="trending-up"></ion-icon> <span id="pill-2-text">Ratio Actual</span>
      </div>
    ),
  },
  3: {
    cardClass: 'card-cyan',
    icon: 'cash',
    iconBoxStyle: iconBox('147,197,253', '#93C5FD'),
    pill: (
      <div className="pill-change pill-green" id="pill-3">
        <ion-icon name="trending-up"></ion-icon> <span id="pill-3-text">Ingresos</span>
      </div>
    ),
  },
  4: {
    cardClass: 'card-pink',
    icon: 'rocket',
    iconBoxStyle: iconBox('248,180,200', '#F8B4C8'),
    pill: (
      <div className="pill-change pill-green" id="pill-4">
        <ion-icon name="trending-up"></ion-icon> <span id="pill-4-text">Retorno</span>
      </div>
    ),
  },
  5: {
    cardClass: 'card-orange',
    icon: 'people',
    iconBoxStyle: iconBox('252,211,77', '#FCD34D'),
    pill: <div className="pill-change pill-green">Generados</div>,
  },
  6: {
    cardClass: 'card-pink',
    icon: 'wallet',
    iconBoxStyle: iconBox('248,180,200', '#F8B4C8'),
    pill: null, // card-6-date se renderea dinámico (fecha de inversión)
  },
  7: {
    cardClass: 'card-cyan',
    icon: 'pricetag',
    iconBoxStyle: iconBox('147,197,253', '#93C5FD'),
    pill: <div className="pill-change pill-green">Ratio Actual</div>,
  },
};

export default function TarjetasKpi({
  leads,
  ventas,
  filtros,
  fila,
}: {
  /** Leads YA filtrados con applyGlobalFilters (rango + tab + etiqueta). */
  leads: Lead[];
  ventas: Venta[];
  filtros: FiltrosGlobales;
  /** Qué fila renderear (el DOM legacy intercala el split-row entre ambas). */
  fila?: 'top' | 'bottom';
}) {
  const { clientId, config, clientType, rawConfig } = useClientConfig();
  const tema = useTemaDocumento();
  const isLight = tema === 'light';

  const m = useMemo(
    () => calcularMetricas(leads, ventas, config?.investment, filtros, clientType, clientId),
    [leads, ventas, config?.investment, filtros, clientType, clientId]
  );

  // Port de applyCardLabels(config.card_labels || {}).
  const customLabels = rawConfig?.card_labels || {};
  const hasCustom = Object.keys(customLabels).length > 0;
  const fallback = !hasCustom && clientType === 'hotel' ? HOTEL_CARD_LABELS : DEFAULT_CARD_LABELS;
  const labelDe = (i: number) => {
    const custom = customLabels[i] || customLabels[String(i)] || {};
    const defaults = fallback[String(i)];
    return {
      title: custom.title || defaults.title,
      description: custom.description !== undefined ? custom.description : defaults.description,
    };
  };

  // Valores formateados EXACTAMENTE como updateUI().
  const valores: Record<number, string> = {
    1: String(m.qualified),
    2: (m.conversionRate * 100).toFixed(1) + '%',
    3: `$${m.sales.toLocaleString('en-US')}`,
    4: `${m.roi.toFixed(2)}x`,
    5: String(m.total),
    6: `$${m.investment.toLocaleString('en-US')}`,
    7: `$${m.cpl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  };

  // Fecha de actualización de inversión (pill de card 6).
  let card6Date = 'Presupuesto';
  if (config?.investmentUpdatedAt) {
    const [y, mo, d] = config.investmentUpdatedAt.split('-');
    card6Date = `Actualizada al ${d}/${mo}/${y}`;
  }

  // Colores de sparkline según theme (port de renderAllCharts).
  const LIGHT_BLUE = '#2563EB';
  const sparkPrimary = isLight ? LIGHT_BLUE : config?.themePrimary || '#7551FF';
  const sparkSecondary = isLight ? '#60A5FA' : config?.themeSecondary || '#01F1E3';

  // Orden de cards: hoteles reacomodan las filas (port de initHotelTabs):
  //   top: 1, 3, 4, 7 · bottom: 5, 6, 2. Los demás: 1-4 / 5-7.
  const esHotel = clientType === 'hotel';
  const topOrder = esHotel ? [1, 3, 4, 7] : [1, 2, 3, 4];
  const bottomOrder = esHotel ? [5, 6, 2] : [5, 6, 7];

  const renderCard = (i: number) => {
    const meta = CARD_META[i];
    const lbl = labelDe(i);
    return (
      <div className={`card-quantix ${meta.cardClass}`} id={`card-${i}-wrapper`} key={i}>
        <div className="kpi-card-top">
          <div className="label-group">
            <span className="label-main" id={`label-main-${i}`}>
              {lbl.title}
            </span>
            <span className="label-sub" id={`label-sub-${i}`}>
              {lbl.description}
            </span>
          </div>
          <div className="icon-box" style={meta.iconBoxStyle}>
            <ion-icon name={meta.icon}></ion-icon>
          </div>
        </div>
        <div className="value-big" id={`card-${i}-value`}>
          {valores[i]}
        </div>
        {i === 6 ? (
          <div className="pill-change pill-green" id="card-6-date">
            {card6Date}
          </div>
        ) : (
          meta.pill
        )}
        <Sparkline id={`chart-${i}`} dataPoints={SPARK_DATA[i]} colorHex={SPARK_USA_PRIMARIO[i] ? sparkPrimary : sparkSecondary} />
      </div>
    );
  };

  const filaTop = (
    <div className="cards-grid" id="top-cards-row">
      {topOrder.map(renderCard)}
    </div>
  );
  const filaBottom = (
    <div className="bottom-cards-row" id="bottom-cards-row">
      {bottomOrder.map(renderCard)}
    </div>
  );

  if (fila === 'top') return filaTop;
  if (fila === 'bottom') return filaBottom;
  return (
    <>
      {filaTop}
      {filaBottom}
    </>
  );
}
