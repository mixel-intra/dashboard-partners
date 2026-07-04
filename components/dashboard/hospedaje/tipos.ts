// Tipos, constantes y helpers del Panel de Reservas de Hospedaje (Airtable).
// Port 1:1 del módulo "Panel de Reservas de Hospedaje" de legacy/src/dashboard.js.

export interface HospedajeReserva {
  airtable_id: string;
  sesion_id: string;
  nombre: string;
  email: string;
  fecha_entrada: Date | null;
  fecha_salida: Date | null;
  adultos: number;
  ninos: number;
  telefono: string;
  tipo_habitacion: string;
  cantidad_habitaciones: number;
  noches: number;
  total_estimado: number;
  estado: string;
  notas: string;
}

export interface HospedajeInteraccion {
  id?: number | string;
  client_slug: string;
  airtable_record_id: string;
  tipo: string;
  resultado: string | null;
  vendedor_nombre: string;
  vendedor_id: string | null;
  created_at: string;
}

export const HSP_STATUS_COLORS: Record<string, string> = {
  'Nuevo Lead': '#F59E0B',
  'Contactado': '#3B82F6',
  'Cotizado': '#8B5CF6',
  'Confirmado': '#10B981',
  'Check-in': '#06B6D4',
  'Check-out': '#6B7280',
  'Cancelado': '#EF4444',
  'No Show': '#EF4444',
};

export const HSP_CONFIRMED_STATUSES = ['Confirmado', 'Check-in', 'Check-out'];
export const HSP_PROCESS_STATUSES = ['Nuevo Lead', 'Contactado', 'Cotizado'];

export const HSP_PIPELINE = [
  'Nuevo Lead',
  'Contactado',
  'Cotizado',
  'Confirmado',
  'Check-in',
  'Check-out',
  'Cancelado',
  'No Show',
];

export const HSP_INTERACTION_ICONS: Record<string, string> = {
  llamada: 'call-outline',
  whatsapp: 'logo-whatsapp',
  email: 'mail-outline',
  nota: 'document-text-outline',
};

// Airtable manda "2026-05-15" (solo fecha) que JS parsea como medianoche UTC.
// Se agrega T12:00:00 para que el offset de zona horaria no corra el día.
export function parseAirtableDate(val: any): Date | null {
  if (!val) return null;
  const str = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + 'T12:00:00');
  return new Date(str);
}

export function esFechaValida(d: Date | null): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
}

// Mapeo de un record de Airtable → HospedajeReserva (mismos alias de campos).
export function mapAirtableReserva(r: any): HospedajeReserva {
  const f = r.fields || {};
  return {
    airtable_id: r.id,
    sesion_id: f['SesionID'] || f['sesionid'] || '',
    nombre: f['Nombre Cliente'] || f['nombre_cliente'] || 'Sin nombre',
    email: f['email'] || f['Email'] || '',
    fecha_entrada: parseAirtableDate(f['Fecha entrada'] || f['fecha_entrada']),
    fecha_salida: parseAirtableDate(f['Fecha salida'] || f['fecha_salida']),
    adultos: parseInt(f['Cantidad Adultos'] || f['cantidad_adultos'] || 0),
    ninos: parseInt(f['Cantidad Niños'] || f['cantidad_ninos'] || f['Cantidad Ninos'] || 0),
    telefono: f['Teléfono'] || f['Telefono'] || f['telefono'] || '',
    tipo_habitacion: f['Tipo Habitación'] || f['Tipo Habitacion'] || f['tipo_habitacion'] || '',
    cantidad_habitaciones: parseInt(f['Cantidad Habitaciones'] || f['cantidad_habitaciones'] || f['Cantidad...'] || 0),
    noches: parseInt(f['Noches'] || f['noches'] || 0),
    total_estimado: parseFloat(f['Total Estimado'] || f['total_estimado'] || 0),
    estado: f['Estado'] || f['estado'] || 'Nuevo Lead',
    notas: f['Notas'] || f['notas'] || '',
  };
}

export function fmtMonto(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

// formatPhone — port de dashboard.js (formato [+XX] XXX XXX XXXX).
export function formatPhone(phone: any): string {
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
