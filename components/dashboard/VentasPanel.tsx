'use client';

// Panel lateral "Registro de Ventas" — port del markup #ventas-panel /
// #ventas-backdrop y de la lógica inline de legacy/index.html (toggleVentas /
// loadVentas / renderVentas / saveVenta / deleteVenta / editVenta /
// cancelEditVenta / resetVentaForm). Mismos ids/clases (vp-*) para que el CSS
// extraído aplique. CRUD vía useVentas() (tabla `ventas` del Supabase admin);
// al guardar/eliminar se invalida la query y la Card 3 del dashboard se
// refresca sola (equivalente a refreshVentasDashboard del legacy).
//
// Montaje (en DashboardClient, fuera del <main>):
//   <VentasPanel open={ventasOpen} onClose={() => setVentasOpen(false)} />
// NOTA: para Casa de Empeño el botón del sidebar NO abre este panel sino la
// captura de inversión en publicidad (cde-invest-panel, fase 8h) — ese gating
// va en el onToggleVentas del parent.

import { useEffect, useRef, useState } from 'react';
import { useVentas } from '@/lib/dashboard/useVentas';
import type { Venta } from '@/lib/dashboard/filtros';

function formatMoney(n: number | string): string {
  return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export default function VentasPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ventas, cargando, guardarVenta, eliminarVenta, refetch } = useVentas();

  const [editingId, setEditingId] = useState<string | number | ''>('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Al abrir: fecha de hoy por defecto + recargar la lista (paridad con openVentas).
  useEffect(() => {
    if (!open) return;
    setFecha((f) => f || todayISO());
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetForm() {
    setEditingId('');
    setMonto('');
    setFecha(todayISO());
    setDescripcion('');
  }

  async function onGuardar() {
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0 || !fecha) {
      alert('Por favor ingresa monto y fecha válidos.');
      return;
    }
    setGuardando(true);
    try {
      await guardarVenta({
        id: editingId || undefined,
        monto: montoNum,
        fecha,
        descripcion: descripcion.trim(),
      });
      resetForm();
    } catch (err: any) {
      alert('Error al guardar: ' + (err?.message || err));
    } finally {
      setGuardando(false);
    }
  }

  async function onEliminar(id: string | number) {
    if (!confirm('¿Eliminar esta venta?')) return;
    try {
      await eliminarVenta(id);
    } catch (err: any) {
      alert('Error al eliminar: ' + (err?.message || err));
    }
  }

  function onEditar(v: Venta) {
    setEditingId(v.id);
    setMonto(String(v.monto));
    setFecha(v.fecha || '');
    setDescripcion(v.descripcion || '');
    // Scroll al formulario (paridad con editVenta)
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  const total = ventas.reduce((s, v) => s + parseFloat(String(v.monto)), 0);

  return (
    <>
      <div id="ventas-backdrop" className={open ? 'open' : ''} onClick={onClose}></div>

      <div id="ventas-panel" className={open ? 'open' : ''}>
        <div className="vp-header">
          <div className="vp-title">
            <ion-icon name="cash-outline"></ion-icon>
            Registro de Ventas
          </div>
          <button className="vp-close" onClick={onClose}>
            <ion-icon name="close-outline"></ion-icon>
          </button>
        </div>

        {/* Formulario agregar/editar */}
        <div className="vp-form" ref={formRef}>
          <div className="vp-form-title" id="vp-form-title">
            {editingId ? 'Editar Venta' : 'Nueva Venta'}
          </div>
          <div className="vp-row">
            <div className="vp-field">
              <label className="vp-label">Monto ($)</label>
              <input
                type="number"
                id="vp-monto"
                className="vp-input"
                placeholder="0.00"
                step="0.01"
                min="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </div>
            <div className="vp-field">
              <label className="vp-label">Fecha</label>
              <input type="date" id="vp-fecha" className="vp-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div className="vp-field">
            <label className="vp-label">Descripción (opcional)</label>
            <input
              type="text"
              id="vp-descripcion"
              className="vp-input"
              placeholder="Ej: Reservación habitación doble"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <div className="vp-actions">
            <button className="vp-btn-save" onClick={onGuardar} disabled={guardando}>
              <ion-icon name="checkmark-outline"></ion-icon> Guardar Venta
            </button>
            <button
              className="vp-btn-cancel"
              id="vp-cancel-btn"
              onClick={resetForm}
              style={{ display: editingId ? 'block' : 'none' }}
            >
              Cancelar
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="vp-list">
          <div className="vp-list-header">
            <span className="vp-list-title">Ventas registradas</span>
            <span className="vp-total" id="vp-total-label">
              {ventas.length ? formatMoney(total) : ''}
            </span>
          </div>
          <div id="vp-items-container">
            {cargando ? (
              <div className="vp-loading">
                <ion-icon name="sync-outline"></ion-icon> Cargando...
              </div>
            ) : !ventas.length ? (
              <div className="vp-empty">
                <ion-icon name="receipt-outline"></ion-icon>
                <span>Aún no hay ventas registradas</span>
              </div>
            ) : (
              ventas.map((v) => (
                <div className="vp-item" id={`vp-item-${v.id}`} key={v.id}>
                  <div className="vp-item-info">
                    <div className="vp-item-monto">{formatMoney(v.monto)}</div>
                    <div className="vp-item-meta">
                      {formatDate(v.fecha)}
                      {v.descripcion ? ' · ' + v.descripcion : ''}
                    </div>
                    {v.registrado_por ? (
                      <div className="vp-item-autor">
                        <ion-icon name="person-outline"></ion-icon> {v.registrado_por}
                      </div>
                    ) : null}
                  </div>
                  <div className="vp-item-btns">
                    <button className="vp-icon-btn edit" onClick={() => onEditar(v)} title="Editar">
                      <ion-icon name="pencil-outline"></ion-icon>
                    </button>
                    <button className="vp-icon-btn delete" onClick={() => onEliminar(v.id)} title="Eliminar">
                      <ion-icon name="trash-outline"></ion-icon>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
