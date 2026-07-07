// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getSession, isSessionExpired, saveSession, SESSION_DURATION } from './session';
import type { Session } from '@/types/session';

// El contrato de sesión es INTOCABLE: mismo key y shape que el legacy para
// que las sesiones existentes sobrevivan el cutover.
const KEY = 'intra_session_v2';

const usuario = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@x.com',
  role: 'partner' as const,
  clients: ['roof-107'],
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-07T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('saveSession / getSession', () => {
  it('guarda bajo el key legacy con timestamp agregado', () => {
    saveSession(usuario);
    const raw = JSON.parse(localStorage.getItem(KEY)!);
    expect(raw).toMatchObject(usuario);
    expect(raw.timestamp).toBe(Date.now());
    expect(getSession()).toEqual(raw);
  });

  it('JSON corrupto en storage → null (no lanza)', () => {
    localStorage.setItem(KEY, '{corrupto');
    expect(getSession()).toBeNull();
  });

  it('sin sesión → null; clearSession la elimina', () => {
    expect(getSession()).toBeNull();
    saveSession(usuario);
    clearSession();
    expect(getSession()).toBeNull();
  });
});

describe('isSessionExpired (TTL 24h — mismo del legacy)', () => {
  it('dentro de las 24h no expira; pasadas las 24h sí', () => {
    saveSession(usuario);
    const s = getSession() as Session;

    vi.advanceTimersByTime(SESSION_DURATION); // exactamente 24h → aún válida (> estricto)
    expect(isSessionExpired(s)).toBe(false);

    vi.advanceTimersByTime(1);
    expect(isSessionExpired(s)).toBe(true);
  });
});
