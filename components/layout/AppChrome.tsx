'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession } from '@/lib/auth/session';
import ChangePasswordModal from './ChangePasswordModal';

// Chrome de layout compartido (sidebar colapsable + topbar + menú móvil).
// Port del markup duplicado en legacy/director.html e index.html; los estilos
// vienen de styles/theme-intra.css + styles/style.css (clases .sidebar,
// .main-header, #mobile-menu-sheet, …).

export interface ChromeMenuItem {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export default function AppChrome({
  clientName,
  logoUrl,
  welcomeName,
  extraItems = [],
  headerExtra,
  children,
}: {
  clientName: string;
  logoUrl?: string | null;
  welcomeName: string;
  /** Items adicionales del sidebar/menú móvil, antes de los 3 estándar. */
  extraItems?: ChromeMenuItem[];
  /** Contenido extra en el header (a la izquierda del branding intra). */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Click fuera del sidebar lo cierra (paridad con el inline de director.html).
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!sidebarOpen) return;
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [sidebarOpen]);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  const items: ChromeMenuItem[] = [
    ...extraItems,
    { icon: 'key-outline', label: 'Cambiar contraseña', onClick: () => setShowChangePass(true) },
    { icon: 'apps-outline', label: 'Ver otro Dashboard', onClick: () => router.push('/hub') },
    { icon: 'log-out-outline', label: 'Cerrar sesión', onClick: logout, danger: true },
  ];

  return (
    <div className="app-container full-width-layout" id="app-wrapper">
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
          {items.map((it) => (
            <button key={it.label} onClick={it.onClick} className="sidebar-icon-btn">
              <ion-icon name={it.icon}></ion-icon>
              <span className="sidebar-btn-label">{it.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Columna principal */}
      <div className="main-column">
        <header className="main-header">
          <div className="header-left">
            <div className="client-branding">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img id="client-logo" src={logoUrl} alt="Client Logo" className="client-logo-img" />
              ) : null}
              <div className="welcome-area">
                <span className="welcome-label">Bienvenido,</span>
                <h2 className="welcome-name" id="welcome-name">
                  {welcomeName}
                </h2>
                <h2 id="client-name-display" className="client-name-header">
                  {clientName}
                </h2>
              </div>
            </div>
          </div>
          <div className="header-right">
            <div className="desktop-actions">
              {headerExtra}
              <div className="intra-branding">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/TechonologyByIntra_Claro.png"
                  alt="Intra"
                  className="intra-logo-img theme-logo-dark"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/TechonologyByIntra_Oscuro.png"
                  alt="Intra"
                  className="intra-logo-img theme-logo-light"
                />
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

        <main className="main-content" style={{ padding: 0 }}>
          {children}
        </main>
      </div>

      {/* Menú móvil (bottom sheet), mismas opciones que el sidebar */}
      <div
        id="mobile-menu-backdrop"
        className={mobileOpen ? 'open' : ''}
        onClick={() => setMobileOpen(false)}
      ></div>
      <div id="mobile-menu-sheet" className={mobileOpen ? 'open' : ''}>
        <div className="mm-handle"></div>
        <div className="mm-items">
          {items.map((it, i) => (
            <span key={it.label} style={{ display: 'contents' }}>
              {it.danger && i > 0 && <div className="mm-divider"></div>}
              <button
                className={`mm-item${it.danger ? ' mm-danger' : ''}`}
                onClick={() => {
                  it.onClick();
                  setMobileOpen(false);
                }}
              >
                <div
                  className="mm-icon"
                  style={
                    it.danger
                      ? { background: 'rgba(239,68,68,0.1)' }
                      : it.icon === 'apps-outline'
                        ? { background: 'rgba(117,81,255,0.1)' }
                        : undefined
                  }
                >
                  <ion-icon
                    name={it.icon}
                    style={
                      it.danger
                        ? { color: '#ef4444' }
                        : it.icon === 'apps-outline'
                          ? { color: 'rgba(117,81,255,0.8)' }
                          : undefined
                    }
                  ></ion-icon>
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
