'use client';

// Right rail de contexto — port de populateContextPanel/populateContextForToday/
// renderContextHeatmap/ctxHeatmapShift/ctxHeatmapJumpToDate (ids ctx-*) de
// legacy/src/dashboard.js y el markup <aside id="rest-context"> de index.html.

import { useEffect, useMemo, useState } from 'react';
import { dateKey, formatTime, type Disponibilidad, type Reserva } from '../hooks';

export interface PropsContexto {
  reservas: Reserva[];
  liberadas: Set<string>;
  disponibilidad: Disponibilidad;
  /** Día objetivo (YYYY-MM-DD): reserva seleccionada → su fecha; sin selección
   *  → filtro de fecha activo u hoy. null = reserva seleccionada sin fecha
   *  parseable (muestra el estado vacío, como el legacy). */
  claveObjetivo: string | null;
  seleccionadaId: string | null;
  onAbrirDetalle: (r: Reserva) => void;
  onSaltarAFecha: (key: string) => void;
}

export default function PanelContexto(props: PropsContexto) {
  const { reservas, liberadas, disponibilidad, claveObjetivo, seleccionadaId } = props;

  const fechaObjetivo = useMemo(
    () => (claveObjetivo ? new Date(claveObjetivo + 'T00:00:00') : null),
    [claveObjetivo]
  );

  // Mes visible del heatmap + día resaltado (is-current)
  const [anchor, setAnchor] = useState<{ year: number; month: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [claveActual, setClaveActual] = useState<string>('');

  // Al cambiar el día objetivo, el heatmap salta a su mes (populateContextPanel).
  useEffect(() => {
    if (!fechaObjetivo) return;
    setAnchor({ year: fechaObjetivo.getFullYear(), month: fechaObjetivo.getMonth() });
    setClaveActual(dateKey(fechaObjetivo));
  }, [claveObjetivo]); // eslint-disable-line react-hooks/exhaustive-deps

  const sinFecha = !fechaObjetivo;

  // ── Reservas del mismo día ────────────────────────────────────────────────
  const mismoDia = useMemo(() => {
    if (!fechaObjetivo) return [];
    const targetKey = dateKey(fechaObjetivo);
    return reservas.filter((res) => {
      const d = res.fechaParsed;
      return d && dateKey(d) === targetKey;
    });
  }, [reservas, fechaObjetivo]);

  // Aforo — cuentan las no-rechazadas y no-liberadas (mesa liberada no ocupa aforo)
  const activas = mismoDia.filter((res) => res.estado !== 'Rechazado' && !liberadas.has(res.id));
  const confirmadas = mismoDia.filter((res) => res.estado === 'Confirmado').length;
  const pendientes = mismoDia.filter((res) => res.estado === 'Nuevo Lead').length;
  const rechazadas = mismoDia.filter((res) => res.estado === 'Rechazado').length;
  const servidas = mismoDia.filter((res) => liberadas.has(res.id)).length;
  const otras = mismoDia.length - confirmadas - pendientes - rechazadas;
  const paxUsado = activas.reduce((sum, res) => sum + (parseInt(String(res.pax)) || 0), 0);
  const capacidadDiaria = disponibilidad.dailyCapacity ? parseInt(String(disponibilidad.dailyCapacity)) : null;

  let anchoBarra: string;
  let claseBarra = '';
  let pctTexto = '';
  if (capacidadDiaria && capacidadDiaria > 0) {
    const pct = Math.min(100, Math.round((paxUsado / capacidadDiaria) * 100));
    anchoBarra = pct + '%';
    if (pct >= 90) claseBarra = ' danger';
    else if (pct >= 70) claseBarra = ' warn';
    pctTexto = pct + '%';
  } else {
    anchoBarra = paxUsado > 0 ? '40%' : '0%';
  }

  const metaPartes: React.ReactNode[] = [
    <span key="c"><strong>{confirmadas}</strong> confirmadas</span>,
    <span key="p"><strong>{pendientes}</strong> pendientes</span>,
  ];
  if (rechazadas > 0)
    metaPartes.push(
      <span key="r" className="rest-ctx-meta-rejected"><strong>{rechazadas}</strong> rechazadas</span>
    );
  if (servidas > 0)
    metaPartes.push(
      <span key="s" className="rest-ctx-meta-released"><strong>{servidas}</strong> servidas</span>
    );
  if (otras > 0) metaPartes.push(<span key="o"><strong>{otras}</strong> otras</span>);

  const listaOrdenada = useMemo(() => {
    const timeKey = (res: Reserva) => {
      if (!res.horaEvento) return 99999;
      const [h, m] = res.horaEvento.split(':').map((x) => parseInt(x) || 0);
      return h * 60 + m;
    };
    return [...mismoDia].sort((a, b) => timeKey(a) - timeKey(b));
  }, [mismoDia]);

  // ── Heatmap mensual (port de renderContextHeatmap) ───────────────────────
  const heatmap = useMemo(() => {
    const { year, month } = anchor;
    const buckets: Record<string, number> = {};
    reservas.forEach((res) => {
      if (res.estado === 'Rechazado') return;
      const d = res.fechaParsed;
      if (!d) return;
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const k = dateKey(d);
      buckets[k] = (buckets[k] || 0) + (parseInt(String(res.pax)) || 0);
    });

    // Umbral: escala por capacidad diaria si existe, si no por el máximo del mes
    const maxVal = Math.max(1, ...Object.values(buckets));
    const ref = capacidadDiaria || maxVal;
    const lvl = (v: number) => {
      if (!v) return 0;
      const r = v / ref;
      if (r >= 0.85) return 4;
      if (r >= 0.6) return 3;
      if (r >= 0.35) return 2;
      return 1;
    };

    const closed = disponibilidad.closedDates || [];
    const todayKey = dateKey(new Date());

    const dows = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const firstOfMonth = new Date(year, month, 1);
    // getDay() domingo=0 → queremos lunes=0
    const startBlank = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const celdas: { key: string; cls: string; title: string; dia: number }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const k = dateKey(d);
      const v = buckets[k] || 0;
      const cls = ['rest-ctx-hm-cell', `lvl${lvl(v)}`];
      if (k === todayKey) cls.push('is-today');
      if (k === claveActual) cls.push('is-current');
      if (closed.includes(k)) cls.push('is-closed');
      const titleParts = [d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })];
      if (v) titleParts.push(`${v} pax`);
      if (closed.includes(k)) titleParts.push('Cerrado');
      celdas.push({ key: k, cls: cls.join(' '), title: titleParts.join(' · '), dia: day });
    }

    const etiquetaMes = new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    return { dows, startBlank, celdas, etiquetaMes };
  }, [reservas, anchor, claveActual, capacidadDiaria, disponibilidad.closedDates]);

  function moverMes(delta: number) {
    setAnchor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function saltarADia(k: string) {
    // Aplica el filtro de fecha al board (mismo comportamiento que "Saltar a
    // fecha"). NO abre el detalle de la primera reserva: deja que el operador
    // vea la lista filtrada y elija manualmente cuál ver.
    const target = new Date(k + 'T00:00:00');
    if (isNaN(target.getTime())) return;
    props.onSaltarAFecha(k);
    setClaveActual(k);
  }

  return (
    <aside className="rest-context" id="rest-context">
      <div className={`rest-context-empty${sinFecha ? '' : ' hidden'}`} id="rest-context-empty">
        <ion-icon name="albums-outline"></ion-icon>
        <div className="rest-context-empty-title">Contexto del día</div>
        <div className="rest-context-empty-sub">
          Selecciona una reserva para ver el aforo y las otras reservas del mismo día.
        </div>
      </div>
      <div className={`rest-context-content${sinFecha ? ' hidden' : ''}`} id="rest-context-content">
        {/* Capacity card */}
        <div className="rest-ctx-section">
          <div className="rest-ctx-section-title">
            <span>
              <ion-icon name="people-outline"></ion-icon> Aforo del día
            </span>
            <span className="rest-ctx-day-label" id="ctx-day-label">
              {fechaObjetivo
                ? fechaObjetivo.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
                : '—'}
            </span>
          </div>
          <div className="rest-ctx-cap">
            <div className="rest-ctx-cap-row">
              <div className="rest-ctx-cap-numbers">
                <span className="rest-ctx-cap-used" id="ctx-cap-used">{paxUsado}</span>
                <span className="rest-ctx-cap-sep">/</span>
                <span className="rest-ctx-cap-total" id="ctx-cap-total">{capacidadDiaria || '∞'}</span>
                <span className="rest-ctx-cap-unit">pax</span>
              </div>
              <span className="rest-ctx-cap-pct" id="ctx-cap-pct">{pctTexto}</span>
            </div>
            <div className="rest-ctx-cap-bar">
              <div
                className={`rest-ctx-cap-bar-fill${claseBarra}`}
                id="ctx-cap-bar-fill"
                style={{ width: anchoBarra }}
              ></div>
            </div>
            <div className="rest-ctx-cap-meta" id="ctx-cap-meta">
              {metaPartes.map((parte, i) => (
                <span key={i} style={{ display: 'contents' }}>
                  {i > 0 && <span className="rest-ctx-dot">·</span>}
                  {parte}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Same day reservations */}
        <div className="rest-ctx-section">
          <div className="rest-ctx-section-title">
            <span>
              <ion-icon name="time-outline"></ion-icon> Reservas del mismo día
            </span>
            <span className="rest-ctx-count" id="ctx-day-count">{mismoDia.length}</span>
          </div>
          <div className="rest-ctx-day-list" id="ctx-day-list">
            {mismoDia.length === 0 ? (
              <div className="rest-ctx-empty-list">Sin otras reservas este día</div>
            ) : (
              listaOrdenada.map((res) => {
                const esActual = seleccionadaId !== null && res.id === seleccionadaId;
                const statusKey =
                  res.estado === 'Confirmado' ? 's-confirmed' : res.estado === 'Rechazado' ? 's-rejected' : 's-pending';
                const time = res.horaEvento ? formatTime(res.horaEvento) : '—';
                const pax = parseInt(String(res.pax)) || 0;
                return (
                  <div
                    className={`rest-ctx-day-row ${esActual ? 'is-current' : ''}`}
                    key={res.id || `${time}-${res.nombre}`}
                    onClick={() => props.onAbrirDetalle(res)}
                    title={res.tipoEvento || ''}
                  >
                    <span className="rest-ctx-day-time">{time}</span>
                    <span className={`rest-ctx-day-status ${statusKey}`}></span>
                    <span className="rest-ctx-day-name">{res.nombre || 'Sin nombre'}</span>
                    <span className="rest-ctx-day-pax">
                      <strong>{pax}</strong> pax
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Month heatmap */}
        <div className="rest-ctx-section">
          <div className="rest-ctx-section-title rest-ctx-heatmap-head">
            <button className="rest-ctx-heatmap-nav" onClick={() => moverMes(-1)} title="Mes anterior">
              <ion-icon name="chevron-back-outline"></ion-icon>
            </button>
            <span id="ctx-heatmap-label">{heatmap.etiquetaMes}</span>
            <button className="rest-ctx-heatmap-nav" onClick={() => moverMes(1)} title="Mes siguiente">
              <ion-icon name="chevron-forward-outline"></ion-icon>
            </button>
          </div>
          <div className="rest-ctx-heatmap" id="ctx-heatmap">
            {heatmap.dows.map((d, i) => (
              <div className="rest-ctx-hm-dow" key={`dow-${i}`}>{d}</div>
            ))}
            {Array.from({ length: heatmap.startBlank }).map((_, i) => (
              <div className="rest-ctx-hm-cell empty" key={`blank-${i}`}></div>
            ))}
            {heatmap.celdas.map((c) => (
              <div
                className={c.cls}
                data-date={c.key}
                title={c.title}
                key={c.key}
                onClick={() => saltarADia(c.key)}
              >
                {c.dia}
              </div>
            ))}
          </div>
          <div className="rest-ctx-heatmap-legend">
            <span>Menos</span>
            <span className="hm-sw lvl0"></span>
            <span className="hm-sw lvl1"></span>
            <span className="hm-sw lvl2"></span>
            <span className="hm-sw lvl3"></span>
            <span className="hm-sw lvl4"></span>
            <span>Más</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
