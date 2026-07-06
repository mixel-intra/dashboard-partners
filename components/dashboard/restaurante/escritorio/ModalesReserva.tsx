'use client';

// Modales del módulo restaurante (compartidos escritorio + móvil) — port del
// markup #restaurant-confirm-modal / #unarchive-confirm-modal /
// #bulk-confirm-modal / #conversation-modal / #restaurant-edit-modal /
// #restaurant-create-modal de legacy/index.html y su JS (showConfirmModal,
// selectRejectReason, executeReservationAction, openEditModal,
// saveEditedReservation, openNewReservationModal, submitNewReservation).
// Se montan vía portal en <body> (paridad con la reubicación que hacía
// bootstrapRestMobile para que funcionen también en la UI móvil).

import { useEffect, useRef, useState } from 'react';
import {
  formatReservationDate,
  formatTime,
  todayKeyMx,
  type DatosNuevaReserva,
  type Reserva,
} from '../hooks';

// ── Estilos inline compartidos (el legacy los traía en el markup) ───────────
const sOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(8px)',
  zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const sCaja = (maxWidth: number): React.CSSProperties => ({
  background: 'rgba(15,13,30,0.92)',
  backdropFilter: 'blur(28px)',
  WebkitBackdropFilter: 'blur(28px)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 24,
  maxWidth,
  width: '90%',
  overflow: 'hidden',
});
const sCabecera: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};
const sCerrar: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.4)',
  fontSize: '1.5rem',
  cursor: 'pointer',
  lineHeight: 1,
};
const sBtnCancelar: React.CSSProperties = {
  flex: 1,
  padding: 12,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'transparent',
  borderRadius: 12,
  color: 'white',
  cursor: 'pointer',
  fontFamily: "'Inter',sans-serif",
};
const sEtiqueta: React.CSSProperties = {
  fontSize: '0.78rem',
  color: 'rgba(255,255,255,0.45)',
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export interface PropsModales {
  clientName: string;
  archivoHabilitado: boolean;

  /** Confirmar/Rechazar (showConfirmModal). */
  confirmar: { reserva: Reserva; accion: 'Confirmado' | 'Rechazado' } | null;
  onCerrarConfirmar: () => void;
  /** Ejecuta la acción contra el webhook; el caller cierra el modal y toastea. Lanza en error. */
  onEjecutarAccion: (reserva: Reserva, accion: 'Confirmado' | 'Rechazado', mensaje: string) => Promise<void>;

  /** Desarchivar (solo roof-107). */
  desarchivar: Reserva | null;
  onCerrarDesarchivar: () => void;
  onEjecutarDesarchivar: (r: Reserva) => Promise<void>;

  /** Confirmación de acción masiva (archivar/desarchivar en lote). */
  lote: { count: number; esDesarchivar: boolean; alConfirmar: () => void } | null;
  onCerrarLote: () => void;

  /** Modal de conversación. */
  convo: Reserva | null;
  onCerrarConvo: () => void;

  /** Editar reservación. */
  editar: Reserva | null;
  onCerrarEditar: () => void;
  tieneWebhookConfirmacion: boolean;
  /** Nunca lanza (el legacy aplica los cambios localmente aunque falle el webhook). */
  onGuardarEdicion: (
    reserva: Reserva,
    cambios: { pax: number | string; tipoEvento: string; telefono: string; email: string }
  ) => Promise<void>;

  /** Nueva reserva (alta manual). */
  crear: boolean;
  onCerrarCrear: () => void;
  /** Lanza con mensaje si falla (se muestra inline). */
  onCrear: (datos: DatosNuevaReserva) => Promise<void>;
}

// ============================================================
// Modal Confirmar / Rechazar
// ============================================================
function ModalConfirmar(props: PropsModales) {
  const abierto = !!props.confirmar;
  const reserva = props.confirmar?.reserva;
  const accion = props.confirmar?.accion || 'Confirmado';
  const isConfirm = accion === 'Confirmado';

  const [mensaje, setMensaje] = useState('');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  // Pre-fill del mensaje al abrir (port de showConfirmModal).
  useEffect(() => {
    if (!abierto || !reserva) return;
    setMotivo(null);
    setEnviando(false);
    if (isConfirm) {
      const dateStr = formatReservationDate(reserva);
      const timeStr = reserva.horaEvento ? ` a las ${formatTime(reserva.horaEvento)}` : '';
      const venueName = props.clientName || 'nuestro local';
      setMensaje(
        `¡Hola ${reserva.nombre}! Tu reserva para el ${dateStr}${timeStr} está confirmada. ¡Te esperamos en ${venueName}! 🍽️`
      );
    } else {
      setMensaje('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, reserva?.id, accion]);

  if (!abierto || !reserva) return null;

  // Port de selectRejectReason.
  function elegirMotivo(key: string) {
    setMotivo(key);
    const nombre = reserva!.nombre || '';
    const messages: Record<string, string> = {
      'sin-disponibilidad': `Hola ${nombre}, lamentablemente no tenemos disponibilidad para esa fecha. Te invitamos a elegir otra fecha y con gusto te atendemos.`,
      'fecha-cerrada': `Hola ${nombre}, el restaurante estará cerrado en esa fecha. Puedes consultarnos para otras fechas disponibles.`,
      'grupo-grande': `Hola ${nombre}, el tamaño del grupo supera nuestra capacidad disponible en esa fecha. Contáctanos para explorar opciones.`,
      otra: '',
    };
    setMensaje(messages[key] || '');
    if (key === 'otra') msgRef.current?.focus();
  }

  async function ejecutar() {
    setEnviando(true);
    try {
      await props.onEjecutarAccion(reserva!, accion, mensaje);
    } finally {
      setEnviando(false);
    }
  }

  const motivos: [string, string][] = [
    ['sin-disponibilidad', 'Sin disponibilidad'],
    ['fecha-cerrada', 'Fecha cerrada'],
    ['grupo-grande', 'Grupo muy grande'],
    ['otra', 'Otra razón'],
  ];

  return (
    <div id="restaurant-confirm-modal" style={sOverlay}>
      <div style={sCaja(440)}>
        <div style={sCabecera}>
          <h3 id="confirm-modal-title" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {isConfirm ? 'Confirmar' : 'Rechazar'} Reserva
          </h3>
          <button onClick={props.onCerrarConfirmar} style={sCerrar}>
            &times;
          </button>
        </div>
        <div style={{ padding: 24 }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.045)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Cliente</span>
                <span id="confirm-modal-name" style={{ color: 'white', fontWeight: 600 }}>
                  {reserva.nombre}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Personas</span>
                <span id="confirm-modal-pax" style={{ color: 'white' }}>{`${reserva.pax} personas`}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Fecha</span>
                <span id="confirm-modal-date" style={{ color: 'white' }}>
                  {formatReservationDate(reserva.fechaEvento)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Tipo</span>
                <span id="confirm-modal-type" style={{ color: 'white' }}>{reserva.tipoEvento}</span>
              </div>
            </div>
          </div>
          {/* Motivos de rechazo (solo visible al rechazar) */}
          <div id="confirm-modal-reject-reasons" style={{ display: isConfirm ? 'none' : 'block', marginBottom: 16 }}>
            <label style={sEtiqueta}>Motivo del rechazo</label>
            <div className="reject-reasons-row">
              {motivos.map(([key, label]) => (
                <button
                  key={key}
                  className={`reject-reason-chip${motivo === key ? ' selected' : ''}`}
                  onClick={() => elegirMotivo(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 4 }}>
            <label id="confirm-modal-msg-label" style={{ ...sEtiqueta, marginBottom: 6 }}>
              Mensaje para el cliente
            </label>
            <textarea
              id="confirm-modal-message"
              ref={msgRef}
              className="rest-confirm-message"
              placeholder={isConfirm ? 'Mensaje para el cliente...' : 'Selecciona un motivo arriba o escribe un mensaje...'}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
            ></textarea>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button onClick={props.onCerrarConfirmar} style={sBtnCancelar}>
              Cancelar
            </button>
            <button
              id="confirm-modal-action-btn"
              onClick={ejecutar}
              disabled={enviando}
              style={{
                flex: 1,
                padding: 12,
                border: 'none',
                background: isConfirm ? '#10B981' : '#FF4444',
                borderRadius: 12,
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Inter',sans-serif",
              }}
            >
              {enviando ? (
                <>
                  <ion-icon name="sync-outline" class="spin"></ion-icon> Enviando...
                </>
              ) : isConfirm ? (
                'Confirmar Reserva'
              ) : (
                'Rechazar Reserva'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal Desarchivar (solo 107 Rooftop)
// ============================================================
function ModalDesarchivar(props: PropsModales) {
  const [trayendo, setTrayendo] = useState(false);
  const r = props.desarchivar;
  useEffect(() => setTrayendo(false), [r?.id]);
  if (!r) return null;

  async function ejecutar() {
    setTrayendo(true);
    try {
      await props.onEjecutarDesarchivar(r!);
    } finally {
      setTrayendo(false);
    }
  }

  return (
    <div
      id="unarchive-confirm-modal"
      style={sOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onCerrarDesarchivar();
      }}
    >
      <div style={sCaja(400)}>
        <div style={sCabecera}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Desarchivar</h3>
          <button onClick={props.onCerrarDesarchivar} style={sCerrar}>
            &times;
          </button>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ margin: 0, color: 'var(--text-dim, rgba(255,255,255,0.75))', fontSize: '0.95rem', lineHeight: 1.45 }}>
            ¿Mover la reserva archivada de{' '}
            <span id="unarchive-modal-name" style={{ color: 'white', fontWeight: 600 }}>
              {r.nombre || 'esta reserva'}
            </span>{' '}
            de nuevo a pendientes?
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button onClick={props.onCerrarDesarchivar} style={sBtnCancelar}>
              No
            </button>
            <button
              id="unarchive-confirm-btn"
              onClick={ejecutar}
              disabled={trayendo}
              style={{
                flex: 1,
                padding: 12,
                border: 'none',
                background: '#94A3B8',
                borderRadius: 12,
                color: '#0F172A',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Inter',sans-serif",
              }}
            >
              {trayendo ? 'Trayendo…' : 'Sí'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal de confirmación de acción masiva (archivar/desarchivar) — roof-107
// ============================================================
function ModalLote(props: PropsModales) {
  const lote = props.lote;
  if (!lote) return null;
  const verb = lote.esDesarchivar ? 'Desarchivar' : 'Archivar';
  const plural = lote.count === 1 ? '' : 's';

  return (
    <div
      id="bulk-confirm-modal"
      style={{ ...sOverlay, zIndex: 2100 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onCerrarLote();
      }}
    >
      <div style={sCaja(420)}>
        <div style={sCabecera}>
          <h3 id="bulk-confirm-title" style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
            {verb}
          </h3>
          <button onClick={props.onCerrarLote} style={sCerrar}>
            &times;
          </button>
        </div>
        <div style={{ padding: 24 }}>
          <p
            id="bulk-confirm-text"
            style={{ margin: 0, color: 'var(--text-dim, rgba(255,255,255,0.75))', fontSize: '0.95rem', lineHeight: 1.45 }}
          >
            {lote.esDesarchivar ? (
              <>
                ¿Desarchivar <strong>{lote.count}</strong> reserva{plural} y devolverlas al board?
              </>
            ) : (
              <>
                ¿Archivar <strong>{lote.count}</strong> reserva{plural}? Se ocultarán del board (las verás en
                “Archivadas”).
              </>
            )}
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button onClick={props.onCerrarLote} style={sBtnCancelar}>
              Cancelar
            </button>
            <button
              id="bulk-confirm-btn"
              onClick={() => {
                // capturar antes de cerrar (paridad con closeBulkConfirm)
                const fn = lote.alConfirmar;
                props.onCerrarLote();
                fn();
              }}
              style={{
                flex: 1,
                padding: 12,
                border: 'none',
                background: '#94A3B8',
                borderRadius: 12,
                color: '#0F172A',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Inter',sans-serif",
              }}
            >
              {verb}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal de conversación
// ============================================================
function ModalConversacion(props: PropsModales) {
  const r = props.convo;
  if (!r) return null;
  return (
    <div id="conversation-modal" style={sOverlay}>
      <div style={sCaja(520)}>
        <div style={sCabecera}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ion-icon name="chatbubble-ellipses-outline"></ion-icon>
            <span id="convo-modal-name">{r.nombre}</span>
          </h3>
          <button onClick={props.onCerrarConvo} style={sCerrar}>
            &times;
          </button>
        </div>
        <div style={{ padding: 24 }}>
          <pre
            id="convo-modal-content"
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'rgba(255,255,255,0.7)',
              fontFamily: "'Inter',sans-serif",
              fontSize: '0.9rem',
              lineHeight: 1.6,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: 20,
              maxHeight: 400,
              overflowY: 'auto',
            }}
          >
            {r.detalles || r.conversacion || 'No hay detalles registrados para esta reserva.'}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal Editar Reservación
// ============================================================
function ModalEditar(props: PropsModales) {
  const r = props.editar;
  const [pax, setPax] = useState('');
  const [tipo, setTipo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!r) return;
    setPax(r.pax ? String(r.pax) : '');
    setTipo(r.tipoEvento || '');
    setTelefono(r.telefono || '');
    setEmail(r.email || '');
    setGuardando(false);
  }, [r?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return null;

  async function guardar() {
    // Mismos fallbacks que el legacy: campo vacío conserva el valor anterior.
    const cambios = {
      pax: parseInt(pax) || r!.pax,
      tipoEvento: tipo || r!.tipoEvento,
      telefono: telefono || r!.telefono,
      email: email || r!.email,
    };
    setGuardando(true);
    try {
      await props.onGuardarEdicion(r!, cambios);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div id="restaurant-edit-modal" style={sOverlay}>
      <div style={sCaja(480)}>
        <div style={sCabecera}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ion-icon name="create-outline"></ion-icon> Editar Reservación
          </h3>
          <button onClick={props.onCerrarEditar} style={sCerrar}>
            &times;
          </button>
        </div>
        <div style={{ padding: 24, display: 'grid', gap: 16 }}>
          <div className="rest-edit-field">
            <span className="rest-edit-label">Personas (PAX)</span>
            <input
              type="number"
              id="edit-modal-pax"
              className="rest-edit-input"
              min={1}
              value={pax}
              onChange={(e) => setPax(e.target.value)}
            />
          </div>
          <div className="rest-edit-field">
            <span className="rest-edit-label">Tipo de evento</span>
            <input
              type="text"
              id="edit-modal-tipo"
              className="rest-edit-input"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            />
          </div>
          <div className="rest-edit-field">
            <span className="rest-edit-label">Teléfono</span>
            <input
              type="tel"
              id="edit-modal-telefono"
              className="rest-edit-input"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
          <div className="rest-edit-field">
            <span className="rest-edit-label">Email</span>
            <input
              type="email"
              id="edit-modal-email"
              className="rest-edit-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div
            id="edit-modal-warning"
            className={`rest-warning-inline${props.tieneWebhookConfirmacion ? ' hidden' : ''}`}
          >
            <ion-icon name="alert-circle-outline"></ion-icon>
            <span>No hay webhook configurado. Los cambios se guardarán solo localmente.</span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button onClick={props.onCerrarEditar} style={sBtnCancelar}>
              Cancelar
            </button>
            <button
              id="edit-modal-save-btn"
              onClick={guardar}
              disabled={guardando}
              style={{
                flex: 1,
                padding: 12,
                border: 'none',
                background: '#7551FF',
                borderRadius: 12,
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Inter',sans-serif",
              }}
            >
              {guardando ? (
                <>
                  <ion-icon name="sync-outline" class="spin"></ion-icon> Guardando...
                </>
              ) : (
                'Guardar Cambios'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal Nueva reserva (sirve escritorio y móvil)
// ============================================================
function ModalCrear(props: PropsModales) {
  const abierto = props.crear;
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [tipo, setTipo] = useState('');
  const [pax, setPax] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [detalles, setDetalles] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const nombreRef = useRef<HTMLInputElement>(null);

  // Reset al abrir (port de openNewReservationModal).
  useEffect(() => {
    if (!abierto) return;
    setNombre('');
    setTelefono('');
    setEmail('');
    setTipo('');
    setPax('');
    setHora('');
    setDetalles('');
    setFecha(todayKeyMx());
    setError(null);
    setCreando(false);
    const t = setTimeout(() => nombreRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [abierto]);

  if (!abierto) return null;

  async function crear() {
    const nombreVal = nombre.trim();
    const paxVal = parseInt(pax, 10);
    const fechaVal = fecha.trim();

    if (!nombreVal) return setError('El nombre del cliente es obligatorio.');
    if (!Number.isFinite(paxVal) || paxVal < 1) return setError('Indica cuántas personas (PAX).');
    if (!fechaVal) return setError('Selecciona la fecha de la reserva.');
    setError(null);

    setCreando(true);
    try {
      await props.onCrear({
        nombre: nombreVal,
        telefono: telefono.trim(),
        email: email.trim(),
        tipoEvento: tipo.trim(),
        pax: paxVal,
        fechaEvento: fechaVal,
        horaEvento: hora.trim(),
        detalles: detalles.trim(),
      });
    } catch (e: any) {
      setError('No se pudo crear la reserva: ' + (e.message || e));
    } finally {
      setCreando(false);
    }
  }

  return (
    <div
      id="restaurant-create-modal"
      style={{ ...sOverlay, padding: 16 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onCerrarCrear();
      }}
    >
      <div
        style={{
          ...sCaja(480),
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ ...sCabecera, flexShrink: 0 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ion-icon name="add-circle-outline"></ion-icon> Nueva reserva
          </h3>
          <button onClick={props.onCerrarCrear} style={sCerrar}>
            &times;
          </button>
        </div>
        <div style={{ padding: 24, display: 'grid', gap: 14, overflowY: 'auto' }}>
          <div className="rest-edit-field">
            <span className="rest-edit-label">Nombre del cliente *</span>
            <input
              type="text"
              id="create-nombre"
              ref={nombreRef}
              className="rest-edit-input"
              placeholder="Ej. Juan Pérez"
              autoComplete="off"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="rest-edit-field">
              <span className="rest-edit-label">Teléfono</span>
              <input
                type="tel"
                id="create-telefono"
                className="rest-edit-input"
                placeholder="+52…"
                autoComplete="off"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </div>
            <div className="rest-edit-field">
              <span className="rest-edit-label">Personas (PAX) *</span>
              <input
                type="number"
                id="create-pax"
                className="rest-edit-input"
                min={1}
                placeholder="2"
                value={pax}
                onChange={(e) => setPax(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="rest-edit-field">
              <span className="rest-edit-label">Fecha *</span>
              <input
                type="date"
                id="create-fecha"
                className="rest-edit-input"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div className="rest-edit-field">
              <span className="rest-edit-label">Hora</span>
              <input
                type="time"
                id="create-hora"
                className="rest-edit-input"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
              />
            </div>
          </div>
          <div className="rest-edit-field">
            <span className="rest-edit-label">Tipo de evento</span>
            <input
              type="text"
              id="create-tipo"
              className="rest-edit-input"
              placeholder="Reserva de Mesa Regular"
              autoComplete="off"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            />
          </div>
          <div className="rest-edit-field">
            <span className="rest-edit-label">Email</span>
            <input
              type="email"
              id="create-email"
              className="rest-edit-input"
              placeholder="cliente@correo.com"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="rest-edit-field">
            <span className="rest-edit-label">Detalles</span>
            <textarea
              id="create-detalles"
              className="rest-confirm-message"
              placeholder="Notas, peticiones especiales, ubicación preferida…"
              value={detalles}
              onChange={(e) => setDetalles(e.target.value)}
            ></textarea>
          </div>
          <div id="create-modal-error" className={`rest-warning-inline${error ? '' : ' hidden'}`}>
            <ion-icon name="alert-circle-outline"></ion-icon>
            <span id="create-modal-error-text">{error || 'Revisa los campos.'}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button onClick={props.onCerrarCrear} style={sBtnCancelar}>
              Cancelar
            </button>
            <button
              id="create-submit-btn"
              onClick={crear}
              disabled={creando}
              style={{
                flex: 1.4,
                padding: 12,
                border: 'none',
                background: '#7551FF',
                borderRadius: 12,
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Inter',sans-serif",
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {creando ? (
                <>
                  <ion-icon name="sync-outline" class="spin"></ion-icon> Creando…
                </>
              ) : (
                <>
                  <ion-icon name="checkmark-outline"></ion-icon> Crear reserva
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ModalesReserva(props: PropsModales) {
  return (
    <>
      <ModalConfirmar {...props} />
      {props.archivoHabilitado && <ModalDesarchivar {...props} />}
      {props.archivoHabilitado && <ModalLote {...props} />}
      <ModalConversacion {...props} />
      <ModalEditar {...props} />
      <ModalCrear {...props} />
    </>
  );
}
