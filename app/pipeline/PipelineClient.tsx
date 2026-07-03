'use client';

import '@/styles/theme-intra.css';
import '@/styles/pipeline.css';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/layout/AuthGuard';
import { ToastProvider } from '@/components/ui/Toast';
import KanbanEventos from '@/components/eventos/KanbanEventos';
import SidebarEventos from '@/components/eventos/SidebarEventos';
import CalendarioEventos from '@/components/eventos/CalendarioEventos';
import ModalDetalleEvento from '@/components/eventos/ModalDetalleEvento';
import { useEventosConfig, useEventosLeads } from '@/components/eventos/useEventos';
import { EVT_PROCESS, fmtMoney, type EventoLead } from '@/components/eventos/tipos';

// Port de legacy/pipeline.html — vista standalone del CRM de eventos.
// Los componentes de eventos son COMPARTIDOS con la tab del dashboard (8d).

export default function PipelineClient() {
  return (
    <AuthGuard>
      {() => (
        <ToastProvider>
          <PipelineContent />
        </ToastProvider>
      )}
    </AuthGuard>
  );
}

function PipelineContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('client');

  const [view, setView] = useState<'pipeline' | 'calendario'>('pipeline');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('pg-pipeline');
    return () => document.documentElement.classList.remove('pg-pipeline');
  }, []);

  const configQ = useEventosConfig(clientId);
  const leadsQ = useEventosLeads(clientId, configQ.data);
  const leads = useMemo(() => leadsQ.data || [], [leadsQ.data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (r) =>
        (r.nombre || '').toLowerCase().includes(q) ||
        (r.telefono || '').includes(q) ||
        (r.tipo_evento || '').toLowerCase().includes(q)
    );
  }, [leads, search]);

  // El lead seleccionado se resuelve por id para que sobreviva los refetch.
  const selected: EventoLead | null = useMemo(
    () => leads.find((l) => l.airtable_id === selectedId) || null,
    [leads, selectedId]
  );

  // Summary chips
  const enProceso = leads.filter((r) => EVT_PROCESS.includes(r.estado));
  const totalEstimado = enProceso.reduce((s, r) => s + (r.total_estimado || 0), 0);
  const totalVentas = leads.filter((r) => r.estado === 'Venta').reduce((s, r) => s + (r.total_estimado || 0), 0);
  const perdidos = leads.filter((r) => r.estado === 'Perdido').length;

  const abrir = (l: EventoLead) => setSelectedId(l.airtable_id);

  let contenido: React.ReactNode;
  if (configQ.isLoading || leadsQ.isLoading) {
    contenido = (
      <div className="pipe-loading">
        <div className="pipe-spinner"></div>
        <span>Cargando pipeline...</span>
      </div>
    );
  } else if (configQ.error) {
    contenido = (
      <div className="pipe-loading" style={{ color: '#EF4444' }}>
        Error cargando configuración
      </div>
    );
  } else if (!configQ.data?.apiKey) {
    contenido = <div className="pipe-loading">Pipeline de eventos no configurado para este cliente.</div>;
  } else if (view === 'calendario') {
    contenido = <CalendarioEventos leads={leads} onOpen={abrir} />;
  } else {
    contenido = <KanbanEventos leads={filtered} onOpen={abrir} />;
  }

  const esCalendario = view === 'calendario';

  return (
    <div className="pipe-app">
      {/* Top Bar */}
      <div className="pipe-topbar">
        <div className="pipe-topbar-left">
          <a className="pipe-back-btn" href={`/?client=${clientId}&from=pipeline`}>
            <ion-icon name="arrow-back-outline"></ion-icon> Dashboard
          </a>
          <span className="pipe-topbar-title font-display">Pipeline de Cotizaciones</span>
        </div>
        <div className="pipe-topbar-right" id="summary-chips">
          <span className="pipe-chip pipe-chip-proceso">
            <ion-icon name="trending-up-outline"></ion-icon>
            {fmtMoney(totalEstimado)} en proceso
          </span>
          <span className="pipe-chip pipe-chip-ventas">
            <ion-icon name="checkmark-circle-outline"></ion-icon>
            {fmtMoney(totalVentas)} vendido
          </span>
          {perdidos > 0 && (
            <span className="pipe-chip pipe-chip-perdido">
              {perdidos} perdido{perdidos > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="pipe-controls">
        <div className="pipe-toggle">
          <button
            className={`pipe-toggle-btn${!esCalendario ? ' active' : ''}`}
            onClick={() => setView('pipeline')}
          >
            <ion-icon name="grid-outline"></ion-icon> Pipeline
          </button>
          <button
            className={`pipe-toggle-btn${esCalendario ? ' active' : ''}`}
            onClick={() => setView('calendario')}
          >
            <ion-icon name="calendar-outline"></ion-icon> Agenda
          </button>
        </div>
        <div className="pipe-search-wrap">
          <ion-icon name="search-outline"></ion-icon>
          <input
            type="text"
            className="pipe-search"
            placeholder="Buscar cliente, tipo, teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Main Workspace: Kanban + Sidebar or Full Calendar */}
      <div className="pipe-workspace">
        <div className={`pipe-kanban-panel${esCalendario ? ' full-width' : ''}`} id="kanban-panel">
          <div id="pipeline-content">{contenido}</div>
        </div>
        <div className={`pipe-sidebar${esCalendario ? ' collapsed' : ''}`} id="sidebar-panel">
          <div id="sidebar-content">{!esCalendario && <SidebarEventos leads={leads} onOpen={abrir} />}</div>
        </div>
      </div>

      {selected && (
        <ModalDetalleEvento
          clientId={clientId}
          config={configQ.data}
          lead={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
