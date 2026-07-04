'use client';

import { useMemo, useState } from 'react';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import ModalDetalleHospedaje from './ModalDetalleHospedaje';
import { useHospedajeReservas } from './useHospedaje';
import {
  HSP_CONFIRMED_STATUSES,
  HSP_PROCESS_STATUSES,
  HSP_STATUS_COLORS,
  esFechaValida,
  fmtMonto,
  type HospedajeReserva,
} from './tipos';

// Panel de Reservas de Hospedaje (Airtable) — port de renderHospedajePanel()
// + renderHspRows() + filterHospedaje()/searchHospedaje() (#hospedaje-panel).
// Se monta dentro de .split-row-grid en la pestaña "Reservas"; sin config de
// Airtable el panel queda vacío/oculto (paridad con el legacy).

export default function PanelHospedaje() {
  const { hospedajeConfig } = useClientConfig();
  const { data, isLoading, configurado } = useHospedajeReservas();

  // hospedajeFilters — 'proceso' | 'confirmados' + búsqueda
  const [statusTab, setStatusTab] = useState<'proceso' | 'confirmados'>('proceso');
  const [search, setSearch] = useState('');
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const all = useMemo(() => data || [], [data]);
  const reservaDetalle = detalleId ? all.find((r) => r.airtable_id === detalleId) || null : null;

  // Sin config de Airtable → panel oculto (paridad: innerHTML = '' + .hidden)
  if (!configurado) {
    return <div id="hospedaje-panel" className="hsp-panel hsp-panel-inline hidden"></div>;
  }

  if (isLoading) {
    return (
      <div id="hospedaje-panel" className="hsp-panel hsp-panel-inline">
        <div className="hsp-loading">
          <div className="hsp-spinner"></div>
          <span>Cargando reservas...</span>
        </div>
      </div>
    );
  }

  const enProceso = all.filter(
    (r) => HSP_PROCESS_STATUSES.includes(r.estado) || r.estado === 'Cancelado' || r.estado === 'No Show'
  );
  const confirmados = all.filter((r) => HSP_CONFIRMED_STATUSES.includes(r.estado));

  const totalEstimado = enProceso
    .filter((r) => !['Cancelado', 'No Show'].includes(r.estado))
    .reduce((s, r) => s + (r.total_estimado || 0), 0);
  const totalConfirmado = confirmados.reduce((s, r) => s + (r.total_estimado || 0), 0);

  // Filtro de búsqueda (nombre / teléfono / email)
  const q = (search || '').toLowerCase();
  const filterFn = (r: HospedajeReserva) =>
    !q ||
    (r.nombre || '').toLowerCase().includes(q) ||
    (r.telefono || '').includes(q) ||
    (r.email || '').toLowerCase().includes(q);

  const visibles = (statusTab === 'confirmados' ? confirmados : enProceso).filter(filterFn);

  return (
    <>
      <div id="hospedaje-panel" className="hsp-panel hsp-panel-inline">
        <div className="hsp-header">
          <div>
            <span className="hsp-section-label">RESERVAS DE HOSPEDAJE</span>
            <h3 className="hsp-title">Solicitudes de Reservación</h3>
          </div>
          <div className="hsp-search-wrap">
            <ion-icon name="search-outline"></ion-icon>
            <input
              type="text"
              className="hsp-search"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="hsp-tabs">
          <button
            className={`hsp-tab ${statusTab !== 'confirmados' ? 'active' : ''}`}
            onClick={() => setStatusTab('proceso')}
          >
            En Proceso ({enProceso.length})
            <span className="hsp-tab-amount">{fmtMonto(totalEstimado)}</span>
            <span className="hsp-tab-label">estimado</span>
          </button>
          <button
            className={`hsp-tab ${statusTab === 'confirmados' ? 'active' : ''}`}
            onClick={() => setStatusTab('confirmados')}
          >
            Confirmados ({confirmados.length})
            <span className="hsp-tab-amount">{fmtMonto(totalConfirmado)}</span>
            <span className="hsp-tab-label">confirmado</span>
          </button>
        </div>

        <div className="hsp-table-wrap">
          <table className="hsp-table">
            <thead>
              <tr>
                <th>Huésped</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th style={{ textAlign: 'center' }}>Noches</th>
                <th>Hab.</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 20, opacity: 0.5 }}>
                    Sin reservas
                  </td>
                </tr>
              ) : (
                visibles.map((r) => {
                  const color = HSP_STATUS_COLORS[r.estado] || '#9CA3AF';
                  const fechaIn = esFechaValida(r.fecha_entrada)
                    ? r.fecha_entrada.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                    : '—';
                  const fechaOut = esFechaValida(r.fecha_salida)
                    ? r.fecha_salida.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                    : '—';
                  const total = r.total_estimado ? fmtMonto(r.total_estimado) : '—';
                  return (
                    <tr
                      key={r.airtable_id}
                      className="hsp-row"
                      onClick={() => setDetalleId(r.airtable_id)}
                      title="Ver detalle"
                    >
                      <td className="hsp-td-name">{r.nombre}</td>
                      <td>{fechaIn}</td>
                      <td>{fechaOut}</td>
                      <td style={{ textAlign: 'center' }}>{r.noches || '—'}</td>
                      <td>{r.tipo_habitacion || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{total}</td>
                      <td>
                        <span
                          className="hsp-status-badge"
                          style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
                        >
                          {r.estado}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de detalle (#hospedaje-detail-modal) */}
      {reservaDetalle && (
        <ModalDetalleHospedaje
          key={reservaDetalle.airtable_id}
          reserva={reservaDetalle}
          onClose={() => setDetalleId(null)}
        />
      )}
    </>
  );
}
