'use client';

// Tabla de leads + modal "Ver todo" — port de renderTable()/renderLogRow()/
// populateEstadoDropdown()/applyTableFilters()/setupModalEvents() de
// legacy/src/dashboard.js y del markup #leads-table-card / #leads-modal de
// legacy/index.html (mismos ids/clases para que el CSS extraído aplique).
//
// Montaje (dentro de <div className="split-row-grid" id="split-row-grid">):
//   <TablaLeads leads={filteredLeads} totalSinFiltro={leads.length} />
// - `leads`: YA filtrados con applyGlobalFilters.
// - `totalSinFiltro`: state.leads.length del legacy — si no hay calificados
//   pero sí hay leads, la tabla muestra todos los filtrados (fallback).
// - `onLeadClick` (opcional): Casa de Empeño abre su modal de detalle por fila
//   (cdeOpenLeadModal, fase 8h); si se pasa y el cliente es CDE, las filas
//   son clickeables.

import { useMemo, useState } from 'react';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { useTemaDocumento } from '@/lib/charts/temaChart';
import { esCasaDeEmpeno, SLUGS } from '@/lib/slugs';
import {
  cdeMotivo,
  cdeStage,
  etiquetaIntra,
  ETIQUETA_INTRA_STYLE,
  isQualified,
  type Lead,
} from '@/lib/dashboard/filtros';
import FiltrosLeads, { opcionesEstado } from '@/components/dashboard/leads/FiltrosLeads';
import { exportLeadsToExcel } from '@/components/dashboard/leads/exportar';

// Estilo base del badge de estatus (los colores van por theme/calificación).
const BADGE_BASE: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 20,
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
};

