'use client';

import '@/styles/theme-intra.css';
import '@/styles/style.css';
import '@/styles/dashboard.css';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/layout/AuthGuard';
import { ToastProvider } from '@/components/ui/Toast';
import { ClientConfigProvider, useClientConfig } from '@/lib/config/ClientConfigProvider';
import DashboardShell, { esLogicSystems, type DashTab, type IntraTab } from '@/components/dashboard/DashboardShell';
import TarjetasKpi from '@/components/dashboard/kpis/TarjetasKpi';
import GraficaHistorica from '@/components/dashboard/charts/GraficaHistorica';
import TablaLeads from '@/components/dashboard/leads/TablaLeads';
import RangoFechas from '@/components/dashboard/leads/RangoFechas';
import { FiltroEtiquetaGlobal } from '@/components/dashboard/leads/FiltrosLeads';
import VentasPanel from '@/components/dashboard/VentasPanel';
import PanelHospedaje from '@/components/dashboard/hospedaje/PanelHospedaje';
import ResenasSocial from '@/components/dashboard/resenas/ResenasSocial';
import SaludCanales from '@/components/dashboard/kommo/SaludCanales';
import PanelCde, { ModalLead, useAdSpend } from '@/components/dashboard/cde/PanelCde';
import { CtaPipelineEventos, PanelEventos } from '@/components/dashboard/EventosTab';
import { applyGlobalFilters, type FiltrosGlobales, type Lead } from '@/lib/dashboard/filtros';
import { rangoMesEnCurso, usaRangoServidor, useLeads } from '@/lib/dashboard/useLeads';
import { useVentas } from '@/lib/dashboard/useVentas';
import { esCasaDeEmpeno } from '@/lib/slugs';
import type { Session } from '@/types/session';

// Dashboard principal — integración de todas las secciones (fases 8a-8i):
// KPIs + gráfica histórica + tabla (core) · hospedaje · reseñas · salud de
// canales · CDE · tab de eventos. El panel de restaurante (8e/8f) se monta
// cuando su módulo esté completo. Semántica de tabs = switchDashTab del legacy.

export default function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = searchParams.get('client');

  // Guard: logic-systems usa su panel dedicado (paridad con el head-guard).
  useEffect(() => {
    if (esLogicSystems(client)) {
      router.replace(`/director?client=${encodeURIComponent(client!)}`);
    }
  }, [client, router]);

  if (esLogicSystems(client)) return null;

  return (
    <AuthGuard>
      {(session) => (
        <ClientConfigProvider>
          <ToastProvider>
            <DashboardContent session={session} />
          </ToastProvider>
        </ClientConfigProvider>
      )}
    </AuthGuard>
  );
}

