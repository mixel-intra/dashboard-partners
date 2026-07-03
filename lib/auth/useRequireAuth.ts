'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Session } from '@/types/session';
import { clearSession, getSession, isSessionExpired } from './session';

// Replica de checkAuth() de legacy/src/auth.js, adaptada a las rutas nuevas:
//   login.html → /login · hub.html → /hub · index.html → / · admin guard → /admin
//
// IMPORTANTE: la sesión vive SOLO en localStorage, así que este guard es
// client-side por diseño. El middleware de Next NO puede leer localStorage —
// no intentes "arreglarlo" moviéndolo a middleware (rompería el login).

// Páginas "de cliente": validan acceso al slug de ?client= (igual que el legacy
// con index/pipeline).
const CLIENT_PAGES = ['/', '/pipeline'];

export type AuthState =
  | { status: 'checking'; session: null }
  | { status: 'ok'; session: Session }
  | { status: 'redirect'; session: null };

export function useRequireAuth(): AuthState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<AuthState>({ status: 'checking', session: null });

  useEffect(() => {
    const session = getSession();
    const clientId = searchParams.get('client');

    if (!session) {
      if (pathname !== '/login') router.replace('/login');
      setState({ status: 'redirect', session: null });
      return;
    }

    if (isSessionExpired(session)) {
      clearSession();
      router.replace('/login');
      setState({ status: 'redirect', session: null });
      return;
    }

    // Guard de /admin (equivalente a la verificación automática de auth.js):
    if (pathname === '/admin' && session.role !== 'admin') {
      router.replace('/hub');
      setState({ status: 'redirect', session: null });
      return;
    }

    if (CLIENT_PAGES.includes(pathname) && clientId) {
      const hasAccess =
        session.role === 'admin' || (session.clients && session.clients.includes(clientId));
      if (!hasAccess) {
        router.replace('/hub');
        setState({ status: 'redirect', session: null });
        return;
      }
    }

    if (CLIENT_PAGES.includes(pathname) && !clientId) {
      if (session.clients && session.clients.length === 1) {
        router.replace(`/?client=${session.clients[0]}`);
      } else {
        router.replace('/hub');
      }
      setState({ status: 'redirect', session: null });
      return;
    }

    setState({ status: 'ok', session });
    // searchParams es estable por render; dependemos del string para re-evaluar
    // si cambia ?client= en navegación client-side.
  }, [pathname, searchParams, router]);

  return state;
}

export function logout(router: { replace: (url: string) => void }) {
  clearSession();
  router.replace('/login');
}
