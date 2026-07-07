import { describe, it, expect } from 'vitest';
import {
  applyGlobalFilters,
  calcularMetricas,
  cdeMotivo,
  cdeStage,
  etiquetaIntra,
  formatPhone,
  getLeadTags,
  isQualified,
  normalizeStatus,
  parseCustomDate,
  type Lead,
} from './filtros';

// ESTA LÓGICA MUEVE LOS KPIs DE LOS CLIENTES: los casos vienen del legacy
// (dashboard.js) — si un test truena tras un cambio, comparar contra el legacy
// antes de "arreglar" el test.

const CDE = 'casa-de-empeño';

describe('parseCustomDate', () => {
  it('parsea el formato Kommo/n8n "d/m/yyyy, h:mm:ss p.m."', () => {
    const d = parseCustomDate('3/2/2026, 5:37:27 p.m.');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1); // febrero
    expect(d.getDate()).toBe(3);
  });

  it('devuelve una fecha (hoy) si el valor viene vacío', () => {
    expect(parseCustomDate(null)).toBeInstanceOf(Date);
    expect(parseCustomDate('')).toBeInstanceOf(Date);
  });
});

describe('formatPhone', () => {
  it('vacío → em dash', () => {
    expect(formatPhone(null)).toBe('—');
    expect(formatPhone('')).toBe('—');
  });

  it('sin código de país (+) se devuelve tal cual', () => {
    expect(formatPhone('9991234567')).toBe('9991234567');
  });

  it('separa lada y formatea números de 10 dígitos', () => {
    expect(formatPhone('+529991234567')).toBe('[+52] 999 123 4567');
  });

  it('México: quita el prefijo 1 de marcación móvil (11 dígitos)', () => {
    expect(formatPhone('+5219991234567')).toBe('[+52] 999 123 4567');
  });

  it('longitudes no estándar conservan el número local sin formato', () => {
    expect(formatPhone('+52123')).toBe('[+52] 123');
  });
});

describe('normalizeStatus', () => {
  it('capitaliza estatus desconocidos (passthrough)', () => {
    expect(normalizeStatus('nuevo lead', 'otro', null)).toBe('Nuevo lead');
  });

  it('vacío → Desconocido', () => {
    expect(normalizeStatus(null, 'otro', null)).toBe('Desconocido');
    expect(normalizeStatus('', 'hotel', null)).toBe('Desconocido');
  });

  describe('hoteles (singular y plural)', () => {
    it.each([
      ['CALIFICADO RESERVA', 'Calificado Reserva'],
      ['calificado reservas', 'Calificado Reserva'],
      ['Calificado Evento', 'Calificado Evento'],
      ['calificado eventos', 'Calificado Evento'],
      ['calificado daypass', 'Calificado DayPass'],
      ['calificado day pass', 'Calificado DayPass'],
      ['calificado restaurante', 'Calificado Restaurante'],
    ])('%s → %s', (input, esperado) => {
      expect(normalizeStatus(input, 'hotel', 'hotel-x')).toBe(esperado);
    });
  });

  describe('CEFEMEX Capital', () => {
    it('"rechazado cefemex" es Cotizado para hotel y Rechazado CEFEMEX para otros', () => {
      expect(normalizeStatus('rechazado cefemex', 'hotel', 'hotel-x')).toBe('Cotizado');
      expect(normalizeStatus('rechazado cefemex', 'otro', 'cefemex')).toBe('Rechazado CEFEMEX');
    });

    it('etapas del pipeline financiero', () => {
      expect(normalizeStatus('documentación pendiente', 'otro', 'cefemex')).toBe('Documentación / Integración E1');
      expect(normalizeStatus('revisión financiera', 'otro', 'cefemex')).toBe('Revisión Financiera / Integración E2');
      expect(normalizeStatus('comité', 'otro', 'cefemex')).toBe('Comité / Autorización');
    });
  });

  describe('casa-de-empeño (ambas grafías del slug)', () => {
    it.each([
      ['venta perdida', 'Venta perdida'],
      ['Rescate / Empeño Otros', 'Rescate / Empeño Otros'],
      ['lead empeño oro', 'Lead Empeño Oro'],
      ['cita agendada', 'Cita agendada'],
      ['reagendar', 'Reagendar'],
      ['empeñado', 'Empeñado'],
    ])('%s → %s', (input, esperado) => {
      expect(normalizeStatus(input, 'otro', 'casa-de-empeño')).toBe(esperado);
      expect(normalizeStatus(input, 'otro', 'casa-de-empeno')).toBe(esperado);
    });
  });

  it('los específicos ganan al genérico "calificado"', () => {
    expect(normalizeStatus('no_calificado', 'otro', null)).toBe('No Calificado');
    expect(normalizeStatus('calificado cita', 'otro', null)).toBe('Calificado Cita');
    expect(normalizeStatus('lead calificado', 'otro', null)).toBe('Lead Calificado');
    expect(normalizeStatus('condicionado', 'otro', null)).toBe('Lead Condicionado');
    expect(normalizeStatus('rechazado', 'otro', null)).toBe('Rechazado');
  });
});

