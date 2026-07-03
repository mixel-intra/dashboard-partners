'use client';

import { useState } from 'react';
import { EVT_STATUS_COLORS, tieneFecha, type EventoLead } from './tipos';

// Calendario completo (día/semana/mes) del CRM de eventos.
// Port de renderCalendar()/renderCalWeek()/renderCalDay()/renderCalMonth().

type Vista = 'day' | 'week' | 'month';

export default function CalendarioEventos({
  leads,
  onOpen,
}: {
  leads: EventoLead[];
  onOpen: (lead: EventoLead) => void;
}) {
  const [view, setView] = useState<Vista>('week');
  const [offset, setOffset] = useState(0);

  const today = new Date();
  const dated = leads.filter(tieneFecha);

  const viewBtns = (
    <div className="pipe-cal-view-toggle">
      {(['day', 'week', 'month'] as Vista[]).map((v) => {
        const labels = { day: 'Día', week: 'Semana', month: 'Mes' };
        return (
          <button
            key={v}
            className={`pipe-cal-view-btn ${view === v ? 'active' : ''}`}
            onClick={() => {
              setView(v);
              setOffset(0);
            }}
          >
            {labels[v]}
          </button>
        );
      })}
    </div>
  );

  const nav = (label: string, showToday: boolean) => (
    <div className="pipe-cal-nav">
      <button className="pipe-cal-nav-btn" onClick={() => setOffset((o) => o - 1)}>
        <ion-icon name="chevron-back-outline"></ion-icon>
      </button>
      <span className="pipe-cal-week-label font-display">{label}</span>
      <button className="pipe-cal-nav-btn" onClick={() => setOffset((o) => o + 1)}>
        <ion-icon name="chevron-forward-outline"></ion-icon>
      </button>
      {showToday && (
        <button className="pipe-cal-nav-btn pipe-cal-today-btn" onClick={() => setOffset(0)}>
          Hoy
        </button>
      )}
      {viewBtns}
    </div>
  );

  const calCard = (l: EventoLead & { fecha_contacto: Date }) => {
    const hora = l.fecha_contacto.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const color = EVT_STATUS_COLORS[l.estado] || '#9CA3AF';
    return (
      <div
        key={l.airtable_id}
        className="pipe-cal-card"
        style={{ ['--cal-accent' as any]: color, borderLeftColor: color }}
        onClick={() => onOpen(l)}
      >
        <div className="pipe-cal-time">{hora}</div>
        <div className="pipe-cal-name">{l.nombre}</div>
        <div className="pipe-cal-type">
          {l.tipo_evento} · {l.pax} pax
        </div>
      </div>
    );
  };

  if (view === 'day') {
    const day = new Date(today);
    day.setDate(today.getDate() + offset);
    const isToday = day.toDateString() === today.toDateString();
    const label = day.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const dayLeads = dated
      .filter((l) => l.fecha_contacto.toDateString() === day.toDateString())
      .sort((a, b) => a.fecha_contacto.getTime() - b.fecha_contacto.getTime());

    const hours: Record<number, typeof dayLeads> = {};
    for (let h = 7; h <= 20; h++) hours[h] = [];
    dayLeads.forEach((l) => {
      const h = l.fecha_contacto.getHours();
      if (!hours[h]) hours[h] = [];
      hours[h].push(l);
    });

    return (
      <div className="pipe-calendar-full">
        {nav(`${isToday ? 'Hoy — ' : ''}${label}`, !isToday)}
        <div className="pipe-cal-day-view">
          {Object.entries(hours).map(([h, hLeads]) => (
            <div className="pipe-cal-hour-row" key={h}>
              <div className="pipe-cal-hour-label">{`${String(h).padStart(2, '0')}:00`}</div>
              <div className="pipe-cal-hour-content">
                {hLeads.length === 0 ? <div className="pipe-cal-empty-slot"></div> : hLeads.map(calCard)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'month') {
    const refDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const year = refDate.getFullYear(),
      month = refDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = (firstDay.getDay() + 6) % 7;
    const label = refDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

    const cells: React.ReactNode[] = [];
    for (let i = 0; i < startPad; i++)
      cells.push(<div key={`p${i}`} className="pipe-cal-month-cell pipe-cal-month-pad"></div>);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const cellDate = new Date(year, month, d);
      const isToday = cellDate.toDateString() === today.toDateString();
      const dayLeads = dated.filter((l) => l.fecha_contacto.toDateString() === cellDate.toDateString());
      const dayOffset = Math.round((cellDate.getTime() - today.getTime()) / 86400000);
      cells.push(
        <div
          key={d}
          className={`pipe-cal-month-cell ${isToday ? 'pipe-cal-today' : ''}`}
          onClick={() => {
            setView('day');
            setOffset(dayOffset);
          }}
        >
          <div className="pipe-cal-month-day">{d}</div>
          <div className="pipe-cal-month-dots">
            {dayLeads.slice(0, 3).map((l, i) => (
              <div
                key={i}
                className="pipe-cal-month-dot"
                style={{ background: EVT_STATUS_COLORS[l.estado] || '#9CA3AF' }}
                title={l.nombre}
              ></div>
            ))}
            {dayLeads.length > 3 && <span className="pipe-cal-month-more">+{dayLeads.length - 3}</span>}
          </div>
        </div>
      );
    }

    return (
      <div className="pipe-calendar-full">
        {nav(label, offset !== 0)}
        <div className="pipe-cal-month-grid">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
            <div key={d} className="pipe-cal-month-header">
              {d}
            </div>
          ))}
          {cells}
        </div>
      </div>
    );
  }

  // week (default)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + offset * 7);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push(d);
  }
  const label = `${days[0].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} — ${days[6].toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="pipe-calendar-full">
      {nav(label, offset !== 0)}
      <div className="pipe-cal-grid">
        {days.map((day) => {
          const dayStr = day.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
          const isToday = day.toDateString() === today.toDateString();
          const dayLeads = dated
            .filter((l) => l.fecha_contacto.toDateString() === day.toDateString())
            .sort((a, b) => a.fecha_contacto.getTime() - b.fecha_contacto.getTime());
          return (
            <div className={`pipe-cal-day ${isToday ? 'pipe-cal-today' : ''}`} key={day.toISOString()}>
              <div className="pipe-cal-day-header">{dayStr}</div>
              <div className="pipe-cal-day-body">
                {dayLeads.length === 0 ? <div className="pipe-cal-empty">—</div> : dayLeads.map(calCard)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
