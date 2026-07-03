'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import {
  EVT_PIPELINE,
  EVT_STATUS_COLORS,
  INTERACTION_ICONS,
  fmtMoney,
  formatPhone,
  type EventoLead,
  type EventosConfig,
} from './tipos';
import { useGuardarSeguimiento, useInteracciones } from './useEventos';

// Modal de detalle del lead de eventos — port de openDetail()/saveAll().

export default function ModalDetalleEvento({
  clientId,
  config,
  lead,
  onClose,
}: {
  clientId: string | null;
  config: EventosConfig | undefined;
  lead: EventoLead | null;
  onClose: () => void;
}) {
  const showToast = useToast();
  const interaccionesQ = useInteracciones(clientId, lead?.airtable_id || null);
  const guardar = useGuardarSeguimiento(clientId, config);

  const [newStatus, setNewStatus] = useState('');
  const [tipo, setTipo] = useState('llamada');
  const [resultado, setResultado] = useState('');

  useEffect(() => {
    if (lead) {
      setNewStatus(lead.estado);
      setTipo('llamada');
      setResultado('');
    }
  }, [lead]);

  // Cerrar con Escape (paridad con el legacy).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!lead) return null;

  const r = lead;
  const color = EVT_STATUS_COLORS[r.estado] || '#9CA3AF';
  const interactions = interaccionesQ.data || [];
  const hasHistory = interactions.length > 0;

  const fechaContacto =
    r.fecha_contacto instanceof Date && !isNaN(r.fecha_contacto.getTime())
      ? r.fecha_contacto.toLocaleDateString('es-MX', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';
  const total = r.total_estimado ? fmtMoney(r.total_estimado, 2) : '—';
  const now = new Date();
  const hasUpcoming = r.fecha_contacto instanceof Date && r.fecha_contacto > now;
  const phone = (r.telefono || '').replace(/\D/g, '');

  const saveEnabled = newStatus !== r.estado || resultado.trim().length > 0;

  async function handleSave() {
    try {
      await guardar.mutateAsync({ lead: r, newStatus, tipo, resultado: resultado.trim() });
      showToast('Cambios guardados', 'success');
      setResultado('');
    } catch (err) {
      console.error('saveAll failed:', err);
      showToast('Error al guardar', 'error');
    }
  }

  return (
    <div
      className="pipe-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pipe-modal-content">
        <div>
          <div className="pipe-detail-header">
            <div>
              <h2 className="pipe-detail-name font-display">{r.nombre}</h2>
              <span className="pipe-detail-sub">
                {r.tipo_evento || 'Evento'} · {r.pax || '?'} pax · {r.fecha_evento || '—'}
                <span
                  className="pipe-status-badge"
                  style={{ background: `${color}18`, color, border: `1px solid ${color}33`, marginLeft: 8 }}
                >
                  {r.estado}
                </span>
              </span>
            </div>
            <button className="pipe-close-btn" onClick={onClose}>
              &times;
            </button>
          </div>

          <div className={`pipe-modal-layout ${hasHistory ? 'pipe-two-col' : ''}`}>
            <div className="pipe-modal-left">
              <div className="pipe-detail-grid">
                <div className="pipe-detail-card">
                  <div className="pipe-detail-card-icon">
                    <ion-icon name="people-outline"></ion-icon>
                  </div>
                  <div>
                    <div className="pipe-detail-label">PAX</div>
                    <div className="pipe-detail-value">{r.pax || '—'}</div>
                  </div>
                </div>
                <div className="pipe-detail-card">
                  <div className="pipe-detail-card-icon">
                    <ion-icon name="cash-outline"></ion-icon>
                  </div>
                  <div>
                    <div className="pipe-detail-label">Total Estimado</div>
                    <div className="pipe-detail-value">{total}</div>
                  </div>
                </div>
              </div>

              {hasUpcoming ? (
                <div className="pipe-call-scheduled">
                  <ion-icon name="alarm-outline"></ion-icon> Llamada programada: <strong>{fechaContacto}</strong>
                </div>
              ) : r.fecha_contacto ? (
                <div className="pipe-call-past">
                  <ion-icon name="checkmark-circle-outline"></ion-icon> Contacto: {fechaContacto}
                </div>
              ) : null}

              <div className="pipe-detail-info">
                <div className="pipe-info-item">
                  <ion-icon name="call-outline"></ion-icon> {formatPhone(r.telefono) || '—'}
                </div>
                <div className="pipe-info-item">
                  <ion-icon name="mail-outline"></ion-icon> {r.email || '—'}
                </div>
              </div>

              {r.notas && (
                <div className="pipe-detail-notes">
                  <ion-icon name="document-text-outline"></ion-icon> {r.notas}
                </div>
              )}
              {r.detalles && (
                <div className="pipe-detail-notes">
                  <ion-icon name="chatbubble-outline"></ion-icon> {r.detalles}
                </div>
              )}

              <div className="pipe-detail-actions">
                {r.telefono && (
                  <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="pipe-action-btn pipe-btn-whatsapp">
                    <ion-icon name="logo-whatsapp"></ion-icon> WhatsApp
                  </a>
                )}
                {r.telefono && (
                  <a href={`tel:${r.telefono}`} className="pipe-action-btn pipe-btn-call">
                    <ion-icon name="call-outline"></ion-icon> Llamar
                  </a>
                )}
                {r.email && (
                  <a href={`mailto:${r.email}`} className="pipe-action-btn pipe-btn-email">
                    <ion-icon name="mail-outline"></ion-icon> Email
                  </a>
                )}
              </div>

              <div className="pipe-interaction-form">
                <h4 className="pipe-section-title">Actualizar Seguimiento</h4>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label className="pipe-form-label">Estatus</label>
                    <select
                      className="pipe-form-select"
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      style={{ borderColor: color, color }}
                    >
                      {EVT_PIPELINE.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="pipe-form-label">Tipo de contacto</label>
                    <select className="pipe-form-select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                      <option value="llamada">Llamada</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="nota">Nota</option>
                    </select>
                  </div>
                </div>
                <textarea
                  className="pipe-form-textarea"
                  rows={3}
                  placeholder="Resultado de la interacción, acuerdos, siguiente paso..."
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value)}
                ></textarea>
                <button
                  className="pipe-form-save-btn"
                  disabled={!saveEnabled || guardar.isPending}
                  onClick={handleSave}
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

            {hasHistory && (
              <div className="pipe-modal-right">
                <h4 className="pipe-section-title">Historial de Seguimiento</h4>
                <div>
                  {interactions.map((ix, i) => {
                    const icon = INTERACTION_ICONS[ix.tipo] || 'chatbubble-outline';
                    const tipoLabel = ix.tipo.charAt(0).toUpperCase() + ix.tipo.slice(1);
                    const fecha = new Date(ix.created_at).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    return (
                      <div className="pipe-timeline-item" key={ix.id ?? i}>
                        <div className="pipe-timeline-icon" style={{ background: `${color}18` }}>
                          <ion-icon name={icon} style={{ color }}></ion-icon>
                        </div>
                        <div className="pipe-timeline-content">
                          <div className="pipe-timeline-meta">
                            {tipoLabel} · {fecha} · <strong>{ix.vendedor_nombre}</strong>
                          </div>
                          <div className="pipe-timeline-text">{ix.resultado || ''}</div>
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
