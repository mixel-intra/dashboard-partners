'use client';

// <PanelRestaurante/> — módulo completo de reservas de restaurante (fases
// 8e+8f). Monta el board de escritorio (#restaurant-panel) inline y, vía
// portal a <body>, la UI móvil (#rest-mobile + sheets) y los modales
// compartidos (paridad con la reubicación de bootstrapRestMobile: con
// body[data-mobile-mode="restaurant"] el CSS oculta #app-wrapper, así que
// nada de eso puede vivir dentro del shell).
//
// Contrato de montaje:
//   - Renderizar dentro del shell cuando la tab activa es 'restaurante'
//     (requiere ClientConfigProvider + ToastProvider + QueryClientProvider).
//   - Prop opcional `rangoGlobal`: rango de fechas global del header (fase
//     8c); si se pasa, filtra el board igual que state.filters.start/end.
//   - Mientras está montado oculta .content-header-row (el legacy la
//     escondía al entrar a la tab restaurante); el padre debe encargarse de
//     NO renderizar el dashboard-grid de KPIs en esta tab.
//   - Si Restaurante es el primer servicio unlocked, marca
//     document.body.dataset.mobileMode = 'restaurant' (activa la UI móvil).

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { useToast } from '@/components/ui/Toast';
import TableroReservas from './escritorio/TableroReservas';
import DrawerReserva from './escritorio/DrawerReserva';
import PanelDisponibilidad from './escritorio/PanelDisponibilidad';
import PanelContexto from './escritorio/PanelContexto';
import ModalesReserva from './escritorio/ModalesReserva';
import ReservasMovil from './movil/ReservasMovil';
import {
  dateKey,
  matchesRestaurantView,
  useAccionReserva,
  useArchivoReservas,
  useCrearReserva,
  useDisponibilidad,
  useEditarReserva,
  useNotasReserva,
  useReservas,
  type DatosNuevaReserva,
  type Reserva,
  type VistaReserva,
} from './hooks';

// Toasts locales del módulo: 'warning' (el ToastProvider compartido solo trae
// success/error) y el toast con "Deshacer" de liberar mesa (showUndoToast).
type ToastLocal =
  | { id: number; clase: 'warning'; msg: string; fading: boolean }
  | { id: number; clase: 'undo'; msg: string; onUndo: () => void; fading: boolean };

let siguienteToastId = 1;

