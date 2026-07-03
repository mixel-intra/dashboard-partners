'use client';

import { useState } from 'react';
import { EVT_PROCESS, EVT_STATUS_COLORS, fmtMoney, tieneFecha, type EventoLead } from './tipos';

// Sidebar del pipeline: resumen, mini calendario y próximos eventos.
// Port de renderSidebar() de pipeline.html.

export default function SidebarEventos({
  leads,
  onOpen,
}: {
  leads: EventoLead[];
  onOpen: (lead: EventoLead) => void;
}) {
  const [offset, setOffset] = useState(0);

  const all = leads;
  const enProceso = all.filter((r) => EVT_PROCESS.includes(r.estado));
  const totalProceso = enProceso.reduce((s, r) => s + (r.total_estimado || 0), 0);
  const ventas = all.filter((r) => r.estado === 'Venta');
  const totalVentas = ventas.reduce((s, r) => s + (r.total_estimado || 0), 0);
  const conversionRate = all.length > 0 ? ((ventas.length / all.length) * 100).toFixed(1) : '0';

  // Mini calendar
  const today = new Date();
  const refDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = refDate.getFullYear(),
    month = refDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7;
  const monthLabel = refDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  const datedLeads = all.filter(tieneFecha);

  // Upcoming events (next 5)
  const now = new Date();
  const upcoming = datedLeads
    .filter((l) => l.fecha_contacto >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    .sort((a, b) => a.fecha_contacto.getTime() - b.fecha_contacto.getTime())
    .slice(0, 5);

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < startPad; i++) cells.push(<div key={`p${i}`} className="pipe-mini-cal-cell pad"></div>);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const cellDate = new Date(year, month, d);
    const isToday = cellDate.toDateString() === today.toDateString();
    const hasEvents = datedLeads.some((l) => l.fecha_contacto.toDateString() === cellDate.toDateString());
    cells.push(
      <div key={d} className={`pipe-mini-cal-cell ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}`}>
        {d}
      </div>
    );
  }

  return (
    <>
      {/* Stats */}
      <div className="pipe-sb-section">
        <div className="pipe-sb-title">
          <ion-icon name="analytics-outline"></ion-icon> Resumen
        </div>
        <div className="pipe-stats-grid">
          <div className="pipe-stat-card">
            <div className="pipe-stat-label">Total Leads</div>
            <div className="pipe-stat-value purple">{all.length}</div>
          </div>
          <div className="pipe-stat-card">
            <div className="pipe-stat-label">Conversión</div>
            <div className="pipe-stat-value amber">{conversionRate}%</div>
          </div>
          <div className="pipe-stat-card">
            <div className="pipe-stat-label">En Proceso</div>
            <div className="pipe-stat-value">{fmtMoney(totalProceso)}</div>
          </div>
          <div className="pipe-stat-card">
            <div className="pipe-stat-label">Vendido</div>
            <div className="pipe-stat-value green">{fmtMoney(totalVentas)}</div>
          </div>
        </div>
      </div>

      {/* Mini Calendar */}
      <div className="pipe-sb-section">
        <div className="pipe-sb-title">
          <ion-icon name="calendar-outline"></ion-icon> Calendario
        </div>
        <div className="pipe-mini-cal-nav">
          <span className="pipe-mini-cal-label font-display">{monthLabel}</span>
          <div className="pipe-mini-cal-btns">
            <button className="pipe-mini-cal-btn" onClick={() => setOffset((o) => o - 1)}>
              <ion-icon name="chevron-back-outline"></ion-icon>
            </button>
            <button className="pipe-mini-cal-btn" onClick={() => setOffset((o) => o + 1)}>
              <ion-icon name="chevron-forward-outline"></ion-icon>
            </button>
          </div>
        </div>
        <div className="pipe-mini-cal-grid">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
            <div key={d} className="pipe-mini-cal-header">
              {d}
            </div>
          ))}
          {cells}
        </div>
      </div>

      {/* Upcoming */}
      <div className="pipe-sb-section">
        <div className="pipe-sb-title">
          <ion-icon name="time-outline"></ion-icon> Próximos Eventos
        </div>
        {upcoming.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#4B5563', fontSize: '0.78rem', padding: 12 }}>
            Sin eventos próximos
          </div>
        ) : (
          upcoming.map((l) => {
            const color = EVT_STATUS_COLORS[l.estado] || '#9CA3AF';
            const dateStr = l.fecha_contacto.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
            const total = l.total_estimado ? fmtMoney(l.total_estimado) : '';
            return (
              <div key={l.airtable_id} className="pipe-upcoming-item" onClick={() => onOpen(l)}>
                <div className="pipe-upcoming-dot" style={{ background: color }}></div>
                <div className="pipe-upcoming-info">
                  <div className="pipe-upcoming-name">{l.nombre}</div>
                  <div className="pipe-upcoming-meta">
                    {l.tipo_evento || 'Evento'} · {dateStr} · {l.pax || '?'} pax
                  </div>
                </div>
                {total && <div className="pipe-upcoming-amount">{total}</div>}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
