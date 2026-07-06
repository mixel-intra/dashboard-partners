// ============================================================
// Lógica pura del Panel del Director General (Logic Systems).
// Port 1:1 de legacy/src/director.js (constantes, normalizadores,
// predicados de etapa, utilidades de fecha y datos demo).
// ⚠️ MAPEO: todo lead→panel está centralizado en `F` (campos) y `ST` (etapas).
// Ajústalos aquí si el webhook cambia de nombres o agrega etapas.
// ============================================================

export const SLUG = 'logic-systems';
export const PALETTE = ['#0A6CFF', '#1FB36B', '#F5A623', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#0EA5E9'];

export type Lead = Record<string, any>;

export function firstNonEmpty(...vals: any[]): any {
  for (const v of vals) if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  return null;
}

export function parseFecha(str: any): Date | null {
  if (!str) return null;
  if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
  // ISO 8601 (Supabase, ej. "2026-07-06T01:08:13.772066+00:00"): parseo nativo.
  // Debe ir ANTES del limpiado de abajo, que elimina puntos ("p.m.") y corrompería
  // la fracción de segundos del ISO.
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(str))) {
    const iso = new Date(str);
    return isNaN(iso.getTime()) ? null : iso;
  }
  try {
    const cleaned = String(str).replace(/\./g, '').replace(/p\s*m/i, 'PM').replace(/a\s*m/i, 'AM');
    const datePart = cleaned.split(',')[0].trim();
    const [d, m, y] = datePart.split(/[\/\-]/).map(Number);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, (m || 1) - 1, d);
    const nat = new Date(cleaned);
    return isNaN(nat.getTime()) ? null : nat;
  } catch {
    return null;
  }
}

// Extrae "HH:MM" de un string de fecha. Soporta el formato legacy con a.m./p.m.
// ("30/6/2026, 7:18:57 p.m.") y el ISO de Supabase ("2026-07-03T13:00:00+00:00",
// del que toma la hora literal, sin convertir zona horaria).
export function parseHora(str: any): string {
  if (!str) return '';
  const m = String(str).match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\s*\.?\s*m/i);
  if (m) {
    let h = Number(m[1]);
    const min = m[2];
    const pm = /p/i.test(m[3]);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return String(h).padStart(2, '0') + ':' + min;
  }
  const iso = String(str).match(/T(\d{2}):(\d{2})/);
  if (iso) return iso[1] + ':' + iso[2];
  return '';
}

// Interpreta demo_inicio como hora "de pared" LITERAL, sin conversión de zona:
// "2026-10-05T09:00:00+00:00" → { h:9, mi:0, date: <local 5 oct 09:00> }. Los datos
// guardan la hora local del cliente con sufijo "+00:00"; convertir por zona la
// desplazaría. `date` se arma con esos componentes en local para comparar/agrupar.
export type Wall = { h: number; mi: number; date: Date };
export function parseWall(str: any): Wall | null {
  const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return { h: +m[4], mi: +m[5], date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) };
}

// --- Dimensiones fijas del negocio de Logic Systems ----------
export const SISTEMAS = ['CIB Financiera', 'e-SIGeN', 'CIB Casa de Empeño', 'e-SIGeN PLD'];
export const FUENTES = ['Facebook', 'WhatsApp', 'Instagram', 'Google'];

// Normaliza el valor crudo del lead (utm_campaign) a uno de los 4 sistemas fijos, o null.
// Ajusta los patrones cuando confirmes cómo llega el dato real desde Kommo.
export function normSistema(l: Lead): string | null {
  const s = (firstNonEmpty(l.utm_campaign, l.sistema, l.campana, l.campaign) || '').toString().toLowerCase();
  if (/empe[ñn]o|casa.?de.?emp/.test(s)) return 'CIB Casa de Empeño'; // antes que "cib"
  if (/pld/.test(s)) return 'e-SIGeN PLD'; // antes que "sigen"
  if (/e.?sigen|sigen/.test(s)) return 'e-SIGeN';
  if (/financiera|cib/.test(s)) return 'CIB Financiera';
  return null;
}
// Normaliza la fuente cruda del lead (utm_medium/utm_source) a una de las 4 fijas, o null.
export function normFuente(l: Lead): string | null {
  const s = (firstNonEmpty(l.utm_medium, l.utm_source, l.fuente, l.canal) || '').toString().toLowerCase();
  if (/whats|wpp|\bwa\b/.test(s)) return 'WhatsApp';
  if (/insta|\big\b|ig[_-]/.test(s)) return 'Instagram';
  if (/face|\bfb\b|fb[_-]|meta/.test(s)) return 'Facebook';
  if (/google|goog|adwords|gads|\bcpc\b/.test(s)) return 'Google';
  return null;
}

// --- Campos del lead -----------------------------------------
export const F = {
  nombre: (l: Lead) => firstNonEmpty(l.nombre, l.contacto, l.cliente) || 'Sin nombre',
  telefono: (l: Lead) => firstNonEmpty(l.telefono_contacto, l.telefono, l.phone, l.celular) || '',
  estado: (l: Lead) => (firstNonEmpty(l.estatus, l.estado, l.stage) || '').toString(),
  estadoId: (l: Lead) => Number(firstNonEmpty(l.estatus_id, l.stage_id)) || null,
  precio: (l: Lead) => Number(firstNonEmpty(l.precio, l.monto, l.valor)) || 0,
  fecha: (l: Lead) => parseFecha(firstNonEmpty(l.fecha_creacion, l.fecha, l.created_at)),
  fuente: (l: Lead) => normFuente(l) || 'Otra',
  sistema: (l: Lead) => normSistema(l) || 'Otro',
  campana: (l: Lead) => normSistema(l) || 'Otro', // alias histórico: en Logic Systems "campaña" ES el sistema
  respuesta: (l: Lead) => firstNonEmpty(l.respuesta_ai, l.ultimo_mensaje) || '',
};

