'use client';

import { EVT_PIPELINE, EVT_STATUS_COLORS, fmtMoney, type EventoLead } from './tipos';

// Tablero kanban del CRM de eventos — port de renderKanban()/renderCard().

export default function KanbanEventos({
  leads,
  onOpen,
}: {
  leads: EventoLead[];
  onOpen: (lead: EventoLead) => void;
}) {
  return (
    <div className="pipe-board">
      {EVT_PIPELINE.map((stage) => {
        const color = EVT_STATUS_COLORS[stage];
        const stageLeads = leads.filter((r) => r.estado === stage);
        const stageTotal = stageLeads.reduce((s, r) => s + (r.total_estimado || 0), 0);
        return (
          <div className="pipe-col" key={stage}>
            <div className="pipe-col-header">
              <div className="pipe-col-title" style={{ color }}>
                <span className="pipe-col-dot" style={{ background: color }}></span>
                {stage}
              </div>
              <span className="pipe-col-count">{stageLeads.length}</span>
            </div>
            <div className="pipe-col-body">
              {stageLeads.length === 0 ? (
                <div className="pipe-col-empty">Sin leads</div>
              ) : (
                stageLeads.map((r) => <Card key={r.airtable_id} r={r} accentColor={color} onOpen={onOpen} />)
              )}
            </div>
            {stageTotal > 0 && <div className="pipe-col-footer">{fmtMoney(stageTotal)}</div>}
          </div>
        );
      })}
    </div>
  );
}

function Card({
  r,
  accentColor,
  onOpen,
}: {
  r: EventoLead;
  accentColor: string;
  onOpen: (lead: EventoLead) => void;
}) {
  const total = r.total_estimado ? fmtMoney(r.total_estimado) : '';
  const phone = (r.telefono || '').replace(/\D/g, '');
  return (
    <div className="pipe-card" style={{ ['--card-accent' as any]: accentColor }} onClick={() => onOpen(r)}>
      <div className="pipe-card-name">{r.nombre}</div>
      <div className="pipe-card-type">{r.tipo_evento || 'Evento'}</div>
      <div className="pipe-card-meta">
        {r.pax ? (
          <span className="pipe-card-pax">
            <ion-icon name="people-outline"></ion-icon> {r.pax} pax
          </span>
        ) : (
          <span></span>
        )}
        {total && <span className="pipe-card-amount">{total}</span>}
      </div>
      {r.fecha_evento && (
        <div className="pipe-card-date">
          <ion-icon name="calendar-outline"></ion-icon> {r.fecha_evento}
        </div>
      )}
      {(r.telefono || r.email) && (
        <div className="pipe-card-actions">
          {r.telefono && (
            <a
              href={`https://wa.me/${phone}`}
              target="_blank"
              rel="noreferrer"
              className="pipe-card-action wa"
              onClick={(e) => e.stopPropagation()}
              title="WhatsApp"
            >
              <ion-icon name="logo-whatsapp"></ion-icon>
            </a>
          )}
          {r.telefono && (
            <a
              href={`tel:${r.telefono}`}
              className="pipe-card-action call"
              onClick={(e) => e.stopPropagation()}
              title="Llamar"
            >
              <ion-icon name="call-outline"></ion-icon>
            </a>
          )}
          {r.email && (
            <a
              href={`mailto:${r.email}`}
              className="pipe-card-action email"
              onClick={(e) => e.stopPropagation()}
              title="Email"
            >
              <ion-icon name="mail-outline"></ion-icon>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
