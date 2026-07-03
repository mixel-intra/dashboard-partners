import type { Session } from '@/types/session';

// Gestión de sesión — port 1:1 de legacy/src/auth.js.
// MISMO key y shape en localStorage: las sesiones existentes sobreviven el cutover.

const KEY = 'intra_session_v2';
export const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24h

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(userData: Omit<Session, 'timestamp'>) {
  localStorage.setItem(KEY, JSON.stringify({ ...userData, timestamp: Date.now() }));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export function isSessionExpired(session: Session): boolean {
  return Date.now() - session.timestamp > SESSION_DURATION;
}
