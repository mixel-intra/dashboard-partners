'use client';

// Board de escritorio del restaurante — port del markup #restaurant-panel
// (toolbar v2 + quick stats, panel de disponibilidad, chips/búsqueda/salto a
// fecha, barra de selección masiva y el board agrupado por día) de
// legacy/index.html + renderRestaurantReservations/renderRestaurantTimeline/
// buildReservationCard de legacy/src/dashboard.js.

import { useEffect, useMemo, useRef } from 'react';
import flatpickr from 'flatpickr';
import { Spanish } from 'flatpickr/dist/l10n/es.js';
import 'flatpickr/dist/flatpickr.min.css';
import type { Instance } from 'flatpickr/dist/types/instance';
import {
  formatTime,
  isReservationInWeek,
  isReservationToday,
  matchesRestaurantView,
  ordenarReservas,
  type Reserva,
  type VistaReserva,
} from '../hooks';

export interface PropsTablero {
  /** Todas las reservas (los contadores y stats se calculan sobre el set completo). */
  reservas: Reserva[];
  /** Reservas visibles en el board (con TODOS los filtros aplicados, sin ordenar). */
  visibles: Reserva[];
  filtros: { view: VistaReserva; search: string; date: Date | null };
  onCambiarVista: (v: VistaReserva) => void;
  onBuscar: (q: string) => void;
  onSaltarFecha: (d: Date) => void;
  onLimpiarFecha: () => void;

  sinConfig: boolean;
  errorRed: boolean;
  cargando: boolean;
  refrescando: boolean;
  onRefrescar: () => void;

  archivoHabilitado: boolean;
  archivadas: Set<string>;
  liberadas: Set<string>;
  tieneNotas: (id: string) => boolean;

  modoSeleccion: boolean;
  idsSeleccionados: Set<string>;
  onToggleModoSeleccion: () => void;
  onToggleSeleccion: (id: string) => void;
  onSeleccionarTodas: (checked: boolean) => void;
  onAccionLote: () => void;

  seleccionadaId: string | null;
  onAbrirDetalle: (r: Reserva) => void;
  onConfirmar: (r: Reserva) => void;
  onRechazar: (r: Reserva) => void;
  onEditar: (r: Reserva) => void;
  onArchivar: (r: Reserva) => void;
  onDesarchivar: (r: Reserva) => void;

  onNuevaReserva: () => void;
  aceptandoReservas: boolean;
  panelDisponibilidadAbierto: boolean;
  onTogglePanelDisponibilidad: () => void;

  /** Slots para conservar el orden exacto del markup legacy. */
  slotDisponibilidad: React.ReactNode;
  slotDrawer: React.ReactNode;
  slotContexto: React.ReactNode;
}