function FilaLead({
  lead,
  index,
  clickable,
  isLight,
  isCDE,
  esCefemex,
  qualified,
  themeSecondary,
  onLeadClick,
}: {
  lead: Lead;
  index: number;
  clickable: boolean;
  isLight: boolean;
  isCDE: boolean;
  esCefemex: boolean;
  qualified: boolean;
  themeSecondary: string;
  onLeadClick?: (lead: Lead, index: number) => void;
}) {
  // Port del badgeStyle de renderLogRow.
  const badgeStyle: React.CSSProperties = isLight
    ? {
        color: qualified ? '#065f46' : '#991b1b',
        background: qualified ? '#d1fae5' : '#fee2e2',
        border: `1px solid ${qualified ? '#a7f3d0' : '#fecaca'}`,
      }
    : {
        color: qualified ? themeSecondary : '#ef4444',
        background: 'rgba(255,255,255,0.05)',
      };

  // Para CDE: mostrar etapa original como badge (verde si calificado)
  const badgeText = isCDE && lead.etiquetas_display ? lead.etiquetas_display : lead.estatus;

  // Columnas "Monto" y "Motivo" — solo Casa de Empeño
  let cdeCells: React.ReactNode = null;
  if (isCDE) {
    const monto = Number(lead.precio || lead.price || 0);
    const montoTxt = monto > 0 ? '$' + monto.toLocaleString('en-US') : '—';
    const stage = cdeStage(lead);
    const motivoTxt = stage === 'perdido' ? cdeMotivo(lead).label : '—';
    cdeCells = (
      <>
        <td className="td-cde" style={{ fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {montoTxt}
        </td>
        <td className="td-cde" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          {motivoTxt}
        </td>
      </>
    );
  }

  // Columna "Etiqueta" — solo CEFEMEX Capital
  let etiquetaCell: React.ReactNode = null;
  if (esCefemex) {
    const etiqueta = etiquetaIntra(lead);
    etiquetaCell = (
      <td>
        <span className="status-badge" style={{ ...ETIQUETA_INTRA_STYLE[etiqueta], ...BADGE_BASE }}>
          {etiqueta}
        </span>
      </td>
    );
  }

  const esClickeable = clickable && isCDE && !!onLeadClick;

  return (
    <tr
      onClick={esClickeable ? () => onLeadClick!(lead, index) : undefined}
      style={esClickeable ? { cursor: 'pointer' } : undefined}
    >
      <td style={{ fontWeight: 600 }}>{lead.nombre || 'Sin nombre'}</td>
      <td style={{ color: 'var(--text-secondary)' }}>
        {lead.fecha_parsed ? lead.fecha_parsed.toLocaleDateString('es-MX') : 'N/A'}
      </td>
      <td>
        <span className="status-badge" style={{ ...badgeStyle, ...BADGE_BASE }}>
          {badgeText}
        </span>
      </td>
      {cdeCells}
      {etiquetaCell}
    </tr>
  );
}

// Encabezados compartidos por la tabla principal y la del modal.
function EncabezadosTabla({ isCDE, esCefemex }: { isCDE: boolean; esCefemex: boolean }) {
  return (
    <tr>
      <th>Nombre</th>
      <th>Fecha</th>
      <th>Estado</th>
      <th className="th-cde" style={{ display: isCDE ? undefined : 'none' }}>
        Monto
      </th>
      <th className="th-cde" style={{ display: isCDE ? undefined : 'none' }}>
        Motivo
      </th>
      <th className="th-etiqueta" style={{ display: esCefemex ? undefined : 'none' }}>
        Etiqueta
      </th>
    </tr>
  );
}

export default function TablaLeads({
  leads,
  totalSinFiltro,
  onLeadClick,
}: {
  leads: Lead[];
  totalSinFiltro: number;
  onLeadClick?: (lead: Lead, index: number) => void;
}) {
  const { clientId, config, clientType } = useClientConfig();
  const tema = useTemaDocumento();
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);

  const isLight = tema === 'light';
  const isCDE = esCasaDeEmpeno(clientId);
  const esCefemex = clientId === SLUGS.CEFEMEX;
  const themeSecondary = config?.themeSecondary || '#01F1E3';

  // Título (port de initHotelTabs — hotel usa un título más específico).
  const titulo = clientType === 'hotel' ? 'Últimas cotizaciones enviadas a ventas' : 'Últimas cotizaciones a ventas';

  // Port de renderTable(): calificados; si no hay pero sí hay leads → filtrados;
  // orden del más reciente al más antiguo.
  const leadsToShow = useMemo(() => {
    let lts = leads.filter((l) => isQualified(l, clientType, clientId));
    if (lts.length === 0 && totalSinFiltro > 0) {
      lts = leads;
    }
    return [...lts].sort(
      (a, b) => (b.fecha_parsed ? b.fecha_parsed.getTime() : 0) - (a.fecha_parsed ? a.fecha_parsed.getTime() : 0)
    );
  }, [leads, totalSinFiltro, clientType, clientId]);

  const estados = useMemo(() => opcionesEstado(leadsToShow, clientId), [leadsToShow, clientId]);

  // Filtro local de estado (port de applyTableFilters). Para CDE el badge que
  // se compara es etiquetas_display || estatus.
  const mainLeads = useMemo(() => {
    if (!estadoFiltro) return leadsToShow;
    return leadsToShow.filter((l) => {
      const badge = isCDE ? l.etiquetas_display || l.estatus : l.estatus;
      return badge === estadoFiltro;
    });
  }, [leadsToShow, estadoFiltro, isCDE]);

  function exportar() {
    exportLeadsToExcel(leads, {
      clientName: config?.clientName || '',
      clientType,
      clientId,
    });
  }

  return (
    <>
      <div className="table-card" id="leads-table-card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span className="label-sub">REGISTRO DE LEADS</span>
            <h3 id="table-title" className="section-headline" style={{ fontSize: '1.5rem', margin: 0 }}>
              {titulo}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button id="export-excel-btn" className="table-action-btn" title="Exportar a Excel" onClick={exportar}>
              <ion-icon name="download-outline"></ion-icon>
              <span>Exportar</span>
            </button>
            <button id="view-all-btn" className="table-action-btn" title="Ver info completa" onClick={() => setModalAbierto(true)}>
              <ion-icon name="open-outline"></ion-icon>
              <span>Ver todo</span>
            </button>
          </div>
        </div>

        {/* Filter bar (estado + limpiar) */}
        <FiltrosLeads estados={estados} value={estadoFiltro} onChange={setEstadoFiltro} />

        <div
          className="table-wrapper"
          style={{ border: 'none', padding: 0, background: 'none', maxHeight: 420, overflowY: 'auto' }}
        >
          <table>
            <thead className="leads-thead" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <EncabezadosTabla isCDE={isCDE} esCefemex={esCefemex} />
            </thead>
            <tbody id="leads-table-body">
              {mainLeads.map((lead, index) => (
                <FilaLead
                  key={lead.id_lead ?? `${lead.nombre}-${index}`}
                  lead={lead}
                  index={index}
                  clickable
                  isLight={isLight}
                  isCDE={isCDE}
                  esCefemex={esCefemex}
                  qualified={isQualified(lead, clientType, clientId)}
                  themeSecondary={themeSecondary}
                  onLeadClick={onLeadClick}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal "Ver todo" — todos los leadsToShow, sin el filtro local de estado */}
      <div
        id="leads-modal"
        className={`modal-overlay${modalAbierto ? '' : ' hidden'}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModalAbierto(false);
        }}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h3>Detalle Completo de Leads</h3>
            <button className="close-modal" onClick={() => setModalAbierto(false)}>
              &times;
            </button>
          </div>
          <div className="modal-body">
            <table className="modal-table">
              <thead>
                <EncabezadosTabla isCDE={isCDE} esCefemex={esCefemex} />
              </thead>
              <tbody id="modal-table-body">
                {leadsToShow.map((lead, index) => (
                  <FilaLead
                    key={lead.id_lead ?? `${lead.nombre}-${index}`}
                    lead={lead}
                    index={index}
                    clickable={false}
                    isLight={isLight}
                    isCDE={isCDE}
                    esCefemex={esCefemex}
                    qualified={isQualified(lead, clientType, clientId)}
                    themeSecondary={themeSecondary}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
