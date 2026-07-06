'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession } from '@/lib/auth/session';
import { toggleTheme as toggleThemeGlobal, getTheme } from '@/lib/theme';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { SLUGS } from '@/lib/slugs';
import ChangePasswordModal from '@/components/layout/ChangePasswordModal';
import type { Session } from '@/types/session';

// Shell del dashboard principal — port del chrome de legacy/index.html:
// loader, sidebar (ventas/tema/contraseña/hub/logout), topbar con tabs de
// hotel, mini-barra intra (solo admin) y menú móvil. Las secciones (KPIs,
// charts, tabla, paneles) se montan como children por pestaña.

export type DashTab = 'eventos' | 'reservas' | 'daypass' | 'restaurante' | 'social_listening';
export type IntraTab = 'dashboard' | 'canales';

const TAB_META: { key: DashTab; icon: string; label: string }[] = [
  { key: 'eventos', icon: 'calendar-outline', label: 'Eventos' },
  { key: 'reservas', icon: 'bed-outline', label: 'Reservas' },
  { key: 'daypass', icon: 'sunny-outline', label: 'Day Pass' },
  { key: 'restaurante', icon: 'restaurant-outline', label: 'Restaurante' },
  { key: 'social_listening', icon: 'star-outline', label: 'Reputación' },
];