// ── Wrapper de flatpickr (Saltar a fecha) ───────────────────────────────────
// Port de openDateJump/refreshDatePickerDots: init perezoso → aquí en mount,
// con los puntitos por día (onDayCreate) y posicionado sobre el botón.
function SaltarFecha({
  reservas,
  fecha,
  onSaltarFecha,
  onLimpiarFecha,
}: {
  reservas: Reserva[];
  fecha: Date | null;
  onSaltarFecha: (d: Date) => void;
  onLimpiarFecha: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const fpRef = useRef<Instance | null>(null);
  const reservasRef = useRef<Reserva[]>(reservas);
  reservasRef.current = reservas;
  const onSaltarRef = useRef(onSaltarFecha);
  onSaltarRef.current = onSaltarFecha;

  useEffect(() => {
    if (!inputRef.current) return;
    fpRef.current = flatpickr(inputRef.current, {
      locale: Spanish,
      dateFormat: 'Y-m-d',
      positionElement: btnRef.current || undefined,
      onChange: (selectedDates) => {
        if (selectedDates && selectedDates[0]) onSaltarRef.current(selectedDates[0]);
      },
      onDayCreate: (_dObj, _dStr, _fp, dayElem) => {
        const cell = (dayElem as any).dateObj as Date | undefined;
        if (!cell) return;
        const matches = reservasRef.current.filter((r) => {
          if (!r.fechaParsed) return false;
          const d = r.fechaParsed;
          return (
            d.getFullYear() === cell.getFullYear() &&
            d.getMonth() === cell.getMonth() &&
            d.getDate() === cell.getDate()
          );
        });
        if (matches.length === 0) return;
        // Color del punto por prioridad: pendiente > confirmada > rechazada
        const hasPending = matches.some((r) => r.estado === 'Nuevo Lead');
        const hasConfirmed = matches.some((r) => r.estado === 'Confirmado');
        const dotClass = hasPending ? 'is-pending' : hasConfirmed ? 'is-confirmed' : 'is-rejected';
        const dot = document.createElement('span');
        dot.className = 'flatpickr-day-dot ' + dotClass;
        if (matches.length > 1) dot.setAttribute('data-count', String(matches.length));
        dayElem.appendChild(dot);
      },
    }) as Instance;
    return () => {
      fpRef.current?.destroy();
      fpRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-pinta los puntitos cuando llegan datos nuevos (refreshDatePickerDots).
  useEffect(() => {
    fpRef.current?.redraw?.();
  }, [reservas]);

  // Al limpiar el filtro desde fuera, limpia también el picker.
  useEffect(() => {
    if (!fecha && fpRef.current && fpRef.current.selectedDates.length) fpRef.current.clear(false);
  }, [fecha]);

  const monthShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const etiqueta = fecha
    ? `${fecha.getDate()} ${monthShort[fecha.getMonth()]} ${fecha.getFullYear()}`
    : 'Saltar a fecha';

  return (
    <div className="rest-date-jump">
      <button
        id="rest-date-btn"
        ref={btnRef}
        className={`rest-date-btn${fecha ? ' is-active' : ''}`}
        onClick={(ev) => {
          ev.stopPropagation();
          fpRef.current?.open();
        }}
        title="Saltar a una fecha"
      >
        <ion-icon name="calendar-outline"></ion-icon>
        <span id="rest-date-btn-label">{etiqueta}</span>
      </button>
      <button
        id="rest-date-clear"
        className={`rest-date-clear${fecha ? '' : ' hidden'}`}
        onClick={onLimpiarFecha}
        title="Quitar filtro de fecha"
      >
        <ion-icon name="close-outline"></ion-icon>
      </button>
      <input type="text" id="rest-date-picker" ref={inputRef} style={{ display: 'none' }} />
    </div>
  );
}

// ── Tarjeta del board (port de buildReservationCard) ────────────────────────
function TarjetaReserva({
  r,
  isPast,
  props,
}: {
  r: Reserva;
  isPast: boolean;
  props: PropsTablero;
}) {
  const selecting = props.modoSeleccion;
  const isSelected = selecting && props.idsSeleccionados.has(r.id);
  const cleanPhone = (r.telefono || '').replace(/[\s\-\+\(\)]/g, '');
  const isPending = r.estado === 'Nuevo Lead';
  const isConfirmed = r.estado === 'Confirmado';
  const isRejected = r.estado === 'Rechazado';
  const isReleased = props.liberadas.has(r.id);
  const statusKey = isReleased ? 's-served' : isPending ? 's-pending' : isConfirmed ? 's-confirmed' : 's-rejected';
  const statusLabel = isReleased ? 'Servida' : isPending ? 'Nuevo lead' : isConfirmed ? 'Confirmada' : 'Rechazada';

  const t = r.horaEvento ? formatTime(r.horaEvento) : null;
  const tipo = r.tipoEvento || 'Reserva';
  const detail = (r.detalles || '').trim();
  const isArchived = props.archivadas.has(r.id);

  const cardCls = ['rest-card'];
  if (isPending) cardCls.push('is-pending');
  else if (isConfirmed) cardCls.push('is-confirmed');
  else if (isRejected) cardCls.push('is-rejected');
  if (isPast) cardCls.push('is-past');
  if (isReleased) cardCls.push('is-released');
  if (selecting) cardCls.push('is-selecting');
  if (isSelected) cardCls.push('is-selected');
  if (!selecting && props.seleccionadaId === r.id) cardCls.push('is-active');

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={cardCls.join(' ')}
      data-id={String(r.id || '')}
      onClick={() => (selecting ? props.onToggleSeleccion(r.id) : props.onAbrirDetalle(r))}
    >
      {selecting && (
        <span className="rest-card-check">
          <ion-icon name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}></ion-icon>
        </span>
      )}
      {props.tieneNotas(r.id) && <span className="rest-card-notes-flag" title="Tiene notas"></span>}
      <div className="rest-card-namebox">
        <div className="rest-card-namerow">
          <span className="rest-card-name">{r.nombre || 'Sin nombre'}</span>
          <span className={`rest-card-pill ${statusKey}`}>
            <span className="pdot"></span>
            {statusLabel}
          </span>
        </div>
        <div className="rest-card-meta">
          <span>
            <strong>{r.pax || 0}</strong> pax
          </span>
          <span className="dot">·</span>
          <span>{tipo}</span>
          {t && (
            <>
              <span className="dot">·</span>
              <span>{t}</span>
            </>
          )}
        </div>
      </div>
      {detail ? (
        <div className="rest-card-detail">{detail}</div>
      ) : (
        <div className="rest-card-detail is-empty">Sin detalles del lead</div>
      )}
      {!selecting && (
        <div className="rest-card-actions">
          {isPending ? (
            <>
              <button
                className="rest-card-btn success"
                onClick={(e) => { stop(e); props.onConfirmar(r); }}
                title="Confirmar reserva"
              >
                <ion-icon name="checkmark-outline"></ion-icon> Confirmar
              </button>
              <button
                className="rest-card-btn danger"
                onClick={(e) => { stop(e); props.onRechazar(r); }}
                title="Rechazar reserva"
              >
                <ion-icon name="close-outline"></ion-icon> Rechazar
              </button>
            </>
          ) : (
            <button
              className="rest-card-btn"
              onClick={(e) => { stop(e); props.onEditar(r); }}
              title="Editar reserva"
            >
              <ion-icon name="create-outline"></ion-icon> Editar
            </button>
          )}
          {cleanPhone && (
            <a
              className="rest-card-btn icon whatsapp"
              href={`https://wa.me/${cleanPhone}`}
              target="_blank"
              rel="noopener"
              onClick={stop}
              title="WhatsApp"
            >
              <ion-icon name="logo-whatsapp"></ion-icon>
            </a>
          )}
          {/* Botón Archivar — solo roof-107, visible en todos los estados */}
          {props.archivoHabilitado &&
            (isArchived ? (
              <button
                className="rest-card-btn icon archive is-archived"
                onClick={(e) => { stop(e); props.onDesarchivar(r); }}
                title="Desarchivar"
              >
                <ion-icon name="archive-outline"></ion-icon>
              </button>
            ) : (
              <button
                className="rest-card-btn icon archive"
                onClick={(e) => { stop(e); props.onArchivar(r); }}
                title="Archivar — quitar del board"
              >
                <ion-icon name="archive-outline"></ion-icon>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Estado vacío del board (port de renderRestaurantTimeline vacío +
//    renderRestaurantEmpty para sin-config / sin-conexión) ──────────────────
function BoardVacio({ props }: { props: PropsTablero }) {
  if (props.sinConfig) {
    return (
      <div className="rest-board-empty">
        <ion-icon name="cog-outline"></ion-icon>
        <div className="rest-board-empty-title">Restaurante en preparación</div>
        <div className="rest-board-empty-sub">
          Aún no hay un origen de reservas configurado para este entorno.
        </div>
      </div>
    );
  }
  if (props.errorRed) {
    return (
      <div className="rest-board-empty">
        <ion-icon name="cloud-offline-outline"></ion-icon>
        <div className="rest-board-empty-title">Sin conexión</div>
        <div className="rest-board-empty-sub">
          No pudimos contactar al servidor. Revisa tu internet y prueba &quot;Actualizar&quot;.
        </div>
      </div>
    );
  }
  if (props.cargando) {
    return (
      <div className="rest-empty-list">
        <ion-icon name="sync-outline" class="spin"></ion-icon>
        <div className="rest-empty-list-title">Cargando reservas…</div>
      </div>
    );
  }

  const hasData = props.reservas.length > 0;
  const view = props.filtros.view;
  let icon = 'restaurant-outline';
  let title = 'Sin reservas todavía';
  let sub = 'Cuando lleguen reservas calificadas las verás aquí.';
  if (hasData) {
    if (props.filtros.search || props.filtros.date) {
      icon = 'funnel-outline';
      title = 'Sin resultados';
      sub = 'Ajusta la búsqueda, la fecha o cambia de chip.';
    } else if (view === 'nuevos') {
      icon = 'checkmark-done-outline';
      title = 'Todo al día ✨';
      sub = 'No hay leads sin responder. Revisa "Confirmadas" o "Todas".';
    } else if (view === 'confirmadas') {
      icon = 'calendar-clear-outline';
      title = 'Sin reservas confirmadas';
      sub = 'Aún no has confirmado ninguna reserva.';
    } else if (view === 'rechazadas') {
      icon = 'archive-outline';
      title = 'Sin rechazadas';
      sub = 'No hay reservas rechazadas.';
    } else {
      icon = 'funnel-outline';
      title = 'Sin resultados';
      sub = 'Ajusta los filtros.';
    }
  }
  return (
    <div className="rest-board-empty">
      <ion-icon name={icon}></ion-icon>
      <div className="rest-board-empty-title">{title}</div>
      <div className="rest-board-empty-sub">{sub}</div>
    </div>
  );
}

export default function TableroReservas(props: PropsTablero) {
  const {
    reservas,
    visibles,
    filtros,
    archivadas,
    archivoHabilitado,
    modoSeleccion,
    idsSeleccionados,
  } = props;

  // ── Quick stats + contadores de chips (sobre el set completo) ────────────
  const stats = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const todays = reservas.filter((r) => isReservationToday(r));
    return {
      hoy: todays.length,
      paxHoy: todays.reduce((sum, r) => sum + (Number(r.pax) || 0), 0),
      semana: reservas.filter((r) => isReservationInWeek(r, startOfWeek, endOfWeek)).length,
      pendientes: reservas.filter((r) => matchesRestaurantView(r, 'nuevos', archivadas)).length,
      nuevos: reservas.filter((r) => matchesRestaurantView(r, 'nuevos', archivadas)).length,
      confirmadas: reservas.filter((r) => matchesRestaurantView(r, 'confirmadas', archivadas)).length,
      rechazadas: reservas.filter((r) => matchesRestaurantView(r, 'rechazadas', archivadas)).length,
      // "Todas" = total visible (excluye archivadas), para que al archivar baje y suba "Archivadas"
      todas: reservas.filter((r) => matchesRestaurantView(r, 'todas', archivadas)).length,
      archivadas: reservas.filter((r) => matchesRestaurantView(r, 'archivadas', archivadas)).length,
    };
  }, [reservas, archivadas]);

  // ── Agrupado por día (port de renderRestaurantTimeline) ──────────────────
  const grupos = useMemo(() => {
    const ordenadas = ordenarReservas(visibles);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const groupKey = (r: Reserva) => {
      const d = r.fechaParsed;
      if (!d) return 'zzz-sin-fecha';
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);
      if (day < today) return 'past';
      return day.toISOString().slice(0, 10);
    };

    const lista: { key: string; items: Reserva[]; sample: Reserva }[] = [];
    const mapa: Record<string, { key: string; items: Reserva[]; sample: Reserva }> = {};
    ordenadas.forEach((r) => {
      const k = groupKey(r);
      if (!mapa[k]) {
        mapa[k] = { key: k, items: [], sample: r };
        lista.push(mapa[k]);
      }
      mapa[k].items.push(r);
    });
    return lista;
  }, [visibles]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const monthShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  const groupLabel = (key: string, sample: Reserva) => {
    if (key === 'past') return 'Histórico';
    if (key === 'zzz-sin-fecha') return 'Sin fecha';
    const d = sample.fechaParsed as Date;
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    if (day.getTime() === today.getTime()) return 'Hoy';
    if (day.getTime() === tomorrow.getTime()) return 'Mañana';
    if (day < weekEnd) return `${dayNames[d.getDay()]} ${d.getDate()} ${monthShort[d.getMonth()]}`;
    return `${dayNames[d.getDay()]} ${d.getDate()} ${monthShort[d.getMonth()]} ${d.getFullYear()}`;
  };

  const n = idsSeleccionados.size;
  const esVistaArchivadas = filtros.view === 'archivadas';
  const idsVisibles = visibles.map((r) => r.id).filter(Boolean);
  const todasSeleccionadas = idsVisibles.length > 0 && idsVisibles.every((id) => idsSeleccionados.has(id));

  return (
    <>
      {/* Compact header */}
      <div className="rest-toolbar-v2">
        <div className="rest-title-block">
          <h3>
            <ion-icon name="restaurant-outline"></ion-icon>
            Restaurante
          </h3>
          <div className="rest-quick-stats" id="rest-quick-stats">
            <span className="rest-quick-stat">
              <strong id="rest-stat-hoy">{stats.hoy}</strong> hoy
            </span>
            <span className="rest-quick-stat-divider">·</span>
            <span className="rest-quick-stat">
              <strong id="rest-stat-pax-hoy">{stats.paxHoy}</strong> pax
            </span>
            <span className="rest-quick-stat-divider">·</span>
            <span className="rest-quick-stat alert">
              <strong id="rest-stat-pendientes">{stats.pendientes}</strong> pendientes
            </span>
            <span className="rest-quick-stat-divider hidden-mobile">·</span>
            <span className="rest-quick-stat hidden-mobile">
              <strong id="rest-stat-semana">{stats.semana}</strong> esta semana
            </span>
          </div>
        </div>
        <div className="rest-toolbar-actions">
          <button
            id="rest-new-btn"
            className="rest-tool-btn primary"
            onClick={props.onNuevaReserva}
            title="Crear una nueva reserva"
          >
            <ion-icon name="add-outline"></ion-icon>
            <span>Nueva reserva</span>
          </button>
          <button
            id="avail-toggle-btn"
            className={`rest-tool-btn success${props.aceptandoReservas ? '' : ' unavailable'}`}
            onClick={props.onTogglePanelDisponibilidad}
            title="Panel de disponibilidad"
          >
            <ion-icon name="shield-checkmark-outline"></ion-icon>
            <span id="avail-btn-label">{props.aceptandoReservas ? 'Disponibilidad' : 'Sin disponibilidad'}</span>
          </button>
          <button
            id="rest-refresh-btn"
            onClick={props.onRefrescar}
            className={`rest-tool-btn${props.refrescando ? ' loading' : ''}`}
            disabled={props.refrescando}
            title="Actualizar reservas"
          >
            <ion-icon name="refresh-outline"></ion-icon>
            <span className="hidden-mobile">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Availability Panel */}
      {props.slotDisponibilidad}

      {/* Top toolbar: filters (left) → search → date jump (right) */}
      <div className="rest-board-toolbar">
        <div className="rest-board-chips" id="rest-chips">
          <button
            className={`rest-chip${filtros.view === 'nuevos' ? ' active' : ''}`}
            data-status="nuevos"
            onClick={() => props.onCambiarVista('nuevos')}
            title="Leads sin responder"
          >
            Pendientes <span className="rest-chip-count" id="rest-count-nuevos">{stats.nuevos}</span>
          </button>
          <button
            className={`rest-chip${filtros.view === 'confirmadas' ? ' active' : ''}`}
            data-status="confirmadas"
            onClick={() => props.onCambiarVista('confirmadas')}
            title="Reservas confirmadas a futuro"
          >
            Confirmadas <span className="rest-chip-count" id="rest-count-confirmadas">{stats.confirmadas}</span>
          </button>
          <button
            className={`rest-chip${filtros.view === 'todas' ? ' active' : ''}`}
            data-status="todas"
            onClick={() => props.onCambiarVista('todas')}
            title="Todas las reservas"
          >
            Todas <span className="rest-chip-count" id="rest-count-todas">{stats.todas}</span>
          </button>
          <button
            className={`rest-chip${filtros.view === 'rechazadas' ? ' active' : ''}`}
            data-status="rechazadas"
            onClick={() => props.onCambiarVista('rechazadas')}
            title="Reservas rechazadas"
          >
            Rechazadas <span className="rest-chip-count" id="rest-count-rechazadas">{stats.rechazadas}</span>
          </button>
          <button
            className={`rest-chip${filtros.view === 'archivadas' ? ' active' : ''}`}
            id="rest-chip-archivadas"
            data-status="archivadas"
            onClick={() => props.onCambiarVista('archivadas')}
            title="Reservas archivadas (ocultas del board)"
            style={{ display: archivoHabilitado ? '' : 'none' }}
          >
            Archivadas <span className="rest-chip-count" id="rest-count-archivadas">{stats.archivadas}</span>
          </button>
        </div>
        <button
          className={`rest-select-toggle${modoSeleccion ? ' active' : ''}`}
          id="rest-select-btn"
          onClick={props.onToggleModoSeleccion}
          title="Seleccionar varias para archivar"
          style={{ display: archivoHabilitado ? '' : 'none' }}
        >
          {modoSeleccion ? (
            <>
              <ion-icon name="close-outline"></ion-icon> Cancelar
            </>
          ) : (
            <>
              <ion-icon name="checkbox-outline"></ion-icon> Seleccionar
            </>
          )}
        </button>
        <div className="rest-board-search">
          <ion-icon name="search-outline"></ion-icon>
          <input
            type="text"
            id="rest-search-input"
            placeholder="Buscar por nombre, teléfono o tipo de evento..."
            value={filtros.search}
            onChange={(e) => props.onBuscar(e.target.value)}
          />
        </div>
        <SaltarFecha
          reservas={reservas}
          fecha={filtros.date}
          onSaltarFecha={props.onSaltarFecha}
          onLimpiarFecha={props.onLimpiarFecha}
        />
      </div>

      {/* Barra de acción de selección masiva (solo roof-107, visible en modo selección) */}
      <div className={`rest-bulk-bar${modoSeleccion ? ' visible' : ''}`} id="rest-bulk-bar">
        <label className="rest-bulk-all">
          <input
            type="checkbox"
            id="rest-bulk-all"
            checked={todasSeleccionadas}
            onChange={(e) => props.onSeleccionarTodas(e.target.checked)}
          />
          <span>Seleccionar todas</span>
        </label>
        <span className="rest-bulk-count" id="rest-bulk-count">
          {n} seleccionada{n === 1 ? '' : 's'}
        </span>
        <div className="rest-bulk-spacer"></div>
        <button className="rest-bulk-cancel" onClick={props.onToggleModoSeleccion}>
          Cancelar
        </button>
        <button
          className="rest-bulk-action"
          id="rest-bulk-action-btn"
          onClick={props.onAccionLote}
          disabled={n === 0}
        >
          {esVistaArchivadas ? (
            <>
              <ion-icon name="arrow-undo-outline"></ion-icon> Desarchivar{n ? ` (${n})` : ''}
            </>
          ) : (
            <>
              <ion-icon name="archive-outline"></ion-icon> Archivar{n ? ` (${n})` : ''}
            </>
          )}
        </button>
      </div>

      {/* Shell: board (cards) + context rail */}
      <div className="rest-shell">
        {/* Main: card board */}
        <section className={`rest-board${modoSeleccion ? ' select-mode' : ''}`} id="rest-board">
          {grupos.length === 0 ? (
            <BoardVacio props={props} />
          ) : (
            grupos.map((group) => {
              const isPast = group.key === 'past';
              const day = group.sample.fechaParsed;
              const isToday =
                !!day &&
                (() => {
                  const d = new Date(day);
                  d.setHours(0, 0, 0, 0);
                  return d.getTime() === today.getTime();
                })();
              const totalPax = group.items.reduce((s, r) => s + (parseInt(String(r.pax)) || 0), 0);
              return (
                <div className={`rest-board-day ${isToday ? 'is-today' : ''}`} key={group.key}>
                  <div className="rest-board-day-header">
                    <span className="rest-board-day-label">{groupLabel(group.key, group.sample)}</span>
                    <span className="rest-board-day-meta">
                      <strong>{group.items.length}</strong> reserva{group.items.length === 1 ? '' : 's'} ·{' '}
                      <strong>{totalPax}</strong> pax
                    </span>
                  </div>
                  <div className="rest-board-grid">
                    {group.items.map((r, i) => (
                      <TarjetaReserva key={r.id || `${group.key}-${i}`} r={r} isPast={isPast} props={props} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* Detail drawer-overlay + backdrop */}
        {props.slotDrawer}

        {/* Context: capacity (today by default) + month heatmap */}
        {props.slotContexto}
      </div>
    </>
  );
}
