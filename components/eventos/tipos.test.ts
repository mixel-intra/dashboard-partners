import { describe, expect, it } from 'vitest';
import {
  fmtMoney,
  formatPhone,
  mapAirtableRecord,
  normalizarEventosConfig,
  tieneFecha,
} from './tipos';

describe('mapAirtableRecord', () => {
  it('mapea los campos de Airtable a las claves internas', () => {
    const l = mapAirtableRecord({
      id: 'rec123',
      fields: {
        'Nombre Cliente': 'Ana',
        email: 'ana@x.com',
        Telefono: '+52999',
        TipoEvento: 'Boda',
        PAX: '120',
        FechaEvento: '2026-08-01',
        FechaContacto: '2026-07-01T10:00:00.000Z',
        TotalEstimado: '45000.50',
        Estado: 'Cotizando',
        Notas: 'nota',
      },
    });
    expect(l.airtable_id).toBe('rec123');
    expect(l.nombre).toBe('Ana');
    expect(l.pax).toBe(120);
    expect(l.total_estimado).toBe(45000.5);
    expect(l.estado).toBe('Cotizando');
    expect(l.fecha_contacto).toBeInstanceOf(Date);
  });

  it('defaults del legacy: sin nombre → "Sin nombre", sin estado → "Nuevo Lead"', () => {
    const l = mapAirtableRecord({ id: 'r1', fields: {} });
    expect(l.nombre).toBe('Sin nombre');
    expect(l.estado).toBe('Nuevo Lead');
    expect(l.pax).toBe(0); // parseInt(undefined || 0) → 0 — paridad con el legacy
    expect(l.fecha_contacto).toBeNull();
  });
});

describe('normalizarEventosConfig', () => {
  it('acepta snake_case y camelCase', () => {
    expect(normalizarEventosConfig({ api_key: 'k', base_id: 'b', table_name: 't' })).toEqual({
      apiKey: 'k',
      baseId: 'b',
      tableName: 't',
    });
    expect(normalizarEventosConfig({ apiKey: 'k2', baseId: 'b2', tableName: 't2' })).toEqual({
      apiKey: 'k2',
      baseId: 'b2',
      tableName: 't2',
    });
    expect(normalizarEventosConfig(null)).toEqual({ apiKey: '', baseId: '', tableName: '' });
  });
});

describe('formatPhone (eventos)', () => {
  it('mismas reglas que el resto del app', () => {
    expect(formatPhone('')).toBe('—');
    expect(formatPhone('+5219991234567')).toBe('[+52] 999 123 4567');
    expect(formatPhone('local 123')).toBe('local 123');
  });
});

describe('fmtMoney / tieneFecha', () => {
  it('formatea a en-US con decimales opcionales', () => {
    expect(fmtMoney(45000)).toBe('$45,000');
    expect(fmtMoney(45000.5, 2)).toBe('$45,000.50');
    expect(fmtMoney(0)).toBe('$0');
  });

  it('tieneFecha exige Date válida', () => {
    expect(tieneFecha({ fecha_contacto: new Date('2026-01-01') } as any)).toBe(true);
    expect(tieneFecha({ fecha_contacto: new Date('nope') } as any)).toBe(false);
    expect(tieneFecha({ fecha_contacto: null } as any)).toBe(false);
  });
});
