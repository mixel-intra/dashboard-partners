'use client';

import { useState } from 'react';

// Disparador manual del scrape de Social Listening — port de
// triggerSocialListeningScrape() de legacy/src/backoffice.js más el bloque
// #sl-last-scrape-info que selectClient() poblaba con la última corrida.

export default function DisparadorScrape({
  clientSlugActual,
  slConfig,
  onDone,
}: {
  // Valor ACTUAL del input de ID (el legacy lee elements.clientIdInput.value)
  clientSlugActual: string;
  // social_listening_config guardado (para "Último scrape: …")
  slConfig: any;
  // Tras un scrape OK el legacy recarga registry + re-selecciona el cliente
  onDone: (clientId: string) => void;
}) {
  const [corriendo, setCorriendo] = useState(false);

  async function ejecutar() {
    const clientId = clientSlugActual;
    if (!clientId) {
      alert('Guarda primero el cliente.');
      return;
    }
    setCorriendo(true);
    try {
      const res = await fetch(`/api/scrape-reviews?client=${encodeURIComponent(clientId)}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const total = (data.results || []).reduce((acc: number, r: any) => acc + (r.inserted || 0), 0);
      alert(`Scrape OK. Reviews nuevas insertadas: ${total}`);
      // refresca la config visible para que last_scraped_at se actualice
      onDone(clientId);
    } catch (err: any) {
      console.error('Scrape error:', err);
      alert('Error en scrape: ' + err.message);
    } finally {
      setCorriendo(false);
    }
  }

  const cfg = slConfig || {};
  let info: React.ReactNode;
  if (cfg.last_scraped_at) {
    const when = new Date(cfg.last_scraped_at).toLocaleString('es-MX');
    info = (
      <>
        Último scrape: {when} ·{' '}
        {cfg.last_scrape_status === 'error' ? (
          <span style={{ color: 'var(--danger,#f87171)' }}>Error: {cfg.last_scrape_error || 'desconocido'}</span>
        ) : (
          <span style={{ color: 'var(--success,#34d399)' }}>OK</span>
        )}
      </>
    );
  } else {
    info = 'Aún no se ha ejecutado ningún scrape.';
  }

  return (
    <>
      <div id="sl-last-scrape-info" style={{ marginTop: 11, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
        {info}
      </div>
      <button
        type="button"
        id="sl-test-btn"
        className="btn btn-secondary"
        style={{ marginTop: 11, fontSize: '0.78rem', padding: '7px 14px' }}
        disabled={corriendo}
        onClick={ejecutar}
      >
        {corriendo ? (
          <>
            <ion-icon name="hourglass-outline"></ion-icon> Scrapeando…
          </>
        ) : (
          <>
            <ion-icon name="flash-outline"></ion-icon> Ejecutar scrape ahora
          </>
        )}
      </button>
    </>
  );
}
