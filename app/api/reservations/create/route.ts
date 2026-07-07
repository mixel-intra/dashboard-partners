import { type NextRequest } from 'next/server';
import { corsJson, corsPreflight } from '@/lib/api/cors';
import { EnvFaltanteError, requireEnv } from '@/lib/api/env';
import { adminAnonClient } from '@/lib/api/supabaseServer';

// ⚠️ DIRECCIÓN: Airtable se va a retirar — toda la información migrará a
// Supabase (los leads del Panel del Director ya migraron). Cuando existan las
// tablas nuevas, este es el único punto que hay que cambiar.
// Crea una reserva escribiéndola directo en la tabla de Airtable del cliente.
// Port 1:1 de legacy/api/reservations/create.js. Base/tabla resueltas
// server-side desde clients_config.restaurant_config; typecast:true para que
// Airtable coaccione fecha/número desde strings.
//
// USO: POST /api/reservations/create
//   Body: { clientSlug, nombre, telefono, email, tipoEvento, pax,
//           fechaEvento (YYYY-MM-DD), horaEvento (HH:MM), detalles }

const METHODS = 'POST, OPTIONS';

export async function POST(req: NextRequest) {
  let airtableToken: string;
  try {
    airtableToken = requireEnv('AIRTABLE_TOKEN');
  } catch (e: any) {
    return corsJson({ error: e.message }, 500, METHODS);
  }

  let body: any = {};
  try {
    body = (await req.json()) || {};
  } catch {
    body = {};
  }
  const clientSlug = body.clientSlug || body.client_id || body.client;
  const nombre = (body.nombre || '').toString().trim();

  if (!clientSlug) return corsJson({ error: 'clientSlug es requerido' }, 400, METHODS);
  if (!nombre) return corsJson({ error: 'El nombre del cliente es requerido' }, 400, METHODS);

  // ── Resolver base/tabla de Airtable del cliente (server-side) ──────────────
  let restaurantConfig: any;
  try {
    const supabase = adminAnonClient();
    const { data, error } = await supabase
      .from('clients_config')
      .select('restaurant_config')
      .eq('id_slug', clientSlug)
      .single();
    if (error) throw error;
    restaurantConfig = (data && data.restaurant_config) || {};
  } catch (e: any) {
    if (e instanceof EnvFaltanteError) return corsJson({ error: e.message }, 500, METHODS);
    return corsJson(
      { error: 'No se pudo leer la configuración del cliente: ' + (e.message || e) },
      400,
      METHODS
    );
  }

  const baseId = restaurantConfig.airtable_base_id;
  const tableId = restaurantConfig.airtable_table_id;
  if (!baseId || !tableId) {
    return corsJson({ error: 'Este cliente no tiene Airtable configurado (base/tabla).' }, 400, METHODS);
  }

  // ── Construir los campos (omitiendo vacíos) ────────────────────────────────
  const pax = parseInt(body.pax, 10);
  const fields: Record<string, unknown> = {
    'Nombre Cliente': nombre,
    Estado: body.estado || 'Nuevo Lead',
  };
  if (body.telefono) fields['Telefono'] = String(body.telefono).trim();
  if (body.email) fields['email'] = String(body.email).trim();
  if (body.tipoEvento) fields['TipoEvento'] = String(body.tipoEvento).trim();
  if (Number.isFinite(pax) && pax > 0) fields['PAX'] = pax;
  if (body.fechaEvento) fields['FechaEvento'] = String(body.fechaEvento).trim();
  if (body.horaEvento) fields['HoraEvento'] = String(body.horaEvento).trim();
  if (body.detalles) fields['Detalles'] = String(body.detalles).trim();

  // ── Crear el registro en Airtable ──────────────────────────────────────────
  try {
    const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`;
    const r = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${airtableToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    const text = await r.text();

    if (!r.ok) {
      console.error('Airtable create error:', r.status, text.substring(0, 500));
      return corsJson(
        {
          error: 'Airtable rechazó la creación de la reserva',
          status: r.status,
          detail: text.substring(0, 500),
        },
        502,
        METHODS
      );
    }

    const data = JSON.parse(text);
    return corsJson({ ok: true, record: (data.records && data.records[0]) || null }, 200, METHODS);
  } catch (error: any) {
    console.error('create reservation error:', error.message, error.stack);
    return corsJson({ error: error.message, type: error.name }, 500, METHODS);
  }
}

export function OPTIONS() {
  return corsPreflight(METHODS);
}
