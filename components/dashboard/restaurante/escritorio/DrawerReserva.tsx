'use client';

// Drawer de detalle de reserva — port de selectReservation/populateDrawer/
// closeDrawer (ids rdm-*) de legacy/src/dashboard.js y el markup
// #rest-drawer + #rest-drawer-backdrop de legacy/index.html.

import {
  formatReservationDate,
  formatTime,
  isReservationToday,
  type Reserva,
} from '../hooks';

export interface PropsDrawer {
  /** Reserva seleccionada; null = drawer cerrado. */
  reserva: Reserva | null;
  archivoHabilitado: boolean;
  archivadas: Set<string>;
  liberadas: Set<string>;
  crmTemplate: string;
  obtenerNotas: (id: string) => string;
  guardarNotas: (id: string, texto: string) => void;
  onCerrar: () => void;
  onConfirmar: (r: Reserva) => void;
  onRechazar: (r: Reserva) => void;
  onEditar: (r: Reserva) => void;
  onArchivar: (r: Reserva) => void;
  onDesarchivar: (r: Reserva) => void;
  onLiberar: (r: Reserva) => void;
  onRestaurar: (r: Reserva) => void;
}

// Icono del canal Kommo (feature latente — hoy kommoSource nunca viene).
function IconoFuente({ source }: { source: string }) {
  switch (source) {
    case 'whatsapp':
      return (
        <span className="rest-item-source whatsapp" title="WhatsApp">
          <ion-icon name="logo-whatsapp"></ion-icon>
        </span>
      );
    case 'instagram':
      return (
        <span className="rest-item-source instagram" title="Instagram">
          <ion-icon name="logo-instagram"></ion-icon>
        </span>
      );
    case 'web':
      return (
        <span className="rest-item-source web" title="Web">
          <ion-icon name="globe-outline"></ion-icon>
        </span>
      );
    case 'messenger':
      return (
        <span className="rest-item-source web" title="Messenger">
          <ion-icon name="logo-facebook"></ion-icon>
        </span>
      );
    default:
      return null;
  }
}