describe('getLeadTags', () => {
  it('lee arrays de objetos {name} en campos conocidos', () => {
    expect(getLeadTags({ tags: [{ name: 'Calificado_Intra' }, { name: 'VIP' }] })).toEqual([
      'calificado_intra',
      'vip',
    ]);
  });

  it('lee strings separados por coma/;/| y salto de línea', () => {
    expect(getLeadTags({ etiquetas: 'uno, dos; tres|cuatro' })).toEqual(['uno', 'dos', 'tres', 'cuatro']);
  });

  it('lee _embedded.tags (API nativa de Kommo)', () => {
    expect(getLeadTags({ _embedded: { tags: [{ name: 'Oro' }] } })).toEqual(['oro']);
  });

  it('fallback: escanea arrays con keywords CDE en campos no estándar', () => {
    expect(getLeadTags({ campos_extra: [{ name: 'condicionado_intra' }] })).toEqual(['condicionado_intra']);
  });

  it('sin etiquetas → []', () => {
    expect(getLeadTags({ nombre: 'X' })).toEqual([]);
  });
});

describe('etiquetaIntra', () => {
  it('clasifica por tag de Kommo', () => {
    expect(etiquetaIntra({ tags: ['calificado_intra'] })).toBe('Calificado Intra');
    expect(etiquetaIntra({ tags: ['condicionado_intra'] })).toBe('Condicionado Intra');
    expect(etiquetaIntra({ tags: ['otra'] })).toBe('Orgánico');
    expect(etiquetaIntra({})).toBe('Orgánico');
  });
});

describe('cdeStage', () => {
  it.each([
    ['Lead Empeño Oro', 'oro'],
    ['Rescate / Empeño Otros', 'otros'],
    ['Cita agendada', 'cita'],
    ['Reagendar', 'reagendar'],
    ['Empeñado', 'empenado'],
    ['Venta perdida', 'perdido'],
  ] as const)('%s → %s', (estatus, etapa) => {
    expect(cdeStage({ estatus })).toBe(etapa);
  });

  it('prefiere estatus_original (etapa real) sobre estatus reescrito', () => {
    expect(cdeStage({ estatus: 'Lead Calificado', estatus_original: 'venta perdida' })).toBe('perdido');
  });

  it('etapas fuera del funnel → null', () => {
    expect(cdeStage({ estatus: 'contacto inicial' })).toBeNull();
  });
});

describe('cdeMotivo', () => {
  it('matchea por texto (anchor) sin importar acentos', () => {
    expect(cdeMotivo({ motivo: 'Monto insuficiente para el préstamo' }).norm).toBe('monto insuficiente');
    expect(cdeMotivo({ nota: 'artículo fuera de catálogo' }).norm).toBe('articulo fuera de catalogo');
  });

  it('matchea por ID numérico de Kommo aunque venga anidado', () => {
    expect(cdeMotivo({ custom_fields: [{ values: [{ enum_id: 36957715 }] }] }).norm).toBe(
      'usuario dejo de contestar'
    );
  });

  it('sin match → Otros', () => {
    expect(cdeMotivo({ nombre: 'X' }).norm).toBe('otros');
  });
});