// --- Señales de calificación / demo --------------------------
// MODELO ACTUAL (Supabase): cada lead trae accion_calendario + demo_inicio (calendario
// real de Outlook) y urgencia. MODELO VIEJO (modo demo / Kommo): estatus_id + estatus.
// Los predicados soportan ambos: si hay estatus_id se usa el pipeline de Kommo; si no,
// se derivan de accion_calendario / demo_inicio / urgencia.
export const ST = {
  RECHAZADO: 100538408, // "rechazado" — el agente descartó (sin perfil / sin garantía)
  ATENCION: 100538416, // "atencion personalizada" — pasa a asesor humano (lead caliente)
  SEGUIMIENTO: 100605424, // "Seguimiento CAMILA" — el agente sigue nutriendo
  SIN_RESPUESTA: 100781696, // "SIN RESPUESTA" — el lead no contestó
};
export function accionCal(l: Lead): string {
  return (firstNonEmpty(l.accion_calendario, l.accion) || '').toString().toLowerCase();
}
// Un lead "tiene demo" si el calendario la agendó/reagendó/confirmó, o si trae fecha/evento.
export function tieneDemo(l: Lead): boolean {
  if (/agend|reagend|confirm/.test(accionCal(l))) return true;
  return !!firstNonEmpty(l.demo_inicio, l.event_id);
}
export function esDescartado(l: Lead) {
  const id = F.estadoId(l);
  if (id) return id === ST.RECHAZADO;
  return /cancel|descart|rechaz/.test(accionCal(l));
}
export function esSinRespuesta(l: Lead) {
  const id = F.estadoId(l);
  if (id) return id === ST.SIN_RESPUESTA;
  return /sin.?respuesta|no.?contest/.test(accionCal(l));
}
export function esCalificado(l: Lead) {
  const id = F.estadoId(l);
  if (id) return id === ST.ATENCION || id === ST.SEGUIMIENTO;
  return tieneDemo(l);
}
export function esAtencion(l: Lead) {
  const id = F.estadoId(l);
  if (id) return id === ST.ATENCION;
  return /alta|urgente/.test((firstNonEmpty(l.urgencia) || '').toString().toLowerCase());
}
export function conRespuesta(l: Lead) {
  return !esSinRespuesta(l);
}

// --- Periodos -------------------------------------------------
export const PERIODS = [
  { key: 'hoy', label: 'Hoy', days: 1 },
  { key: '7d', label: '7 días', days: 7 },
  { key: '30d', label: '30 días', days: 30 },
  { key: 'trimestre', label: 'Trimestre', days: 90 },
];

export function periodRange(period: string) {
  const def = PERIODS.find((p) => p.key === period) || PERIODS[2];
  if (!def.days) return { start: null, end: null, prevStart: null, prevEnd: null };
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (def.days - 1));
  start.setHours(0, 0, 0, 0);
  const prevEnd = new Date(start);
  prevEnd.setMilliseconds(-1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (def.days - 1));
  prevStart.setHours(0, 0, 0, 0);
  return { start, end, prevStart, prevEnd };
}

export function inRange(l: Lead, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return true;
  const f = F.fecha(l);
  if (!f) return true;
  return f >= start && f <= end;
}

// --- Formato --------------------------------------------------
export function fmtInt(n: number) {
  return (Math.round(n) || 0).toLocaleString('es-MX');
}
export function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
export function fmtDelta(cur: number, prev: number) {
  if (prev <= 0) return cur > 0 ? '100%' : '0%';
  return Math.round(((cur - prev) / prev) * 100) + '%';
}

// Curva suave (Catmull-Rom → bézier) para que la línea no se vea de picos.
export function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]} ${pts[0][1]}` : '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6,
      c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6,
      c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

// --- DEMO data (solo si webhook_url === 'DEMO') ---------------
export function demoLeads(): Lead[] {
  const fuentes = ['Facebook', 'WhatsApp', 'Instagram', 'Google'];
  const campanas = ['CIB Financiera', 'e-SIGeN', 'CIB Casa de Empeño', 'e-SIGeN PLD'];
  const nombres = ['Carlos Vega', 'Liliana Estrada', 'Jorge Herrera', 'Ana Ruiz', 'MVZ. Cesar Gamboa', 'Sci consultores'];
  const stages = [ST.RECHAZADO, ST.RECHAZADO, ST.SEGUIMIENTO, ST.SIN_RESPUESTA, ST.ATENCION, ST.RECHAZADO];
  const labels: Record<number, string> = {
    [ST.RECHAZADO]: 'rechazado',
    [ST.SEGUIMIENTO]: 'Seguimiento CAMILA',
    [ST.SIN_RESPUESTA]: 'SIN RESPUESTA',
    [ST.ATENCION]: 'atencion personalizada',
  };
  const out: Lead[] = [];
  for (let i = 0; i < 140; i++) {
    const daysAgo = Math.floor((i * 7) % 30);
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const id = stages[i % stages.length];
    out.push({
      nombre: nombres[i % nombres.length],
      telefono: '+52199' + (1000000 + i),
      precio: [0, 0, 150000, 500000][i % 4],
      estatus: labels[id],
      estatus_id: id,
      tags: [],
      fecha_creacion: `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}, ${1 + (i % 11)}:0${i % 6}:00 p.m.`,
      utm_medium: fuentes[i % fuentes.length],
      utm_campaign: campanas[i % campanas.length],
    });
  }
  return out;
}