function DashboardContent({ session }: { session: Session }) {
  const { clientId, clientType, rawConfig, hospedajeConfig } = useClientConfig();
  const esCde = esCasaDeEmpeno(clientId);
  const rangoServidor = usaRangoServidor(clientId);

  const [activeTab, setActiveTab] = useState<DashTab>('eventos');
  const [intraTab, setIntraTab] = useState<IntraTab>('dashboard');
  const [ventasOpen, setVentasOpen] = useState(false);
  const [eventosPanelOpen, setEventosPanelOpen] = useState(false);
  const [cdeLeadModal, setCdeLeadModal] = useState<Lead | null>(null);

  // CEFEMEX arranca consultando solo el mes en curso (rango server-side).
  const [filtros, setFiltros] = useState<FiltrosGlobales>(() =>
    rangoServidor ? { ...rangoMesEnCurso(), etiqueta: '' } : { start: null, end: null, etiqueta: '' }
  );

  const { leads, actualizando } = useLeads(filtros);
  const { ventas } = useVentas();
  const spendQ = useAdSpend(esCde);
  const spendMap = spendQ.data || {};

  const filteredLeads = useMemo(
    () => applyGlobalFilters(leads, filtros, clientType, clientId, activeTab),
    [leads, filtros, clientType, clientId, activeTab]
  );

  // Primera tab unlocked = activa (port de initHotelTabs).
  useEffect(() => {
    if (clientType !== 'hotel' || !rawConfig?.hotel_services) return;
    const orden: DashTab[] = ['eventos', 'reservas', 'daypass', 'restaurante', 'social_listening'];
    const primera = orden.find((k) => rawConfig.hotel_services[k] === 'unlocked');
    if (primera) setActiveTab(primera);
  }, [clientType, rawConfig]);

  // Cambiar de tab cierra el panel de eventos (paridad con switchDashTab).
  function cambiarTab(t: DashTab) {
    setActiveTab(t);
    setEventosPanelOpen(false);
  }

  const tabPanelCompleto = activeTab === 'restaurante' || activeTab === 'social_listening';
  const esCanales = intraTab === 'canales';

  // Hospedaje reemplaza la tabla de leads en la tab reservas (si hay Airtable).
  const hospedajeActivo = activeTab === 'reservas' && !!hospedajeConfig.apiKey;

  let contenido: React.ReactNode;
  if (esCanales) {
    contenido = <SaludCanales />;
  } else if (activeTab === 'restaurante') {
    // Fase 8e/8f: <PanelRestaurante/> se monta cuando el módulo esté completo.
    contenido = (
      <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Módulo de restaurante en migración (fase 8e/8f).
      </div>
    );
  } else if (activeTab === 'social_listening') {
    contenido = <ResenasSocial />;
  } else if (eventosPanelOpen) {
    contenido = <PanelEventos onClose={() => setEventosPanelOpen(false)} />;
  } else {
    contenido = (
      <>
        {activeTab === 'eventos' && <CtaPipelineEventos onOpen={() => setEventosPanelOpen(true)} />}
        <div className="dashboard-grid">
          <TarjetasKpi
            fila="top"
            leads={filteredLeads}
            ventas={ventas}
            filtros={filtros}
            cdeSpendMap={esCde ? spendMap : undefined}
            onAbrirInversion={esCde ? () => setVentasOpen(true) : undefined}
          />
          <div className={`split-row-grid${esCde ? ' cde-2col' : ''}`} id="split-row-grid">
            <GraficaHistorica leads={filteredLeads} />
            {esCde ? (
              <PanelCde
                leads={filteredLeads}
                investOpen={ventasOpen}
                onCloseInvest={() => setVentasOpen(false)}
              />
            ) : hospedajeActivo ? (
              <PanelHospedaje />
            ) : (
              <TablaLeads leads={filteredLeads} totalSinFiltro={leads.length} />
            )}
          </div>
          {esCde && (
            <div style={{ marginTop: 24 }}>
              <TablaLeads
                leads={filteredLeads}
                totalSinFiltro={leads.length}
                onLeadClick={(lead) => setCdeLeadModal(lead)}
              />
            </div>
          )}
          <TarjetasKpi fila="bottom" leads={filteredLeads} ventas={ventas} filtros={filtros} cdeSpendMap={esCde ? spendMap : undefined} />
        </div>
      </>
    );
  }

  return (
    <DashboardShell
      session={session}
      activeTab={activeTab}
      onTabChange={cambiarTab}
      intraTab={intraTab}
      onIntraTabChange={setIntraTab}
      onToggleVentas={() => setVentasOpen((v) => !v)}
      ventasLabel={esCde ? 'Inversión publicidad' : 'Registrar ventas'}
      headerRowOculto={tabPanelCompleto || esCanales}
      headerControls={
        !tabPanelCompleto && !esCanales ? (
          <>
            <FiltroEtiquetaGlobal
              value={filtros.etiqueta}
              onChange={(etiqueta) => setFiltros((f) => ({ ...f, etiqueta }))}
            />
            <RangoFechas
              value={{ start: filtros.start, end: filtros.end }}
              onChange={(v) => setFiltros((f) => ({ ...f, start: v.start, end: v.end }))}
              labelInicial={rangoServidor ? 'Este mes' : 'Todo el tiempo'}
            />
          </>
        ) : undefined
      }
    >
      {contenido}

      {/* Overlay "Actualizando datos…" (CEFEMEX re-consulta por rango) */}
      {actualizando && (
        <div
          id="fetching-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
          }}
        >
          <div
            style={{
              background: 'var(--card-bg,#1e293b)',
              color: 'var(--text-primary,#e2e8f0)',
              padding: '16px 26px',
              borderRadius: 12,
              fontSize: '0.9rem',
              fontWeight: 600,
              boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
            }}
          >
            Actualizando datos…
          </div>
        </div>
      )}

      {/* Panel de ventas (no-CDE); en CDE el botón cash abre el cajón de inversión */}
      {!esCde && <VentasPanel open={ventasOpen} onClose={() => setVentasOpen(false)} />}

      {/* Modal de detalle de lead CDE (clic en fila de la tabla) */}
      {cdeLeadModal && <ModalLead lead={cdeLeadModal} onClose={() => setCdeLeadModal(null)} />}
    </DashboardShell>
  );
}
