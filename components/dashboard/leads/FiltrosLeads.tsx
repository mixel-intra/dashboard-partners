'use client';

// Filtros de leads — dos controles portados de legacy/index.html:
//
// 1. FiltroEtiquetaGlobal: segmented Todas/Intra/Orgánico
//    (#filter-etiqueta-global) — SOLO visible para CEFEMEX Capital; filtra en
//    cliente sin re-fetch (port de onEtiquetaSeg). Se monta en el
//    headerControls del shell, junto a <RangoFechas/>:
//      <FiltroEtiquetaGlobal value={filtros.etiqueta}
//                            onChange={(etq) => setFiltros(f => ({ ...f, etiqueta: etq }))} />
//
// 2. FiltrosLeads: la barra de filtro local de la tabla (#table-filter-bar):
//    dropdown de estado (#filter-estado) + botón Limpiar (port de
//    populateEstadoDropdown/applyTableFilters/clearTableFilters). La monta
//    TablaLeads internamente.

import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { useTemaDocumento } from '@/lib/charts/temaChart';
import { esCasaDeEmpeno, SLUGS } from '@/lib/slugs';
import type { Lead } from '@/lib/dashboard/filtros';

// --- 1. Filtro global de etiqueta (CEFEMEX Capital) --------------------------

const ETIQUETAS_SEG: { etq: string; label: string }[] = [
  { etq: '', label: 'Todas' },
  { etq: 'intra', label: 'Intra' },
  { etq: 'organico', label: 'Orgánico' },
];

export function FiltroEtiquetaGlobal({
  value,
  onChange,
}: {
  value: string;
  onChange: (etiqueta: string) => void;
}) {
  const { clientId } = useClientConfig();

  // Visible solo para CEFEMEX Capital (paridad con setupEventListeners).
  if (clientId !== SLUGS.CEFEMEX) return null;

  return (
    <div className="etq-segmented" id="filter-etiqueta-global" title="Filtrar por etiqueta">
      <ion-icon name="pricetags-outline" class="etq-seg-icon"></ion-icon>
      {ETIQUETAS_SEG.map((o) => (
        <button
          key={o.etq}
          type="button"
          className={`etq-seg${value === o.etq ? ' active' : ''}`}
          data-etq={o.etq}
          onClick={() => onChange(o.etq)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// --- 2. Barra de filtro de la tabla (estado + limpiar) -----------------------

// Port de populateEstadoDropdown: opciones únicas del estatus; para Casa de
// Empeño siempre las 6 etapas del funnel (aunque tengan 0) + las presentes.
export function opcionesEstado(leads: Lead[], clientId: string | null): string[] {
  const isCDE = esCasaDeEmpeno(clientId);
  if (isCDE) {
    const fijas = ['Lead Empeño Oro', 'Rescate / Empeño Otros', 'Cita agendada', 'Reagendar', 'Empeñado', 'Venta perdida'];
    const presentes = [...new Set(leads.map((l) => l.estatus).filter(Boolean))] as string[];
    return [...fijas, ...presentes.filter((p) => !fijas.includes(p))];
  }
  return ([...new Set(leads.map((l) => l.estatus).filter(Boolean))] as string[]).sort();
}

export default function FiltrosLeads({
  estados,
  value,
  onChange,
}: {
  /** Opciones del dropdown (usar opcionesEstado(leadsToShow, clientId)). */
  estados: string[];
  value: string;
  onChange: (estado: string) => void;
}) {
  const tema = useTemaDocumento();

  // Estilos inline por theme (paridad con populateEstadoDropdown).
  const isLight = tema === 'light';
  const optBg = isLight ? '#ffffff' : '#1e293b';
  const optColor = isLight ? '#1e293b' : '#e2e8f0';
  const optStyle: React.CSSProperties = { background: optBg, color: optColor };

  return (
    <div
      id="table-filter-bar"
      style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}
    >
      <select
        id="filter-estado"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: '0.75rem',
          padding: '4px 10px',
          borderRadius: 8,
          border: '1px solid var(--border-color)',
          background: optBg,
          color: optColor,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="" style={optStyle}>
          Todos los estados
        </option>
        {estados.map((s) => (
          <option key={s} value={s} style={optStyle}>
            {s}
          </option>
        ))}
      </select>
      <button
        onClick={() => onChange('')}
        style={{
          fontSize: '0.72rem',
          padding: '4px 10px',
          borderRadius: 8,
          border: '1px solid var(--border-color)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        Limpiar
      </button>
    </div>
  );
}
