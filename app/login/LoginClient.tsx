'use client';

import '@/styles/login.css';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminSupabase } from '@/lib/supabase/adminClient';
import { clearSession, getSession, saveSession, SESSION_DURATION } from '@/lib/auth/session';
import ChangePasswordModal from '@/components/layout/ChangePasswordModal';

// Port de legacy/login.html (el login vive INLINE ahí, no en auth.js):
// dos paneles — form de login y selector de entornos (mini-hub) — con video
// de fondo en ping-pong. Misma query plaintext contra user_profiles (paridad;
// hardening = follow-up documentado).

interface ClienteCard {
  id_slug: string;
  name: string;
  logo_url: string | null;
  theme_primary: string | null;
}

function hexToRgb(hex: string | null | undefined): string {
  if (!hex?.match(/^#[0-9a-fA-F]{6}$/)) return '117, 81, 255';
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
}

type Panel = 'form' | 'exiting' | 'dash';

export default function LoginClient() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [panel, setPanel] = useState<Panel>('form');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [clients, setClients] = useState<ClienteCard[]>([]);
  const [userLabel, setUserLabel] = useState({ name: '', isAdmin: false });
  const [singleClient, setSingleClient] = useState<ClienteCard | null>(null);
  const [search, setSearch] = useState('');
  const [showChangePass, setShowChangePass] = useState(false);

  // Clase de scope para el CSS de la página (ver styles/login.css).
  useEffect(() => {
    document.documentElement.classList.add('pg-login');
    return () => document.documentElement.classList.remove('pg-login');
  }, []);

  // Video ping-pong: forward y luego reversa manual (igual que el legacy).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let playingForward = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const reverseStep = () => {
      if (playingForward) return;
      video.currentTime -= 1 / 30;
      if (video.currentTime <= 0.05) {
        video.currentTime = 0;
        playingForward = true;
        video.play();
        return;
      }
      timer = setTimeout(reverseStep, 1000 / 30);
    };
    const onEnded = () => {
      playingForward = false;
      video.pause();
      reverseStep();
    };
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('ended', onEnded);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Sesión existente (<24h) → saltar directo al selector de entornos.
  useEffect(() => {
    const existing = getSession();
    if (existing && Date.now() - existing.timestamp < SESSION_DURATION) {
      void showDashboards(existing.name || existing.email || 'Usuario', existing.role === 'admin', null, existing.clients);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animación escalonada de cards al entrar al panel dash (paridad con el legacy).
  useEffect(() => {
    if (panel !== 'dash' || !gridRef.current) return;
    const cards = gridRef.current.querySelectorAll('.client-card');
    const timers: ReturnType<typeof setTimeout>[] = [];
    cards.forEach((card, i) => {
      timers.push(setTimeout(() => card.classList.add('card-visible'), 80 + i * 110));
    });
    return () => timers.forEach(clearTimeout);
  }, [panel, clients, singleClient]);

  async function showDashboards(
    displayName: string,
    isAdmin: boolean,
    loadedClients: ClienteCard[] | null,
    slugs?: string[]
  ) {
    let list = loadedClients;
    if (!list) {
      if (!slugs || slugs.length === 0) {
        clearSession();
        return;
      }
      const { data } = await getAdminSupabase()
        .from('clients_config')
        .select('id_slug, name, logo_url, theme_primary')
        .in('id_slug', slugs);
      list = (data as ClienteCard[]) || [];
    }
    if (list.length === 0) {
      clearSession();
      return;
    }

    setUserLabel({ name: displayName, isAdmin });

    if (list.length === 1) {
      setSingleClient(list[0]);
      transition();
      setTimeout(() => {
        router.push(`/?client=${list[0].id_slug}`);
      }, 1400 + 350);
      return;
    }

    setClients(list);
    transition();
  }

  function transition() {
    setPanel('exiting');
    setTimeout(() => setPanel('dash'), 350);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem('username') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value.trim();

    setVerifying(true);
    setError(null);

    try {
      const supabase = getAdminSupabase();
      const { data: user, error: userError } = await supabase
        .from('user_profiles')
        .select('id, email, name, role, is_active')
        .eq('email', email)
        .eq('password', password)
        .eq('is_active', true)
        .single();

      if (userError || !user) throw new Error('Usuario o contraseña incorrectos');

      let clientRows: ClienteCard[] = [];
      if (user.role === 'admin') {
        const { data } = await supabase
          .from('clients_config')
          .select('id_slug, name, logo_url, theme_primary');
        clientRows = (data as ClienteCard[]) || [];
      } else {
        const { data: access } = await supabase
          .from('user_client_access')
          .select('client_slug')
          .eq('user_id', user.id);
        const slugs = (access || []).map((a: any) => a.client_slug);
        if (slugs.length > 0) {
          const { data } = await supabase
            .from('clients_config')
            .select('id_slug, name, logo_url, theme_primary')
            .in('id_slug', slugs);
          clientRows = (data as ClienteCard[]) || [];
        }
      }

      if (clientRows.length === 0) throw new Error('Sin acceso a ningún entorno');

      saveSession({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        clients: clientRows.map((c) => c.id_slug),
      });

      await showDashboards(user.name || user.email || 'Usuario', user.role === 'admin', clientRows);
    } catch (err: any) {
      setError(err.message || 'Error al ingresar');
      setVerifying(false);
    }
  }

  function doLogout() {
    clearSession();
    window.location.reload();
  }

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

  const q = search.toLowerCase().trim();
  const visibleClients = q
    ? clients.filter(
        (c) => c.name.toLowerCase().includes(q) || c.id_slug.toLowerCase().includes(q)
      )
    : clients;

  const cardLogo = (c: ClienteCard, letterClass?: string) =>
    c.logo_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={c.logo_url} alt={c.name} />
    ) : (
      <span className={letterClass}>{c.name.charAt(0).toUpperCase()}</span>
    );

  return (
    <>
      {/* Full-screen video background (ping-pong) */}
      <video className="video-bg" autoPlay muted playsInline id="bg-video" ref={videoRef}>
        <source src="/assets/cosmic.mp4" type="video/mp4" />
      </video>
      <div className="video-overlay"></div>

      <div className="login-wrapper">
        {/* ======== PASO 1: Login Form ======== */}
        <div
          id="form-panel"
          className={`glass-card-wrapper${panel === 'exiting' ? ' panel-exit' : ''}${panel === 'dash' ? ' hidden' : ''}`}
        >
          <div className="neon-border"></div>
          <div className="glass-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/intra-logo-cropped.png"
              alt="Intra"
              style={{ height: 36, marginBottom: '1.2rem', display: 'block' }}
            />
            <h2 className="card-title">Iniciar sesión</h2>
            <p className="card-subtitle">Ingresa tus credenciales para acceder a tu panel de partner.</p>

            <div id="error-box" className="error-box" style={{ display: error ? 'block' : 'none' }}>
              {error}
            </div>

            <form id="login-form" autoComplete="off" onSubmit={handleSubmit}>
              <div className="input-group">
                <ion-icon name="mail-outline"></ion-icon>
                <div className="input-label-wrap">
                  <span className="input-label">Tu correo</span>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="nombre@empresa.com"
                    autoComplete="username"
                    name="username"
                    id="username"
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <ion-icon name="lock-closed-outline"></ion-icon>
                <div className="input-label-wrap">
                  <span className="input-label">Contraseña</span>
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input-field"
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    name="password"
                    id="password"
                    required
                  />
                </div>
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label="Mostrar contraseña"
                >
                  <ion-icon name={showPw ? 'eye-off-outline' : 'eye-outline'}></ion-icon>
                </button>
              </div>

              <div className="actions-row">
                <label className="keep-signed">
                  <input type="checkbox" id="keep-signed" /> Mantener sesión
                </label>
                <button type="submit" className="btn-signin" id="login-btn" disabled={verifying}>
                  {verifying ? 'Verificando...' : 'Entrar'}
                </button>
              </div>
            </form>

            <a href="#" className="forgot-link">
              ¿Olvidaste tu contraseña? Contacta al administrador.
            </a>
          </div>
        </div>

        {/* ======== PASO 2: Dashboard Selection ======== */}
        <div
          id="dash-panel"
          className={`dash-glass-wrapper${panel === 'dash' ? ' panel-enter' : ' hidden'}`}
        >
          <div className="neon-border"></div>
          <div className="dash-glass-card">
            <div className="user-greeting">
              <div className="user-avatar" id="user-avatar">
                {(userLabel.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="greeting-text">
                <h2>
                  Hola, <span id="user-name">{userLabel.name}</span>
                </h2>
                <p>Selecciona tu entorno de trabajo</p>
              </div>
              <div className="session-actions">
                {userLabel.isAdmin && (
                  <a id="admin-btn" href="/admin" className="sess-btn" title="Base de Datos">
                    <ion-icon name="server-outline"></ion-icon>
                  </a>
                )}
                <button className="sess-btn" onClick={() => setShowChangePass(true)} title="Cambiar contraseña">
                  <ion-icon name="key-outline"></ion-icon>
                </button>
                <button className="sess-btn danger" onClick={doLogout} title="Cerrar sesión">
                  <ion-icon name="power-outline"></ion-icon>
                </button>
              </div>
            </div>

            {!singleClient && (
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
            )}

            <div id="clients-grid" className="clients-grid" ref={gridRef}>
              {singleClient ? (
                <div
                  className="client-card"
                  id="single-card"
                  style={{ ['--brand-rgb' as any]: hexToRgb(singleClient.theme_primary), cursor: 'default' }}
                >
                  <div className="card-logo-stage">{cardLogo(singleClient)}</div>
                  <div className="card-info">
                    <span className="card-name">{singleClient.name}</span>
                    <span className="card-slug">Accediendo...</span>
                  </div>
                  <div className="card-arrow spinning">
                    <ion-icon name="sync-outline"></ion-icon>
                  </div>
                </div>
              ) : (
                visibleClients.map((c) => (
                  <a
                    key={c.id_slug}
                    className="client-card"
                    href={`/?client=${c.id_slug}`}
                    style={{ ['--brand-rgb' as any]: hexToRgb(c.theme_primary) }}
                    onMouseMove={tiltMove}
                    onMouseLeave={tiltLeave}
                  >
                    <div className="card-logo-stage">{cardLogo(c, 'card-letter')}</div>
                    <div className="card-info">
                      <span className="card-name">{c.name}</span>
                    </div>
                    <div className="card-arrow">
                      <ion-icon name="arrow-forward-outline"></ion-icon>
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>

        <p className="footer-text" id="footer-text">
          &copy; 2026 Dashboard Partners. Todos los derechos reservados.
        </p>
      </div>

      <ChangePasswordModal open={showChangePass} onClose={() => setShowChangePass(false)} />
    </>
  );
}
