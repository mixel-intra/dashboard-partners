import { describe, expect, it } from 'vitest';
import { fmtAgo, normalizeCanal } from './_lib';

describe('normalizeCanal', () => {
  it('acepta las claves canónicas directas', () => {
    expect(normalizeCanal('whatsapp')).toBe('whatsapp');
    expect(normalizeCanal('telefonia')).toBe('telefonia');
  });

  it('mapea los tokens reales de Kommo (message[add][0][origin])', () => {
    expect(normalizeCanal('waba')).toBe('whatsapp');
    expect(normalizeCanal('wz')).toBe('whatsapp');
    expect(normalizeCanal('instagram_business')).toBe('instagram');
    expect(normalizeCanal('messenger')).toBe('facebook');
    expect(normalizeCanal('telegram_bot')).toBe('telegram');
  });

  it('normaliza mayúsculas, espacios y acentos', () => {
    expect(normalizeCanal('  WhatsApp Business  ')).toBe('whatsapp');
    expect(normalizeCanal('Teléfono')).toBe('telefonia');
    expect(normalizeCanal('CORREO')).toBe('email');
  });

  it('canales fuera del catálogo → null', () => {
    expect(normalizeCanal('paloma mensajera')).toBeNull();
    expect(normalizeCanal('')).toBeNull();
    expect(normalizeCanal(null)).toBeNull();
  });
});

describe('fmtAgo', () => {
  const base = new Date('2026-07-07T12:00:00Z').getTime();

  it('sin señal previa', () => {
    expect(fmtAgo(null, base)).toBe('sin señal previa');
  });

  it('escala minutos → horas → días', () => {
    expect(fmtAgo('2026-07-07T11:59:40Z', base)).toBe('hace <1 min');
    expect(fmtAgo('2026-07-07T11:48:00Z', base)).toBe('hace 12 min');
    expect(fmtAgo('2026-07-07T05:00:00Z', base)).toBe('hace 7 h');
    expect(fmtAgo('2026-07-04T12:00:00Z', base)).toBe('hace 3 d'); // ≥48h pasa a días
  });
});
