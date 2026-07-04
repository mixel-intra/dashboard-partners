'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useGuardarHospedaje, useHspInteracciones } from './useHospedaje';
import {
  HSP_INTERACTION_ICONS,
  HSP_PIPELINE,
  HSP_STATUS_COLORS,
  esFechaValida,
  fmtMonto,
  formatPhone,
  type HospedajeReserva,
} from './tipos';

// Modal de detalle de una reserva de hospedaje — port de openHospedajeDetail()
// + hspCheckSaveEnabled() + saveHospedajeAll() (#hospedaje-detail-modal).

export default function ModalDetalleHospedaje({
  reserva,
  onClose,
}: {
  reserva: HospedajeReserva;
  onClose: () => void;
}) {
  const showToast = useToast();
  const interaccionesQ = useHspInteracciones(reserva.airtable_id);
  const guardar = useGuardarHospedaje();

  // Formulario "Actualizar Seguimiento"
  const [newStatus, setNewStatus] = useState(reserva.estado);
  const [tipo, setTipo] = useState('llamada');
  const [resultado, setResultado] = useState('');

  const interactions = interaccionesQ.data || [];
  const hasHistory = interactions.length > 0;

  const color = HSP_STATUS_COLORS[reserva.estado] || '#9CA3AF';
  const fechaIn = esFechaValida(reserva.fecha_entrada)
    ? reserva.fecha_entrada.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const fechaOut = esFechaValida(reserva.fecha_salida)
    ? reserva.fecha_salida.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const total = reserva.total_estimado ? fmtMonto(reserva.total_estimado) : '—';

  // Habilitado si cambió el estatus o hay texto (hspCheckSaveEnabled)
  const statusChanged = newStatus !== reserva.estado;
  const puedeGuardar = statusChanged || resultado.trim().length > 0;

  function onGuardar() {
    guardar.mutate(
      { reserva, newStatus, tipo, resultado: resultado.trim() },
      {
        onSuccess: () => {
          showToast('Cambios guardados', 'success');
          // Paridad: el legacy re-renderea el modal → formulario limpio
          setTipo('llamada');
          setResultado('');
        },
        onError: (err) => {
          console.error('Hospedaje: saveAll failed:', err);
          showToast('Error al guardar', 'error');
        },
      }
    );
  }

  return (
    <div id="hospedaje-detail-modal" className="hsp-modal-overlay">
      <div className="hsp-modal-content">
        <div id="hospedaje-detail-content">
          <div className="hsp-detail-header">
            <div>
              <h2 className="hsp-detail-name">{reserva.nombre}</h2>
              <span className="hsp-detail-sub">
                <span
                  className="hsp-status-badge"
                  style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
                >
                  {reserva.estado}
                </span>
              </span>
            </div>
            <button className="hsp-close-btn" onClick={onClose}>
              &times;
            </button>
          </div>

          <div className={`hsp-modal-layout ${hasHistory ? 'hsp-two-col' : ''}`}>
            {/* IZQUIERDA: info del cliente */}
            <div className="hsp-modal-left">
              <div className="hsp-detail-grid">
                <div className="hsp-detail-card">
                  <div className="hsp-detail-card-icon">
                    <ion-icon name="calendar-outline"></ion-icon>
                  </div>
                  <div>
                    <div className="hsp-detail-label">Check-in</div>
                    <div className="hsp-detail-value">{fechaIn}</div>
                  </div>
                </div>
                <div className="hsp-detail-card">
                  <div className="hsp-detail-card-icon">
                    <ion-icon name="log-out-outline"></ion-icon>
                  </div>
                  <div>
                    <div className="hsp-detail-label">Check-out</div>
                    <div className="hsp-detail-value">{fechaOut}</div>
                  </div>
                </div>
                <div className="hsp-detail-card">
                  <div className="hsp-detail-card-icon">
                    <ion-icon name="moon-outline"></ion-icon>
                  </div>
                  <div>
                    <div className="hsp-detail-label">Noches</div>
                    <div className="hsp-detail-value">{reserva.noches || '—'}</div>
                  </div>
                </div>
                <div className="hsp-detail-card">
                  <div className="hsp-detail-card-icon">
                    <ion-icon name="cash-outline"></ion-icon>
                  </div>
                  <div>
                    <div className="hsp-detail-label">Total Estimado</div>
                    <div className="hsp-detail-value">{total}</div>
                  </div>
                </div>
              </div>

              <div className="hsp-detail-info">
                <div className="hsp-info-item">
                  <ion-icon name="bed-outline"></ion-icon> {reserva.tipo_habitacion || '—'}{' '}
                  {reserva.cantidad_habitaciones > 1 ? `(${reserva.cantidad_habitaciones} hab.)` : ''}
                </div>
                <div className="hsp-info-item">
                  <ion-icon name="people-outline"></ion-icon> {reserva.adultos || 0} adulto(s)
                  {reserva.ninos ? `, ${reserva.ninos} niño(s)` : ''}
                </div>
                <div className="hsp-info-item">
                  <ion-icon name="call-outline"></ion-icon> {formatPhone(reserva.telefono) || '—'}
                </div>
                <div className="hsp-info-item">
                  <ion-icon name="mail-outline"></ion-icon> {reserva.email || '—'}
                </div>
              </div>

              {reserva.notas && (
                <div className="hsp-detail-notes">
                  <ion-icon name="document-text-outline"></ion-icon> {reserva.notas}
                </div>
              )}

              <div className="hsp-detail-actions">
                {reserva.telefono && (
                  <a
                    href={`https://wa.me/${reserva.telefono.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hsp-action-btn hsp-btn-whatsapp"
                  >
                    <ion-icon name="logo-whatsapp"></ion-icon> WhatsApp
                  </a>
                )}
                {reserva.telefono && (
                  <a href={`tel:${reserva.telefono}`} className="hsp-action-btn hsp-btn-call">
                    <ion-icon name="call-outline"></ion-icon> Llamar
                  </a>
                )}
                {reserva.email && (
                  <a href={`mailto:${reserva.email}`} className="hsp-action-btn hsp-btn-email">
                    <ion-icon name="mail-outline"></ion-icon> Email
                  </a>
                )}
              </div>

              <div className="hsp-interaction-form">
                <h4 className="hsp-section-title">Actualizar Seguimiento</h4>
                <div className="hsp-form-row" style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label className="hsp-form-label">Estatus</label>
                    <select
                      id="hsp-status-dropdown"
                      className="hsp-form-select"
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      style={{ borderColor: color, color }}
                    >
                      {HSP_PIPELINE.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="hsp-form-label">Tipo de contacto</label>
                    <select
                      id="hsp-interaction-type"
                      className="hsp-form-select"
                      value={tipo}
                      onChange={(e) => setTipo(e.target.value)}
                    >
                      <option value="llamada">Llamada</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="nota">Nota</option>
                    </select>
                  </div>
                </div>
                <textarea
                  id="hsp-interaction-result"
                  className="hsp-form-textarea"
                  rows={3}
                  placeholder="Resultado de la interacción, acuerdos, siguiente paso..."
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value)}
                ></textarea>
                <button
                  id="hsp-save-all-btn"
                  className="hsp-form-save-btn"
                  disabled={!puedeGuardar || guardar.isPending}
                  onClick={onGuardar}
                >
                  {guardar.isPending ? (
                    <>
                      <ion-icon name="sync-outline" class="spin"></ion-icon> Guardando...
                    </>
                  ) : (
                    <>
                      <ion-icon name="save-outline"></ion-icon> Guardar
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* DERECHA: timeline (solo si hay historial) */}
            {hasHistory && (
              <div className="hsp-modal-right">
                <h4 className="hsp-section-title">Historial de Seguimiento</h4>
                <div className="hsp-timeline-scroll">
                  {interactions.map((ix, i) => {
                    const icon = HSP_INTERACTION_ICONS[ix.tipo] || 'chatbubble-outline';
                    const tipoLabel = ix.tipo.charAt(0).toUpperCase() + ix.tipo.slice(1);
                    const fecha = new Date(ix.created_at).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    return (
                      <div className="hsp-timeline-item" key={ix.id ?? i}>
                        <div className="hsp-timeline-icon" style={{ background: `${color}22` }}>
                          <ion-icon name={icon} style={{ color }}></ion-icon>
                        </div>
                        <div className="hsp-timeline-content">
                          <div className="hsp-timeline-meta">
                            {tipoLabel} &middot; {fecha} &middot; <strong>{ix.vendedor_nombre}</strong>
                          </div>
                          <div className="hsp-timeline-text">{ix.resultado || ''}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
