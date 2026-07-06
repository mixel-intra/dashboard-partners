'use client';

// Colores de charts según el theme activo (Linear/Vercel style).
// Port de getChartTheme() + hexToRgba() de legacy/src/dashboard.js, más un
// hook `useTemaDocumento()` que observa cambios de `data-theme` en <html>
// (MutationObserver) para que los charts se re-rendericen al cambiar el tema.

import { useEffect, useState } from 'react';
import type { Theme } from '@/lib/theme';

export interface TemaChart {
  gridColor: string;
  tickColor: string;
  tooltipBg: string;
  tooltipTitle: string;
  tooltipBody: string;
  tooltipBorder: string;
  pointBorder: string;
  canvasBg: string;
}

export function getChartTheme(): TemaChart {
  const isLight =
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
  return {
    gridColor: isLight ? '#E5E7EB' : 'rgba(255,255,255,0.05)',
    tickColor: isLight ? '#6B7280' : '#8E92A3',
    tooltipBg: isLight ? '#FFFFFF' : '#1E1F25',
    tooltipTitle: isLight ? '#111827' : '#fff',
    tooltipBody: isLight ? '#4B5563' : '#ccc',
    tooltipBorder: isLight ? '#E5E7EB' : 'rgba(255,255,255,0.1)',
    pointBorder: isLight ? '#FFFFFF' : '#fff',
    canvasBg: isLight ? '#FFFFFF' : '#0B0C10',
  };
}

// Port de hexToRgba() — usado por los gradientes/barras de los charts.
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Tema actual del documento ('dark' | 'light'), reactivo: se actualiza cuando
 * cambia el atributo data-theme de <html> (toggle del shell). Los componentes
 * de charts lo usan como dependencia para regenerar data/options.
 */
export function useTemaDocumento(): Theme {
  const [tema, setTema] = useState<Theme>('dark');

  useEffect(() => {
    const leer = () =>
      setTema(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    leer();
    const obs = new MutationObserver(leer);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return tema;
}
