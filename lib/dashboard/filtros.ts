// Lógica de normalización/calificación de leads y filtros globales.
// Port 1:1 de legacy/src/dashboard.js (normalizeStatus, getLeadTags,
// isQualified, applyGlobalFilters, etiquetaIntra, cdeStage/cdeMotivo,
// parseCustomDate, formatPhone) como FUNCIONES PURAS: reciben clientType /
// clientId por parámetro en lugar de leer el `state` global del legacy.
// ESTA LÓGICA MUEVE LOS KPIs DE LOS CLIENTES — no cambiar sin comparar
// contra el legacy.

import type { CSSProperties } from 'react';
import type { ClientType } from '@/lib/config/ClientConfigProvider';
import {
  SLUGS,
  esCasaDeEmpeno,
  CEFEMEX_ETAPAS_CALIFICADAS,
  CEFEMEX_ETAPA_GANADO,
  CEFEMEX_ETAPA_PERDIDO,
  CEFEMEX_TAGS_CALIFICAN,
} from '@/lib/slugs';

// El shape real depende del webhook de cada cliente; los campos aquí son los
// que el dashboard toca. Todo lo demás viaja tal cual (…rest del webhook).
export interface Lead {
  nombre?: string;
  telefono?: string;
  estatus?: string;
  estatus_id?: number | string;
  estatus_original?: string; // solo Casa de Empeño (etapa real sin reescribir)
  etiquetas_display?: string; // solo Casa de Empeño
  fecha_creacion?: string;
  fecha_parsed?: Date;
  tipo_servicio?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  precio?: number | string;
  [key: string]: any;
}

export interface FiltrosGlobales {
  start: Date | null;
  end: Date | null;
  /** '' | 'intra' | 'organico' — solo aplica para CEFEMEX Capital. */
  etiqueta: string;
}

/** Tab activa del dashboard de hoteles (afecta el filtro por tipo_servicio). */
export type TabHotel = 'eventos' | 'reservas' | 'daypass' | 'restaurante' | 'social_listening';

// Mapa tab → tipo de servicio (port de TAB_SERVICE_MAP).
export const TAB_SERVICE_MAP: Record<string, string> = {
  eventos: 'Evento',
  reservas: 'Reserva',
  daypass: 'DayPass',
  restaurante: 'Restaurante',
};

// --- Fechas ---------------------------------------------------------------

// Port de parseCustomDate — maneja "3/2/2026, 5:37:27 p.m." (formato Kommo/n8n).
export function parseCustomDate(str: string | null | undefined): Date {
  if (!str) return new Date();
  try {
    const cleaned = str.replace(/\./g, '').replace(/p\s*m/i, 'PM').replace(/a\s*m/i, 'AM');
    const parts = cleaned.split(',');
    const datePart = parts[0].trim();
    const [d, m, y] = datePart.split('/').map(Number);

    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
      return new Date(y, m - 1, d);
    }
    return new Date(cleaned);
  } catch {
    return new Date();
  }
}

// --- Teléfonos (para la exportación a Excel) --------------------------------

