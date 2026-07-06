'use client';

// Gráfica histórica principal — port de createMainChart() + el toggle
// calificados/total (setupEventListeners) y la tarjeta .big-chart-card del
// markup de legacy/index.html.
//
// Theme: reactivo vía useTemaDocumento() (MutationObserver sobre data-theme
// de <html>); al cambiar el tema se regeneran data/options y react-chartjs-2
// actualiza el chart.
//
// Montaje (dentro de <div className="split-row-grid" id="split-row-grid">):
//   <GraficaHistorica leads={filteredLeads} />
// `leads` YA pasó por applyGlobalFilters; el filtro calificados/total se
// aplica aquí según el modo activo.

import { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ScriptableContext,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { getChartTheme, hexToRgba, useTemaDocumento } from '@/lib/charts/temaChart';
import { isQualified, type Lead } from '@/lib/dashboard/filtros';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export type ChartMode = 'calificados' | 'total';

export default function GraficaHistorica({ leads }: { leads: Lead[] }) {
  const { clientId, config, clientType } = useClientConfig();
  const tema = useTemaDocumento();
  const [chartMode, setChartMode] = useState<ChartMode>('calificados');

  const esHotel = clientType === 'hotel';
  // Overrides de hotel (port de initHotelTabs): título distinto y el toggle
  // "Totales" oculto (visibility, no display — conserva el layout).
  const titulo = esHotel ? 'Histórico de cotizaciones de eventos canalizados a ventas' : 'Comportamiento';

  const { data, options } = useMemo(() => {
    const t = getChartTheme();

    // Grouping by Date (port literal de createMainChart)
    const dailyData: Record<string, number> = {};
    const sourceLeads =
      chartMode === 'calificados' ? leads.filter((l) => isQualified(l, clientType, clientId)) : leads;
    const sorted = [...sourceLeads].sort(
      (a, b) => (a.fecha_parsed ? a.fecha_parsed.getTime() : 0) - (b.fecha_parsed ? b.fecha_parsed.getTime() : 0)
    );

    sorted.forEach((l) => {
      if (!l.fecha_parsed || isNaN(l.fecha_parsed.getTime())) return;
      const key = l.fecha_parsed.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
      dailyData[key] = (dailyData[key] || 0) + 1;
    });

    let labels = Object.keys(dailyData);
    let values = Object.values(dailyData);

    if (labels.length === 0) {
      labels = ['N/A'];
      values = [0];
    }

    const isLight = tema === 'light';
    const color = isLight ? '#2563EB' : config?.themePrimary || '#7551FF';

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Leads',
            data: values,
            borderColor: color,
            borderWidth: 4,
            backgroundColor: (context: ScriptableContext<'line'>) => {
              const ctx = context.chart.ctx;
              const gradient = ctx.createLinearGradient(0, 0, 0, 400);
              gradient.addColorStop(0, hexToRgba(color, isLight ? 0.15 : 0.3));
              gradient.addColorStop(1, hexToRgba(color, 0));
              return gradient;
            },
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: color,
            pointBorderColor: t.pointBorder,
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: t.tooltipBg,
            padding: 12,
            titleColor: t.tooltipTitle,
            bodyColor: t.tooltipBody,
            borderColor: t.tooltipBorder,
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: t.tickColor, font: { size: 10 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: t.gridColor },
            ticks: { color: t.tickColor, precision: 0 },
          },
        },
      } as any,
    };
  }, [leads, chartMode, tema, clientType, clientId, config?.themePrimary]);

  return (
    <div className="card-quantix big-chart-card">
      <div
        className="card-header"
        style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <span className="label-sub">TENDENCIA HISTÓRICA</span>
          <h3 className="section-headline" id="main-chart-title" style={{ fontSize: '1.5rem', margin: 0 }}>
            {titulo}
          </h3>
        </div>
        <div
          className="chart-mode-toggle"
          id="main-chart-toggle"
          style={esHotel ? { visibility: 'hidden' } : undefined}
        >
          <button
            className={`chart-mode-btn${chartMode === 'calificados' ? ' active' : ''}`}
            data-mode="calificados"
            onClick={() => setChartMode('calificados')}
          >
            Calificados
          </button>
          <button
            className={`chart-mode-btn${chartMode === 'total' ? ' active' : ''}`}
            data-mode="total"
            onClick={() => setChartMode('total')}
          >
            Totales
          </button>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', width: '100%' }}>
        <Line id="main-chart" data={data} options={options} />
      </div>
    </div>
  );
}
