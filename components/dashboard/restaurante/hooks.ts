'use client';

// Hooks de datos del módulo Restaurante — port de legacy/src/dashboard.js
// (fetchRestaurantReservations, archived/released, restaurant_availability,
// notas/vistos en localStorage y las mutaciones confirmar/rechazar/editar/
// crear). Escritorio y móvil consumen ESTOS mismos hooks (muere el
// monkey-patch de window.fetchRestaurantReservations del legacy).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { tieneArchivoReservas } from '@/lib/slugs';

// ============================================================
// Tipos
// ============================================================

export interface Reserva {
  id: string;
  kommoLeadId: string | number | null;
  kommoChatId: string;
  nombre: string;
  email: string;
  telefono: string;
  tipoEvento: string;
  pax: number | string;
  fechaEvento: string;
  horaEvento: string;
  estado: string;
  detalles: string;
  conversacion: string;
  /** Momento en que se creó el registro: ancla los relativos ("hoy",
   *  "mañana", "lunes 18") al día en que el cliente lo dijo, no a hoy. */
  createdTime: string;
  /** Fecha parseada del texto libre de FechaEvento. */
  fechaParsed: Date | null;
  /** Canal Kommo (feature latente — hoy el webhook no lo manda). */
  kommoSource?: string;
}

export type VistaReserva = 'nuevos' | 'confirmadas' | 'todas' | 'rechazadas' | 'archivadas';

export interface Disponibilidad {
  accepting: boolean;
  closedDates: string[];
  dailyCapacity: number | null;
  soldOutDate: string | null;
  soldOutTime: string | null;
  closedEventDate: string | null;
  closedEventTime: string | null;
  soldOutMessage: string;
  closedEventMessage: string;
}

// Mensajes por defecto que usará el agente (editables desde el panel).
export const DEFAULT_SOLD_OUT_MSG =
  '¡Gracias por escribirnos! Por hoy estamos sold out y no puedo tomar nuevas reservas. Pero puedes venir como walk-in y con gusto intentamos conseguirte una mesa según disponibilidad. ¡Te esperamos en la terraza!';
export const DEFAULT_CLOSED_EVENT_MSG =
  'Hoy permanecemos cerrados por una eventualidad fuera de nuestro control, así que por hoy no podemos recibir reservas ni walk-ins. Lamentamos el inconveniente y te esperamos muy pronto con la mejor vista de Santo Domingo.';

const DISPONIBILIDAD_INICIAL: Disponibilidad = {
  accepting: true,
  closedDates: [],
  dailyCapacity: 80,
  soldOutDate: null,
  soldOutTime: null,
  closedEventDate: null,
  closedEventTime: null,
  soldOutMessage: '',
  closedEventMessage: '',
};

// ============================================================
// Parsing de fechas en español (port 1:1 de parseFechaEvento y helpers)
// ============================================================

const MESES_MAP: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
  septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8,
  oct: 9, nov: 10, dic: 11,
};

const DIAS_MAP: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5,
  sabado: 6, sábado: 6,
};

function applyTime(date: Date, t: { h: number; m: number } | null) {
  if (t) date.setHours(t.h, t.m, 0, 0);
  else date.setHours(0, 0, 0, 0);
}

// Extrae la hora de cualquier parte del texto. Soporta: "8pm", "8 pm", "8p",
// "8:30pm", "8:30 p.m.", "20:30", "9:45 PM", "a las 8", "a las 8:30".
function extractTime(s: string): { h: number; m: number } | null {
  let m: RegExpMatchArray | null;
  // hh:mm con am/pm opcional (incluye "p.m." / "a. m.")
  m = s.match(/(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?/i);
  if (m) {
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const ap = (m[3] || '').replace(/[.\s]/g, '').toLowerCase();
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
    return { h, m: min };
  }
  // "8pm" / "8 p.m." / "8p" / "a las 8 pm" (sin minutos, requiere marcador)
  m = s.match(/(?:a\s+las\s+)?(\d{1,2})\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm|p|a)\b/i);
  if (m) {
    let h = parseInt(m[1]);
    const ap = (m[2] || '').replace(/[.\s]/g, '').toLowerCase();
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
    return { h, m: 0 };
  }
  // "a las 8" sin am/pm → reservas de restaurante = tarde/noche, asumimos PM
  m = s.match(/a\s+las\s+(\d{1,2})(?::(\d{2}))?/i);
  if (m) {
    let h = parseInt(m[1]);
    const min = parseInt(m[2] || '0');
    if (h < 12 && h >= 1) h += 12;
    return { h, m: min };
  }
  return null;
}