describe('isQualified', () => {
  describe('CEFEMEX Capital (por ID de etapa)', () => {
    it('etapas del set calificado → true', () => {
      expect(isQualified({ estatus_id: 100458628 }, 'otro', 'cefemex')).toBe(true);
    });

    it('Ganado (142) siempre cuenta', () => {
      expect(isQualified({ estatus_id: 142 }, 'otro', 'cefemex')).toBe(true);
    });

    it('Perdido (143) solo con tag intra', () => {
      expect(isQualified({ estatus_id: 143, tags: ['calificado_intra'] }, 'otro', 'cefemex')).toBe(true);
      expect(isQualified({ estatus_id: 143, tags: ['condicionado_intra'] }, 'otro', 'cefemex')).toBe(true);
      expect(isQualified({ estatus_id: 143 }, 'otro', 'cefemex')).toBe(false);
    });

    it('etapa desconocida → false (aunque el texto diga calificado)', () => {
      expect(isQualified({ estatus_id: 1, estatus: 'lead calificado' }, 'otro', 'cefemex')).toBe(false);
    });
  });

  it('hoteles: todo lo que empieza con "calificado"', () => {
    expect(isQualified({ estatus: 'Calificado Evento' }, 'hotel', 'hotel-x')).toBe(true);
    expect(isQualified({ estatus: 'no calificado' }, 'hotel', 'hotel-x')).toBe(false);
    expect(isQualified({ estatus: 'nuevo' }, 'hotel', 'hotel-x')).toBe(false);
  });

  it('inmobiliaria: SOLO "calificado cita" (el genérico no cuenta)', () => {
    expect(isQualified({ estatus: 'Calificado Cita' }, 'inmobiliaria', 'inmo-x')).toBe(true);
    expect(isQualified({ estatus: 'Lead Calificado' }, 'inmobiliaria', 'inmo-x')).toBe(false);
  });

  it('casa-de-empeño: califican las 6 etapas del funnel (incl. venta perdida)', () => {
    expect(isQualified({ estatus: 'Venta perdida' }, 'otro', CDE)).toBe(true);
    expect(isQualified({ estatus: 'Empeñado' }, 'otro', CDE)).toBe(true);
    expect(isQualified({ estatus: 'contacto inicial' }, 'otro', CDE)).toBe(false);
  });

  it('política general (otros clientes): lista de keywords', () => {
    expect(isQualified({ estatus: 'lead condicionado' }, 'otro', 'x')).toBe(true);
    expect(isQualified({ estatus: 'en documentación' }, 'otro', 'x')).toBe(true);
    expect(isQualified({ estatus: 'nuevo' }, 'otro', 'x')).toBe(false);
    expect(isQualified(null, 'otro', 'x')).toBe(false);
  });
});

// Helpers de fixtures
function lead(fecha: string, extra: Partial<Lead> = {}): Lead {
  return { fecha_parsed: new Date(fecha), estatus: 'nuevo', ...extra };
}

