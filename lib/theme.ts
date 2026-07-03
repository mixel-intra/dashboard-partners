// Manejo del theme (data-theme en <html> + localStorage `intra-theme`).
// Mismo contrato que el legacy: 'dark' | 'light', default por prefers-color-scheme.

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'intra-theme';

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage bloqueado: el theme solo vive esta sesión */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