// Port de formatPhone — separa lada (+XX) y formatea el número local.
export function formatPhone(phone: string | number | null | undefined): string {
  if (!phone) return '—';
  const raw = String(phone).trim();
  if (!raw.startsWith('+')) return raw;
  // Separar código de país (+XX) del número local
  const digits = raw.replace(/\D/g, '');
  const code = '+' + digits.slice(0, 2);
  let local = digits.slice(2);
  // México: quitar prefijo "1" de marcación móvil
  if (code === '+52' && local.length === 11 && local.startsWith('1')) {
    local = local.slice(1);
  }
  // Formato: XXX XXX XXXX
  if (local.length === 10) {
    return `[${code}] ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return `[${code}] ${local}`;
}

// --- Normalización de estatus -----------------------------------------------

// Port de normalizeStatus(status) — con clientType/clientId explícitos.
export function normalizeStatus(
  status: string | null | undefined,
  clientType: ClientType,
  clientId: string | null
): string {
  if (!status) return 'Desconocido';
  const s = status.toLowerCase().trim();

  // --- CEFEMEX CASA DE EMPEÑO: nombres legibles por etapa del funnel ---
  if (esCasaDeEmpeno(clientId)) {
    if (s.includes('perdid')) return 'Venta perdida';
    if (s.includes('rescate') || (s.includes('empe') && s.includes('otros'))) return 'Rescate / Empeño Otros';
    if (s.includes('oro') && s.includes('empe')) return 'Lead Empeño Oro';
    if (s.includes('cita')) return 'Cita agendada';
    if (s.includes('reagendar')) return 'Reagendar';
    if (s.includes('empeñad') || s.includes('empenad')) return 'Empeñado';
    // resto de etapas (contacto inicial, seguimiento, etc.): passthrough capitalizado
  }

  // --- NORMALIZACIÓN PARA HOTELES (EXCEPTO CEFEMEX) ---
  // Soporta tanto singular ("CALIFICADO RESERVA") como plural ("CALIFICADO RESERVAS")
  const isHotel = clientType === 'hotel' && clientId !== SLUGS.CEFEMEX;
  if (isHotel) {
    if (s.includes('calificado restaurante')) return 'Calificado Restaurante';
    if (s.includes('calificado daypass') || s.includes('calificado day pass')) return 'Calificado DayPass';
    if (s.includes('calificado reserva')) return 'Calificado Reserva';
    if (s.includes('calificado evento')) return 'Calificado Evento';
  }

  // Specific matches to preserve names
  if (s.includes('rechazado cefemex')) {
    return clientType === 'hotel' ? 'Cotizado' : 'Rechazado CEFEMEX';
  }
  if (s.includes('continuidad cefemex')) return 'Continuidad CEFEMEX';
  if (s.includes('documentacion') || s.includes('documentación')) return 'Documentación / Integración E1';
  if (s.includes('financiera')) return 'Revisión Financiera / Integración E2';
  if (s.includes('comité') || s.includes('comite')) return 'Comité / Autorización';

  // Específicos ANTES del genérico 'calificado' para evitar falsos matches
  if (s.includes('no_calificado') || s === 'no calificado') return 'No Calificado';
  if (s.includes('calificado cita')) return 'Calificado Cita';
  if (s.includes('calificado')) return 'Lead Calificado';
  if (s.includes('condicionado')) return 'Lead Condicionado';
  if (s.includes('rechazado')) return 'Rechazado';

  return status.charAt(0).toUpperCase() + status.slice(1);
}

// --- Etiquetas (tags de Kommo) -----------------------------------------------

function _extractTagNames(val: any): string[] {
  if (Array.isArray(val)) {
    return val
      .map((t) => (typeof t === 'object' ? t.name || t.label || t.tag || '' : String(t)).toLowerCase().trim())
      .filter(Boolean);
  }
  if (typeof val === 'string' && val.trim()) {
    return val
      .toLowerCase()
      .split(/[,;|\n]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

// Port de getLeadTags — busca las etiquetas donde sea que las mande el webhook.
export function getLeadTags(lead: Lead): string[] {
  // Campos conocidos (top-level)
  const knownFields = ['tags', 'etiquetas', 'contact_tags', 'tag', 'labels', 'tag_names', 'etiqueta'];
  for (const field of knownFields) {
    if (lead[field]) {
      const found = _extractTagNames(lead[field]);
      if (found.length > 0) return found;
    }
  }

  // Kommo API nativa: _embedded.tags
  if (lead._embedded && lead._embedded.tags) {
    const found = _extractTagNames(lead._embedded.tags);
    if (found.length > 0) return found;
  }

  // Fallback: escanea todos los campos array buscando objetos con .name que parezcan etiquetas
  const cdeKeywords = ['calificado', 'intra', 'oro', 'rescate', 'otros', 'condicionado'];
  for (const [key, val] of Object.entries(lead)) {
    if (['estatus', 'nombre', 'fecha_creacion', 'telefono', 'tipo_servicio', 'etiquetas_display'].includes(key)) continue;
    if (Array.isArray(val) && val.length > 0) {
      const items = _extractTagNames(val);
      if (items.some((s) => cdeKeywords.some((kw) => s.includes(kw)))) {
        return items;
      }
    }
  }

  return [];
}

export type EtiquetaIntra = 'Calificado Intra' | 'Condicionado Intra' | 'Orgánico';

// Etiqueta de origen del lead (CEFEMEX Capital) según tags de Kommo.
export function etiquetaIntra(lead: Lead): EtiquetaIntra {
  const tags = getLeadTags(lead);
  if (tags.includes('calificado_intra')) return 'Calificado Intra';
  if (tags.includes('condicionado_intra')) return 'Condicionado Intra';
  return 'Orgánico'; // no trae ninguno de los dos tags intra
}

// Estilos inline de la etiqueta (paridad con ETIQUETA_INTRA_STYLE del legacy).
export const ETIQUETA_INTRA_STYLE: Record<EtiquetaIntra, CSSProperties> = {
  'Calificado Intra': { color: '#059669', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)' },
  'Condicionado Intra': { color: '#d97706', background: 'rgba(245,158,11,0.13)', border: '1px solid rgba(245,158,11,0.35)' },
  'Orgánico': { color: '#64748b', background: 'rgba(100,116,139,0.14)', border: '1px solid rgba(100,116,139,0.35)' },
};

// --- CEFEMEX Casa de Empeño: funnel por texto de etapa ------------------------

export type CdeStageKey = 'oro' | 'otros' | 'cita' | 'reagendar' | 'empenado' | 'perdido';

export interface CdeMotivo {
  norm: string;
  label: string;
  anchor: string;
  id: string;
}

// Motivos de venta perdida (catálogo). Se matchea por TEXTO (anchor) o por ID de Kommo.
export const CDE_MOTIVOS: CdeMotivo[] = [
  { norm: 'monto insuficiente', label: 'Monto insuficiente', anchor: 'insuficiente', id: '36957695' },
  { norm: 'articulo fuera de catalogo', label: 'Fuera de catálogo', anchor: 'catalogo', id: '36957699' },
  { norm: 'acepto oferta de otra casa', label: 'Aceptó oferta de otra casa de empeño', anchor: 'oferta', id: '36957703' },
  { norm: 'no era joyeria de oro', label: 'No era oro', anchor: 'joyeria', id: '36957707' },
  { norm: 'no cumple lineamientos', label: 'No cumple lineamientos', anchor: 'lineamient', id: '36957711' },
  { norm: 'usuario dejo de contestar', label: 'Dejó de contestar', anchor: 'contestar', id: '36957715' },
  { norm: 'no se presento a las citas', label: 'No se presentó', anchor: 'presento', id: '36957719' },
  { norm: 'otros', label: 'Otros', anchor: 'otros', id: '36957723' },
];

// Port de cdeNorm — minúsculas sin acentos.
export function cdeNorm(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Port de cdeStage — clasifica el lead en una de las 6 etapas del funnel CDE.
export function cdeStage(lead: Lead): CdeStageKey | null {
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
function cdeValues(obj: any, out: string[] = []): string[] {
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

// Port de cdeMotivo — motivo de venta perdida por texto (anchor) o ID de Kommo.
export function cdeMotivo(lead: Lead): CdeMotivo {
  const raw = cdeValues(lead).join('  '); // crudo (para IDs numéricos)
  const hay = cdeNorm(raw); // normalizado (para texto)
  for (const m of CDE_MOTIVOS) {
    if (m.norm === 'otros') continue;
    if (hay.includes(m.anchor) || raw.includes(m.id)) return m;
  }
  return CDE_MOTIVOS.find((m) => m.norm === 'otros')!;
}

// --- Calificación -------------------------------------------------------------

// Port de isQualified(lead) — con clientType/clientId explícitos.
export function isQualified(lead: Lead | null | undefined, clientType: ClientType, clientId: string | null): boolean {
  if (!lead) return false;

  // --- CEFEMEX CAPITAL: se evalúa por ID de etapa del pipeline ---
  if (clientId === SLUGS.CEFEMEX) {
    const etapa = Number(lead.estatus_id);

    // Etapas #8 a #19 del pipeline → calificado directo.
    if (CEFEMEX_ETAPAS_CALIFICADAS.has(etapa)) return true;

    // Ganado: cuentan todos.
    if (etapa === CEFEMEX_ETAPA_GANADO) return true;

    // Perdido: solo si trae tag calificado_intra / condicionado_intra.
    if (etapa === CEFEMEX_ETAPA_PERDIDO) {
      return getLeadTags(lead).some((t) => CEFEMEX_TAGS_CALIFICAN.includes(String(t).toLowerCase()));
    }

    return false;
  }

  const s = (lead.estatus || '').toLowerCase();

  // --- HOTELES (excepto CEFEMEX) ---
  if (clientType === 'hotel' && clientId !== SLUGS.CEFEMEX) {
    return s.startsWith('calificado');
  }

  // --- INMOBILIARIA / REAL ESTATE ---
  // Solo cuenta "calificado cita" — el genérico "lead calificado" NO cuenta
  if (clientType === 'inmobiliaria') {
    return s.includes('calificado cita');
  }

  // --- CEFEMEX CASA DE EMPEÑO: califican las 6 etapas del funnel (incl. venta perdida) ---
  if (esCasaDeEmpeno(clientId)) {
    return cdeStage(lead) !== null;
  }

  // --- POLÍTICA GENERAL ---
  return [
    'calificado',
    'condicionado',
    'continuidad cefemex',
    'rechazado cefemex',
    'cotizado',
    'documentación',
    'documentacion',
    'integración',
    'integracion',
    'financiera',
    'comité',
    'comite',
    'autorización',
    'autorizacion',
  ].some((term) => s.includes(term));
}

// --- Filtro global ---------------------------------------------------------

// Port de applyGlobalFilters() — devuelve los leads filtrados en lugar de
// mutar state.filteredLeads. `activeTab` solo afecta a clientes hotel
// (filtro por tipo_servicio de la pestaña activa).
export function applyGlobalFilters(
  leads: Lead[],
  filters: FiltrosGlobales,
  clientType: ClientType,
  clientId: string | null,
  activeTab: TabHotel = 'eventos'
): Lead[] {
  return leads.filter((lead) => {
    if (!lead.fecha_parsed) return false;

    let match = true;
    if (filters.start) {
      match = match && lead.fecha_parsed >= filters.start;
    }
    if (filters.end) {
      match = match && lead.fecha_parsed <= filters.end;
    }

    // Filtrar por tipo de servicio si es hotel
    if (match && clientType === 'hotel') {
      const isCefemex = clientId === SLUGS.CEFEMEX;
      const expectedType = TAB_SERVICE_MAP[activeTab];

      if (expectedType) {
        if (isCefemex) {
          match = match && lead.tipo_servicio === expectedType;
        } else {
          // Para otros hoteles:
          // Un lead calificado aparece SOLO en su pestaña correspondiente.
          // Un lead general (no calificado) cuenta para TODAS las pestañas para sumar al total global e ingresos.
          const isQual = isQualified(lead, clientType, clientId);
          if (isQual) {
            match = match && lead.tipo_servicio === expectedType;
          } else {
            // Es un lead general, se queda para que sume al total de registros
            match = true;
          }
        }
      }
    }

    // Filtro global de etiqueta — solo CEFEMEX Capital
    if (match && clientId === SLUGS.CEFEMEX && filters.etiqueta) {
      const etq = etiquetaIntra(lead);
      if (filters.etiqueta === 'intra') {
        match = etq === 'Calificado Intra' || etq === 'Condicionado Intra';
      } else if (filters.etiqueta === 'organico') {
        match = etq === 'Orgánico';
      }
    }

    return match;
  });
}

// --- Métricas de KPIs -----------------------------------------------------

export interface Venta {
  id: string | number;
  monto: number | string;
  fecha: string | null;
  descripcion?: string | null;
  registrado_por?: string | null;
  client_slug?: string;
}

export interface MetricasDashboard {
  total: number;
  qualified: number;
  investment: number;
  sales: number;
  roi: number;
  conversionRate: number;
  cpl: number;
}

// Port de calculateMetrics() — leads YA filtrados por applyGlobalFilters.
export function calcularMetricas(
  filteredLeads: Lead[],
  ventas: Venta[],
  investmentRaw: number | string | null | undefined,
  filters: FiltrosGlobales,
  clientType: ClientType,
  clientId: string | null
): MetricasDashboard {
  const total = filteredLeads.length;
  const qualified = filteredLeads.filter((l) => isQualified(l, clientType, clientId)).length;

  const investment = parseFloat(String(investmentRaw)) || 0;

  // Filtrar ventas por el rango de fechas activo
  const filteredVentas = ventas.filter((v) => {
    if (!v.fecha) return true;
    const ventaDate = new Date(v.fecha + 'T00:00:00');
    if (filters.start && ventaDate < filters.start) return false;
    if (filters.end && ventaDate > filters.end) return false;
    return true;
  });
  const sales = filteredVentas.reduce((sum, v) => sum + parseFloat(String(v.monto || 0)), 0);

  const conversionRate = total > 0 ? qualified / total : 0;
  const roi = investment > 0 ? sales / investment : 0;
  const cpl = qualified > 0 ? investment / qualified : 0;

  return { total, qualified, investment, sales, roi, conversionRate, cpl };
}