describe('applyGlobalFilters', () => {
  const filtros = { start: new Date('2026-06-01'), end: new Date('2026-06-30'), etiqueta: '' };

  it('filtra por rango de fechas y excluye leads sin fecha_parsed', () => {
    const leads = [lead('2026-06-15'), lead('2026-05-01'), { estatus: 'x' } as Lead];
    const out = applyGlobalFilters(leads, filtros, 'otro', 'x');
    expect(out).toHaveLength(1);
  });

  it('sin rango deja pasar todo lo que tenga fecha', () => {
    const out = applyGlobalFilters([lead('2020-01-01')], { start: null, end: null, etiqueta: '' }, 'otro', 'x');
    expect(out).toHaveLength(1);
  });

  it('hotel: el calificado solo aparece en su pestaña; el general en todas', () => {
    const calificadoEvento = lead('2026-06-10', { estatus: 'Calificado Evento', tipo_servicio: 'Evento' });
    const calificadoReserva = lead('2026-06-10', { estatus: 'Calificado Reserva', tipo_servicio: 'Reserva' });
    const general = lead('2026-06-10', { estatus: 'nuevo', tipo_servicio: null });
    const leads = [calificadoEvento, calificadoReserva, general];

    const tabEventos = applyGlobalFilters(leads, filtros, 'hotel', 'hotel-x', 'eventos');
    expect(tabEventos).toContain(calificadoEvento);
    expect(tabEventos).not.toContain(calificadoReserva);
    expect(tabEventos).toContain(general); // el general suma al total en TODAS las tabs

    const tabReservas = applyGlobalFilters(leads, filtros, 'hotel', 'hotel-x', 'reservas');
    expect(tabReservas).toContain(calificadoReserva);
    expect(tabReservas).not.toContain(calificadoEvento);
    expect(tabReservas).toContain(general);
  });

  it('CEFEMEX (hotel): filtro estricto por tipo_servicio, sin excepción para generales', () => {
    const general = lead('2026-06-10', { estatus: 'nuevo', tipo_servicio: null });
    const out = applyGlobalFilters([general], filtros, 'hotel', 'cefemex', 'eventos');
    expect(out).toHaveLength(0);
  });

  it('CEFEMEX: filtro global de etiqueta intra/orgánico', () => {
    const intra = lead('2026-06-10', { tags: ['calificado_intra'] });
    const organico = lead('2026-06-10', { tags: [] });
    const base = { ...filtros };
    // clientType 'otro' para no activar el filtro de tipo_servicio de hoteles
    expect(applyGlobalFilters([intra, organico], { ...base, etiqueta: 'intra' }, 'otro', 'cefemex')).toEqual([intra]);
    expect(applyGlobalFilters([intra, organico], { ...base, etiqueta: 'organico' }, 'otro', 'cefemex')).toEqual([
      organico,
    ]);
    expect(applyGlobalFilters([intra, organico], base, 'otro', 'cefemex')).toHaveLength(2);
  });
});

describe('calcularMetricas', () => {
  const sinRango = { start: null, end: null, etiqueta: '' };

  it('calcula total, calificados, conversión, ROI y CPL', () => {
    const leads = [
      lead('2026-06-01', { estatus: 'lead calificado' }),
      lead('2026-06-02', { estatus: 'nuevo' }),
      lead('2026-06-03', { estatus: 'nuevo' }),
      lead('2026-06-04', { estatus: 'lead calificado' }),
    ];
    const ventas = [
      { id: 1, monto: 1000, fecha: '2026-06-05' },
      { id: 2, monto: '500', fecha: '2026-06-06' },
    ];
    const m = calcularMetricas(leads, ventas, 300, sinRango, 'otro', 'x');
    expect(m.total).toBe(4);
    expect(m.qualified).toBe(2);
    expect(m.conversionRate).toBe(0.5);
    expect(m.sales).toBe(1500);
    expect(m.roi).toBe(5); // 1500 / 300
    expect(m.cpl).toBe(150); // 300 / 2
  });

  it('las ventas respetan el rango de fechas; sin fecha siempre cuentan', () => {
    const filtros = { start: new Date('2026-06-01'), end: new Date('2026-06-30T23:59:59'), etiqueta: '' };
    const ventas = [
      { id: 1, monto: 100, fecha: '2026-06-15' },
      { id: 2, monto: 200, fecha: '2026-07-15' }, // fuera del rango
      { id: 3, monto: 50, fecha: null }, // sin fecha → cuenta
    ];
    const m = calcularMetricas([], ventas, 0, filtros, 'otro', 'x');
    expect(m.sales).toBe(150);
  });

  it('divisiones por cero quedan en 0 (sin NaN/Infinity)', () => {
    const m = calcularMetricas([], [], null, sinRango, 'otro', 'x');
    expect(m).toMatchObject({ total: 0, qualified: 0, investment: 0, sales: 0, roi: 0, conversionRate: 0, cpl: 0 });
  });
});
