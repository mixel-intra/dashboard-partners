'use client';

import '@/styles/theme-intra.css';
import '@/styles/style.css';
import '@/styles/dashboard.css';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/layout/AuthGuard';
import { ToastProvider } from '@/components/ui/Toast';
import { ClientConfigProvider, useClientConfig } from '@/lib/config/ClientConfigProvider';
import DashboardShell, { esLogicSystems, type DashTab, type IntraTab } from '@/components/dashboard/DashboardShell';
import type { Session } from '@/types/session';

// Dashboard principal — port de index.html + dashboard.js.
// Fase 8a: shell + config + chrome. Las secciones (KPIs, charts, tabla,
// restaurante, hospedaje, eventos, reseñas, kommo, CDE, móvil) se montan
// en fases 8b-8j.

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
  const { clientType, rawConfig } = useClientConfig();
  const [activeTab, setActiveTab] = useState<DashTab>('eventos');
  const [intraTab, setIntraTab] = useState<IntraTab>('dashboard');
  const [ventasOpen, setVentasOpen] = useState(false);

  // Primera tab unlocked = activa (port de initHotelTabs).
  useEffect(() => {
    if (clientType !== 'hotel' || !rawConfig?.hotel_services) return;
    const orden: DashTab[] = ['eventos', 'reservas', 'daypass', 'restaurante', 'social_listening'];
    const primera = orden.find((k) => rawConfig.hotel_services[k] === 'unlocked');
    if (primera) setActiveTab(primera);
  }, [clientType, rawConfig]);

  return (
    <DashboardShell
      session={session}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      intraTab={intraTab}
      onIntraTabChange={setIntraTab}
      onToggleVentas={() => setVentasOpen((v) => !v)}
    >
      {/* ── Fase 8b-8j: aquí se montan las secciones por tab ── */}
      <div className="dashboard-grid">
        <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Sección en migración (fases 8b–8j). Tab activa: {activeTab} · Intra: {intraTab} · Ventas:{' '}
          {ventasOpen ? 'abierto' : 'cerrado'}
        </div>
      </div>
    </DashboardShell>
  );
}
