// ============================================================
// CEFEMEX CASA DE EMPEÑO — lógica pura del módulo CDE.
// Port 1:1 de legacy/src/dashboard.js líneas 6791-7458.
// SOLO aplica cuando clientId === 'casa-de-empeño'.
// ============================================================

import type { Plugin } from 'chart.js';

export const CDE_SLUG = 'casa-de-empeño';

export const CDE_STAGES = [
  { key: 'oro', label: 'Empeño Oro', color: '#f59e0b' },
  { key: 'otros', label: 'Rescate / Otros', color: '#8b5cf6' },
  { key: 'cita', label: 'Cita agendada', color: '#3b82f6' },
  { key: 'reagendar', label: 'Reagendar', color: '#06b6d4' },
  { key: 'empenado', label: 'Empeñado', color: '#22c55e' },
  { key: 'perdido', label: 'Venta perdida', color: '#ef4444' },
] as const;

// Motivos de venta perdida (catálogo). Se matchea por TEXTO (anchor) o por ID de Kommo.
export const CDE_MOTIVOS = [
  { norm: 'monto insuficiente', label: 'Monto insuficiente', anchor: 'insuficiente', id: '36957695' },
  { norm: 'articulo fuera de catalogo', label: 'Fuera de catálogo', anchor: 'catalogo', id: '36957699' },
  { norm: 'acepto oferta de otra casa', label: 'Aceptó oferta de otra casa de empeño', anchor: 'oferta', id: '36957703' },
  { norm: 'no era joyeria de oro', label: 'No era oro', anchor: 'joyeria', id: '36957707' },
  { norm: 'no cumple lineamientos', label: 'No cumple lineamientos', anchor: 'lineamient', id: '36957711' },
  { norm: 'usuario dejo de contestar', label: 'Dejó de contestar', anchor: 'contestar', id: '36957715' },
  { norm: 'no se presento a las citas', label: 'No se presentó', anchor: 'presento', id: '36957719' },
  { norm: 'otros', label: 'Otros', anchor: 'otros', id: '36957723' },
];

// Paleta sobria (tonos apagados) para el doughnut — coherente con el dashboard oscuro.
export const CDE_PIE_COLORS = ['#6C8EBF', '#C9A66B', '#9988C9', '#6BA89C', '#C98B8B', '#7E8AA0', '#B5896A', '#9AA0AA'];

export const CDE_CHIP_ESTADOS = [
  'Lead Empeño Oro',
  'Rescate / Empeño Otros',
  'Cita agendada',
  'Reagendar',
  'Empeñado',
  'Venta perdida',
];

// Inversión mensual: el gasto vive en ad_spend (por mes, Mayo–Diciembre 2026).
export const CDE_MESES = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
export const CDE_MES_LABEL: Record<string, string> = {
  '2026-05': 'Mayo 2026',
  '2026-06': 'Junio 2026',
  '2026-07': 'Julio 2026',
  '2026-08': 'Agosto 2026',
  '2026-09': 'Septiembre 2026',
  '2026-10': 'Octubre 2026',
  '2026-11': 'Noviembre 2026',
  '2026-12': 'Diciembre 2026',
};

export function cdeDefaultMonth(): string {
  const now = new Date().toISOString().slice(0, 7);
  return CDE_MESES.includes(now) ? now : '2026-05';
}

export function cdeNorm(s: unknown): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export type CdeStageKey = (typeof CDE_STAGES)[number]['key'] | null;

export function cdeStage(lead: any): CdeStageKey {
  const s = cdeNorm(lead.estatus_original || lead.estatus);
  if (s.includes('oro') && s.includes('empe')) return 'oro';
  if (s.includes('rescate') || s.includes('otros')) return 'otros';
  if (s.includes('cita')) return 'cita';
  if (s.includes('reagendar')) return 'reagendar';
  if (s.includes('empenad')) return 'empenado';
  if (s.includes('perdid')) return 'perdido';
  return null;
}

// Junta TODOS los valores string del lead (incluye campos personalizados anidados),
// para buscar el motivo donde sea que Kommo lo mande (tags, custom fields, etc.).
export function cdeValues(obj: any, out: string[] = []): string[] {
  if (obj == null) return out;
  const t = typeof obj;
  if (t === 'string') {
    out.push(obj);
    return out;
  }
  if (t === 'number') {
    out.push(String(obj)); // incluye IDs numéricos
    return out;
  }
  if (t === 'boolean') return out;
  if (Array.isArray(obj)) {
    obj.forEach((v) => cdeValues(v, out));
    return out;
  }
  if (t === 'object') {
    Object.values(obj).forEach((v) => cdeValues(v, out));
    return out;
  }
  return out;
}

export function cdeMotivo(lead: any) {
  const raw = cdeValues(lead).join('  '); // crudo (para IDs numéricos)
  const hay = cdeNorm(raw); // normalizado (para texto)
  for (const m of CDE_MOTIVOS) {
    if (m.norm === 'otros') continue;
    if (hay.includes(m.anchor) || raw.includes(m.id)) return m;
  }
  return CDE_MOTIVOS.find((m) => m.norm === 'otros')!;
}

export interface CdePieEntry {
  label: string;
  n: number;
}

export function cdeConteos(leads: any[]) {
  const counts: Record<string, number> = {};
  CDE_STAGES.forEach((s) => (counts[s.key] = 0));
  const perdidos: any[] = [];
  leads.forEach((l) => {
    const k = cdeStage(l);
    if (k) counts[k]++;
    if (k === 'perdido') perdidos.push(l);
  });
  const totalFunnel = CDE_STAGES.reduce((a, s) => a + counts[s.key], 0);
  return { counts, perdidos, totalFunnel, empenados: counts.empenado };
}

