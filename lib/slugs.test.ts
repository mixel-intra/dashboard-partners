import { describe, expect, it } from 'vitest';
import { CEFEMEX_ETAPAS_CALIFICADAS, SLUGS, esCasaDeEmpeno, tieneArchivoReservas } from './slugs';

describe('esCasaDeEmpeno', () => {
  it('acepta AMBAS grafías (con y sin acento) — así viven en datos reales', () => {
    expect(esCasaDeEmpeno('casa-de-empeño')).toBe(true);
    expect(esCasaDeEmpeno('casa-de-empeno')).toBe(true);
  });

  it('rechaza cualquier otro slug', () => {
    expect(esCasaDeEmpeno('cefemex')).toBe(false);
    expect(esCasaDeEmpeno(null)).toBe(false);
    expect(esCasaDeEmpeno('')).toBe(false);
  });
});

describe('tieneArchivoReservas', () => {
  it('solo roof-107 tiene la feature de archivo', () => {
    expect(tieneArchivoReservas(SLUGS.ROOF_107)).toBe(true);
    expect(tieneArchivoReservas('107-roof')).toBe(false); // la grafía de CLAUDE.md viejo NO es la del código
    expect(tieneArchivoReservas(null)).toBe(false);
  });
});

describe('CEFEMEX_ETAPAS_CALIFICADAS', () => {
  it('el set congela las etapas del pipeline (#9-#18); Rechazado y HILLFLARE fuera', () => {
    expect(CEFEMEX_ETAPAS_CALIFICADAS.size).toBe(10);
    expect(CEFEMEX_ETAPAS_CALIFICADAS.has(100458628)).toBe(true); // #10 Lead Calificado
    expect(CEFEMEX_ETAPAS_CALIFICADAS.has(100538408)).toBe(false); // #8 Rechazado
    expect(CEFEMEX_ETAPAS_CALIFICADAS.has(94994555)).toBe(false); // #19 LEADS HILLFLARE
  });
});
