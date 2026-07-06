'use client';

import { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { useTemaDocumento } from '@/lib/charts/temaChart';
import { getSession } from '@/lib/auth/session';
import { toggleTheme } from '@/lib/theme';
import {
  calcularMetricas,
  isQualified,
  type FiltrosGlobales,
  type Lead,
  type Venta,
} from '@/lib/dashboard/filtros';
import type { RangoPredefinido } from '@/components/dashboard/leads/RangoFechas';

// Dashboard móvil (Figma MD3 Dark Glass) — port de renderMobileDashboard()/
// _renderMobileChart() + el bottom-sheet de rango de fechas de index.html.
// La visibilidad la controla el CSS (.mobile-dash solo ≤480px); a diferencia
// del legacy (que leía los valores del DOM desktop), aquí se calculan de la
// misma fuente (calcularMetricas).

const DEFAULT_LABELS: Record<number, string> = {
  1: 'Oportunidades calificadas',
  2: 'Tasa de Conversión',
  3: 'Ventas',
  4: 'ROI',
  5: 'Total de Registros',
  6: 'Inversión',
  7: 'Costo por oportunidad calificada',
};
const HOTEL_LABELS: Record<number, string> = {
  1: 'Cotizaciones de eventos canalizados a ventas',
  2: 'Tasa de Conversión',
  3: 'Ventas',
  4: 'ROI',
  5: 'Registros',
  6: 'Inversión en Pauta',
  7: 'Costo por cotización de evento canalizado a ventas',
};

const KPI_DEFS = [
  { i: 1, accent: '#FCD34D', icon: 'ribbon-outline' },
  { i: 2, accent: '#A78BFA', icon: 'swap-vertical-outline' },
  { i: 3, accent: '#93C5FD', icon: 'cash-outline' },
  { i: 4, accent: '#F8B4C8', icon: 'rocket-outline' },
  { i: 5, accent: '#FCD34D', icon: 'people-outline' },
  { i: 6, accent: '#F8B4C8', icon: 'wallet-outline' },
  { i: 7, accent: '#93C5FD', icon: 'pricetag-outline' },
];

const RANGOS: { key: RangoPredefinido; label: string; icon: string; color: string }[] = [
  { key: 'today', label: 'Hoy', icon: 'today-outline', color: '#C4A8FF' },
  { key: '7d', label: 'Últimos 7 días', icon: 'calendar-outline', color: 'rgba(99,102,241,0.8)' },
  { key: '30d', label: 'Últimos 30 días', icon: 'calendar-outline', color: 'rgba(6,182,212,0.8)' },
  { key: 'this-month', label: 'Este mes', icon: 'calendar-outline', color: 'rgba(109,213,140,0.8)' },
  { key: 'last-month', label: 'Mes pasado', icon: 'calendar-outline', color: 'rgba(251,191,36,0.8)' },
  { key: 'all', label: 'Todo el tiempo', icon: 'infinite-outline', color: '' },
];

export default function MobileDash({
  leads,
  ventas,
  filtros,
  onRango,
  onOpenMenu,
  onVerTodo,
}: {
  /** Leads YA filtrados (applyGlobalFilters). */
  leads: Lead[];
  ventas: Venta[];
  filtros: FiltrosGlobales;
  onRango: (r: RangoPredefinido, label: string) => void;
  onOpenMenu: () => void;
  onVerTodo: () => void;
}) {
  const { clientId, config, clientType, rawConfig } = useClientConfig();
  const tema = useTemaDocumento();
  const isLight = tema === 'light';
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rangoLabel, setRangoLabel] = useState('Todo el tiempo');

  const session = getSession();
  const fullName = session?.name || config?.clientName || 'Admin';
  const firstName = fullName.split(' ')[0];
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  const m = useMemo(
    () => calcularMetricas(leads, ventas, config?.investment, filtros, clientType, clientId),
    [leads, ventas, config?.investment, filtros, clientType, clientId]
  );
  const valores: Record<number, string> = {
    1: String(m.qualified),
    2: (m.conversionRate * 100).toFixed(1) + '%',
    3: `$${m.sales.toLocaleString('en-US')}`,
    4: `${m.roi.toFixed(2)}x`,
    5: String(m.total),
    6: `$${m.investment.toLocaleString('en-US')}`,
    7: `$${m.cpl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  };
  const customLabels = rawConfig?.card_labels || {};
  const hasCustom = Object.keys(customLabels).length > 0;
  const fallback = !hasCustom && clientType === 'hotel' ? HOTEL_LABELS : DEFAULT_LABELS;
  const labelDe = (i: number) =>
    (customLabels[i] || customLabels[String(i)] || {}).title || fallback[i];

  // Chart diario de calificados (mismo agrupado que _renderMobileChart).
  const { chartLabels, chartValues } = useMemo(() => {
    const qualified = leads.filter((l) => isQualified(l, clientType, clientId));
    const dailyData: Record<string, number> = {};
    qualified.forEach((l: any) => {
      if (!l.fecha_parsed || isNaN(l.fecha_parsed.getTime())) return;
      const key = l.fecha_parsed.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
      dailyData[key] = (dailyData[key] || 0) + 1;
    });
    let labels = Object.keys(dailyData);
    let values = Object.values(dailyData);
    if (labels.length === 0) {
      labels = ['--'];
      values = [0];
    }
    return { chartLabels: labels, chartValues: values };
  }, [leads, clientType, clientId]);

  // Últimos 6 calificados (leads recientes).
  const recientes = useMemo(() => {
    const qualified = leads.filter((l) => isQualified(l, clientType, clientId));
    return qualified.slice(-6).reverse();
  }, [leads, clientType, clientId]);

  return (
    <>
      <div className="mobile-dash" id="mobile-dash">
        {/* Cosmic background */}
        <div className="mob-bg">
          <div className="mob-orb mob-orb-purple"></div>
          <div className="mob-orb mob-orb-indigo"></div>
          <div className="mob-orb mob-orb-cyan"></div>
          <div className="mob-orb mob-orb-rose"></div>
          <div className="mob-grid"></div>
        </div>

        <div className="mob-scroll" id="mob-scroll">
          {/* Header */}
          <div className="mob-header">
            <div>
              <p className="mob-date" id="mob-date">
                {fecha}
              </p>
              <h2 className="mob-greeting" id="mob-greeting" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                {saludo}, {firstName}
              </h2>
            </div>
            <div className="mob-header-right">
              <button className="mob-icon-btn" onClick={() => toggleTheme()} title="Tema">
                <ion-icon name={isLight ? 'sunny-outline' : 'moon-outline'} id="mob-theme-icon"></ion-icon>
              </button>
              <button className="mob-icon-btn" onClick={onOpenMenu} title="Menú">
                <ion-icon name="ellipsis-vertical-outline"></ion-icon>
              </button>
            </div>
          </div>

          {/* Status chip */}
          <div className="mob-status-chip">
            <div className="mob-status-dot"></div>
            <span id="mob-client-chip">{config?.clientName || 'Sistema activo'}</span>
          </div>

          {/* KPI section */}
          <div className="mob-section-row">
            <span className="mob-section-title">Métricas clave</span>
            <button className="mob-range-btn" id="mob-range-label" onClick={() => setSheetOpen(true)}>
              <ion-icon name="calendar-outline"></ion-icon>
              <span>{rangoLabel}</span>
              <ion-icon name="chevron-down-outline" style={{ fontSize: 10 }}></ion-icon>
            </button>
          </div>
          <div className="mob-kpi-scroll" id="mob-kpi-scroll">
            {KPI_DEFS.map((k) => {
              const [r, g, b] = [k.accent.slice(1, 3), k.accent.slice(3, 5), k.accent.slice(5, 7)].map((x) =>
                parseInt(x, 16)
              );
              const cardBg = isLight ? 'rgba(255,255,255,0.7)' : `rgba(${r},${g},${b},0.08)`;
              const cardBorder = isLight ? `rgba(${r},${g},${b},0.15)` : `rgba(${r},${g},${b},0.18)`;
              const cardShadow = isLight ? '0 4px 16px rgba(15,23,42,0.06)' : '0 8px 32px rgba(0,0,0,0.3)';
              const iconBg = isLight ? `rgba(${r},${g},${b},0.1)` : `rgba(${r},${g},${b},0.15)`;
              const iconShadow = isLight ? 'none' : `0 0 16px rgba(${r},${g},${b},0.3)`;
              return (
                <div
                  key={k.i}
                  className="mob-kpi-card"
                  style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow }}
                >
                  <div
                    className="mob-kpi-icon"
                    style={{ background: iconBg, borderColor: `rgba(${r},${g},${b},0.25)`, boxShadow: iconShadow }}
                  >
                    <ion-icon name={k.icon} style={{ color: k.accent, fontSize: '1.1rem' }}></ion-icon>
                  </div>
                  <div className="mob-kpi-label">{labelDe(k.i)}</div>
                  <div className="mob-kpi-value">{valores[k.i]}</div>
                  <div
                    className="mob-kpi-badge"
                    style={{
                      background: `rgba(${r},${g},${b},0.12)`,
                      borderColor: `rgba(${r},${g},${b},0.22)`,
                      color: k.accent,
                    }}
                  >
                    <ion-icon name="trending-up-outline" style={{ fontSize: 10 }}></ion-icon> Actual
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chart */}
          <div className="mob-glass-card" id="mob-chart-section">
            <div className="mob-chart-top">
              <div>
                <p className="mob-card-title" id="mob-chart-title">
                  Histórico
                </p>
                <p className="mob-card-sub">Tendencia de leads calificados</p>
              </div>
              <div className="mob-badge-green">
                <ion-icon name="trending-up-outline"></ion-icon>
                <span>Esta semana</span>
              </div>
            </div>
            <div style={{ height: 130, position: 'relative' }}>
              <Line
                data={{
                  labels: chartLabels,
                  datasets: [
                    {
                      data: chartValues,
                      borderColor: '#A78BFA',
                      borderWidth: 2.5,
                      fill: true,
                      backgroundColor: (context: any) => {
                        const { ctx: c, chartArea } = context.chart;
                        if (!chartArea) return 'rgba(167,139,250,0.1)';
                        const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        grad.addColorStop(0, 'rgba(167,139,250,0.38)');
                        grad.addColorStop(1, 'rgba(167,139,250,0)');
                        return grad;
                      },
                      tension: 0.4,
                      pointRadius: 0,
                      pointHoverRadius: 4,
                      pointHoverBackgroundColor: '#A78BFA',
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: 'rgba(13,11,30,0.92)',
                      borderColor: 'rgba(167,139,250,0.2)',
                      borderWidth: 1,
                      titleColor: '#A78BFA',
                      bodyColor: 'rgba(255,255,255,0.9)',
                    },
                  },
                  scales: {
                    x: {
                      grid: { display: false },
                      ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 9 } },
                      border: { display: false },
                    },
                    y: {
                      grid: { color: 'rgba(255,255,255,0.04)' },
                      ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 9 } },
                      border: { display: false },
                    },
                  },
                }}
              />
            </div>
          </div>

          {/* Leads recientes */}
          <div className="mob-glass-card" id="mob-leads-section">
            <div className="mob-section-row" style={{ marginBottom: 12 }}>
              <span className="mob-section-title">Leads recientes</span>
              <button className="mob-see-all" onClick={onVerTodo}>
                Ver todo <ion-icon name="chevron-forward-outline"></ion-icon>
              </button>
            </div>
            <div id="mob-leads-list">
              {recientes.length === 0 ? (
                <p
                  style={{
                    color: isLight ? 'rgba(15,23,42,0.3)' : 'rgba(255,255,255,0.3)',
                    fontSize: 13,
                    textAlign: 'center',
                    padding: '12px 0',
                  }}
                >
                  Sin leads recientes
                </p>
              ) : (
                recientes.map((l: any, i) => {
                  const name = l.nombre || l.name || `Lead #${l.id || ''}`;
                  const f =
                    l.fecha_parsed instanceof Date && !isNaN(l.fecha_parsed.getTime())
                      ? l.fecha_parsed.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                      : l.fecha
                        ? String(l.fecha).slice(0, 10)
                        : '--';
                  return (
                    <div className="mob-lead-item" key={i}>
                      <div className="mob-lead-icon">
                        <ion-icon name="person-outline"></ion-icon>
                      </div>
                      <span className="mob-lead-name">{name}</span>
                      <span className="mob-lead-date">{f}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom sheet de rango de fechas (mobSetRange) */}
      <div id="mob-date-backdrop" className={sheetOpen ? 'open' : ''} onClick={() => setSheetOpen(false)}></div>
      <div id="mob-date-sheet" className={sheetOpen ? 'open' : ''}>
        <div className="mm-handle"></div>
        <div className="mm-items">
          <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', margin: '0 0 8px 4px' }}>
            Filtrar por fecha
          </p>
          {RANGOS.map((r, idx) => (
            <span key={r.key} style={{ display: 'contents' }}>
              {idx === RANGOS.length - 1 && <div className="mm-divider"></div>}
              <button
                className="mm-item"
                onClick={() => {
                  setSheetOpen(false);
                  setRangoLabel(r.label);
                  onRango(r.key, r.label);
                }}
              >
                <div className="mm-icon" style={r.color ? { background: `${r.color.startsWith('#') ? r.color + '1a' : r.color.replace('0.8', '0.1')}` } : undefined}>
                  <ion-icon name={r.icon} style={r.color ? { color: r.color } : undefined}></ion-icon>
                </div>
                <span>{r.label}</span>
              </button>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
