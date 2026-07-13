import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  F,
  ST,
  demoLeads,
  esAtencion,
  esCalificado,
  esDescartado,
  esSinRespuesta,
  eventosRange,
  fmtDelta,
  inRange,
  mapEvento,
  normFuente,
  normSistema,
  parseFecha,
  parseHora,
  parseWall,
  pct,
  periodRange,
  smoothPath,
  tieneDemo,
} from './logica';

describe('parseFecha', () => {
  it('ISO de Supabase se parsea nativo (sin corromper la fracción de segundos)', () => {
    const d = parseFecha('2026-07-06T01:08:13.772066+00:00');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(6);
  });

  it('formato legacy "d/m/yyyy, h:mm:ss p.m."', () => {
    const d = parseFecha('30/6/2026, 7:18:57 p.m.');
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(30);
  });

  it('Date pasa tal cual; inválidos → null', () => {
    const now = new Date();
    expect(parseFecha(now)).toBe(now);
    expect(parseFecha('no es fecha')).toBeNull();
    expect(parseFecha(null)).toBeNull();
  });
});

describe('parseHora', () => {
  it('formato a.m./p.m. del legacy', () => {
    expect(parseHora('30/6/2026, 7:18:57 p.m.')).toBe('19:18');
    expect(parseHora('1/1/2026, 12:05:00 a.m.')).toBe('00:05');
    expect(parseHora('1/1/2026, 12:30:00 p.m.')).toBe('12:30');
  });

  it('ISO: toma la hora literal (sin conversión de zona)', () => {
    expect(parseHora('2026-07-03T13:00:00+00:00')).toBe('13:00');
  });

  it('sin hora → cadena vacía', () => {
    expect(parseHora('')).toBe('');
    expect(parseHora('texto')).toBe('');
  });
});

describe('parseWall', () => {
  it('interpreta demo_inicio como hora de pared LITERAL', () => {
    const w = parseWall('2026-10-05T09:00:00+00:00');
    expect(w).not.toBeNull();
    expect(w!.h).toBe(9);
    expect(w!.mi).toBe(0);
    // date en LOCAL con esos componentes (no desplazada por zona)
    expect(w!.date.getHours()).toBe(9);
    expect(w!.date.getDate()).toBe(5);
  });

  it('formatos no ISO → null', () => {
    expect(parseWall('30/6/2026')).toBeNull();
    expect(parseWall(null)).toBeNull();
  });
});

describe('normSistema (precedencia de patrones)', () => {
  it('"casa de empeño" gana antes que "cib"', () => {
    expect(normSistema({ utm_campaign: 'CIB Casa de Empeño' })).toBe('CIB Casa de Empeño');
  });

  it('"pld" gana antes que "sigen"', () => {
    expect(normSistema({ utm_campaign: 'e-SIGeN PLD' })).toBe('e-SIGeN PLD');
  });

  it.each([
    ['esigen', 'e-SIGeN'],
    ['sigen', 'e-SIGeN'],
    ['financiera', 'CIB Financiera'],
    ['cib', 'CIB Financiera'],
  ])('%s → %s', (raw, esperado) => {
    expect(normSistema({ utm_campaign: raw })).toBe(esperado);
  });

  it('lee el campo `sistema` de Supabase como alias', () => {
    expect(normSistema({ sistema: 'CIB Financiera' })).toBe('CIB Financiera');
  });

  it('sin match → null (el panel lo agrupa como "Otro")', () => {
    expect(normSistema({ utm_campaign: 'otra cosa' })).toBeNull();
    expect(F.sistema({ utm_campaign: 'otra cosa' })).toBe('Otro');
  });

  it.each([
    ['KonektaPUI'],
    ['konectapui'],
    ['DEMO KonektaPUI con Grisel'],
    ['RA - Demostración KonectaPui'],
  ])('%s → KonektaPUI (5º sistema)', (raw) => {
    expect(normSistema({ sistema: raw })).toBe('KonektaPUI');
  });
});

describe('normFuente (variantes reales)', () => {
  it.each([
    ['fb', 'Facebook'],
    ['meta ads', 'Facebook'],
    ['whatsapp', 'WhatsApp'],
    ['wpp', 'WhatsApp'],
    ['ig_stories', 'Instagram'],
    ['insta', 'Instagram'],
    ['google / cpc', 'Google'],
    ['adwords', 'Google'],
  ])('%s → %s', (raw, esperado) => {
    expect(normFuente({ utm_medium: raw })).toBe(esperado);
  });

  it('lee el campo `fuente` de Supabase como alias', () => {
    expect(normFuente({ fuente: 'facebook' })).toBe('Facebook');
  });
});

