'use client';

import { useState } from 'react';
import type { ClienteRegistro } from './tipos';

// Panel lateral de entornos — port de renderClientList() + filterClients()
// de legacy/src/backoffice.js (búsqueda, botón "Nuevo Entorno" y lista).

const TYPE_LABELS: Record<string, string> = {
  hotel: 'Hotel',
  inmobiliaria: 'Inmobiliaria',
  otro: 'Otro',
};

export default function TablaClientes({
  clients,
  currentClientId,
  onSelect,
  onAdd,
}: {
  clients: ClienteRegistro[];
  currentClientId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const term = busqueda.toLowerCase();

  return (
    <>
      {/* Search */}
      <div className="sb-search" style={{ marginBottom: 7 }}>
        <ion-icon name="search-outline"></ion-icon>
        <input
          type="text"
          id="client-search"
          placeholder="Buscar entorno…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {/* Add */}
      <button id="add-client-btn" className="sb-add-btn" onClick={onAdd}>
        <ion-icon name="add-circle-outline"></ion-icon> Nuevo Entorno
      </button>

      <div className="sb-section-lbl">Entornos</div>
      <div id="clients-list" className="sb-list">
        {clients.length === 0 ? (
          <div className="loading-text">No hay clientes registrados</div>
        ) : (
          clients.map((client) => {
            const isActive = currentClientId === client.id_slug;
            const typeLabel = TYPE_LABELS[client.client_type || ''] || 'Otro';
            const metaText = client.webhook_url ? 'Configurado' : 'Pendiente';
            // filterClients() del legacy filtra por el textContent del item
            const visible =
              !term || `${client.id_slug} ${typeLabel} ${metaText}`.toLowerCase().includes(term);
            return (
              <div
                key={client.id_slug}
                className={`client-item ${isActive ? 'active' : ''}`}
                data-id={client.id_slug}
                style={{ display: visible ? 'flex' : 'none' }}
                onClick={() => onSelect(client.id_slug)}
              >
                <div
                  className="client-icon-placeholder"
                  style={
                    client.logo_url
                      ? { background: 'transparent', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.08)' }
                      : undefined
                  }
                >
                  {client.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={client.logo_url}
                      alt="logo"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4, borderRadius: 12 }}
                    />
                  ) : (
                    client.id_slug.charAt(0).toUpperCase()
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <span className="client-id-label">{client.id_slug}</span>
                  <span className="client-type-label">{typeLabel}</span>
                </div>
                <span className="client-meta" style={{ flexShrink: 0 }}>
                  {metaText}
                </span>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
