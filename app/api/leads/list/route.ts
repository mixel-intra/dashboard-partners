import { type NextRequest } from 'next/server';
import { corsJson, corsPreflight } from '@/lib/api/cors';
import { leadsServiceClient } from '@/lib/api/supabaseServer';

// Lee los leads del Panel del Director (logic-systems) desde su Supabase per-cliente
// y los devuelve normalizados a las claves que espera components/director/logica.ts.
//
// FUENTE: tabla `leads` de la Supabase per-cliente, poblada por el agente "Camila".
// Cada lead que llega YA está calificado y con demo agendada en el calendario real
// (Outlook): accion_calendario, demo_inicio y event_id. (Antes se leía de Airtable;
// esa ruta se retiró — ver historial de git.)
//
// SEGURIDAD: conexión 100% server-side con la SERVICE key (SUPABASE_SECRET_KEY),
// que NUNCA se expone al navegador.
//
// USO: GET /api/leads/list?client=logic-systems
//   → { leads: [ { id, nombre, telefono, fecha_creacion, utm_campaign, utm_medium, ... } ] }

const METHODS = 'GET, OPTIONS';
const LEADS_TABLE = process.env.LEADS_TABLE || 'leads';
const PAGE_SIZE = 1000;

// Mapea una fila cruda de Supabase a las claves canónicas que consume logica.ts,
// conservando además los campos originales (empresa, correo, situacion, urgencia,
// accion_calendario, demo_inicio, event_id, contexto, …).
function mapLead(row: Record<string, any>): Record<string, any> {
  return {
    ...row,
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono_contacto || row.telefono || '',
    fecha_creacion: row.created_at,
    // Dimensiones de marketing: logica.ts las normaliza con normSistema()/normFuente().
    utm_campaign: row.sistema,
    utm_medium: row.fuente,
  };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const clientSlug = q.get('client') || q.get('slug') || '';
  if (!clientSlug) return corsJson({ error: 'client es requerido' }, 400, METHODS);

  let supabase;
  try {
    supabase = leadsServiceClient();
  } catch (e: any) {
    return corsJson({ error: e.message }, 500, METHODS);
  }

  // Lee todas las filas paginando (Supabase corta en 1000 por consulta por defecto).
  try {
    const leads: Record<string, any>[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(LEADS_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      (data || []).forEach((row: Record<string, any>) => leads.push(mapLead(row)));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return corsJson({ leads }, 200, METHODS);
  } catch (error: any) {
    console.error('list leads (supabase) error:', error.message);
    return corsJson(
      { error: 'No se pudieron leer los leads de Supabase: ' + (error.message || error) },
      502,
      METHODS
    );
  }
}

export function OPTIONS() {
  return corsPreflight(METHODS);
}