describe('F (accesores de campos)', () => {
  it('telefono prefiere telefono_contacto (modelo Supabase)', () => {
    expect(F.telefono({ telefono_contacto: '+521111', telefono: '+522222' })).toBe('+521111');
    expect(F.telefono({ telefono: '+522222' })).toBe('+522222');
  });

  it('fecha lee created_at como alias', () => {
    expect(F.fecha({ created_at: '2026-07-01T10:00:00+00:00' })).not.toBeNull();
  });
});

describe('predicados — modelo NUEVO (Supabase: accion_calendario/demo_inicio/urgencia)', () => {
  it('tieneDemo por acción del calendario o por fecha/evento', () => {
    expect(tieneDemo({ accion_calendario: 'Agendada' })).toBe(true);
    expect(tieneDemo({ accion_calendario: 'reagendada' })).toBe(true);
    expect(tieneDemo({ demo_inicio: '2026-07-10T09:00:00+00:00' })).toBe(true);
    expect(tieneDemo({ event_id: 'abc' })).toBe(true);
    expect(tieneDemo({})).toBe(false);
  });

  it('esCalificado = tieneDemo cuando no hay estatus_id', () => {
    expect(esCalificado({ accion_calendario: 'agendada' })).toBe(true);
    expect(esCalificado({})).toBe(false);
  });

  it('esDescartado por acción cancelada/descartada', () => {
    expect(esDescartado({ accion_calendario: 'cancelada' })).toBe(true);
    expect(esDescartado({ accion_calendario: 'agendada' })).toBe(false);
  });

  it('esAtencion por urgencia alta', () => {
    expect(esAtencion({ urgencia: 'Alta' })).toBe(true);
    expect(esAtencion({ urgencia: 'baja' })).toBe(false);
  });
});

describe('predicados — modelo VIEJO (Kommo: estatus_id, usado por el modo demo)', () => {
  it('respeta el pipeline por ID', () => {
    expect(esCalificado({ estatus_id: ST.ATENCION })).toBe(true);
    expect(esCalificado({ estatus_id: ST.SEGUIMIENTO })).toBe(true);
    expect(esCalificado({ estatus_id: ST.RECHAZADO })).toBe(false);
    expect(esDescartado({ estatus_id: ST.RECHAZADO })).toBe(true);
    expect(esSinRespuesta({ estatus_id: ST.SIN_RESPUESTA })).toBe(true);
  });

  it('si hay estatus_id, la señal de calendario NO cambia el resultado', () => {
    expect(esCalificado({ estatus_id: ST.RECHAZADO, accion_calendario: 'agendada' })).toBe(false);
  });
});

describe('periodRange (con reloj congelado)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0)); // 15 jul 2026 mediodía
  });
  afterEach(() => vi.useRealTimers());

  it('7 días: hoy incluido, inicio 6 días atrás a las 00:00', () => {
    const { start, end } = periodRange('7d');
    expect(start!.getDate()).toBe(9);
    expect(start!.getHours()).toBe(0);
    expect(end!.getDate()).toBe(15);
    expect(end!.getHours()).toBe(23);
  });

  it('el periodo anterior es contiguo (prevEnd = start − 1ms) y del mismo largo', () => {
    const { start, prevStart, prevEnd } = periodRange('7d');
    expect(prevEnd!.getTime()).toBe(start!.getTime() - 1);
    expect(prevStart!.getDate()).toBe(2);
  });

  it('periodo desconocido cae al default (30 días)', () => {
    const { start } = periodRange('xxx');
    expect(start!.getDate()).toBe(16); // 15 jul − 29 días
    expect(start!.getMonth()).toBe(5); // junio
  });

  it('inRange: sin fecha en el lead → true (no se descarta)', () => {
    const { start, end } = periodRange('7d');
    expect(inRange({}, start, end)).toBe(true);
    expect(inRange({ fecha_creacion: '1/1/2020' }, start, end)).toBe(false);
  });

  it('esteMes: del 1 al último día del mes; anterior = mes previo', () => {
    const { start, end, prevStart } = periodRange('esteMes');
    expect(start!.getDate()).toBe(1);
    expect(start!.getMonth()).toBe(6); // julio
    expect(end!.getDate()).toBe(31); // julio tiene 31
    expect(end!.getMonth()).toBe(6);
    expect(prevStart!.getMonth()).toBe(5); // junio
  });

  it('mesPasado: mes natural anterior (junio) con anterior = mayo', () => {
    const { start, end, prevStart } = periodRange('mesPasado');
    expect(start!.getMonth()).toBe(5); // junio
    expect(start!.getDate()).toBe(1);
    expect(end!.getDate()).toBe(30); // junio tiene 30
    expect(prevStart!.getMonth()).toBe(4); // mayo
  });

  it('todo: sin límites de fecha', () => {
    const { start, end, prevStart } = periodRange('todo');
    expect(start).toBeNull();
    expect(end).toBeNull();
    expect(prevStart).toBeNull();
  });
});