export default function PanelRestaurante({
  rangoGlobal,
}: {
  /** Rango global del header (state.filters.start/end del legacy). */
  rangoGlobal?: { start: Date | null; end: Date | null };
}) {
  const { clientId, config, rawConfig, restaurantConfig } = useClientConfig();
  const showToast = useToast();

  // ── Datos (hooks compartidos escritorio + móvil) ──────────────────────────
  const { reservas, sinConfig, cargando, refrescando, errorRed, refrescar, actualizadoEn, errorEn } = useReservas();
  const archivo = useArchivoReservas();
  const disp = useDisponibilidad();
  const notas = useNotasReserva(reservas);
  const accion = useAccionReserva();
  const edicion = useEditarReserva();
  const creacion = useCrearReserva();

  // ── Estado de UI (escritorio) ─────────────────────────────────────────────
  const [filtros, setFiltros] = useState<{ view: VistaReserva; search: string; date: Date | null }>({
    view: 'nuevos',
    search: '',
    date: null,
  });
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [idsSeleccionados, setIdsSeleccionados] = useState<Set<string>>(new Set());
  const [panelDispAbierto, setPanelDispAbierto] = useState(false);

  // ── Modales compartidos ───────────────────────────────────────────────────
  const [modalConfirmar, setModalConfirmar] = useState<{ reserva: Reserva; accion: 'Confirmado' | 'Rechazado' } | null>(null);
  const [modalDesarchivar, setModalDesarchivar] = useState<Reserva | null>(null);
  const [modalLote, setModalLote] = useState<{ count: number; esDesarchivar: boolean; alConfirmar: () => void } | null>(null);
  const [modalConvo, setModalConvo] = useState<Reserva | null>(null);
  const [modalEditar, setModalEditar] = useState<Reserva | null>(null);
  const [modalCrear, setModalCrear] = useState(false);
  const [resetSeleccion, setResetSeleccion] = useState(0);

  const [toastsLocales, setToastsLocales] = useState<ToastLocal[]>([]);
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  // ── Toasts locales (warning + deshacer) ───────────────────────────────────
  function desvanecerToast(id: number, delay: number) {
    setTimeout(() => {
      setToastsLocales((prev) => prev.map((t) => (t.id === id ? { ...t, fading: true } : t)));
      setTimeout(() => setToastsLocales((prev) => prev.filter((t) => t.id !== id)), 300);
    }, delay);
  }

  function mostrarWarning(msg: string) {
    const id = siguienteToastId++;
    setToastsLocales((prev) => [...prev, { id, clase: 'warning', msg, fading: false }]);
    desvanecerToast(id, 3500);
  }

  function mostrarUndo(msg: string, onUndo: () => void) {
    const id = siguienteToastId++;
    setToastsLocales((prev) => [...prev, { id, clase: 'undo', msg, onUndo, fading: false }]);
    desvanecerToast(id, 6000);
  }

  // Dispatcher con soporte 'warning' (paridad con el showToast del legacy).
  function mostrarToast(msg: string, tipo: 'success' | 'error' | 'warning' = 'success') {
    if (tipo === 'warning') mostrarWarning(msg);
    else showToast(msg, tipo);
  }

  // ── Efectos de integración con el shell ───────────────────────────────────

  // Mobile: si el cliente usa principalmente Restaurante (primer servicio
  // unlocked), mostramos la UI móvil dedicada (port de initHotelTabs).
  useEffect(() => {
    const services = rawConfig?.hotel_services || {
      eventos: 'unlocked',
      reservas: 'locked',
      daypass: 'locked',
      restaurante: 'locked',
      social_listening: 'locked',
    };
    const firstUnlocked = Object.keys(services).find((s) => services[s] === 'unlocked');
    if (firstUnlocked === 'restaurante') document.body.dataset.mobileMode = 'restaurant';
    else delete document.body.dataset.mobileMode;
    return () => {
      delete document.body.dataset.mobileMode;
    };
  }, [rawConfig]);

  // El header "Dashboard / Todo el tiempo" no aplica en la vista restaurante
  // (switchDashTab lo ocultaba al entrar a la tab).
  useEffect(() => {
    const row = document.querySelector('.content-header-row');
    row?.classList.add('hidden');
    return () => row?.classList.remove('hidden');
  }, []);

  // Esc cierra el drawer y el modal de desarchivar (paridad).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setSeleccionadaId((prev) => (prev !== null ? null : prev));
      setModalDesarchivar((prev) => (prev !== null ? null : prev));
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Al entrar a la tab, todo lo ya cargado se marca como visto (port del
  // markRestaurantAsSeen de switchDashTab).
  const marcadoInicial = useRef(false);
  useEffect(() => {
    if (marcadoInicial.current) return;
    marcadoInicial.current = true;
    notas.marcarTodasVistas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Badge de nuevas reservaciones en el tab (si el shell lo renderiza).
  useEffect(() => {
    const badge = document.getElementById('rest-new-badge');
    if (badge) badge.textContent = notas.nuevosIds.length > 0 ? String(notas.nuevosIds.length) : '';
  }, [notas.nuevosIds]);

  // Toast tras cada fetch (legacy: 'Reservas actualizadas' / 'Sin conexión').
  const ultimoOk = useRef(0);
  useEffect(() => {
    if (!actualizadoEn) return;
    if (ultimoOk.current === 0) {
      ultimoOk.current = actualizadoEn;
      showToast('Reservas actualizadas', 'success');
      return;
    }
    if (actualizadoEn !== ultimoOk.current) {
      ultimoOk.current = actualizadoEn;
      showToast('Reservas actualizadas', 'success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualizadoEn]);

  const ultimoError = useRef(0);
  useEffect(() => {
    if (!errorEn || !errorRed) return;
    if (errorEn !== ultimoError.current) {
      ultimoError.current = errorEn;
      showToast('Sin conexión', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorEn, errorRed]);

  // ── Filtros del board (port de getFilteredRestaurantReservations) ─────────
  const visibles = useMemo(() => {
    let lista = reservas.filter((r) => matchesRestaurantView(r, filtros.view, archivo.archivadas));

    const q = filtros.search.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (r) =>
          (r.nombre || '').toLowerCase().includes(q) ||
          (r.telefono || '').toLowerCase().includes(q) ||
          (r.email || '').toLowerCase().includes(q) ||
          (r.tipoEvento || '').toLowerCase().includes(q)
      );
    }

    if (filtros.date) {
      const target = new Date(filtros.date);
      target.setHours(0, 0, 0, 0);
      lista = lista.filter((r) => {
        if (!r.fechaParsed) return false;
        const d = new Date(r.fechaParsed);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === target.getTime();
      });
    }

    // Rango global del header (si el padre lo pasa)
    if (rangoGlobal && (rangoGlobal.start || rangoGlobal.end)) {
      lista = lista.filter((r) => {
        if (!r.fechaParsed) return true;
        if (rangoGlobal.start && r.fechaParsed < rangoGlobal.start) return false;
        if (rangoGlobal.end && r.fechaParsed > rangoGlobal.end) return false;
        return true;
      });
    }

    return lista;
  }, [reservas, filtros, archivo.archivadas, rangoGlobal]);

  const seleccionada = seleccionadaId ? reservas.find((r) => r.id === seleccionadaId) || null : null;

  // Día objetivo del right rail: reserva seleccionada → su fecha; sin
  // selección → filtro de fecha activo u hoy (populateContextForToday).
  const claveObjetivo = seleccionada
    ? seleccionada.fechaParsed
      ? dateKey(seleccionada.fechaParsed)
      : null
    : dateKey(filtros.date || new Date());

  // ── Handlers ──────────────────────────────────────────────────────────────

  function cambiarVista(v: VistaReserva) {
    // Cambiar de vista limpia la selección para no mezclar contextos
    setIdsSeleccionados(new Set());
    setFiltros((prev) => ({ ...prev, view: v }));
  }

  function saltarFecha(d: Date) {
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    setFiltros((prev) => ({ ...prev, date: target }));
  }

  function abrirDetalle(r: Reserva) {
    setSeleccionadaId(r.id);
    notas.marcarVista(r.id);
  }

  function toggleModoSeleccion() {
    setModoSeleccion((prev) => {
      if (prev) setIdsSeleccionados(new Set());
      return !prev;
    });
  }

  function toggleSeleccion(id: string) {
    setIdsSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function seleccionarTodas(checked: boolean) {
    const ids = visibles.map((r) => r.id).filter(Boolean);
    setIdsSeleccionados((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  // Limpia ambos modos de selección (escritorio + móvil) tras un lote.
  function terminarLote(msg: string) {
    setModoSeleccion(false);
    setIdsSeleccionados(new Set());
    setResetSeleccion((s) => s + 1);
    showToast(msg, 'success');
  }

  function abrirLote(ids: string[], esDesarchivar: boolean) {
    if (!ids.length) return;
    setModalLote({
      count: ids.length,
      esDesarchivar,
      alConfirmar: async () => {
        const plural = ids.length === 1 ? '' : 's';
        try {
          if (esDesarchivar) {
            await archivo.desarchivar.mutateAsync(ids);
            terminarLote(`${ids.length} reserva${plural} desarchivada${plural}`);
          } else {
            await archivo.archivar.mutateAsync(ids);
            terminarLote(`${ids.length} reserva${plural} archivada${plural}`);
          }
        } catch (e: any) {
          console.error(esDesarchivar ? 'Error desarchivando en lote:' : 'Error archivando en lote:', e);
          showToast(`Error al ${esDesarchivar ? 'desarchivar' : 'archivar'}: ` + (e.message || e), 'error');
        }
      },
    });
  }

  function confirmarReserva(r: Reserva) {
    setModalConfirmar({ reserva: r, accion: 'Confirmado' });
  }

  function rechazarReserva(r: Reserva) {
    setModalConfirmar({ reserva: r, accion: 'Rechazado' });
  }

  // Port de executeReservationAction (el modal maneja el estado "Enviando...").
  async function ejecutarAccion(reserva: Reserva, nuevoEstado: 'Confirmado' | 'Rechazado', mensaje: string) {
    try {
      await accion.mutateAsync({ reserva, nuevoEstado, mensajeCliente: mensaje });
      setModalConfirmar(null);
      mostrarToast(
        nuevoEstado === 'Confirmado' ? 'Reserva confirmada exitosamente' : 'Reserva rechazada',
        nuevoEstado === 'Confirmado' ? 'success' : 'warning'
      );
    } catch (error: any) {
      console.error('Error en acción de reserva:', error);
      showToast('Error al procesar la reserva: ' + error.message, 'error');
    }
  }

  async function archivarReserva(r: Reserva) {
    if (!r.id) return;
    try {
      await archivo.archivar.mutateAsync([r.id]);
      showToast('Reserva archivada', 'success');
    } catch (e: any) {
      console.error('Error archivando reserva:', e);
      showToast('Error al archivar: ' + (e.message || e), 'error');
    }
  }

  async function ejecutarDesarchivar(r: Reserva) {
    if (!r.id) return;
    try {
      await archivo.desarchivar.mutateAsync([r.id]);
      showToast(`${r.nombre || 'La reserva'} volvió a pendientes`, 'success');
      setModalDesarchivar(null);
    } catch (e: any) {
      console.error('Error desarchivando reserva:', e);
      showToast('Error al desarchivar: ' + (e.message || e), 'error');
    }
  }

  // Liberar mesa: la reserva sale del aforo del día pero sigue en el board
  // (badge "Servida") para auditoría. Con toast de deshacer.
  async function liberarMesa(r: Reserva) {
    if (!r.id) return;
    try {
      await archivo.liberar.mutateAsync(r.id);
      mostrarUndo(`Mesa liberada · ${r.pax || 0} pax disponibles`, () => restaurarMesa(r));
    } catch (e: any) {
      console.error('Error liberando reserva:', e);
      showToast('Error al liberar: ' + (e.message || e), 'error');
    }
  }

  async function restaurarMesa(r: Reserva) {
    if (!r.id) return;
    try {
      await archivo.restaurar.mutateAsync(r.id);
      showToast('Mesa restaurada — vuelve a contar en aforo', 'success');
    } catch (e: any) {
      console.error('Error restaurando reserva:', e);
      showToast('Error al restaurar: ' + (e.message || e), 'error');
    }
  }

  // Port de saveEditedReservation: nunca lanza; toastea según cómo fue el envío.
  async function guardarEdicion(
    reserva: Reserva,
    cambios: { pax: number | string; tipoEvento: string; telefono: string; email: string }
  ) {
    const resultado = await edicion.mutateAsync({ reserva, cambios });
    if (resultado.envio === 'ok') showToast('Reservación actualizada correctamente', 'success');
    else if (resultado.envio === 'error') showToast('Error al enviar al servidor: ' + resultado.mensajeError, 'error');
    else mostrarWarning('Cambios guardados localmente (sin webhook)');
    setModalEditar(null);
  }

  async function crearReserva(datos: DatosNuevaReserva) {
    await creacion.mutateAsync(datos); // si falla, el modal muestra el error inline
    setModalCrear(false);
    showToast('Reserva creada exitosamente', 'success');
  }

  async function guardarFilaDisponibilidad(fila: Record<string, any>) {
    await disp.guardar.mutateAsync(fila);
  }

  const clientName = config?.clientName || '';

  return (
    <>
      {/* ── Escritorio: panel de restaurante (dentro del shell) ── */}
      <div id="restaurant-panel">
        <TableroReservas
          reservas={reservas}
          visibles={visibles}
          filtros={filtros}
          onCambiarVista={cambiarVista}
          onBuscar={(q) => setFiltros((prev) => ({ ...prev, search: q }))}
          onSaltarFecha={saltarFecha}
          onLimpiarFecha={() => setFiltros((prev) => ({ ...prev, date: null }))}
          sinConfig={sinConfig}
          errorRed={errorRed}
          cargando={cargando}
          refrescando={refrescando}
          onRefrescar={() => refrescar()}
          archivoHabilitado={archivo.habilitado}
          archivadas={archivo.archivadas}
          liberadas={archivo.liberadas}
          tieneNotas={notas.tieneNotas}
          modoSeleccion={modoSeleccion}
          idsSeleccionados={idsSeleccionados}
          onToggleModoSeleccion={toggleModoSeleccion}
          onToggleSeleccion={toggleSeleccion}
          onSeleccionarTodas={seleccionarTodas}
          onAccionLote={() => abrirLote(Array.from(idsSeleccionados), filtros.view === 'archivadas')}
          seleccionadaId={seleccionadaId}
          onAbrirDetalle={abrirDetalle}
          onConfirmar={confirmarReserva}
          onRechazar={rechazarReserva}
          onEditar={setModalEditar}
          onArchivar={archivarReserva}
          onDesarchivar={setModalDesarchivar}
          onNuevaReserva={() => setModalCrear(true)}
          aceptandoReservas={disp.disponibilidad.accepting}
          panelDisponibilidadAbierto={panelDispAbierto}
          onTogglePanelDisponibilidad={() => setPanelDispAbierto((v) => !v)}
          slotDisponibilidad={
            <PanelDisponibilidad
              abierto={panelDispAbierto}
              disponibilidad={disp.disponibilidad}
              setDisponibilidad={disp.setDisponibilidad}
              guardarFila={guardarFilaDisponibilidad}
              archivoHabilitado={archivo.habilitado}
              mostrarToast={mostrarToast}
            />
          }
          slotDrawer={
            <DrawerReserva
              reserva={seleccionada}
              archivoHabilitado={archivo.habilitado}
              archivadas={archivo.archivadas}
              liberadas={archivo.liberadas}
              crmTemplate={restaurantConfig.crmLeadUrlTemplate}
              obtenerNotas={notas.obtenerNotas}
              guardarNotas={notas.guardarNotas}
              onCerrar={() => setSeleccionadaId(null)}
              onConfirmar={confirmarReserva}
              onRechazar={rechazarReserva}
              onEditar={setModalEditar}
              onArchivar={archivarReserva}
              onDesarchivar={setModalDesarchivar}
              onLiberar={liberarMesa}
              onRestaurar={restaurarMesa}
            />
          }
          slotContexto={
            <PanelContexto
              reservas={reservas}
              liberadas={archivo.liberadas}
              disponibilidad={disp.disponibilidad}
              claveObjetivo={claveObjetivo}
              seleccionadaId={seleccionadaId}
              onAbrirDetalle={abrirDetalle}
              onSaltarAFecha={(key) => saltarFecha(new Date(key + 'T00:00:00'))}
            />
          }
        />
      </div>

      {/* ── Móvil + modales compartidos + toasts locales (portales a <body>) ── */}
      {montado &&
        createPortal(
          <ReservasMovil
            clientId={clientId}
            clientName={clientName}
            reservas={reservas}
            refrescar={refrescar}
            archivoHabilitado={archivo.habilitado}
            archivadas={archivo.archivadas}
            disponibilidad={disp.disponibilidad}
            setDisponibilidad={disp.setDisponibilidad}
            guardarFila={guardarFilaDisponibilidad}
            onConfirmar={confirmarReserva}
            onRechazar={rechazarReserva}
            onArchivar={archivarReserva}
            onDesarchivar={setModalDesarchivar}
            onNuevaReserva={() => setModalCrear(true)}
            onLote={abrirLote}
            resetSeleccionSignal={resetSeleccion}
          />,
          document.body
        )}

      {montado &&
        createPortal(
          <ModalesReserva
            clientName={clientName}
            archivoHabilitado={archivo.habilitado}
            confirmar={modalConfirmar}
            onCerrarConfirmar={() => setModalConfirmar(null)}
            onEjecutarAccion={ejecutarAccion}
            desarchivar={modalDesarchivar}
            onCerrarDesarchivar={() => setModalDesarchivar(null)}
            onEjecutarDesarchivar={ejecutarDesarchivar}
            lote={modalLote}
            onCerrarLote={() => setModalLote(null)}
            convo={modalConvo}
            onCerrarConvo={() => setModalConvo(null)}
            editar={modalEditar}
            onCerrarEditar={() => setModalEditar(null)}
            tieneWebhookConfirmacion={!!restaurantConfig.confirmWebhookUrl}
            onGuardarEdicion={guardarEdicion}
            crear={modalCrear}
            onCerrarCrear={() => setModalCrear(false)}
            onCrear={crearReserva}
          />,
          document.body
        )}

      {montado &&
        toastsLocales.length > 0 &&
        createPortal(
          <div className="toast-container" style={{ zIndex: 100000 }}>
            {toastsLocales.map((t) =>
              t.clase === 'warning' ? (
                <div key={t.id} className={`toast warning${t.fading ? ' fade-out' : ''}`}>
                  <ion-icon name="warning-outline"></ion-icon>
                  <span>{t.msg}</span>
                </div>
              ) : (
                <div key={t.id} className={`toast success has-undo${t.fading ? ' fade-out' : ''}`}>
                  <ion-icon name="checkmark-circle-outline"></ion-icon>
                  <span style={{ flex: 1 }}>{t.msg}</span>
                  <button
                    className="toast-undo-btn"
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      border: 'none',
                      color: '#fff',
                      fontWeight: 600,
                      padding: '5px 12px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '0.78rem',
                    }}
                    onClick={() => {
                      setToastsLocales((prev) => prev.filter((x) => x.id !== t.id));
                      try {
                        t.onUndo();
                      } catch (e) {
                        console.error('Undo handler error:', e);
                      }
                    }}
                  >
                    Deshacer
                  </button>
                </div>
              )
            )}
          </div>,
          document.body
        )}
    </>
  );
}
