'use client';

import '@/styles/hub.css';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminSupabase } from '@/lib/supabase/adminClient';
import { clearSession } from '@/lib/auth/session';
import AuthGuard from '@/components/layout/AuthGuard';
import ChangePasswordModal from '@/components/layout/ChangePasswordModal';
import type { Session } from '@/types/session';

// Port del selector de clientes de legacy/hub.html (script inline loadHub):
// admin ve todos los entornos (session.clients ya trae todos desde el login),
// partner solo los suyos. Cards con entrada animada + tilt 3D.

interface ClienteCard {
  id_slug: string;
  name: string;
  logo_url: string | null;
  theme_primary: string | null;
}

function hexToRgb(hex: string | null | undefined): string {
  if (hex && hex.match(/^#[0-9a-fA-F]{6}$/)) {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
  }
  return '117, 81, 255';
}

export default function HubClient() {
  return (
    <AuthGuard>
      {(session) => <HubContent session={session} />}
    </AuthGuard>
  );
}

function HubContent({ session }: { session: Session }) {
  const router = useRouter();
  const [clients, setClients] = useState<ClienteCard[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [showChangePass, setShowChangePass] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add('pg-hub');
    return () => document.documentElement.classList.remove('pg-hub');
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await getAdminSupabase()
        .from('clients_config')
        .select('id_slug, name, logo_url, theme_primary')
        .in('id_slug', session.clients);
      if (error || !data || data.length === 0) {
        setLoadError(true);
        setClients([]);
        return;
      }
      setClients(data as ClienteCard[]);
    })();
  }, [session]);

  // Entrada animada de las cards (60 + i*80 ms, igual que el legacy).
  useEffect(() => {
    if (!clients?.length || !gridRef.current) return;
    const cards = gridRef.current.querySelectorAll('.client-card');
    const timers: ReturnType<typeof setTimeout>[] = [];
    cards.forEach((card, i) => {
      timers.push(setTimeout(() => card.classList.add('card-visible'), 60 + i * 80));
    });
    return () => timers.forEach(clearTimeout);
  }, [clients]);

  function tiltMove(e: React.MouseEvent<HTMLElement>) {
    const card = e.currentTarget;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transition = 'opacity 0.5s, border-color 0.3s, box-shadow 0.3s';
    card.style.transform = `translateY(-5px) perspective(600px) rotateX(${-y * 9}deg) rotateY(${x * 9}deg)`;
  }
  function tiltLeave(e: React.MouseEvent<HTMLElement>) {
    e.currentTarget.style.transition = '';
    e.currentTarget.style.transform = '';
  }

  function logout() {
    clearSession();
    router.replace('/login');
  }

  const userName = session.name || session.email;
  const q = search.toLowerCase().trim();

  return (
    <>
      {/* Panel Izquierdo */}
      <aside className="left-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/intra-logo.png" alt="Intra" className="brand-logo" />

        <div className="title-container">
          <h1>
            Sistemas
            <br />
            Inteligentes.
          </h1>
          <p>Accede a resultados en tiempo real.</p>
        </div>

        <footer style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', lineHeight: 1.5 }}>
          &copy; 2026 Dashboard Partners.
          <br />
          Todos los derechos reservados.
        </footer>
      </aside>

      {/* Panel Derecho */}
      <main className="right-panel">
        <div className="user-greeting">
          <div className="avatar" id="user-avatar">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="greeting-text">
            <h2>
              Hola, <span id="hub-user-name">{userName}</span>
            </h2>
            <p>Selecciona tu entorno de trabajo</p>
          </div>
          <div className="session-actions">
            {session.role === 'admin' && (
              <a id="admin-panel-btn" href="/admin" className="sess-btn" style={{ display: 'inline-flex' }} title="Base de Datos">
                <ion-icon name="server-outline"></ion-icon>
              </a>
            )}
            <button className="sess-btn" onClick={() => setShowChangePass(true)} title="Cambiar contraseña">
              <ion-icon name="key-outline"></ion-icon>
            </button>
            <button className="sess-btn danger" onClick={logout} title="Cerrar sesión">
              <ion-icon name="power-outline"></ion-icon>
            </button>
          </div>
        </div>

        <div id="admin-badge-area">
          <div className="env-badge">
            {session.role === 'admin' ? (
              <>
                <ion-icon name="shield-half-outline"></ion-icon> Acceso Total (Admin)
              </>
            ) : (
              <>
                <ion-icon name="cube-outline"></ion-icon> Propiedades Disponibles
              </>
            )}
          </div>
        </div>

        <div className="hub-search-wrap">
          <ion-icon name="search-outline"></ion-icon>
          <input
            type="text"
            id="hub-search"
            placeholder="Buscar cliente..."
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div id="clients-container" className="grid-container" ref={gridRef}>
          {clients === null ? (
            <div className="loading-wrap">
              <ion-icon name="scan-outline" class="spin"></ion-icon>
              <p>Estableciendo conexión segura...</p>
            </div>
          ) : loadError || clients.length === 0 ? (
            <div className="loading-wrap" style={{ color: '#ff5555' }}>
              <ion-icon name="warning-outline" style={{ fontSize: '3rem', marginBottom: '1rem' }}></ion-icon>
              <p>No tienes acceso a ningún entorno.</p>
            </div>
          ) : (
            clients.map((client) => {
              const visible = !q || client.name.toLowerCase().includes(q) || client.id_slug.toLowerCase().includes(q);
              return (
                <a
                  key={client.id_slug}
                  className="client-card"
                  href={`/?client=${client.id_slug}`}
                  style={{ ['--brand-rgb' as any]: hexToRgb(client.theme_primary), display: visible ? undefined : 'none' }}
                  onMouseMove={tiltMove}
                  onMouseLeave={tiltLeave}
                >
                  <div className="card-logo-stage">
                    {client.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={client.logo_url} alt={client.name} />
                    ) : (
                      <span className="card-letter">{(client.name || '?').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="card-info">
                    <span className="card-name">{client.name}</span>
                  </div>
                  <div className="card-arrow">
                    <ion-icon name="arrow-forward-outline"></ion-icon>
                  </div>
                </a>
              );
            })
          )}
        </div>
      </main>

      <ChangePasswordModal open={showChangePass} onClose={() => setShowChangePass(false)} />
    </>
  );
}