export default function DrawerReserva(props: PropsDrawer) {
  const { reserva: r } = props;
  const abierto = !!r;

  const isToday = r ? isReservationToday(r) : false;
  const cleanPhone = r ? (r.telefono || '').replace(/[\s\-\+\(\)]/g, '') : '';
  const isReleased = !!r && props.liberadas.has(r.id);
  const isArchived = !!r && props.archivoHabilitado && props.archivadas.has(r.id);

  const statusKey = !r
    ? 's-pending'
    : isReleased
      ? 's-served'
      : r.estado === 'Confirmado'
        ? 's-confirmed'
        : r.estado === 'Rechazado'
          ? 's-rejected'
          : 's-pending';
  const statusText = !r ? '' : isReleased ? 'Servida' : r.estado === 'Nuevo Lead' ? 'Nuevo Lead' : r.estado;

  const showStatusActions = !!r && r.estado === 'Nuevo Lead';
  const showArchiveAction = props.archivoHabilitado;
  // Liberar mesa: solo en Confirmadas (mesa ya tiene compromiso real)
  const showReleaseAction = props.archivoHabilitado && !!r && r.estado === 'Confirmado';

  // "Abrir en CRM": URL desde el template + lead id (populateOpenCrmButton).
  const crmHabilitado = !!props.crmTemplate && !!r?.kommoLeadId;
  const crmHref = crmHabilitado
    ? props.crmTemplate.replace('{lead_id}', encodeURIComponent(String(r!.kommoLeadId)))
    : undefined;
  const crmTitle = crmHabilitado
    ? 'Abrir este lead en el CRM en una pestaña nueva'
    : !props.crmTemplate
      ? 'No hay URL de CRM configurada para este cliente'
      : 'Este lead no tiene ID de CRM asociado';

  const origText = r ? r.detalles || r.conversacion || '' : '';

  return (
    <>
      <section className={`rest-drawer${abierto ? ' is-open' : ''}`} id="rest-drawer">
        {/* Empty state (oculto en el layout modal, se conserva por compat) */}
        <div className="rest-drawer-empty hidden" id="rest-drawer-empty">
          <ion-icon name="reader-outline"></ion-icon>
          <div className="rest-drawer-empty-title">Selecciona una reserva</div>
          <div className="rest-drawer-empty-sub">Elige una reserva para ver el detalle.</div>
        </div>
        {/* Content */}
        <div className={`rest-drawer-content${abierto ? '' : ' hidden'}`} id="rest-drawer-content">
          {r && (
            <>
              {/* Header */}
              <div className="rest-drawer-header">
                <div className="rest-drawer-headline">
                  <div className="rest-drawer-name-block">
                    <h3 className="rest-drawer-name" id="rdm-name">
                      {r.nombre || 'Sin nombre'}
                    </h3>
                    <div className="rest-drawer-meta">
                      <span id="rdm-date">
                        <strong>{formatReservationDate(r)}</strong>
                        {isToday && <> <span className="rest-today-badge">HOY</span></>}
                      </span>
                      <span className="rest-drawer-meta-divider">·</span>
                      <span id="rdm-time-meta">{r.horaEvento ? formatTime(r.horaEvento) : 'Sin hora'}</span>
                      <span className="rest-drawer-meta-divider">·</span>
                      <span>
                        <strong id="rdm-pax-meta">{r.pax || 0}</strong> pax
                      </span>
                      <span
                        className="rest-drawer-meta-divider"
                        id="rdm-source-divider"
                        style={{ display: r.kommoSource ? '' : 'none' }}
                      >
                        ·
                      </span>
                      <span className="rest-drawer-source" id="rdm-source" style={{ display: r.kommoSource ? '' : 'none' }}>
                        {r.kommoSource && (
                          <>
                            <IconoFuente source={r.kommoSource} />{' '}
                            {r.kommoSource[0].toUpperCase() + r.kommoSource.slice(1)}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`rest-drawer-status-pill ${statusKey}`} id="rdm-status-pill">
                      <span className="dot"></span>
                      <span id="rdm-status-text">{statusText}</span>
                    </span>
                    <button className="rest-drawer-close" onClick={props.onCerrar} aria-label="Cerrar">
                      &times;
                    </button>
                  </div>
                </div>
                <div className="rest-drawer-actions" id="rdm-actions">
                  {showStatusActions && (
                    <>
                      <button onClick={() => props.onConfirmar(r)} className="rest-action success">
                        <ion-icon name="checkmark-circle-outline"></ion-icon> Confirmar
                      </button>
                      <button onClick={() => props.onRechazar(r)} className="rest-action danger">
                        <ion-icon name="close-circle-outline"></ion-icon> Rechazar
                      </button>
                    </>
                  )}
                  <button onClick={() => props.onEditar(r)} className="rest-action primary">
                    <ion-icon name="create-outline"></ion-icon> Editar
                  </button>
                  {cleanPhone && (
                    <>
                      <a
                        href={`https://wa.me/${cleanPhone}`}
                        target="_blank"
                        rel="noopener"
                        className="rest-action whatsapp icon-only"
                        title="WhatsApp directo"
                      >
                        <ion-icon name="logo-whatsapp"></ion-icon>
                      </a>
                      <a href={`tel:${r.telefono}`} className="rest-action call icon-only" title="Llamar">
                        <ion-icon name="call-outline"></ion-icon>
                      </a>
                    </>
                  )}
                  {showReleaseAction &&
                    (isReleased ? (
                      <button
                        onClick={() => props.onRestaurar(r)}
                        className="rest-action release is-released"
                        title="La mesa vuelve a contar en el aforo"
                      >
                        <ion-icon name="refresh-outline"></ion-icon> Restaurar mesa
                      </button>
                    ) : (
                      <button
                        onClick={() => props.onLiberar(r)}
                        className="rest-action release"
                        title="Liberar mesa — saca a esta reserva del aforo del día"
                      >
                        <ion-icon name="exit-outline"></ion-icon> Liberar mesa
                      </button>
                    ))}
                  {showArchiveAction &&
                    (isArchived ? (
                      <button onClick={() => props.onDesarchivar(r)} className="rest-action archive">
                        <ion-icon name="archive-outline"></ion-icon> Desarchivar
                      </button>
                    ) : (
                      <button onClick={() => props.onArchivar(r)} className="rest-action archive">
                        <ion-icon name="archive-outline"></ion-icon> Archivar
                      </button>
                    ))}
                </div>
              </div>
              {/* Body */}
              <div className="rest-drawer-body">
                {/* Info grid */}
                <div className="rest-section">
                  <div className="rest-section-title">
                    <ion-icon name="information-circle-outline"></ion-icon>
                    Información
                  </div>
                  <div className="rest-info-grid">
                    <div className="rest-info-cell">
                      <div className="rest-info-cell-label">Tipo de evento</div>
                      <div className="rest-info-cell-value" id="rdm-tipo">
                        {r.tipoEvento || 'N/A'}
                      </div>
                    </div>
                    <div className={`rest-info-cell${r.telefono ? '' : ' hidden'}`} id="rdm-phone-block">
                      <div className="rest-info-cell-label">Teléfono</div>
                      <div className="rest-info-cell-value" id="rdm-phone">
                        {r.telefono || '—'}
                      </div>
                    </div>
                    <div className={`rest-info-cell full${r.email ? '' : ' hidden'}`} id="rdm-email-block">
                      <div className="rest-info-cell-label">Email</div>
                      <div className="rest-info-cell-value" id="rdm-email">
                        {r.email || '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick action: jump to the CRM for full conversation */}
                <div className="rest-section">
                  <a
                    id="rdm-open-crm"
                    className={`rest-open-crm${crmHabilitado ? '' : ' is-disabled'}`}
                    target="_blank"
                    rel="noopener"
                    title={crmTitle}
                    {...(crmHabilitado ? { href: crmHref } : {})}
                  >
                    <ion-icon name="open-outline"></ion-icon>
                    <span>Abrir en CRM</span>
                  </a>
                </div>

                {/* Original conversation (Airtable detalles, si existe) */}
                <div className={`rest-section${origText ? '' : ' hidden'}`} id="rdm-orig-block">
                  <div className="rest-section-title">
                    <ion-icon name="document-text-outline"></ion-icon>
                    Detalles originales del lead
                  </div>
                  <div className="rest-orig-convo" id="rdm-orig-convo">
                    {origText}
                  </div>
                </div>

                {/* Internal notes */}
                <div className="rest-section">
                  <div className="rest-section-title">
                    <ion-icon name="bookmark-outline"></ion-icon>
                    Notas internas
                  </div>
                  <div className="rest-drawer-notes">
                    <textarea
                      id="rdm-notes"
                      key={r.id}
                      placeholder="Agregar notas del staff (no se envían al cliente)…"
                      defaultValue={props.obtenerNotas(r.id)}
                      onBlur={(e) => props.guardarNotas(r.id, e.target.value)}
                    ></textarea>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Backdrop for detail overlay */}
      <div
        className={`rest-drawer-backdrop${abierto ? ' is-visible' : ''}`}
        id="rest-drawer-backdrop"
        onClick={props.onCerrar}
      ></div>
    </>
  );
}
