'use client';

import '@/styles/theme-intra.css';
import '@/styles/style.css';
import '@/styles/director.css';
import '@phosphor-icons/web/regular';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getAdminSupabase } from '@/lib/supabase/adminClient';
import { getSession, isSessionExpired, clearSession } from '@/lib/auth/session';
import AppChrome from '@/components/layout/AppChrome';
import PanelDirector from '@/components/director/PanelDirector';
import { SLUG, demoLeads, type Lead } from '@/components/director/logica';

// Página EXCLUSIVA de logic-systems (port de director.html + director.js init).
// Con otro cliente → dashboard estándar. Tema claro FIJO (sin toggle).

export default function DirectorClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [welcomeName, setWelcomeName] = useState('Administrador');

  // Guards: cliente distinto → dashboard estándar; sin sesión/acceso → login/hub.
  useEffect(() => {
    const client = searchParams.get('client');
    if (client && client.toLowerCase() !== SLUG) {
      router.replace(`/?client=${encodeURIComponent(client)}`);
      return;
    }
    const session = getSession();
    if (!session || isSessionExpired(session)) {
      if (session) clearSession();
      router.replace('/login');
      return;
    }
    if (!(session.role === 'admin' || (session.clients || []).includes(SLUG))) {
      router.replace('/hub');
      return;
    }
    setWelcomeName(session.name || 'Administrador');
    setReady(true);
  }, [router, searchParams]);

  // Tema claro fijo (este panel no tiene modo oscuro); al salir se restaura
  // el theme guardado del resto del app.
  useEffect(() => {
    document.documentElement.classList.add('pg-director');
    const previo = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'light');
    return () => {
      document.documentElement.classList.remove('pg-director');
      let t = previo;
      try {
        t = localStorage.getItem('intra-theme') || previo;
      } catch {
        /* sin storage */
      }
      if (t) document.documentElement.setAttribute('data-theme', t);
    };
  }, []);

  const configQ = useQuery({
    queryKey: ['clients_config', SLUG],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await getAdminSupabase()
        .from('clients_config')
        .select('*')
        .eq('id_slug', SLUG)
        .single();
      if (error || !data) throw new Error('No se encontró la config de "' + SLUG + '" en clients_config.');
      return data;
    },
  });

  // Modo demo (datos ficticios) SOLO si se fuerza con ?demo=1 en la URL. Por defecto
  // el panel usa datos reales de Supabase; el flag histórico webhook_url='DEMO' se ignora.
  const demoMode = searchParams.get('demo') !== null;

  const leadsQ = useQuery({
    queryKey: ['director-leads', SLUG, demoMode],
    enabled: !!configQ.data,
    queryFn: async (): Promise<{ leads: Lead[]; aviso: string | null }> => {
      if (demoMode) return { leads: demoLeads(), aviso: null };

      // Fuente de datos: la Supabase per-cliente de Logic Systems, vía /api/leads/list
      // (endpoint server-side que lee con la SERVICE key y normaliza los campos).
      const res = await fetch('/api/leads/list?client=' + encodeURIComponent(SLUG));

      // Sin configurar (faltan env vars) o error de lectura: no es fatal — panel vacío
      // con la guía que devuelve el endpoint.
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}) as any);
        return { leads: [], aviso: msg.error || 'El origen de leads respondió ' + res.status };
      }

      const raw = await res.json();
      const leads = Array.isArray(raw) ? raw : raw.leads || raw.data || [];
      return { leads, aviso: null };
    },
  });

  if (!ready) return null;

  const cargando = configQ.isLoading || leadsQ.isLoading;
  const error = configQ.error || leadsQ.error;
  const aviso = leadsQ.data?.aviso || null;
  const statusMsg = cargando
    ? 'Cargando datos…'
    : error
      ? 'Error al cargar el panel: ' + ((error as Error).message || error)
      : aviso;

  return (
    <>
      {statusMsg && (
        <div id="dg-status" className={error || aviso ? 'err' : ''}>
          {statusMsg}
        </div>
      )}
      <AppChrome
        clientName={configQ.data?.name || 'Logic Systems'}
        logoUrl={configQ.data?.logo_url || null}
        welcomeName={welcomeName}
      >
        <PanelDirector leads={leadsQ.data?.leads || []} />
      </AppChrome>
    </>
  );
}
