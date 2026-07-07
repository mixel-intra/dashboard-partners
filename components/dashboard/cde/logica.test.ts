import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cdeCalcularRoas,
  cdeConteos,
  cdeDefaultMonth,
  cdePeriodMonths,
  cdePieEntries,
  cdeTotalMontoEmpenado,
} from './logica';

const oro = { estatus: 'Lead Empeño Oro' };
const empenado = (precio: number) => ({ estatus: 'Empeñado', precio });
const perdido = (motivo: string) => ({ estatus: 'Venta perdida', motivo });
const fueraDelFunnel = { estatus: 'contacto inicial' };

describe('cdeConteos', () => {
  it('cuenta por etapa, junta perdidos y suma el funnel completo', () => {
    const { counts, perdidos, totalFunnel, empenados } = cdeConteos([
      oro,
      empenado(100),
      perdido('monto insuficiente'),
      perdido('otros'),
      fueraDelFunnel,
    ]);
    expect(counts.oro).toBe(1);
    expect(counts.empenado).toBe(1);
    expect(counts.perdido).toBe(2);
    expect(perdidos).toHaveLength(2);
    expect(totalFunnel).toBe(4); // el que está fuera del funnel NO cuenta
    expect(empenados).toBe(1);
  });
});

describe('cdePieEntries', () => {
  it('ordena mayor→menor y omite motivos en cero', () => {
    const { entries, total } = cdePieEntries([
      perdido('dejó de contestar'),
      perdido('usuario dejó de contestar otra vez'),
      perdido('monto insuficiente'),
    ]);
    expect(total).toBe(3);
    expect(entries[0]).toEqual({ label: 'Dejó de contestar', n: 2 });
    expect(entries[1]).toEqual({ label: 'Monto insuficiente', n: 1 });
    expect(entries.every((e) => e.n > 0)).toBe(true);
  });

  it('sin perdidos → vacío', () => {
    expect(cdePieEntries([])).toEqual({ entries: [], total: 0 });
  });
});

describe('cdeTotalMontoEmpenado / cdePeriodMonths', () => {
  it('solo suma el precio de los EMPEÑADOS', () => {
    expect(cdeTotalMontoEmpenado([empenado(100), empenado(50), { ...oro, precio: 999 }])).toBe(150);
  });

  it('extrae los meses YYYY-MM presentes en el periodo (por fecha_parsed)', () => {
    const meses = cdePeriodMonths([
      { fecha_parsed: new Date(2026, 4, 10) },
      { fecha_parsed: new Date(2026, 4, 20) },
      { fecha_parsed: new Date(2026, 5, 1) },
      { sin_fecha: true },
    ]);
    expect(meses.sort()).toEqual(['2026-05', '2026-06']);
  });
});

describe('cdeCalcularRoas', () => {
  const spendMap = { '2026-05': 1000, '2026-06': 500 };

  it('ROAS = monto empeñado del periodo ÷ inversión de los meses del periodo', () => {
    const leads = [
      { ...empenado(3000), fecha_parsed: new Date(2026, 4, 10) },
      { ...perdido('otros'), fecha_parsed: new Date(2026, 4, 12) },
    ];
    const r = cdeCalcularRoas(leads, spendMap);
    expect(r.periodSpend).toBe(1000); // solo mayo
    expect(r.totalMonto).toBe(3000);
    expect(r.roas).toBe(3);
    expect(r.label).toBe('Mayo 2026');
  });

  it('varios meses → label "Periodo filtrado" y suma de inversiones', () => {
    const leads = [
      { ...empenado(300), fecha_parsed: new Date(2026, 4, 10) },
      { ...empenado(300), fecha_parsed: new Date(2026, 5, 10) },
    ];
    const r = cdeCalcularRoas(leads, spendMap);
    expect(r.periodSpend).toBe(1500);
    expect(r.label).toBe('Periodo filtrado');
  });

  it('sin leads con fecha → "Sin datos en el periodo"; sin inversión → roas 0', () => {
    const r = cdeCalcularRoas([], spendMap);
    expect(r.label).toBe('Sin datos en el periodo');
    expect(r.periodSpend).toBe(0);
    expect(r.roas).toBe(0);
  });
});

describe('cdeDefaultMonth', () => {
  afterEach(() => vi.useRealTimers());

  it('mes actual si está dentro del catálogo 2026-05..2026-12', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(cdeDefaultMonth()).toBe('2026-08');
  });

  it('fuera del catálogo cae a 2026-05', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-02-01T12:00:00Z'));
    expect(cdeDefaultMonth()).toBe('2026-05');
  });
});