export default function DashboardShell({
  session,
  activeTab,
  onTabChange,
  intraTab,
  onIntraTabChange,
  onToggleVentas,
  ventasLabel = 'Registrar ventas',
  headerRowOculto = false,
  headerControls,
  children,
}: {
  session: Session;
  activeTab: DashTab;
  onTabChange: (t: DashTab) => void;
  intraTab: IntraTab;
  onIntraTabChange: (t: IntraTab) => void;
  onToggleVentas: () => void;
  /** CDE re-etiqueta el botón cash del sidebar como "Inversión publicidad". */
  ventasLabel?: string;
  /** Las tabs restaurante/social_listening ocultan el content-header-row. */
  headerRowOculto?: boolean;
  /** Controles del content-header (filtro etiqueta + selector de rango, fase 8c). */
  headerControls?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { config, clientType, rawConfig, cargando } = useClientConfig();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const [themeIcon, setThemeIcon] = useState('moon-outline');
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.classList.add('pg-dashboard');
    setThemeIcon(getTheme() === 'light' ? 'sunny-outline' : 'moon-outline');
    return () => document.documentElement.classList.remove('pg-dashboard');
  }, []);

  // Cerrar el sidebar al hacer click fuera (paridad).
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!sidebarOpen) return;
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) setSidebarOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [sidebarOpen]);

  function toggleTheme() {
    const next = toggleThemeGlobal();
    setThemeIcon(next === 'light' ? 'sunny-outline' : 'moon-outline');
    const bg = next === 'dark' ? '#0E0B2A' : '#EEEEF8';
    document.documentElement.style.background = bg;
    const mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute('content', bg);
  }

  function logout() {
    clearSession();
    router.replace('/login');
  }

  // Tabs de hotel: derivadas de hotel_services (unlocked|locked|hidden).
  const hotelServices = rawConfig?.hotel_services || {};
  const esHotel = clientType === 'hotel';
  const tabsVisibles = esHotel
    ? TAB_META.filter((t) => {
        const svc = hotelServices[t.key];
        return svc === 'unlocked' || svc === 'locked';
      })
    : [];

  const esAdmin = session.role === 'admin';
  const multiCliente = (session.clients || []).length > 1 || esAdmin;

  // Logo por theme (logo_url / logo_url_light)
  const logo = config?.clientLogo || null;

  const sidebarItems = [
    { icon: 'cash-outline', label: ventasLabel, onClick: onToggleVentas },
    { icon: themeIcon, label: 'Cambiar tema', onClick: toggleTheme },
    { icon: 'key-outline', label: 'Cambiar contraseña', onClick: () => setShowChangePass(true) },
    ...(multiCliente
      ? [{ icon: 'apps-outline', label: 'Ver otro Dashboard', onClick: () => router.push('/hub') }]
      : []),
    { icon: 'log-out-outline', label: 'Cerrar sesión', onClick: logout, danger: true },
  ];

  return (
    <div className="app-container full-width-layout" id="app-wrapper">
      {/* Loader mientras carga la config (port del hero loader). */}
      {cargando && (
        <div id="dashboard-loader">
          <div className="ld-video-overlay"></div>
          <div className="ld-hero">
            <h1 className="ld-heading">
              Hola, <span id="ld-user-name">{session.name || ''}</span>
            </h1>
            <p className="ld-subtitle" style={{ animationDelay: '0.55s' }}>
              Estamos preparando la información
              <br />
              para que la puedas consultar.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/TechonologyByIntra_Claro.png" className="ld-logo-intra" alt="Intra" />
          </div>
          <div className="ld-bar-track">
            <div className="ld-bar-fill" id="loader-bar" style={{ width: '55%' }}></div>
          </div>
        </div>
      )}

      {/* Sidebar colapsable */}
      <aside
        className={`sidebar sidebar-collapsed${sidebarOpen ? ' sidebar-open' : ''}`}
        id="main-sidebar"
        ref={sidebarRef}
      >
        <button
          className="sidebar-hamburger"
          id="sidebar-hamburger-btn"
          onClick={() => setSidebarOpen((v) => !v)}
          title="Menú"
        >
          <span className="sidebar-ham-lines">
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span className="sidebar-ham-label">Menú</span>
        </button>
        <div className="sidebar-nav-icons">
          {sidebarItems.map((it) => (
            <button key={it.label} onClick={it.onClick} className="sidebar-icon-btn">
              <ion-icon name={it.icon}></ion-icon>
              <span className="sidebar-btn-label">{it.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Column */}
      <div className="main-column">
        <header className="main-header">
          <div className="header-left">
            <div className="client-branding">
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img id="client-logo" src={logo} alt="Client Logo" className="client-logo-img" />
              )}
              <div className="welcome-area">
                <span className="welcome-label">Bienvenido,</span>
                <h2 className="welcome-name" id="welcome-name">
                  {session.name || 'Administrador'}
                </h2>
                <h2 id="client-name-display" className="client-name-header">
                  {config?.clientName || 'Cargando...'}
                </h2>
              </div>
            </div>
          </div>

          {/* Tabs de hotel (solo client_type hotel) */}
          {esHotel && tabsVisibles.length > 0 && (
            <div id="hotel-tabs" className="dashboard-tabs">
              <div className="dash-tabs-segment">
                {tabsVisibles.map((t) => (
                  <button
                    key={t.key}
                    className={`dash-tab${activeTab === t.key ? ' active' : ''}`}
                    data-tab={t.key}
                    onClick={() => onTabChange(t.key)}
                  >
                    <ion-icon name={t.icon}></ion-icon>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="header-right">
            <div className="desktop-actions">
              <button onClick={toggleTheme} className="theme-pill-btn" title="Cambiar tema">
                <div className="tpb-track">
                  <span className="tpb-star" style={{ ['--d' as any]: '0s', top: 7, left: 9, fontSize: 9 }}>✦</span>
                  <span className="tpb-star" style={{ ['--d' as any]: '.6s', top: 25, left: 16, fontSize: 6 }}>✦</span>
                  <span className="tpb-star" style={{ ['--d' as any]: '.3s', top: 9, left: 28, fontSize: 4 }}>·</span>
                  <span className="tpb-star" style={{ ['--d' as any]: '1.1s', top: 26, left: 38, fontSize: 7 }}>✦</span>
                  <span className="tpb-star" style={{ ['--d' as any]: '.8s', top: 15, left: 22, fontSize: 3 }}>·</span>
                  <span className="tpb-star" style={{ ['--d' as any]: '.4s', top: 7, left: 46, fontSize: 5 }}>✦</span>
                  <span className="tpb-star" style={{ ['--d' as any]: '.9s', top: 24, left: 54, fontSize: 4 }}>·</span>
                  <span className="tpb-star" style={{ ['--d' as any]: '.2s', top: 10, left: 60, fontSize: 8 }}>✦</span>
                  <span className="tpb-star" style={{ ['--d' as any]: '1.3s', top: 27, left: 68, fontSize: 5 }}>✦</span>
                  <div className="tpb-cloud c1"></div>
                  <div className="tpb-cloud c2"></div>
                  <div className="tpb-thumb">
                    <div className="tpb-crater" style={{ width: 7, height: 7, top: 7, left: 17 }}></div>
                    <div className="tpb-crater" style={{ width: 4, height: 4, top: 18, left: 10 }}></div>
                    <div className="tpb-crater" style={{ width: 3, height: 3, top: 9, left: 10 }}></div>
                  </div>
                </div>
              </button>
              <div className="intra-branding">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/TechonologyByIntra_Claro.png" alt="Intra" className="intra-logo-img theme-logo-dark" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/TechonologyByIntra_Oscuro.png" alt="Intra" className="intra-logo-img theme-logo-light" />
              </div>
            </div>
            <button
              id="mobile-menu-btn"
              className="logout-btn"
              onClick={() => setMobileOpen((v) => !v)}
              title="Menú"
            >
              <ion-icon name="ellipsis-vertical-outline"></ion-icon>
            </button>
          </div>
        </header>

        <main className="main-content">
          {/* Mini-barra Intra (solo admin) — Dashboard / Salud de Canales */}
          {esAdmin && (
            <div id="intra-tabs" className="intra-tabs">
              <button
                className={`intra-tab${intraTab === 'dashboard' ? ' active' : ''}`}
                data-intra="dashboard"
                onClick={() => onIntraTabChange('dashboard')}
              >
                <ion-icon name="grid-outline"></ion-icon>
                <span>Dashboard</span>
              </button>
              <button
                className={`intra-tab${intraTab === 'canales' ? ' active' : ''}`}
                data-intra="canales"
                onClick={() => onIntraTabChange('canales')}
              >
                <ion-icon name="pulse-outline"></ion-icon>
                <span>Salud de Canales</span>
                <span className="intra-tab-badge">Intra</span>
              </button>
            </div>
          )}

          <div className={`content-header-row${headerRowOculto ? ' hidden' : ''}`}>
            <div className="header-title-area">
              <div className="live-label">
                <div className="live-dot"></div>
                <span>Última actualización: Ahora mismo</span>
              </div>
              <h1 className="section-headline">
                Dashboard <ion-icon name="globe-outline" class="globe-icon"></ion-icon>
              </h1>
            </div>
            <div
              className="header-controls"
              style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
            >
              {headerControls}
            </div>
          </div>

          {children}
        </main>
      </div>

      {/* Menú móvil (bottom sheet) */}
      <div id="mobile-menu-backdrop" className={mobileOpen ? 'open' : ''} onClick={() => setMobileOpen(false)}></div>
      <div id="mobile-menu-sheet" className={mobileOpen ? 'open' : ''}>
        <div className="mm-handle"></div>
        <div className="mm-items">
          {sidebarItems.map((it) => (
            <span key={it.label} style={{ display: 'contents' }}>
              {'danger' in it && it.danger && <div className="mm-divider"></div>}
              <button
                className={`mm-item${'danger' in it && it.danger ? ' mm-danger' : ''}`}
                onClick={() => {
                  it.onClick();
                  setMobileOpen(false);
                }}
              >
                <div className="mm-icon">
                  <ion-icon name={it.icon}></ion-icon>
                </div>
                <span>{it.label}</span>
              </button>
            </span>
          ))}
        </div>
      </div>

      <ChangePasswordModal open={showChangePass} onClose={() => setShowChangePass(false)} />
    </div>
  );
}

export function esLogicSystems(clientId: string | null): boolean {
  return !!clientId && clientId.toLowerCase() === SLUGS.LOGIC_SYSTEMS;
}
