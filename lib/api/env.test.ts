import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnvFaltanteError, requireAnyEnv, requireEnv } from './env';

afterEach(() => vi.unstubAllEnvs());

describe('requireEnv', () => {
  it('devuelve el valor si existe', () => {
    vi.stubEnv('X_TEST_VAR', 'valor');
    expect(requireEnv('X_TEST_VAR')).toBe('valor');
  });

  it('falla RUIDOSO con el mensaje que ve el operador en Vercel', () => {
    expect(() => requireEnv('X_NO_EXISTE')).toThrowError(EnvFaltanteError);
    expect(() => requireEnv('X_NO_EXISTE')).toThrowError(/Falta X_NO_EXISTE.*Vercel/);
  });
});

describe('requireAnyEnv (cadenas tipo ADMIN_SUPABASE_URL || SUPABASE_URL)', () => {
  it('respeta el orden de preferencia', () => {
    vi.stubEnv('X_A', 'a');
    vi.stubEnv('X_B', 'b');
    expect(requireAnyEnv('X_A', 'X_B')).toBe('a');
    expect(requireAnyEnv('X_NO', 'X_B')).toBe('b');
  });

  it('si ninguna existe, el error nombra todas las opciones', () => {
    expect(() => requireAnyEnv('X_NO1', 'X_NO2')).toThrowError(/X_NO1 \/ X_NO2/);
  });
});
