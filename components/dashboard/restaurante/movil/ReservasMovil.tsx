'use client';

// UX móvil dedicada de restaurante — port del markup #rest-mobile + bottom
// sheets de legacy/index.html y de las funciones restMobile* de
// legacy/src/dashboard.js (tabs, búsqueda, lista con swipe, aforo ring,
// banner, calendario mensual, editor de disponibilidad, selección masiva y
// menú overflow). Visible solo con body[data-mobile-mode="restaurant"] y
// viewport ≤ 480px (lo controla el CSS ya extraído en styles/style.css).
//
// CAMBIO ARQUITECTÓNICO vs legacy: consume los MISMOS hooks/datos que el
// escritorio (se los pasa <PanelRestaurante/>); ya no existe el monkey-patch
// de window.fetchRestaurantReservations.

import { useEffect, useMemo, useRef, useState } from 'react';
import { toggleTheme } from '@/lib/theme';
import { useToast } from '@/components/ui/Toast';
import {
  dateKey,
  formatReservationDate,
  formatTime,
  matchesRestaurantView,
  parseFechaEvento,
  todayKeyMx,
  type Disponibilidad,
  type Reserva,
  type VistaReserva,
} from '../hooks';

type TabMovil = 'pendientes' | 'confirmadas' | 'todas' | 'rechazadas' | 'archivadas';

export interface PropsMovil {
  clientId: string | null;
  clientName: string;
  reservas: Reserva[];
  refrescar: () => Promise<unknown>;
  archivoHabilitado: boolean;
  archivadas: Set<string>;
  disponibilidad: Disponibilidad;
  setDisponibilidad: React.Dispatch<React.SetStateAction<Disponibilidad>>;
  /** Upsert parcial (accepting/closed_dates/daily_capacity), como el legacy móvil. */
  guardarFila: (fila: Record<string, any>) => Promise<void>;
  onConfirmar: (r: Reserva) => void;
  onRechazar: (r: Reserva) => void;
  onArchivar: (r: Reserva) => void;
  onDesarchivar: (r: Reserva) => void;
  onNuevaReserva: () => void;
  /** Abre el modal compartido de confirmación masiva. */
  onLote: (ids: string[], esDesarchivar: boolean) => void;
  /** Bump tras completar una acción masiva → limpia la selección móvil. */
  resetSeleccionSignal: number;
}

