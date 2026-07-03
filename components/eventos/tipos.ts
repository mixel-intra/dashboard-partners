// CRM de eventos — tipos y constantes compartidas entre /pipeline y la tab
// de eventos del dashboard (Fase 8d). Port de pipeline.html (fuente canónica).

export const EVT_STATUS_COLORS: Record<string, string> = {
  'Nuevo Lead': '#F59E0B',
  Contactado: '#3B82F6',
  Cotizando: '#8B5CF6',
  'Cotización Enviada': '#06B6D4',
  Venta: '#10B981',
  Perdido: '#EF4444',
};
export const EVT_PIPELINE = ['Nuevo Lead', 'Contactado', 'Cotizando', 'Cotización Enviada', 'Venta', 'Perdido'];
export const EVT_PROCESS = ['Nuevo Lead', 'Contactado', 'Cotizando', 'Cotización Enviada'];

export const INTERACTION_ICONS: Record<string, string> = {
  llamada: 'call-outline',
  whatsapp: 'logo-whatsapp',
  email: 'mail-outline',
  nota: 'document-text-outline',
};

export interface EventosConfig {
  apiKey: string;
  baseId: string;
  tableName: string;
}

export interface EventoLead {
  airtable_id: string;
  nombre: string;
  email: string;
  telefono: string;
  tipo_evento: string;
  pax: number;
  fecha_evento: string;
  fecha_contacto: Date | null;
  total_estimado: number;
  estado: string;
  notas: string;
  detalles: string;
  conversacion: string;
}

export interface Interaccion {
  id?: number;
  client_slug: string;
  airtable_record_id: string;
  tipo: string;
  resultado: string;
  vendedor_nombre: string;
  vendedor_id: string | null;
  created_at: string;
}

// Normaliza eventos_config (acepta snake_case y camelCase, igual que el legacy).
export function normalizarEventosConfig(raw: any): EventosConfig {
  const c = raw || {};
  return {
    apiKey: c.api_key || c.apiKey || '',
    baseId: c.base_id || c.baseId || '',
    tableName: c.table_name || c.tableName || '',
  };
}

export function mapAirtableRecord(r: any): EventoLead {
  const f = r.fields || {};
  return {
    airtable_id: r.id,
    nombre: f['Nombre Cliente'] || 'Sin nombre',
    email: f['email'] || '',
    telefono: f['Telefono'] || '',
    tipo_evento: f['TipoEvento'] || '',
    pax: parseInt(f['PAX'] || 0),
    fecha_evento: f['FechaEvento'] || '',
    fecha_contacto: f['FechaContacto'] ? new Date(f['FechaContacto']) : null,
    total_estimado: parseFloat(f['TotalEstimado'] || 0),
    estado: f['Estado'] || 'Nuevo Lead',
    notas: f['Notas'] || '',
    detalles: f['Detalles'] || '',
    conversacion: f['Conversación'] || '',
  };
}

export function formatPhone(phone: string): string {
  if (!phone) return '—';
  const raw = String(phone).trim();
  if (!raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');
  const code = '+' + digits.slice(0, 2);
  let local = digits.slice(2);
  if (code === '+52' && local.length === 11 && local.startsWith('1')) local = local.slice(1);
  if (local.length === 10) return `[${code}] ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  return `[${code}] ${local}`;
}

export function fmtMoney(n: number, decimals = 0): string {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals });
}

export function tieneFecha(l: EventoLead): l is EventoLead & { fecha_contacto: Date } {
  return l.fecha_contacto instanceof Date && !isNaN(l.fecha_contacto.getTime());
}