describe('eventosRange (rango del webhook de calendario)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0)); // 15 jul 2026
  });
  afterEach(() => vi.useRealTimers());

  it('mes visible ± 1 mes de margen', () => {
    const { from, to } = eventosRange('esteMes', new Date(2026, 6, 1)); // julio
    expect(from.getMonth()).toBe(5); // junio
    expect(to.getMonth()).toBe(7); // agosto
    expect(to.getDate()).toBe(31); // fin de agosto
  });

  it('todo el tiempo: ~1 año atrás → 3 meses adelante', () => {
    const { from, to } = eventosRange('todo', null);
    expect(from.getFullYear()).toBe(2025);
    expect(from.getMonth()).toBe(6); // julio 2025
    expect(to.getFullYear()).toBe(2026);
  });
});

describe('mapEvento (normaliza eventos crudos de Microsoft Graph)', () => {
  it('mapea asunto/fecha/id y deriva sistema del asunto', () => {
    const ev = mapEvento({
      id: 'AAA',
      subject: 'DEMO CIB Financiera con Grisel',
      start: { dateTime: '2026-07-01T09:00:00.0000000', timeZone: 'Central Standard Time (Mexico)' },
      end: { dateTime: '2026-07-01T13:00:00.0000000' },
    });
    expect(ev).not.toBeNull();
    expect(ev!.event_id).toBe('AAA');
    expect(ev!.nombre).toBe('DEMO CIB Financiera con Grisel');
    expect(ev!.demo_inicio).toBe('2026-07-01T09:00:00.0000000');
    expect(F.campana(ev!)).toBe('CIB Financiera');
    expect(parseWall(ev!.demo_inicio)!.h).toBe(9);
  });

  it('descarta eventos de todo el día, cancelados y sin hora de inicio', () => {
    expect(mapEvento({ id: '1', subject: 'X', isAllDay: true, start: { dateTime: '2026-07-01T00:00:00' } })).toBeNull();
    expect(mapEvento({ id: '2', subject: 'Cancelado: junta', start: { dateTime: '2026-07-01T09:00:00' } })).toBeNull();
    expect(mapEvento({ id: '3', subject: 'sin fecha' })).toBeNull();
  });
});

describe('formato', () => {
  it('fmtDelta cubre los bordes de división por cero', () => {
    expect(fmtDelta(5, 0)).toBe('100%');
    expect(fmtDelta(0, 0)).toBe('0%');
    expect(fmtDelta(15, 10)).toBe('50%');
    expect(fmtDelta(5, 10)).toBe('-50%');
  });

  it('pct redondea y protege el divisor', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 0)).toBe(0);
  });
});

describe('smoothPath', () => {
  it('0 puntos → cadena vacía; 1 punto → solo Move', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([[10, 20]])).toBe('M10 20');
  });

  it('N puntos → M + (N−1) curvas C', () => {
    const d = smoothPath([
      [0, 0],
      [10, 5],
      [20, 3],
    ]);
    expect(d.startsWith('M0.0 0.0')).toBe(true);
    expect(d.match(/ C/g)).toHaveLength(2);
  });
});

describe('demoLeads', () => {
  it('genera 140 leads con el shape del modelo nuevo Y el viejo', () => {
    const leads = demoLeads();
    expect(leads).toHaveLength(140);
    const l = leads[0];
    expect(l.estatus_id).toBeDefined(); // modelo Kommo (los predicados lo usan)
    expect(l.demo_inicio).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\+00:00$/); // pobla el calendario
    expect(l.accion_calendario).toBe('agendada');
  });
});
