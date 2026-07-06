'use client';

// Panel de disponibilidad (escritorio) — port del markup #avail-panel de
// legacy/index.html y de loadRestaurantAvailability/saveRestaurantAvailability/
// toggleAcceptingReservations/scheduleSoldOut/scheduleClosedEvent/addClosedDate
// de legacy/src/dashboard.js. Escribe en la tabla restaurant_availability del
// Supabase del cliente.

import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CLOSED_EVENT_MSG,
  DEFAULT_SOLD_OUT_MSG,
  formatBusinessDateLabel,
  nowBusinessTime,
  todayBusinessDate,
  type Disponibilidad,
} from '../hooks';

export interface PropsDisponibilidad {
  abierto: boolean;
  disponibilidad: Disponibilidad;
  setDisponibilidad: React.Dispatch<React.SetStateAction<Disponibilidad>>;
  /** Upsert de la fila completa en restaurant_availability. */
  guardarFila: (fila: Record<string, any>) => Promise<void>;
  /** Sección "Estado programado" (Sold Out / Cerrado) — solo roof-107. */
  archivoHabilitado: boolean;
  mostrarToast: (msg: string, tipo?: 'success' | 'error' | 'warning') => void;
}

// Estado textual de un estado programado (port de renderScheduledState).
function estadoProgramado(date: string | null, time: string | null): { texto: string; cls: string } {
  let texto = 'Inactivo';
  let cls = 'avail-status-off';
  if (date) {
    const today = todayBusinessDate();
    const fmtDate = formatBusinessDateLabel(date);
    const hora = time ? ` · ${time}` : '';
    if (date < today) {
      texto = 'Inactivo'; // venció (quedó en el pasado)
      cls = 'avail-status-off';
    } else if (date > today) {
      texto = `Programado · ${fmtDate}${hora}`;
      cls = 'avail-status-scheduled';
    } else {
      // hoy
      const now = nowBusinessTime();
      if (time && now < time) {
        texto = `Programado hoy · ${time}`;
        cls = 'avail-status-scheduled';
      } else {
        texto = 'Activo ahora · hasta medianoche';
        cls = 'avail-status-on';
      }
    }
  }
  return { texto, cls };
}