// Ajusta el año cuando el texto no lo trae, eligiendo el más cercano a la fecha
// de referencia (maneja el rollover dic→ene).
function inferYear(month: number, day: number, ref: Date): Date {
  const refY = ref.getFullYear();
  let cand = new Date(refY, month, day);
  const diffDays = (cand.getTime() - ref.getTime()) / 86400000;
  if (diffDays < -120) cand = new Date(refY + 1, month, day);
  else if (diffDays > 300) cand = new Date(refY - 1, month, day);
  return cand;
}

// Parsea el texto libre de FechaEvento (lo escribe el agente con lo que dijo el
// cliente: "29 de mayo 9pm", "lunes 18, 6:40 pm", "hoy 8pm", "2026-05-25 14:30",
// "24/5/2026 8:30pm"…). refDate (createdTime de la reserva) ancla los relativos.
export function parseFechaEvento(dateStr: string | null | undefined, refDate?: string | Date): Date | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const ref = refDate ? new Date(refDate) : new Date();
  if (isNaN(ref.getTime())) ref.setTime(Date.now());
  const lower = str.toLowerCase();
  const time = extractTime(lower);

  // ISO date-only "YYYY-MM-DD" → medianoche LOCAL (evita desfase de día en UTC-6).
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); applyTime(d, time); return d; }

  // "YYYY-MM-DD HH:mm" o ISO con T
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);

  // "DD/MM/YYYY" o "DD-MM-YYYY" (año 2 o 4 dígitos)
  m = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (m) {
    let y = parseInt(m[3]);
    if (y < 100) y += 2000;
    const d = new Date(y, parseInt(m[2]) - 1, parseInt(m[1]));
    applyTime(d, time);
    return d;
  }

  // Relativos anclados a la fecha de creación de la reserva
  if (/\bhoy\b/.test(lower) && !/\d{1,2}\s+de\s+/.test(lower)) {
    const d = new Date(ref); applyTime(d, time); return d;
  }
  if (/\bma[nñ]ana\b/.test(lower) && !/\d{1,2}\s+de\s+/.test(lower)) {
    const d = new Date(ref); d.setDate(d.getDate() + 1); applyTime(d, time); return d;
  }

  // "DD de MES [de YYYY]" (también "viernes 8 de mayo")
  m = lower.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+(?:de\s+)?(\d{4}))?/);
  if (m && MESES_MAP[m[2]] !== undefined) {
    const day = parseInt(m[1]);
    const mes = MESES_MAP[m[2]];
    const d = m[3] ? new Date(parseInt(m[3]), mes, day) : inferYear(mes, day, ref);
    applyTime(d, time);
    return d;
  }

  // "DD MES [YYYY]" sin "de" — "16 mayo 2026", "28 feb"
  m = lower.match(/\b(\d{1,2})\s+([a-záéíóú]{3,})(?:\s+(\d{4}))?/);
  if (m && MESES_MAP[m[2]] !== undefined) {
    const day = parseInt(m[1]);
    const mes = MESES_MAP[m[2]];
    const d = m[3] ? new Date(parseInt(m[3]), mes, day) : inferYear(mes, day, ref);
    applyTime(d, time);
    return d;
  }

  // Día de la semana ("lunes 18", "este viernes", "Sábado a las 8") → próxima
  // ocurrencia en/después de la fecha de referencia.
  for (const name in DIAS_MAP) {
    if (new RegExp('\\b' + name + '\\b').test(lower)) {
      const d = new Date(ref);
      d.setHours(0, 0, 0, 0);
      let add = (DIAS_MAP[name] - d.getDay() + 7) % 7;
      if (/pr[oó]ximo|siguiente/.test(lower) && add === 0) add = 7;
      d.setDate(d.getDate() + add);
      applyTime(d, time);
      return d;
    }
  }

  // Sólo hora ("8:30 pm" suelto) → ref + hora
  if (time) { const d = new Date(ref); applyTime(d, time); return d; }

  // Fallback nativo
  const nat = new Date(str);
  if (!isNaN(nat.getTime()) && nat.getFullYear() > 2000) return nat;
  return null;
}

