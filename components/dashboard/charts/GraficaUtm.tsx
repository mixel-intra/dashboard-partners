'use client';

// Gráfica de campañas UTM — port de createUTMChart() de legacy/src/dashboard.js:
// barras de leads calificados ('Lead Calificado' / 'Lead Condicionado') por
// utm_campaign + lista top-5 de fuentes (#utm-list).
//
// NOTA de paridad: en el legacy actual NO existe el <canvas id="utm-chart">
// en index.html, así que createUTMChart() era no-op (código muerto vivo). El
// componente queda disponible para montarlo cuando se decida dónde; replica
// exactamente la lógica original.
//
// Theme: reactivo vía useTemaDocumento() (MutationObserver sobre data-theme).
//
// Montaje:
//   <GraficaUtm leads={filteredLeads} />
// `leads` YA pasó por applyGlobalFilters.

import { useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { getChartTheme, hexToRgba, useTemaDocumento } from '@/lib/charts/temaChart';
import type { Lead } from '@/lib/dashboard/filtros';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function GraficaUtm({ leads }: { leads: Lead[] }) {
  const { config } = useClientConfig();
  const tema = useTemaDocumento();

  const { data, options, sortedSources } = useMemo(() => {
    const t = getChartTheme();
    const isLight = tema === 'light';
    const barColor = isLight ? '#2563EB' : config?.themeSecondary || '#01F1E3';

    // Grouping by Campaign (Qualified leads only for more impact)
    const campaignData: Record<string, number> = {};
    leads
      .filter((l) => l.estatus === 'Lead Calificado' || l.estatus === 'Lead Condicionado')
      .forEach((l) => {
        const campaign = l.utm_campaign || 'Orgánico / Otros';
        campaignData[campaign] = (campaignData[campaign] || 0) + 1;
      });

    // Top sources/mediums (lista lateral, port del bloque #utm-list)
    const sourceData: Record<string, number> = {};
    leads.forEach((l) => {
      const src = l.utm_source || l.utm_medium || 'Directo/Otro';
      sourceData[src] = (sourceData[src] || 0) + 1;
    });
    const sortedSources = Object.entries(sourceData)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      sortedSources,
      data: {
        labels: Object.keys(campaignData),
        datasets: [
          {
            label: 'Leads Calificados',
            data: Object.values(campaignData),
            backgroundColor: hexToRgba(barColor, 0.6),
            borderColor: barColor,
            borderWidth: 1,
            borderRadius: 8,
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
            titleColor: t.tooltipTitle,
            bodyColor: t.tooltipBody,
            borderColor: t.tooltipBorder,
            borderWidth: 1,
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: t.tickColor } },
          y: { beginAtZero: true, grid: { color: t.gridColor }, ticks: { color: t.tickColor, precision: 0 } },
        },
      } as any,
    };
  }, [leads, tema, config?.themeSecondary]);

  return (
    <>
      <div style={{ flex: 1, position: 'relative', width: '100%' }}>
        <Bar id="utm-chart" data={data} options={options} />
      </div>
      <div id="utm-list">
        {sortedSources.map(([name, count]) => (
          <div
            key={name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{name}</span>
            <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{count}</span>
          </div>
        ))}
      </div>
    </>
  );
}
