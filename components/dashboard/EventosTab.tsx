'use client';

import '@/styles/pipeline.css';

import { useMemo, useState } from 'react';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import KanbanEventos from '@/components/eventos/KanbanEventos';
import CalendarioEventos from '@/components/eventos/CalendarioEventos';
import ModalDetalleEvento from '@/components/eventos/ModalDetalleEvento';
import { useEventosLeads } from '@/components/eventos/useEventos';
import type { EventoLead } from '@/components/eventos/tipos';

// Tab de eventos del dashboard (fase 8d): CTA "Ver Pipeline de Eventos" +
// panel embebido. Port de openEventosPipeline()/closeEventosPipeline() de
// dashboard.js, pero REUSANDO los componentes compartidos de /pipeline
// (la copia duplicada de ~700 líneas del legacy muere aquí — el panel
// embebido usa el visual del pipeline, que es la fuente canónica).

export function CtaPipelineEventos({ onOpen }: { onOpen: () => void }) {
  const { clientId, eventosConfig } = useClientConfig();
  const leadsQ = useEventosLeads(clientId, eventosConfig.apiKey ? eventosConfig : undefined);
  const count = leadsQ.data?.length || 0;

  if (!eventosConfig.apiKey) return null;
  return (
    <div id="eventos-pipeline-cta" className="evt-pipeline-cta">
      <button className="evt-pipeline-cta-btn" onClick={onOpen}>
        <ion-icon name="git-network-outline"></ion-icon>
        <span>Ver Pipeline de Eventos</span>
        {count > 0 && (
          <span id="evt-pipeline-cta-count" className="evt-pipeline-cta-count">
            {count} leads
          </span>
        )}
        <ion-icon name="arrow-forward-outline" style={{ marginLeft: 'auto', opacity: 0.5 }}></ion-icon>
      </button>
    </div>
  );
}

export function PanelEventos({ onClose }: { onClose: () => void }) {
  const { clientId, eventosConfig } = useClientConfig();
  const [view, setView] = useState<'pipeline' | 'calendario'>('pipeline');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const leadsQ = useEventosLeads(clientId, eventosConfig.apiKey ? eventosConfig : undefined);
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

  const selected: EventoLead | null = useMemo(
    () => leads.find((l) => l.airtable_id === selectedId) || null,
    [leads, selectedId]
  );

  return (
    <div id="eventos-panel">
      <div className="pipe-controls" style={{ padding: 0, marginBottom: 14 }}>
        <button className="pipe-toggle-btn active" onClick={onClose} style={{ flex: 'none' }}>
          <ion-icon name="arrow-back-outline"></ion-icon> Volver al dashboard
        </button>
        <div className="pipe-toggle">
          <button className={`pipe-toggle-btn${view === 'pipeline' ? ' active' : ''}`} onClick={() => setView('pipeline')}>
            <ion-icon name="grid-outline"></ion-icon> Pipeline
          </button>
          <button
            className={`pipe-toggle-btn${view === 'calendario' ? ' active' : ''}`}
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

      {leadsQ.isLoading ? (
        <div className="pipe-loading">
          <div className="pipe-spinner"></div>
          <span>Cargando leads de eventos...</span>
        </div>
      ) : view === 'calendario' ? (
        <CalendarioEventos leads={leads} onOpen={(l) => setSelectedId(l.airtable_id)} />
      ) : (
        <KanbanEventos leads={filtered} onOpen={(l) => setSelectedId(l.airtable_id)} />
      )}

      {selected && (
        <ModalDetalleEvento
          clientId={clientId}
          config={eventosConfig}
          lead={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