export default function PanelDisponibilidad(props: PropsDisponibilidad) {
  const { disponibilidad: av, setDisponibilidad } = props;

  // Inputs locales (capacidad, alta de fecha cerrada, programación y mensajes);
  // se sincronizan cuando llega la fila real de la DB.
  const [capacidad, setCapacidad] = useState<string>('');
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [soldOutFecha, setSoldOutFecha] = useState('');
  const [soldOutHora, setSoldOutHora] = useState('');
  const [soldOutMsg, setSoldOutMsg] = useState('');
  const [cerradoFecha, setCerradoFecha] = useState('');
  const [cerradoHora, setCerradoHora] = useState('');
  const [cerradoMsg, setCerradoMsg] = useState('');
  const [mostrarGuardado, setMostrarGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (av.dailyCapacity) setCapacidad(String(av.dailyCapacity));
    setSoldOutFecha(av.soldOutDate || '');
    setSoldOutHora(av.soldOutTime || '');
    setSoldOutMsg(av.soldOutMessage || DEFAULT_SOLD_OUT_MSG);
    setCerradoFecha(av.closedEventDate || '');
    setCerradoHora(av.closedEventTime || '');
    setCerradoMsg(av.closedEventMessage || DEFAULT_CLOSED_EVENT_MSG);
  }, [av]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Upsert de la fila completa (port de saveRestaurantAvailability). Recibe el
  // snapshot a persistir porque los setState de React no son síncronos.
  async function guardar(siguiente: Disponibilidad) {
    setGuardando(true);
    try {
      await props.guardarFila({
        singleton: true,
        accepting_reservations: siguiente.accepting,
        closed_dates: siguiente.closedDates,
        daily_capacity: siguiente.dailyCapacity,
        sold_out_date: siguiente.soldOutDate,
        sold_out_time: siguiente.soldOutTime || null,
        closed_event_date: siguiente.closedEventDate,
        closed_event_time: siguiente.closedEventTime || null,
        sold_out_message: siguiente.soldOutMessage,
        closed_event_message: siguiente.closedEventMessage,
        updated_at: new Date().toISOString(),
      });
      setMostrarGuardado(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMostrarGuardado(false), 3000);
      props.mostrarToast('Disponibilidad guardada correctamente', 'success');
    } catch (e: any) {
      console.error('Error saving availability:', e);
      props.mostrarToast('Error al guardar: ' + e.message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  // Lee los valores de la UI y arma el snapshot (igual que el legacy antes de guardar).
  function snapshotDesdeUI(base: Disponibilidad): Disponibilidad {
    const capVal = parseInt(capacidad);
    return {
      ...base,
      dailyCapacity: isNaN(capVal) || capVal < 1 ? null : capVal,
      soldOutMessage: soldOutMsg.trim() || DEFAULT_SOLD_OUT_MSG,
      closedEventMessage: cerradoMsg.trim() || DEFAULT_CLOSED_EVENT_MSG,
    };
  }

  function guardarConfiguracion() {
    const siguiente = snapshotDesdeUI(av);
    setDisponibilidad(siguiente);
    guardar(siguiente);
  }

  function toggleAceptando() {
    setDisponibilidad((prev) => ({ ...prev, accepting: !prev.accepting }));
  }

  function agregarFechaCerrada() {
    if (!nuevaFecha) return;
    setDisponibilidad((prev) => {
      if (prev.closedDates.includes(nuevaFecha)) return prev;
      return { ...prev, closedDates: [...prev.closedDates, nuevaFecha].sort() };
    });
    setNuevaFecha('');
  }

  function quitarFechaCerrada(dateStr: string) {
    setDisponibilidad((prev) => ({ ...prev, closedDates: prev.closedDates.filter((d) => d !== dateStr) }));
  }

  // Sold Out: no toma reservas pero el agente ofrece walk-in. Mutuamente
  // excluyente con "Cerrado por eventualidad".
  function programarSoldOut() {
    if (!soldOutFecha) {
      props.mostrarToast('Elige una fecha para el Sold Out', 'error');
      return;
    }
    const siguiente: Disponibilidad = {
      ...snapshotDesdeUI(av),
      soldOutDate: soldOutFecha,
      soldOutTime: soldOutHora || null,
      closedEventDate: null,
      closedEventTime: null, // excluyentes
    };
    setDisponibilidad(siguiente);
    guardar(siguiente);
  }

  function quitarSoldOut() {
    const siguiente: Disponibilidad = { ...snapshotDesdeUI(av), soldOutDate: null, soldOutTime: null };
    setDisponibilidad(siguiente);
    guardar(siguiente);
  }

  // Cerrado por eventualidad: cierre total (ni reservas ni walk-ins).
  function programarCerrado() {
    if (!cerradoFecha) {
      props.mostrarToast('Elige una fecha para el cierre', 'error');
      return;
    }
    const siguiente: Disponibilidad = {
      ...snapshotDesdeUI(av),
      closedEventDate: cerradoFecha,
      closedEventTime: cerradoHora || null,
      soldOutDate: null,
      soldOutTime: null, // excluyentes
    };
    setDisponibilidad(siguiente);
    guardar(siguiente);
  }

  function quitarCerrado() {
    const siguiente: Disponibilidad = { ...snapshotDesdeUI(av), closedEventDate: null, closedEventTime: null };
    setDisponibilidad(siguiente);
    guardar(siguiente);
  }

  const estadoSoldOut = estadoProgramado(av.soldOutDate, av.soldOutTime);
  const estadoCerrado = estadoProgramado(av.closedEventDate, av.closedEventTime);

  return (
    <div id="avail-panel" className={`avail-panel${props.abierto ? ' open' : ''}`}>
      <div className="avail-panel-row">
        <div>
          <div className="avail-panel-label">Aceptando reservas</div>
          <div className="avail-panel-sub">
            Cuando está apagado, el agente no ofrecerá ni confirmará reservas.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            id="avail-status-text"
            className={`avail-toggle-label ${av.accepting ? 'avail-status-on' : 'avail-status-off'}`}
          >
            {av.accepting ? 'Activo' : 'Inactivo'}
          </span>
          <button
            id="avail-accept-toggle"
            className={`avail-toggle${av.accepting ? ' on' : ''}`}
            onClick={toggleAceptando}
          ></button>
        </div>
      </div>
      <div className="avail-sep"></div>
      <div className="avail-panel-row">
        <div>
          <div className="avail-panel-label">Capacidad máxima por día</div>
          <div className="avail-panel-sub">
            El agente dejará de ofrecer reservas cuando se alcance este límite. Déjalo vacío para sin límite.
          </div>
        </div>
        <input
          type="number"
          id="avail-capacity"
          className="avail-capacity-input"
          min={1}
          max={999}
          value={capacidad}
          placeholder="80"
          onChange={(e) => setCapacidad(e.target.value)}
          title="Reservas máximas por día"
        />
      </div>
      <div className="avail-sep"></div>
      <div>
        <div className="avail-panel-label" style={{ marginBottom: 10 }}>
          Fechas inhabilitadas
        </div>
        <div className="avail-date-add-row">
          <input
            type="date"
            id="avail-new-date"
            className="avail-date-input"
            value={nuevaFecha}
            onChange={(e) => setNuevaFecha(e.target.value)}
          />
          <button className="avail-add-btn" onClick={agregarFechaCerrada}>
            <ion-icon name="add-outline"></ion-icon> Agregar fecha
          </button>
        </div>
        <div id="avail-dates-list" className="avail-dates-list" style={{ marginTop: 10 }}>
          {av.closedDates.length === 0 ? (
            <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)' }}>Sin fechas inhabilitadas</span>
          ) : (
            av.closedDates.map((d) => (
              <span className="avail-date-chip" key={d}>
                {new Date(d + 'T00:00:00').toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
                <button onClick={() => quitarFechaCerrada(d)} title="Quitar">
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Estado programado (Sold Out / Cerrado por eventualidad) — solo roof-107 */}
      <div id="avail-today-section" style={{ display: props.archivoHabilitado ? '' : 'none' }}>
        <div className="avail-sep"></div>
        <div className="avail-panel-label" style={{ marginBottom: 4 }}>
          Estado programado
        </div>
        <div className="avail-panel-sub" style={{ marginBottom: 14 }}>
          Elige la fecha (hoy o a futuro) y, si quieres, la hora de inicio. Aplica desde esa hora hasta la
          medianoche de ese día y se restablece solo. El agente responderá con el mensaje correspondiente.
        </div>

        <div className="avail-today-card" id="avail-soldout-card">
          <div className="avail-panel-row" style={{ margin: 0 }}>
            <div>
              <div className="avail-panel-label">Sold Out (agotado)</div>
              <div className="avail-panel-sub">No se toman reservas, pero el agente sí ofrece walk-in.</div>
            </div>
            <span id="avail-soldout-status" className={`avail-toggle-label ${estadoSoldOut.cls}`}>
              {estadoSoldOut.texto}
            </span>
          </div>
          <div className="avail-sched-row">
            <input
              type="date"
              id="avail-soldout-date"
              className="avail-date-input"
              title="Fecha del Sold Out"
              value={soldOutFecha}
              onChange={(e) => setSoldOutFecha(e.target.value)}
            />
            <input
              type="time"
              id="avail-soldout-time"
              className="avail-date-input"
              title="Hora de inicio (opcional)"
              value={soldOutHora}
              onChange={(e) => setSoldOutHora(e.target.value)}
            />
            <button className="avail-add-btn" onClick={programarSoldOut}>
              <ion-icon name="checkmark-outline"></ion-icon> Programar
            </button>
            <button className="avail-clear-btn" onClick={quitarSoldOut}>
              Quitar
            </button>
          </div>
          <textarea
            id="avail-soldout-msg"
            className="avail-msg-input"
            rows={3}
            placeholder="Mensaje del agente cuando esté Sold Out…"
            value={soldOutMsg}
            onChange={(e) => setSoldOutMsg(e.target.value)}
          ></textarea>
        </div>

        <div className="avail-today-card" id="avail-closed-card" style={{ marginTop: 12 }}>
          <div className="avail-panel-row" style={{ margin: 0 }}>
            <div>
              <div className="avail-panel-label">Cerrado por eventualidad</div>
              <div className="avail-panel-sub">Cierre total: no se aceptan reservas ni walk-ins.</div>
            </div>
            <span id="avail-closed-status" className={`avail-toggle-label ${estadoCerrado.cls}`}>
              {estadoCerrado.texto}
            </span>
          </div>
          <div className="avail-sched-row">
            <input
              type="date"
              id="avail-closed-date"
              className="avail-date-input"
              title="Fecha del cierre"
              value={cerradoFecha}
              onChange={(e) => setCerradoFecha(e.target.value)}
            />
            <input
              type="time"
              id="avail-closed-time"
              className="avail-date-input"
              title="Hora de inicio (opcional)"
              value={cerradoHora}
              onChange={(e) => setCerradoHora(e.target.value)}
            />
            <button className="avail-add-btn" onClick={programarCerrado}>
              <ion-icon name="checkmark-outline"></ion-icon> Programar
            </button>
            <button className="avail-clear-btn" onClick={quitarCerrado}>
              Quitar
            </button>
          </div>
          <textarea
            id="avail-closed-msg"
            className="avail-msg-input"
            rows={3}
            placeholder="Mensaje del agente cuando esté cerrado…"
            value={cerradoMsg}
            onChange={(e) => setCerradoMsg(e.target.value)}
          ></textarea>
        </div>
      </div>

      <div className="avail-save-row">
        <span
          id="avail-save-status"
          className="avail-save-status"
          style={{ display: mostrarGuardado ? 'inline' : 'none' }}
        >
          ✓ Guardado
        </span>
        <button className="avail-save-btn" onClick={guardarConfiguracion} disabled={guardando}>
          <ion-icon name="cloud-upload-outline"></ion-icon> Guardar configuración
        </button>
      </div>
    </div>
  );
}
