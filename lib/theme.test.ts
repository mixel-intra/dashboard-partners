// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { getTheme, setTheme, toggleTheme } from './theme';

// Contrato del theme: atributo data-theme en <html> + localStorage 'intra-theme'
// (los mismos que el script anti-flash del layout y el CSS [data-theme]).

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('getTheme / setTheme', () => {
  it('sin atributo el default es dark', () => {
    expect(getTheme()).toBe('dark');
  });

  it('setTheme escribe atributo Y storage', () => {
    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('intra-theme')).toBe('light');
  });
});

describe('toggleTheme', () => {
  it('alterna dark ↔ light y devuelve el nuevo valor', () => {
    setTheme('dark');
    expect(toggleTheme()).toBe('light');
    expect(getTheme()).toBe('light');
    expect(toggleTheme()).toBe('dark');
    expect(localStorage.getItem('intra-theme')).toBe('dark');
  });
});