export function cdePieEntries(perdidos: any[]): { entries: CdePieEntry[]; total: number } {
  const counts: Record<string, number> = {};
  CDE_MOTIVOS.forEach((m) => (counts[m.norm] = 0));
  perdidos.forEach((l) => {
    counts[cdeMotivo(l).norm]++;
  });
  const total = perdidos.length;
  // Mayor a menor (rebanada más grande primero) y sin ceros.
  const entries = CDE_MOTIVOS.map((m) => ({ label: m.label, n: counts[m.norm] }))
    .filter((e) => e.n > 0)
    .sort((a, b) => b.n - a.n);
  return { entries, total };
}

// Monto TOTAL empeñado (suma del Presupuesto de TODOS los empeñados del periodo filtrado)
export function cdeTotalMontoEmpenado(leads: any[]): number {
  let monto = 0;
  leads.forEach((l) => {
    if (cdeStage(l) === 'empenado') monto += Number(l.precio || l.price || 0);
  });
  return monto;
}

// Meses (YYYY-MM) presentes en el periodo filtrado (según la fecha de los leads)
export function cdePeriodMonths(leads: any[]): string[] {
  const set = new Set<string>();
  leads.forEach((l) => {
    const d = l.fecha_parsed;
    if (d && typeof d.getFullYear === 'function') {
      set.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
  });
  return [...set];
}

// Inversión y ROAS del PERIODO FILTRADO (respeta el filtro de fecha).
export function cdeCalcularRoas(leads: any[], spendMap: Record<string, number>) {
  const months = cdePeriodMonths(leads);
  const periodSpend = months.reduce((a, m) => a + (spendMap[m] || 0), 0);
  let label: string;
  if (months.length === 0) label = 'Sin datos en el periodo';
  else if (months.length === 1) label = CDE_MES_LABEL[months[0]] || months[0];
  else label = 'Periodo filtrado';
  const totalMonto = cdeTotalMontoEmpenado(leads);
  const roas = periodSpend > 0 ? totalMonto / periodSpend : 0;
  return { months, periodSpend, label, totalMonto, roas };
}

// Envuelve un texto en las líneas necesarias para que quepan en maxWidth (NO descarta palabras).
function cdeWrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (!cur || ctx.measureText(test).width <= maxWidth) cur = test;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [String(text || '')];
}

// Plugin: muestra EN EL CENTRO el detalle de la sección activa (al pasar el cursor).
// Sin hover → total. Con hover → %, motivo y "N de total". Port 1:1 del legacy.
export const cdeCenterLabel: Plugin<'doughnut'> = {
  id: 'cdeCenterLabel',
  afterDraw(chart: any) {
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data.length) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const arc0 = meta.data[0];
    const cx = arc0.x,
      cy = arc0.y;
    const inner = arc0.innerRadius || 60;
    const ds = chart.data.datasets[0];
    const data: number[] = ds.data || [];
    const total = data.reduce((a, b) => a + (Number(b) || 0), 0) || 1;
    const names: string[] = chart.$cdeNames || [];
    const active = typeof chart.getActiveElements === 'function' ? chart.getActiveElements() : [];

    let big: string, name: string, sub: string, accent: string;
    if (active.length) {
      const i = active[0].index;
      big = Math.round((data[i] / total) * 100) + '%';
      name = names[i] || '';
      sub = data[i] + ' de ' + total;
      accent = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : '#cbd5e1';
    } else {
      big = String(total);
      name = 'Ventas perdidas';
      sub = inner > 90 ? 'pasa el cursor por una sección' : ''; // solo en dona grande (modal)
      accent = '#cbd5e1';
    }
    const maxW = inner * 1.45;
    const ff = 'Inter, system-ui, sans-serif';
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const bigSize = Math.max(20, Math.round(inner * 0.5));
    let nameSize = Math.max(11, Math.round(inner * 0.16));
    const subSize = Math.max(9, Math.round(inner * 0.12));

    ctx.font = `700 ${nameSize}px ${ff}`;
    let nameLines = cdeWrapText(ctx, name, maxW);
    let g = 0;
    while (nameLines.length > 2 && nameSize > 9 && g < 14) {
      nameSize -= 1;
      ctx.font = `700 ${nameSize}px ${ff}`;
      nameLines = cdeWrapText(ctx, name, maxW);
      g++;
    }

    const nameLH = Math.round(nameSize * 1.18);
    const gapBigName = Math.round(inner * 0.1);
    const gapNameSub = Math.round(inner * 0.06);
    const totalH = bigSize + gapBigName + nameLines.length * nameLH + (sub ? gapNameSub + subSize : 0);
    let y = cy - totalH / 2;

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${bigSize}px ${ff}`;
    ctx.fillText(big, cx, y);
    y += bigSize + gapBigName;

    ctx.fillStyle = accent;
    ctx.font = `700 ${nameSize}px ${ff}`;
    nameLines.forEach((l) => {
      ctx.fillText(l, cx, y);
      y += nameLH;
    });

    if (sub) {
      y += gapNameSub - (nameLH - nameSize);
      ctx.fillStyle = 'rgba(148,163,184,0.95)';
      ctx.font = `500 ${subSize}px ${ff}`;
      ctx.fillText(sub, cx, y);
    }
    ctx.restore();
  },
};