// ── Tarjeta con swipe (swipe → derecha confirma, ← izquierda rechaza) ───────
function TarjetaMovil({
  r,
  seleccionando,
  seleccionada,
  onTap,
  onSwipeConfirmar,
  onSwipeRechazar,
}: {
  r: Reserva;
  seleccionando: boolean;
  seleccionada: boolean;
  onTap: () => void;
  onSwipeConfirmar: () => void;
  onSwipeRechazar: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const st = useRef({ startX: 0, startY: 0, currentX: 0, dragging: false, locked: null as null | 'x' | 'y' });
  const threshold = 80;

  const time = r.horaEvento ? formatTime(r.horaEvento) : '—';
  const [hh, mm] = (time || '').split(':');
  const stateCls = r.estado === 'Confirmado' ? 'confirmed' : r.estado === 'Rechazado' ? 'rejected' : '';
  const tipo = r.tipoEvento || 'Reserva';
  const pax = parseInt(String(r.pax)) || 0;

  const clearSwipeClasses = () => {
    wrapRef.current?.classList.remove('is-swiping-right', 'is-swiping-left');
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (seleccionando) return; // en modo selección el tap alterna selección, sin swipe
    st.current.startX = e.touches[0].clientX;
    st.current.startY = e.touches[0].clientY;
    st.current.currentX = 0;
    st.current.dragging = true;
    st.current.locked = null;
    cardRef.current?.classList.add('is-swiping');
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (seleccionando || !st.current.dragging) return;
    const dx = e.touches[0].clientX - st.current.startX;
    const dy = e.touches[0].clientY - st.current.startY;
    if (st.current.locked === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        st.current.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
    }
    if (st.current.locked !== 'x') return;
    st.current.currentX = dx;
    if (cardRef.current) cardRef.current.style.transform = `translateX(${dx}px)`;
    const wrap = wrapRef.current;
    if (wrap) {
      if (dx > 8) {
        wrap.classList.add('is-swiping-right');
        wrap.classList.remove('is-swiping-left');
      } else if (dx < -8) {
        wrap.classList.add('is-swiping-left');
        wrap.classList.remove('is-swiping-right');
      } else {
        clearSwipeClasses();
      }
    }
  };

  const onTouchEnd = () => {
    if (seleccionando || !st.current.dragging) return;
    st.current.dragging = false;
    const card = cardRef.current;
    card?.classList.remove('is-swiping');
    const dx = st.current.currentX;
    if (Math.abs(dx) >= threshold && st.current.locked === 'x') {
      if (dx > 0) {
        if (card) card.style.transform = 'translateX(110%)';
        setTimeout(() => {
          if (card) card.style.transform = '';
          clearSwipeClasses();
          onSwipeConfirmar();
        }, 220);
      } else {
        if (card) card.style.transform = 'translateX(-110%)';
        setTimeout(() => {
          if (card) card.style.transform = '';
          clearSwipeClasses();
          onSwipeRechazar();
        }, 220);
      }
    } else {
      if (card) card.style.transform = '';
      clearSwipeClasses();
    }
  };

  const onTouchCancel = () => {
    if (seleccionando) return;
    st.current.dragging = false;
    if (cardRef.current) {
      cardRef.current.classList.remove('is-swiping');
      cardRef.current.style.transform = '';
    }
    clearSwipeClasses();
  };

  return (
    <div className={`restm-card-wrap${seleccionando ? ' no-swipe' : ''}`} ref={wrapRef}>
      {!seleccionando && (
        <div className="restm-card-actions">
          <div className="restm-card-action confirm">
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>Confirmar</span>
          </div>
          <div className="restm-card-action reject">
            <span>Rechazar</span>
            <ion-icon name="close-outline"></ion-icon>
          </div>
        </div>
      )}
      <div
        className={`restm-card${seleccionada ? ' is-selected' : ''}`}
        data-id={String(r.id || '')}
        ref={cardRef}
        onClick={onTap}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        {seleccionando && (
          <div className="restm-card-check">
            <ion-icon name={seleccionada ? 'checkmark-circle' : 'ellipse-outline'}></ion-icon>
          </div>
        )}
        <div className="restm-card-time">
          <div className="restm-card-time-h">{hh && hh !== '—' ? hh : '—'}</div>
          <div className="restm-card-time-m">{mm || ''}</div>
        </div>
        <div className="restm-card-info">
          <div className="restm-card-name">{r.nombre || 'Sin nombre'}</div>
          <div className="restm-card-meta">
            <span>
              <strong>{pax}</strong> pax
            </span>
            <span className="restm-card-dot"></span>
            <span>{tipo}</span>
          </div>
        </div>
        <div className={`restm-card-state ${stateCls}`}></div>
      </div>
    </div>
  );
}

// ── Editor de disponibilidad (bottom sheet, guarda solo 3 campos) ───────────
function EditorAforo({
  disponibilidad,
  onGuardar,
  onCancelar,
}: {
  disponibilidad: Disponibilidad;
  onGuardar: (datos: { accepting: boolean; closedDates: string[]; dailyCapacity: number | null }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [accepting, setAccepting] = useState(disponibilidad.accepting !== false);
  const [cap, setCap] = useState(disponibilidad.dailyCapacity ? String(disponibilidad.dailyCapacity) : '');
  const [cerradas, setCerradas] = useState<string[]>(
    Array.isArray(disponibilidad.closedDates) ? [...disponibilidad.closedDates].sort() : []
  );
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const capVal = parseInt(cap);
    setGuardando(true);
    try {
      await onGuardar({
        accepting,
        closedDates: cerradas,
        dailyCapacity: isNaN(capVal) || capVal < 1 ? null : capVal,
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <h3 className="restm-sheet-title">Disponibilidad</h3>
      <div className="restm-avail-row">
        <div className="restm-avail-info">
          <div className="restm-avail-label">Aceptar reservas</div>
          <div className="restm-avail-sub">Si lo apagas, el agente IA dirá que no hay disponibilidad.</div>
        </div>
        <label className="restm-toggle">
          <input
            type="checkbox"
            id="restm-av-toggle"
            checked={accepting}
            onChange={(e) => setAccepting(e.target.checked)}
          />
          <span className="restm-toggle-track">
            <span className="restm-toggle-thumb"></span>
          </span>
        </label>
      </div>
      <div className="restm-avail-row">
        <div className="restm-avail-info">
          <div className="restm-avail-label">Aforo diario</div>
          <div className="restm-avail-sub">Pax máximos por día. Vacío = sin límite.</div>
        </div>
        <input
          type="number"
          min={1}
          placeholder="∞"
          value={cap}
          className="restm-input"
          id="restm-av-cap"
          onChange={(e) => setCap(e.target.value)}
        />
      </div>
      <div className="restm-section">
        <h4>Fechas cerradas</h4>
        <div className="restm-closed-list" id="restm-av-closed">
          {cerradas.length ? (
            cerradas.map((d) => (
              <span
                className="restm-closed-chip"
                data-date={d}
                key={d}
                onClick={() => setCerradas((prev) => prev.filter((x) => x !== d))}
              >
                {new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}{' '}
                <ion-icon name="close-outline"></ion-icon>
              </span>
            ))
          ) : (
            <span style={{ fontSize: 12, opacity: 0.5 }}>Sin fechas cerradas configuradas.</span>
          )}
        </div>
        <input
          type="date"
          id="restm-av-newdate"
          className="restm-add-date"
          style={{ textAlign: 'left' }}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setCerradas((prev) => (prev.includes(v) ? prev : [...prev, v]));
          }}
        />
      </div>
      <div className="restm-actions-row">
        <button className="restm-action-btn reject" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="restm-action-btn confirm" id="restm-av-save" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </>
  );
}

export default function ReservasMovil(props: PropsMovil) {
  const { reservas, archivadas, disponibilidad } = props;
  const showToast = useToast();

  const [tab, setTab] = useState<TabMovil>('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [filtroFecha, setFiltroFecha] = useState<string | null>(null);
  const [seleccionando, setSeleccionando] = useState(false);
  const [idsSeleccionados, setIdsSeleccionados] = useState<Set<string>>(new Set());
  const [refrescando, setRefrescando] = useState(false);
  const [temaIcono, setTemaIcono] = useState('moon-outline');

  // Bottom sheets: #restm-sheet (detalle o disponibilidad), mes y menú.
  const [sheet, setSheet] = useState<{ tipo: 'detalle'; id: string } | { tipo: 'disponibilidad' } | null>(null);
  const [mesAbierto, setMesAbierto] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [anclaMes, setAnclaMes] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [vistaNav, setVistaNav] = useState<'reservas' | 'calendario' | 'disponibilidad'>('reservas');
  const listWrapRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme') || 'dark';
    setTemaIcono(t === 'light' ? 'sunny-outline' : 'moon-outline');
  }, []);

  // Tras una acción masiva completada, limpiar la selección (finishBulkAction).
  useEffect(() => {
    setSeleccionando(false);
    setIdsSeleccionados(new Set());
  }, [props.resetSeleccionSignal]);

  const todayK = todayKeyMx();

  // ── Filtrado (port de getRestMobileFilteredReservations) ─────────────────
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const archivedView = tab === 'archivadas';
    // Las archivadas se ocultan en TODAS las vistas salvo el tab "Archivadas".
    const base = reservas.filter((r) => (archivedView ? archivadas.has(r.id) : !archivadas.has(r.id)));

    // Búsqueda: dentro del conjunto base, ignorando tab/fecha (como el legacy).
    if (q) {
      return base.filter(
        (r) =>
          (r.nombre || '').toLowerCase().includes(q) ||
          (r.telefono || '').toLowerCase().includes(q) ||
          (r.email || '').toLowerCase().includes(q) ||
          (r.tipoEvento || '').toLowerCase().includes(q)
      );
    }

    // Con filtro de fecha activo ignoramos los tabs (todos los estados del día).
    if (filtroFecha) {
      return base.filter((r) => {
        const d = r.fechaParsed || parseFechaEvento(r.fechaEvento);
        return d && dateKey(d) === filtroFecha;
      });
    }

    if (archivedView) return base;

    // Mismas reglas que el escritorio (tab "pendientes" = vista "nuevos").
    const vista: VistaReserva = tab === 'pendientes' ? 'nuevos' : tab;
    return base.filter((r) => matchesRestaurantView(r, vista, archivadas));
  }, [reservas, archivadas, tab, busqueda, filtroFecha]);

  // ── Conteos de tabs (idénticos a escritorio) ─────────────────────────────
  const conteos = useMemo(() => {
    const countFor = (t: TabMovil) =>
      reservas.filter((r) => matchesRestaurantView(r, t === 'pendientes' ? 'nuevos' : t, archivadas)).length;
    return {
      pendientes: countFor('pendientes'),
      confirmadas: countFor('confirmadas'),
      todas: countFor('todas'),
      rechazadas: countFor('rechazadas'),
      archivadas: countFor('archivadas'),
    };
  }, [reservas, archivadas]);

  // ── Aforo de hoy (port de renderRestMobileAforo) ─────────────────────────
  const aforo = useMemo(() => {
    const todays = reservas.filter((r) => {
      const d = r.fechaParsed || parseFechaEvento(r.fechaEvento);
      return d && dateKey(d) === todayK;
    });
    const active = todays.filter((r) => r.estado !== 'Rechazado');
    const confirmed = todays.filter((r) => r.estado === 'Confirmado').length;
    const pending = todays.filter((r) => r.estado === 'Nuevo Lead').length;
    const paxUsed = active.reduce((sum, r) => sum + (parseInt(String(r.pax)) || 0), 0);
    const dailyCap = disponibilidad.dailyCapacity ? parseInt(String(disponibilidad.dailyCapacity)) : null;
    let pct = 0;
    if (dailyCap && dailyCap > 0) pct = Math.min(100, Math.round((paxUsed / dailyCap) * 100));
    let meta = 'Sin reservas hoy';
    if (todays.length > 0) {
      const parts: string[] = [];
      if (confirmed) parts.push(`${confirmed} confirmadas`);
      if (pending) parts.push(`${pending} pendientes`);
      meta = parts.join(' · ') || 'Sin reservas hoy';
    }
    return { paxUsed, dailyCap, pct, meta, todaysCount: todays.length };
  }, [reservas, disponibilidad, todayK]);

  // ── Banner (port de renderRestMobileBanner) ──────────────────────────────
  const banner = useMemo((): { cls: string; icono: string; contenido: React.ReactNode } | null => {
    const closed = Array.isArray(disponibilidad.closedDates) ? disponibilidad.closedDates : [];
    const isClosedToday = closed.includes(todayK);
    const accepting = disponibilidad.accepting !== false;

    if (!accepting) {
      return {
        cls: 'danger',
        icono: 'alert-circle-outline',
        contenido: (
          <span>
            <strong>No estamos aceptando reservas.</strong> Reactiva en Disponibilidad.
          </span>
        ),
      };
    }
    if (isClosedToday) {
      return {
        cls: 'danger',
        icono: 'lock-closed-outline',
        contenido: (
          <span>
            <strong>Hoy está cerrado.</strong> No se reciben reservas para la fecha de hoy.
          </span>
        ),
      };
    }
    const dailyCap = disponibilidad.dailyCapacity ? parseInt(String(disponibilidad.dailyCapacity)) : null;
    if (dailyCap) {
      const todays = reservas.filter((r) => {
        const d = r.fechaParsed || parseFechaEvento(r.fechaEvento);
        return d && dateKey(d) === todayK && r.estado !== 'Rechazado';
      });
      const paxUsed = todays.reduce((sum, r) => sum + (parseInt(String(r.pax)) || 0), 0);
      if (paxUsed >= dailyCap) {
        return {
          cls: 'danger',
          icono: 'people-outline',
          contenido: (
            <span>
              <strong>Aforo lleno hoy.</strong> {paxUsed}/{dailyCap} pax confirmados o pendientes.
            </span>
          ),
        };
      }
      if (paxUsed / dailyCap >= 0.8) {
        return {
          cls: '',
          icono: 'warning-outline',
          contenido: (
            <span>
              Quedan pocos lugares hoy: {dailyCap - paxUsed} de {dailyCap}.
            </span>
          ),
        };
      }
    }
    return null;
  }, [reservas, disponibilidad, todayK]);

  // ── Lista agrupada por día (port de renderRestMobileList) ────────────────
  const grupos = useMemo(() => {
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const lista = [...filtradas];
    lista.sort((a, b) => {
      const aD = a.fechaParsed ? new Date(a.fechaParsed) : new Date(0);
      const bD = b.fechaParsed ? new Date(b.fechaParsed) : new Date(0);
      aD.setHours(0, 0, 0, 0);
      bD.setHours(0, 0, 0, 0);
      const aPast = aD < todayDate;
      const bPast = bD < todayDate;
      if (!aPast && bPast) return -1;
      if (aPast && !bPast) return 1;
      if (aD.getTime() === bD.getTime()) {
        return (a.horaEvento || '').localeCompare(b.horaEvento || '');
      }
      return aPast ? bD.getTime() - aD.getTime() : aD.getTime() - bD.getTime();
    });

    const mapa = new Map<string, Reserva[]>();
    lista.forEach((r) => {
      const d = r.fechaParsed || parseFechaEvento(r.fechaEvento);
      const k = d ? dateKey(d) : 'sin-fecha';
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k)!.push(r);
    });
    return mapa;
  }, [filtradas]);

  const etiquetaGrupo = (k: string) => {
    if (k === 'sin-fecha') return 'Sin fecha';
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const tomorrow = new Date(todayDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const d = new Date(k + 'T00:00:00');
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    if (day.getTime() === todayDate.getTime()) return 'Hoy';
    if (day.getTime() === tomorrow.getTime()) return 'Mañana';
    return `${dayNames[d.getDay()]} ${d.getDate()} ${monthShort[d.getMonth()]}`;
  };

  // ── Heatmap del mes (port de renderRestMobileMonthSheet) ─────────────────
  const mes = useMemo(() => {
    const { year, month } = anclaMes;
    const buckets: Record<string, number> = {};
    reservas.forEach((res) => {
      if (res.estado === 'Rechazado') return;
      const d = res.fechaParsed || parseFechaEvento(res.fechaEvento);
      if (!d || d.getFullYear() !== year || d.getMonth() !== month) return;
      const k = dateKey(d);
      buckets[k] = (buckets[k] || 0) + (parseInt(String(res.pax)) || 0);
    });
    const dailyCap = disponibilidad.dailyCapacity ? parseInt(String(disponibilidad.dailyCapacity)) : null;
    const maxVal = Math.max(1, ...Object.values(buckets));
    const ref = dailyCap || maxVal;
    const lvl = (v: number) => {
      if (!v) return 0;
      const r = v / ref;
      if (r >= 0.85) return 4;
      if (r >= 0.6) return 3;
      if (r >= 0.35) return 2;
      return 1;
    };
    const closed = disponibilidad.closedDates || [];
    const dows = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const firstOfMonth = new Date(year, month, 1);
    const startBlank = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const celdas: { key: string; cls: string; dia: number }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const k = dateKey(d);
      const v = buckets[k] || 0;
      const cls = ['restm-month-cell', `lvl${lvl(v)}`];
      if (k === todayK) cls.push('is-today');
      if (closed.includes(k)) cls.push('is-closed');
      celdas.push({ key: k, cls: cls.join(' '), dia: day });
    }
    const etiqueta = new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    return { dows, startBlank, celdas, etiqueta };
  }, [reservas, anclaMes, disponibilidad, todayK]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function cambiarTab(t: TabMovil) {
    setTab(t);
    setFiltroFecha(null);
    // Cambiar de tab limpia la selección para no mezclar contextos
    setIdsSeleccionados(new Set());
    // La búsqueda anula los tabs; al elegir un tab, la reseteamos.
    if (busqueda) setBusqueda('');
  }

  function refrescarLista() {
    setRefrescando(true);
    Promise.resolve(props.refrescar()).finally(() => {
      setTimeout(() => setRefrescando(false), 400);
    });
  }

  function alternarSeleccion(id: string) {
    setIdsSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function seleccionarTodas(checked: boolean) {
    const ids = filtradas.map((r) => r.id).filter(Boolean);
    setIdsSeleccionados((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function navegar(view: 'reservas' | 'calendario' | 'disponibilidad') {
    setVistaNav(view);
    if (view === 'calendario') abrirMes();
    else if (view === 'disponibilidad') abrirAforo();
    // Volver a "reservas" tras abrir el sheet
    if (view !== 'reservas') {
      setTimeout(() => setVistaNav('reservas'), 350);
    }
  }

  function abrirMes() {
    setMesAbierto(true);
  }

  function abrirAforo() {
    setSheet({ tipo: 'disponibilidad' });
  }

  function saltarAFecha(key: string) {
    setMesAbierto(false);
    setTimeout(() => {
      setFiltroFecha(key);
      listWrapRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 220);
  }

  async function guardarAforo(datos: { accepting: boolean; closedDates: string[]; dailyCapacity: number | null }) {
    props.setDisponibilidad((prev) => ({ ...prev, ...datos }));
    try {
      // El móvil guarda SOLO estos campos (paridad con restMobileSaveAvailability).
      await props.guardarFila({
        singleton: true,
        accepting_reservations: datos.accepting,
        closed_dates: datos.closedDates,
        daily_capacity: datos.dailyCapacity,
      });
      showToast('Disponibilidad actualizada', 'success');
      setSheet(null);
    } catch (e) {
      console.error('Error saving availability:', e);
      showToast('No se pudo guardar', 'error');
    }
  }

  function alternarTema() {
    const next = toggleTheme();
    setTemaIcono(next === 'light' ? 'sunny-outline' : 'moon-outline');
  }

  // ── Estado vacío (port del emptyByTab) ────────────────────────────────────
  const vacio = useMemo(() => {
    const q = busqueda.trim();
    if (q) return { icon: 'search-outline', title: 'Sin resultados', sub: `No encontramos reservas para «${q}».` };
    if (filtroFecha) {
      const fDate = new Date(filtroFecha + 'T00:00:00');
      const fLabel = fDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      return { icon: 'calendar-clear-outline', title: 'Sin reservas este día', sub: `No hay reservas para ${fLabel}.` };
    }
    const porTab: Record<TabMovil, { icon: string; title: string; sub: string }> = {
      pendientes: { icon: 'checkmark-done-outline', title: 'Todo al día ✨', sub: 'No hay reservas pendientes por responder.' },
      confirmadas: { icon: 'calendar-clear-outline', title: 'Sin confirmadas', sub: 'Todavía no hay reservas confirmadas a futuro.' },
      todas: { icon: 'restaurant-outline', title: 'Sin reservas', sub: 'Aún no hay reservas registradas.' },
      rechazadas: { icon: 'close-circle-outline', title: 'Sin rechazadas', sub: 'No hay reservas rechazadas.' },
      archivadas: { icon: 'archive-outline', title: 'Sin archivadas', sub: 'No hay reservas archivadas.' },
    };
    return porTab[tab] || porTab.pendientes;
  }, [busqueda, filtroFecha, tab]);

  const n = idsSeleccionados.size;
  const esVistaArchivadas = tab === 'archivadas';
  const idsFiltradas = filtradas.map((r) => r.id).filter(Boolean);
  const todasMarcadas = idsFiltradas.length > 0 && idsFiltradas.every((id) => idsSeleccionados.has(id));

  const detalle = sheet?.tipo === 'detalle' ? reservas.find((r) => r.id === sheet.id) || null : null;

  const tabsDef: { key: TabMovil; label: string }[] = [
    { key: 'pendientes', label: 'Pendientes' },
    { key: 'confirmadas', label: 'Confirmadas' },
    { key: 'todas', label: 'Todas' },
    { key: 'rechazadas', label: 'Rechazadas' },
  ];

  // Chip de filtro activo (cuando se saltó a una fecha desde el calendario)
  const chipFiltro = filtroFecha ? (
    <button className="restm-filter-chip" onClick={() => setFiltroFecha(null)}>
      <ion-icon name="calendar-outline"></ion-icon>
      <span>
        {new Date(filtroFecha + 'T00:00:00').toLocaleDateString('es-MX', {
          weekday: 'short',
          day: 'numeric',
          month: 'long',
        })}
      </span>
      <ion-icon name="close-outline" class="restm-filter-chip-x"></ion-icon>
    </button>
  ) : null;

  return (
    <>
      <div className="rest-mobile" id="rest-mobile">
        {/* Background ambient */}
        <div className="restm-bg">
          <div className="restm-orb restm-orb-1"></div>
          <div className="restm-orb restm-orb-2"></div>
        </div>

        {/* Sticky top: header + aforo + tabs */}
        <header className="restm-top">
          <div className="restm-header">
            <div className="restm-greet">
              <p className="restm-eyebrow" id="restm-date">
                {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h1 className="restm-title">Reservas</h1>
              <span className="restm-client" id="restm-client">
                {props.clientName || '107 Rooftop'}
              </span>
            </div>
            <div className="restm-actions">
              <button className="restm-iconbtn" onClick={alternarTema} aria-label="Tema">
                <ion-icon name={temaIcono} id="restm-theme-icon"></ion-icon>
              </button>
              <button className="restm-iconbtn" onClick={refrescarLista} aria-label="Actualizar">
                <ion-icon name="sync-outline" id="restm-sync-icon" class={refrescando ? 'spinning' : undefined}></ion-icon>
              </button>
              <button className="restm-iconbtn" onClick={() => setMenuAbierto(true)} aria-label="Más opciones">
                <ion-icon name="ellipsis-vertical-outline"></ion-icon>
              </button>
            </div>
          </div>

          {/* Aforo card (tap para abrir disponibilidad) */}
          <button className="restm-aforo" id="restm-aforo-card" onClick={abrirAforo}>
            <div className="restm-aforo-left">
              <span className="restm-aforo-eyebrow">Aforo de hoy</span>
              <div className="restm-aforo-numbers">
                <span className="restm-aforo-used" id="restm-aforo-used">{aforo.paxUsed}</span>
                <span className="restm-aforo-sep">/</span>
                <span className="restm-aforo-total" id="restm-aforo-total">{aforo.dailyCap || '∞'}</span>
                <span className="restm-aforo-unit">pax</span>
              </div>
              <div className="restm-aforo-meta" id="restm-aforo-meta">{aforo.meta}</div>
            </div>
            <div className="restm-aforo-right">
              <div
                className="restm-aforo-ring"
                id="restm-aforo-ring"
                style={{
                  ['--pct' as any]: aforo.pct + '%',
                  background: `conic-gradient(${
                    aforo.pct >= 90 ? '#F87171' : aforo.pct >= 70 ? '#FBBF24' : '#A78BFA'
                  } ${aforo.pct}%, rgba(255,255,255,0.08) 0)`,
                }}
              >
                <span id="restm-aforo-pct">{aforo.pct}%</span>
              </div>
            </div>
          </button>

          {/* Banner de disponibilidad (cerrado / lleno / aviso) */}
          <div className={banner ? `restm-banner ${banner.cls}` : 'restm-banner hidden'} id="restm-banner">
            {banner && (
              <>
                <ion-icon name={banner.icono}></ion-icon>
                {banner.contenido}
              </>
            )}
          </div>

          {/* Tabs de filtro */}
          <div className="restm-tabs" role="tablist">
            {tabsDef.map((t) => (
              <button
                key={t.key}
                className={`restm-tab${tab === t.key ? ' active' : ''}`}
                data-tab={t.key}
                onClick={() => cambiarTab(t.key)}
              >
                <span>{t.label}</span>
                <span className="restm-tab-count" id={`restm-count-${t.key}`}>{conteos[t.key]}</span>
              </button>
            ))}
            <button
              className={`restm-tab${tab === 'archivadas' ? ' active' : ''}`}
              id="restm-tab-archivadas"
              data-tab="archivadas"
              onClick={() => cambiarTab('archivadas')}
              style={{ display: props.archivoHabilitado ? '' : 'none' }}
            >
              <span>Archivadas</span>
              <span className="restm-tab-count" id="restm-count-archivadas">{conteos.archivadas}</span>
            </button>
          </div>

          {/* Fila de selección masiva (solo roof-107) */}
          <div className="restm-select-row" id="restm-select-row" style={{ display: props.archivoHabilitado ? '' : 'none' }}>
            <button
              className={`restm-select-toggle${seleccionando ? ' active' : ''}`}
              id="restm-select-btn"
              onClick={() => {
                setSeleccionando((v) => {
                  if (v) setIdsSeleccionados(new Set());
                  return !v;
                });
              }}
            >
              {seleccionando ? (
                <>
                  <ion-icon name="close-outline"></ion-icon> Cancelar
                </>
              ) : (
                <>
                  <ion-icon name="checkbox-outline"></ion-icon> Seleccionar
                </>
              )}
            </button>
          </div>

          {/* Buscador (busca en todas las reservas por nombre, teléfono o tipo) */}
          <div className="restm-search">
            <ion-icon name="search-outline" class="restm-search-icon"></ion-icon>
            <input
              type="text"
              id="restm-search-input"
              className="restm-search-input"
              placeholder="Buscar por nombre, teléfono o tipo…"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <button
              type="button"
              className={`restm-search-clear${busqueda ? ' show' : ''}`}
              id="restm-search-clear"
              aria-label="Limpiar búsqueda"
              onClick={(e) => {
                setBusqueda('');
                (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.focus?.();
              }}
            >
              <ion-icon name="close-circle"></ion-icon>
            </button>
          </div>
        </header>

        {/* Lista de reservas (scrollable) */}
        <main className="restm-list-wrap" ref={listWrapRef}>
          <div className="restm-list" id="restm-list">
            {chipFiltro}
            {filtradas.length === 0 ? (
              <div className="restm-empty">
                <ion-icon name={vacio.icon}></ion-icon>
                <div className="restm-empty-title">{vacio.title}</div>
                <div className="restm-empty-sub">{vacio.sub}</div>
              </div>
            ) : (
              Array.from(grupos.entries()).map(([k, items]) => (
                <span key={k} style={{ display: 'contents' }}>
                  <div className={`restm-day-label ${k === todayK ? 'is-today' : ''}`}>{etiquetaGrupo(k)}</div>
                  {items.map((r, i) => (
                    <TarjetaMovil
                      key={r.id || `${k}-${i}`}
                      r={r}
                      seleccionando={seleccionando}
                      seleccionada={seleccionando && idsSeleccionados.has(r.id)}
                      onTap={() => (seleccionando ? alternarSeleccion(r.id) : setSheet({ tipo: 'detalle', id: r.id }))}
                      onSwipeConfirmar={() => props.onConfirmar(r)}
                      onSwipeRechazar={() => props.onRechazar(r)}
                    />
                  ))}
                </span>
              ))
            )}
          </div>
        </main>

        {/* FAB: nueva reserva */}
        <button className="restm-fab" id="restm-fab" onClick={props.onNuevaReserva} aria-label="Nueva reserva">
          <ion-icon name="add-outline"></ion-icon>
        </button>

        {/* Barra de acción de selección masiva móvil (solo roof-107) */}
        <div className={`restm-bulk-bar${seleccionando ? ' visible' : ''}`} id="restm-bulk-bar">
          <button
            className="restm-bulk-cancel"
            onClick={() => {
              setSeleccionando(false);
              setIdsSeleccionados(new Set());
            }}
            aria-label="Cancelar selección"
          >
            <ion-icon name="close-outline"></ion-icon>
          </button>
          <label className="restm-bulk-all">
            <input
              type="checkbox"
              id="restm-bulk-all"
              checked={todasMarcadas}
              onChange={(e) => seleccionarTodas(e.target.checked)}
            />
            <span>Todas</span>
          </label>
          <span className="restm-bulk-count" id="restm-bulk-count">{n}</span>
          <button
            className="restm-bulk-action"
            id="restm-bulk-action-btn"
            onClick={() => {
              const ids = Array.from(idsSeleccionados);
              if (!ids.length) return;
              props.onLote(ids, esVistaArchivadas);
            }}
            disabled={n === 0}
          >
            {esVistaArchivadas ? (
              <>
                <ion-icon name="arrow-undo-outline"></ion-icon> Desarchivar
              </>
            ) : (
              <>
                <ion-icon name="archive-outline"></ion-icon> Archivar
              </>
            )}
          </button>
        </div>

        {/* Bottom tab bar */}
        <nav className="restm-bottombar">
          <button
            className={`restm-bb-item${vistaNav === 'reservas' ? ' active' : ''}`}
            data-view="reservas"
            onClick={() => navegar('reservas')}
          >
            <ion-icon name="restaurant-outline"></ion-icon>
            <span>Reservas</span>
          </button>
          <button
            className={`restm-bb-item${vistaNav === 'calendario' ? ' active' : ''}`}
            data-view="calendario"
            onClick={() => navegar('calendario')}
          >
            <ion-icon name="calendar-outline"></ion-icon>
            <span>Calendario</span>
          </button>
          <button
            className={`restm-bb-item${vistaNav === 'disponibilidad' ? ' active' : ''}`}
            data-view="disponibilidad"
            onClick={() => navegar('disponibilidad')}
          >
            <ion-icon name="time-outline"></ion-icon>
            <span>Disponibilidad</span>
          </button>
        </nav>
      </div>
      {/* /#rest-mobile */}

      {/* Bottom sheet: detalle de reserva / editor de disponibilidad */}
      <div
        className="restm-sheet"
        id="restm-sheet"
        data-active={sheet ? 'true' : 'false'}
        aria-hidden={sheet ? 'false' : 'true'}
        {...(sheet?.tipo === 'disponibilidad' ? { 'data-kind': 'availability' } : {})}
      >
        <div className="restm-sheet-backdrop" onClick={() => setSheet(null)}></div>
        <div className="restm-sheet-panel" id="restm-sheet-panel">
          <div className="restm-sheet-handle"></div>
          <div className="restm-sheet-content" id="restm-sheet-content">
            {sheet?.tipo === 'disponibilidad' && (
              <EditorAforo
                key={`aforo-${disponibilidad.accepting}-${disponibilidad.dailyCapacity}-${disponibilidad.closedDates.join(',')}`}
                disponibilidad={disponibilidad}
                onGuardar={guardarAforo}
                onCancelar={() => setSheet(null)}
              />
            )}
            {detalle &&
              (() => {
                const r = detalle;
                const fechaTxt = formatReservationDate(r);
                const time = r.horaEvento ? formatTime(r.horaEvento) : null;
                const stateCls = r.estado === 'Confirmado' ? 'success' : r.estado === 'Rechazado' ? 'danger' : 'warn';
                const stateIcon =
                  r.estado === 'Confirmado'
                    ? 'checkmark-circle-outline'
                    : r.estado === 'Rechazado'
                      ? 'close-circle-outline'
                      : 'time-outline';
                const isResolved = r.estado === 'Confirmado' || r.estado === 'Rechazado';
                const tel = (r.telefono || '').replace(/[^\d+]/g, '');
                const waLink = tel ? `https://wa.me/${tel.replace(/^\+/, '')}` : null;
                const callLink = tel ? `tel:${tel}` : null;
                const estaArchivada = archivadas.has(r.id);
                return (
                  <>
                    <div className="restm-detail-head">
                      <div className="restm-detail-name">{r.nombre || 'Sin nombre'}</div>
                      <div className="restm-detail-meta">
                        <span className={`restm-pill ${stateCls}`}>
                          <ion-icon name={stateIcon}></ion-icon>
                          {r.estado || 'Nuevo Lead'}
                        </span>
                        <span className="restm-pill">
                          <ion-icon name="calendar-outline"></ion-icon>
                          {fechaTxt}
                        </span>
                        {time && (
                          <span className="restm-pill">
                            <ion-icon name="time-outline"></ion-icon>
                            {time}
                          </span>
                        )}
                        <span className="restm-pill">
                          <ion-icon name="people-outline"></ion-icon>
                          {parseInt(String(r.pax)) || 0} pax
                        </span>
                        {r.tipoEvento && (
                          <span className="restm-pill">
                            <ion-icon name="pricetag-outline"></ion-icon>
                            {r.tipoEvento}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="restm-channels">
                      <a className={`restm-channel call ${callLink ? '' : 'disabled'}`} {...(callLink ? { href: callLink } : {})}>
                        <ion-icon name="call-outline"></ion-icon>
                        <span>Llamar</span>
                      </a>
                      <a
                        className={`restm-channel whatsapp ${waLink ? '' : 'disabled'}`}
                        {...(waLink ? { href: waLink, target: '_blank', rel: 'noopener' } : {})}
                      >
                        <ion-icon name="logo-whatsapp"></ion-icon>
                        <span>WhatsApp</span>
                      </a>
                    </div>

                    {r.detalles && (
                      <div className="restm-section">
                        <h4>Detalles</h4>
                        <div className="restm-detail-text">{r.detalles}</div>
                      </div>
                    )}

                    {r.conversacion && (
                      <div className="restm-section">
                        <h4>Conversación</h4>
                        <div className="restm-detail-text">{r.conversacion}</div>
                      </div>
                    )}

                    <div className="restm-actions-row">
                      <button
                        className="restm-action-btn reject"
                        disabled={isResolved}
                        onClick={() => {
                          setSheet(null);
                          props.onRechazar(r);
                        }}
                      >
                        <ion-icon name="close-outline"></ion-icon> Rechazar
                      </button>
                      <button
                        className="restm-action-btn confirm"
                        disabled={isResolved}
                        onClick={() => {
                          setSheet(null);
                          props.onConfirmar(r);
                        }}
                      >
                        <ion-icon name="checkmark-outline"></ion-icon> Confirmar
                      </button>
                    </div>
                    {props.archivoHabilitado && (
                      <button
                        className="restm-action-btn archive"
                        style={{ marginTop: 8, width: '100%' }}
                        onClick={() => {
                          setSheet(null);
                          if (estaArchivada) props.onDesarchivar(r);
                          else props.onArchivar(r);
                        }}
                      >
                        <ion-icon name="archive-outline"></ion-icon> {estaArchivada ? 'Desarchivar' : 'Archivar'}
                      </button>
                    )}
                  </>
                );
              })()}
          </div>
        </div>
      </div>

      {/* Bottom sheet: calendario mensual completo */}
      <div
        className="restm-sheet"
        id="restm-month-sheet"
        data-active={mesAbierto ? 'true' : 'false'}
        aria-hidden={mesAbierto ? 'false' : 'true'}
      >
        <div className="restm-sheet-backdrop" onClick={() => setMesAbierto(false)}></div>
        <div className="restm-sheet-panel">
          <div className="restm-sheet-handle"></div>
          <div className="restm-sheet-content" id="restm-month-sheet-content">
            <div className="restm-month-head">
              <button
                className="restm-month-nav"
                onClick={() =>
                  setAnclaMes((prev) => {
                    const d = new Date(prev.year, prev.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
              >
                <ion-icon name="chevron-back-outline"></ion-icon>
              </button>
              <div className="restm-month-title">{mes.etiqueta}</div>
              <button
                className="restm-month-nav"
                onClick={() =>
                  setAnclaMes((prev) => {
                    const d = new Date(prev.year, prev.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
              >
                <ion-icon name="chevron-forward-outline"></ion-icon>
              </button>
            </div>
            <div className="restm-month-grid">
              {mes.dows.map((d, i) => (
                <div className="restm-month-dow" key={`dow-${i}`}>{d}</div>
              ))}
              {Array.from({ length: mes.startBlank }).map((_, i) => (
                <div className="restm-month-cell empty" key={`blank-${i}`}></div>
              ))}
              {mes.celdas.map((c) => (
                <button className={c.cls} key={c.key} onClick={() => saltarAFecha(c.key)}>
                  {c.dia}
                </button>
              ))}
            </div>
            <div className="restm-month-legend">
              <span className="restm-month-legend-dot" style={{ background: 'rgba(167,139,250,0.18)' }}></span>
              <span>Pocas</span>
              <span className="restm-month-legend-dot" style={{ background: 'rgba(167,139,250,0.55)', marginLeft: 6 }}></span>
              <span>Llenándose</span>
              <span className="restm-month-legend-dot" style={{ background: 'rgba(167,139,250,0.85)', marginLeft: 6 }}></span>
              <span>Casi lleno</span>
              <span className="restm-month-legend-dot" style={{ background: 'rgba(239,68,68,0.4)', marginLeft: 6 }}></span>
              <span>Cerrado</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom sheet: menú overflow */}
      <div
        className="restm-sheet"
        id="restm-menu-sheet"
        data-active={menuAbierto ? 'true' : 'false'}
        aria-hidden={menuAbierto ? 'false' : 'true'}
      >
        <div className="restm-sheet-backdrop" onClick={() => setMenuAbierto(false)}></div>
        <div className="restm-sheet-panel">
          <div className="restm-sheet-handle"></div>
          <div className="restm-sheet-content">
            <h3 className="restm-sheet-title">Más opciones</h3>
            <button
              className="restm-menu-item"
              onClick={() => {
                setMenuAbierto(false);
                abrirAforo();
              }}
            >
              <ion-icon name="people-outline"></ion-icon>
              <span>Configurar disponibilidad</span>
            </button>
            <button
              className="restm-menu-item"
              onClick={() => {
                setMenuAbierto(false);
                abrirMes();
              }}
            >
              <ion-icon name="calendar-outline"></ion-icon>
              <span>Calendario mensual</span>
            </button>
            <button
              className="restm-menu-item"
              onClick={() => {
                setMenuAbierto(false);
                refrescarLista();
              }}
            >
              <ion-icon name="sync-outline"></ion-icon>
              <span>Actualizar reservas</span>
            </button>
            <button
              className="restm-menu-item"
              id="restm-menu-desktop"
              onClick={() => {
                setMenuAbierto(false);
                window.open(window.location.href.split('?')[0] + '?client=' + props.clientId, '_blank');
              }}
            >
              <ion-icon name="desktop-outline"></ion-icon>
              <span>Abrir versión completa</span>
            </button>
            <button
              className="restm-menu-item"
              onClick={() => {
                setMenuAbierto(false);
                window.location.href = '/hub';
              }}
            >
              <ion-icon name="apps-outline"></ion-icon>
              <span>Cambiar de cliente</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