// ============================================================
// Helpers de fecha/formato compartidos escritorio + móvil
// ============================================================

export function formatTime(hora: string | null | undefined): string {
  if (!hora) return '';
  const parts = hora.split(':');
  let h = parseInt(parts[0]);
  const m = parseInt(parts[1] || '0');
  if (isNaN(h)) return hora;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function dateKey(d: Date | null | undefined): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKeyMx(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatReservationDate(input: Reserva | string | null | undefined): string {
  if (!input) return 'N/A';
  const d =
    typeof input === 'object' && input.fechaParsed
      ? input.fechaParsed
      : parseFechaEvento(typeof input === 'string' ? input : input.fechaEvento);
  if (d) return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  return (typeof input === 'string' ? input : input.fechaEvento) || 'N/A';
}

export function isReservationToday(r: Reserva): boolean {
  const d = r.fechaParsed;
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function isReservationInWeek(r: Reserva, start: Date, end: Date): boolean {
  const d = r.fechaParsed;
  if (!d) return false;
  return d >= start && d <= end;
}

// Fecha "hoy" en la zona horaria del negocio (Santo Domingo), formato YYYY-MM-DD.
// El estado Sold Out / Cerrado se considera activo solo si su fecha === hoy,
// por lo que se restablece solo al cruzar la medianoche local.
export function todayBusinessDate(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function nowBusinessTime(): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Santo_Domingo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    return new Date().toTimeString().slice(0, 5);
  }
}

export function formatBusinessDateLabel(d: string): string {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

// ¿La reserva r pertenece a la vista dada? (nuevos/confirmadas/todas/rechazadas/archivadas)
export function matchesRestaurantView(r: Reserva, viewKey: VistaReserva, archivadas: Set<string>): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = r.fechaParsed
    ? (() => { const x = new Date(r.fechaParsed as Date); x.setHours(0, 0, 0, 0); return x; })()
    : null;
  const isUpcomingOrUndated = !d || d >= today;
  const isArchived = archivadas.has(r.id);

  // Vista "archivadas": solo las archivadas, sin otros filtros.
  if (viewKey === 'archivadas') return isArchived;

  // En el resto de vistas, las archivadas no aparecen.
  if (isArchived) return false;

  switch (viewKey) {
    case 'nuevos':
      // Solo los que aún son accionables (futuros o sin fecha). Los pasados sin responder son ruido histórico.
      return r.estado === 'Nuevo Lead' && isUpcomingOrUndated;
    case 'confirmadas':
      // Confirmadas futuras (la agenda operativa)
      return r.estado === 'Confirmado' && isUpcomingOrUndated;
    case 'rechazadas':
      return r.estado === 'Rechazado';
    case 'todas':
    default:
      return true;
  }
}

// Smart sort compartido: hoy primero, futuras ASC, pasadas al fondo DESC;
// mismo día → por hora ascendente.
export function ordenarReservas(reservas: Reserva[]): Reserva[] {
  const lista = [...reservas];
  lista.sort((a, b) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const aDate = a.fechaParsed ? new Date(a.fechaParsed) : new Date(0);
    const bDate = b.fechaParsed ? new Date(b.fechaParsed) : new Date(0);
    const aDay = new Date(aDate); aDay.setHours(0, 0, 0, 0);
    const bDay = new Date(bDate); bDay.setHours(0, 0, 0, 0);
    const aPast = aDay < today;
    const bPast = bDay < today;
    if (!aPast && bPast) return -1;
    if (aPast && !bPast) return 1;
    if (aPast && bPast) return bDay.getTime() - aDay.getTime();
    // mismo día → por hora ascendente
    if (aDay.getTime() === bDay.getTime()) {
      const aH = a.horaEvento || '';
      const bH = b.horaEvento || '';
      return aH.localeCompare(bH);
    }
    return aDay.getTime() - bDay.getTime();
  });
  return lista;
}

// ============================================================
// useReservas — fetch del webhook (vía /api/proxy) + normalización
// ============================================================

export function useReservas() {
  const { clientId, restaurantConfig } = useClientConfig();
  const webhookUrl = restaurantConfig.airtableWebhookUrl;

  const query = useQuery({
    queryKey: ['rest-reservas', clientId],
    enabled: !!clientId && !!webhookUrl,
    queryFn: async (): Promise<Reserva[]> => {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(webhookUrl)}`;
      const response = await fetch(proxyUrl);
      const rawData: any = await response.json().catch(() => null);

      if (!response.ok) {
        console.warn('Webhook respondió con error', response.status, rawData);
      }

      // Normaliza: el webhook puede responder array vacío, objeto vacío, null
      // o un objeto con error (n8n devuelve {error: ...} cuando no encuentra
      // nada — incluso con status 4xx/5xx). Cualquiera de estos = "sin
      // reservas todavía", no un error técnico que asuste al operador.
      let dataArray: any[];
      if (Array.isArray(rawData)) {
        dataArray = rawData;
      } else if (rawData && typeof rawData === 'object' && !rawData.error) {
        const hasAnyRealKey = Object.keys(rawData).some((k) => {
          const v = rawData[k];
          return v !== null && v !== '' && v !== undefined;
        });
        dataArray = hasAnyRealKey ? [rawData] : [];
      } else {
        dataArray = [];
      }

      const reservas: Reserva[] = dataArray.map((r: any) => ({
        id: r.id || r.ID || r.record_id || '',
        kommoLeadId: r.kommo_lead_id || r.kommoLeadId || null,
        kommoChatId: r.kommo_chat_id || r.kommoChatId || '',
        nombre: r['Nombre Cliente'] || r.nombre_cliente || r.nombre || '',
        email: r.email || r.Email || '',
        telefono: r['Telefono'] || r.telefono || r.Telefono || '',
        tipoEvento: r['TipoEvento'] || r.tipo_evento || r.tipoEvento || '',
        pax: r.PAX || r.pax || 0,
        fechaEvento: r['FechaEvento'] || r.fecha_evento || r.fechaEvento || '',
        horaEvento: r['HoraEvento'] || r.hora_evento || r.horaEvento || '',
        estado: r.Estado || r.estado || 'Nuevo Lead',
        detalles: r.Detalles || r.detalles || '',
        conversacion: r.Conversacion || r.conversacion || '',
        createdTime: r.createdTime || r.created_time || r.created_at || '',
        fechaParsed: null,
      }));

      // Parsear fechas y extraer hora si no viene separada
      reservas.forEach((r) => {
        r.fechaParsed = parseFechaEvento(r.fechaEvento, r.createdTime);
        // Fallback: si horaEvento está vacío pero FechaEvento traía hora (ISO
        // datetime), extraerla de la fecha parseada para que se muestre.
        if (!r.horaEvento && r.fechaParsed) {
          const h = r.fechaParsed.getHours();
          const m = r.fechaParsed.getMinutes();
          if (h !== 0 || m !== 0) {
            r.horaEvento = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          }
        }
      });

      return reservas;
    },
  });

  return {
    reservas: query.data || [],
    /** Sin origen de reservas configurado → estado "Restaurante en preparación". */
    sinConfig: !webhookUrl,
    cargando: query.isLoading,
    refrescando: query.isFetching,
    /** Solo errores genuinos de red llegan aquí (los 4xx/5xx se normalizan a vacío). */
    errorRed: !!query.error,
    refrescar: query.refetch,
    actualizadoEn: query.dataUpdatedAt,
    errorEn: query.errorUpdatedAt,
  };
}

// ============================================================
// useArchivoReservas — archivadas + liberadas (solo roof-107) y sus mutaciones
// ============================================================

export function useArchivoReservas() {
  const { clientId, clientSupabase } = useClientConfig();
  const queryClient = useQueryClient();
  const habilitado = tieneArchivoReservas(clientId);

  const archivadasQ = useQuery({
    queryKey: ['rest-archivadas', clientId],
    enabled: habilitado && !!clientId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await clientSupabase.from('archived_reservations').select('reservation_id');
      if (error) {
        console.warn('No se pudieron cargar IDs archivados:', error.message);
        return new Set<string>();
      }
      return new Set<string>((data || []).map((r: any) => r.reservation_id));
    },
  });

  const liberadasQ = useQuery({
    queryKey: ['rest-liberadas', clientId],
    enabled: habilitado && !!clientId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await clientSupabase.from('released_reservations').select('reservation_id');
      if (error) {
        console.warn('No se pudieron cargar IDs liberados:', error.message);
        return new Set<string>();
      }
      return new Set<string>((data || []).map((r: any) => r.reservation_id));
    },
  });

  // Actualiza el Set cacheado sin re-fetch (mismo patrón que el legacy mutando el Set local).
  const actualizarSet = useCallback(
    (clave: string, ids: string[], agregar: boolean) => {
      queryClient.setQueryData([clave, clientId], (prev: Set<string> | undefined) => {
        const next = new Set(prev || []);
        ids.forEach((id) => (agregar ? next.add(id) : next.delete(id)));
        return next;
      });
    },
    [queryClient, clientId]
  );

  const archivar = useMutation({
    mutationFn: async (ids: string[]) => {
      const rows = ids.map((id) => ({ reservation_id: id }));
      const { error } = await clientSupabase
        .from('archived_reservations')
        .upsert(rows, { onConflict: 'reservation_id' });
      if (error) throw error;
      return ids;
    },
    onSuccess: (ids) => actualizarSet('rest-archivadas', ids, true),
  });

  const desarchivar = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await clientSupabase.from('archived_reservations').delete().in('reservation_id', ids);
      if (error) throw error;
      return ids;
    },
    onSuccess: (ids) => actualizarSet('rest-archivadas', ids, false),
  });

  const liberar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await clientSupabase
        .from('released_reservations')
        .upsert({ reservation_id: id }, { onConflict: 'reservation_id' });
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => actualizarSet('rest-liberadas', [id], true),
  });

  const restaurar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await clientSupabase.from('released_reservations').delete().eq('reservation_id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => actualizarSet('rest-liberadas', [id], false),
  });

  return {
    habilitado,
    archivadas: archivadasQ.data || new Set<string>(),
    liberadas: liberadasQ.data || new Set<string>(),
    archivar,
    desarchivar,
    liberar,
    restaurar,
  };
}

// ============================================================
// useDisponibilidad — tabla restaurant_availability (Supabase del cliente)
// ============================================================

export function useDisponibilidad() {
  const { clientId, clientSupabase } = useClientConfig();
  // Igual que el legacy: un objeto mutable compartido que la UI edita antes de
  // guardar (toggle, fechas cerradas, etc.). El query lo inicializa desde la DB.
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad>(DISPONIBILIDAD_INICIAL);

  const query = useQuery({
    queryKey: ['rest-disponibilidad', clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<Disponibilidad | null> => {
      try {
        const { data } = await clientSupabase
          .from('restaurant_availability')
          .select('*')
          .eq('singleton', true)
          .maybeSingle();
        if (!data) return null;
        return {
          accepting: data.accepting_reservations !== false,
          closedDates: data.closed_dates || [],
          dailyCapacity: data.daily_capacity || 80,
          soldOutDate: data.sold_out_date || null,
          soldOutTime: data.sold_out_time ? String(data.sold_out_time).slice(0, 5) : null,
          closedEventDate: data.closed_event_date || null,
          closedEventTime: data.closed_event_time ? String(data.closed_event_time).slice(0, 5) : null,
          soldOutMessage: data.sold_out_message || DEFAULT_SOLD_OUT_MSG,
          closedEventMessage: data.closed_event_message || DEFAULT_CLOSED_EVENT_MSG,
        };
      } catch (e) {
        console.warn('Could not load restaurant availability:', e);
        return null;
      }
    },
  });

  useEffect(() => {
    if (query.data) setDisponibilidad(query.data);
  }, [query.data]);

  // Upsert genérico: el caller arma la fila (el escritorio guarda todo; el
  // móvil solo accepting/closed_dates/daily_capacity, como en el legacy).
  const guardar = useMutation({
    mutationFn: async (fila: Record<string, any>) => {
      const { error } = await clientSupabase
        .from('restaurant_availability')
        .upsert(fila, { onConflict: 'singleton' });
      if (error) throw error;
    },
  });

  return { disponibilidad, setDisponibilidad, guardar };
}

// ============================================================
// useNotasReserva — notas internas + vistos (localStorage)
//   rest_notes_${clientId}_${reservationId} / rest_seen_${clientId}
// ============================================================

export function useNotasReserva(reservas: Reserva[]) {
  const { clientId } = useClientConfig();
  // Bump para re-pintar el flag de notas en las tarjetas al guardar (paridad
  // con el renderRestaurantReservations() que disparaba saveReservationNotes).
  const [versionNotas, setVersionNotas] = useState(0);
  const [vistos, setVistos] = useState<string[]>([]);

  useEffect(() => {
    try {
      setVistos(JSON.parse(localStorage.getItem(`rest_seen_${clientId}`) || '[]'));
    } catch {
      setVistos([]);
    }
  }, [clientId]);

  const obtenerNotas = useCallback(
    (reservationId: string): string => {
      if (!reservationId || typeof window === 'undefined') return '';
      return localStorage.getItem(`rest_notes_${clientId}_${reservationId}`) || '';
    },
    [clientId]
  );

  const guardarNotas = useCallback(
    (reservationId: string, text: string) => {
      if (!reservationId) return;
      const key = `rest_notes_${clientId}_${reservationId}`;
      if (text.trim()) localStorage.setItem(key, text);
      else localStorage.removeItem(key);
      setVersionNotas((v) => v + 1);
    },
    [clientId]
  );

  const tieneNotas = useCallback(
    (reservationId: string): boolean => {
      if (!reservationId || typeof window === 'undefined') return false;
      return !!localStorage.getItem(`rest_notes_${clientId}_${reservationId}`);
    },
    // versionNotas fuerza recomputar el flag tras guardar
    [clientId, versionNotas] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const guardarVistos = useCallback(
    (ids: string[]) => {
      localStorage.setItem(`rest_seen_${clientId}`, JSON.stringify(ids));
      setVistos(ids);
    },
    [clientId]
  );

  const marcarVista = useCallback(
    (id: string) => {
      if (!id) return;
      setVistos((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        localStorage.setItem(`rest_seen_${clientId}`, JSON.stringify(next));
        return next;
      });
    },
    [clientId]
  );

  const marcarTodasVistas = useCallback(() => {
    const allIds = reservas.map((r) => r.id).filter(Boolean);
    guardarVistos(allIds);
  }, [reservas, guardarVistos]);

  // IDs de reservas que el operador aún no ha visto (alimenta el badge del tab).
  const nuevosIds = useMemo(
    () => reservas.map((r) => r.id).filter(Boolean).filter((id) => !vistos.includes(id)),
    [reservas, vistos]
  );

  return { obtenerNotas, guardarNotas, tieneNotas, vistos, marcarVista, marcarTodasVistas, nuevosIds, versionNotas };
}

// ============================================================
// useAccionReserva — confirmar / rechazar (webhook de confirmación vía proxy)
// ============================================================

export function useAccionReserva() {
  const { clientId, config, restaurantConfig } = useClientConfig();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reserva,
      nuevoEstado,
      mensajeCliente,
    }: {
      reserva: Reserva;
      nuevoEstado: 'Confirmado' | 'Rechazado';
      mensajeCliente: string;
    }) => {
      const webhookUrl = restaurantConfig.confirmWebhookUrl;
      if (!webhookUrl) throw new Error('No hay webhook de confirmación configurado');

      const proxyUrl = `/api/proxy?url=${encodeURIComponent(webhookUrl)}`;
      // MISMO payload que el legacy (executeReservationAction) — no cambiar llaves.
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reserva.id,
          kommo_lead_id: reserva.kommoLeadId,
          kommo_chat_id: reserva.kommoChatId,
          nombre: reserva.nombre,
          email: reserva.email,
          telefono: reserva.telefono,
          tipoEvento: reserva.tipoEvento,
          pax: reserva.pax,
          fechaEvento: reserva.fechaEvento,
          detalles: reserva.detalles,
          nuevoEstado,
          mensajeCliente,
          clientSlug: clientId,
          hotelName: config?.clientName,
        }),
      });

      if (!response.ok) throw new Error(`Error del servidor: ${response.status}`);
    },
    onSuccess: (_data, { reserva, nuevoEstado }) => {
      queryClient.setQueryData(['rest-reservas', clientId], (prev: Reserva[] | undefined) =>
        (prev || []).map((r) => (r.id === reserva.id ? { ...r, estado: nuevoEstado } : r))
      );
    },
  });
}

// ============================================================
// useEditarReserva — action:'update' al mismo webhook de confirmación.
// Igual que el legacy: si el webhook falla (o no existe), los cambios se
// aplican localmente de todas formas — por eso NUNCA lanza.
// ============================================================

export type ResultadoEdicion = { envio: 'ok' | 'error' | 'sin-webhook'; mensajeError?: string };

export function useEditarReserva() {
  const { clientId, config, restaurantConfig } = useClientConfig();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reserva,
      cambios,
    }: {
      reserva: Reserva;
      cambios: { pax: number | string; tipoEvento: string; telefono: string; email: string };
    }): Promise<ResultadoEdicion> => {
      const webhookUrl = restaurantConfig.confirmWebhookUrl;
      if (!webhookUrl) return { envio: 'sin-webhook' };
      try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(webhookUrl)}`;
        // MISMO payload que el legacy (saveEditedReservation).
        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: reserva.id,
            action: 'update',
            ...cambios,
            clientSlug: clientId,
            hotelName: config?.clientName,
          }),
        });
        if (!response.ok) throw new Error(`Error del servidor: ${response.status}`);
        return { envio: 'ok' };
      } catch (error: any) {
        console.error('Error actualizando reservación:', error);
        return { envio: 'error', mensajeError: error.message || String(error) };
      }
    },
    onSuccess: (_resultado, { reserva, cambios }) => {
      // Los cambios se aplican localmente aunque el webhook haya fallado (paridad).
      queryClient.setQueryData(['rest-reservas', clientId], (prev: Reserva[] | undefined) =>
        (prev || []).map((r) => (r.id === reserva.id ? { ...r, ...cambios } : r))
      );
    },
  });
}

// ============================================================
// useCrearReserva — alta manual vía POST /api/reservations/create
// ============================================================

export interface DatosNuevaReserva {
  nombre: string;
  telefono: string;
  email: string;
  tipoEvento: string;
  pax: number;
  fechaEvento: string;
  horaEvento: string;
  detalles: string;
}

export function useCrearReserva() {
  const { clientId } = useClientConfig();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (datos: DatosNuevaReserva) => {
      // MISMO payload que el legacy (submitNewReservation).
      const resp = await fetch('/api/reservations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientSlug: clientId,
          nombre: datos.nombre,
          telefono: datos.telefono,
          email: datos.email,
          tipoEvento: datos.tipoEvento,
          pax: datos.pax,
          fechaEvento: datos.fechaEvento,
          horaEvento: datos.horaEvento,
          detalles: datos.detalles,
          estado: 'Nuevo Lead',
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Error del servidor: ' + resp.status);
    },
    onSuccess: async () => {
      // El legacy re-fetchea el board tras crear.
      await queryClient.invalidateQueries({ queryKey: ['rest-reservas', clientId] });
    },
  });
}
