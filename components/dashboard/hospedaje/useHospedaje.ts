'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { getSession } from '@/lib/auth/session';
import {
  esFechaValida,
  mapAirtableReserva,
  type HospedajeInteraccion,
  type HospedajeReserva,
} from './tipos';

// ⚠️ DIRECCIÓN: Airtable se va a retirar — toda la información migrará a
// Supabase (los leads del Panel del Director ya migraron). Cuando existan las
// tablas nuevas, este es el único punto que hay que cambiar.
// Data hooks del panel de hospedaje. Airtable SIEMPRE vía /api/proxy (CORS).
// OJO: el legacy usa el `supabase` global (= ADMIN Supabase) para `ventas` y
// `hospedaje_interacciones`; aquí eso equivale a adminSupabase del provider.

export function useHospedajeReservas() {
  const { clientId, hospedajeConfig } = useClientConfig();
  const { apiKey, baseId, tableName } = hospedajeConfig;
  const configurado = !!(apiKey && baseId && tableName);

  const q = useQuery({
    queryKey: ['hospedaje-reservas', clientId],
    enabled: configurado,
    queryFn: async (): Promise<HospedajeReserva[]> => {
      const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(airtableUrl)}`;
      const response = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!response.ok) throw new Error(`Airtable HTTP ${response.status}`);
      const data = await response.json();
      return (data.records || []).map(mapAirtableReserva);
    },
  });

  return { ...q, configurado };
}

// Historial de interacciones de una reserva (tabla hospedaje_interacciones).
export function useHspInteracciones(airtableId: string | null) {
  const { clientId, adminSupabase } = useClientConfig();
  return useQuery({
    queryKey: ['hospedaje-interacciones', clientId, airtableId],
    enabled: !!clientId && !!airtableId,
    queryFn: async (): Promise<HospedajeInteraccion[]> => {
      const { data, error } = await adminSupabase
        .from('hospedaje_interacciones')
        .select('*')
        .eq('client_slug', clientId)
        .eq('airtable_record_id', airtableId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Hospedaje: loadInteractions failed:', error);
        return [];
      }
      return data || [];
    },
  });
}

// Port de saveHospedajeAll(): PATCH del Estado en Airtable (vía proxy),
// auto-registro en `ventas` al pasar a Confirmado y log de la interacción
// en `hospedaje_interacciones`.
export function useGuardarHospedaje() {
  const { clientId, hospedajeConfig, adminSupabase } = useClientConfig();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      reserva: HospedajeReserva;
      newStatus: string;
      tipo: string;
      resultado: string;
    }) => {
      const { reserva, newStatus, tipo, resultado } = input;
      const originalStatus = reserva.estado;
      const statusChanged = !!newStatus && newStatus !== originalStatus;

      const session = getSession();
      const userName = session ? session.name : 'Desconocido';
      const userId = session ? session.id : null;

      // 1. Actualizar estatus en Airtable si cambió
      if (statusChanged) {
        const { apiKey, baseId, tableName } = hospedajeConfig;
        const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${reserva.airtable_id}`;
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(airtableUrl)}`;

        const response = await fetch(proxyUrl, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { Estado: newStatus } }),
        });
        if (!response.ok) throw new Error(`Airtable PATCH ${response.status}`);

        // 1b. Auto-registrar venta al confirmar
        if (newStatus === 'Confirmado' && originalStatus !== 'Confirmado') {
          await adminSupabase.from('ventas').insert([
            {
              client_slug: clientId,
              monto: reserva.total_estimado || 0,
              fecha: esFechaValida(reserva.fecha_entrada)
                ? reserva.fecha_entrada.toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0],
              descripcion: `Reserva confirmada: ${reserva.nombre} - ${reserva.tipo_habitacion || ''} ${reserva.noches || ''} noches`,
              registrado_por: userName,
            },
          ]);
        }
      }

      // 2. Registrar interacción en Supabase
      const logText = resultado
        ? statusChanged
          ? `[${originalStatus} → ${newStatus}] ${resultado}`
          : resultado
        : statusChanged
          ? `Estatus cambiado: ${originalStatus} → ${newStatus}`
          : '';

      if (logText) {
        await adminSupabase.from('hospedaje_interacciones').insert([
          {
            client_slug: clientId,
            airtable_record_id: reserva.airtable_id,
            tipo: resultado ? tipo : 'nota',
            resultado: logText,
            vendedor_nombre: userName,
            vendedor_id: userId,
          },
        ]);
      }

      return { statusChanged };
    },
    onSuccess: (res, input) => {
      // Paridad con el legacy: actualiza el estado local sin refetch a Airtable…
      if (res.statusChanged) {
        queryClient.setQueryData<HospedajeReserva[]>(
          ['hospedaje-reservas', clientId],
          (old) =>
            old
              ? old.map((r) =>
                  r.airtable_id === input.reserva.airtable_id ? { ...r, estado: input.newStatus } : r
                )
              : old
        );
        // …y refresca las ventas del dashboard (refreshVentasDashboard()).
        queryClient.invalidateQueries({ queryKey: ['ventas'] });
      }
      queryClient.invalidateQueries({
        queryKey: ['hospedaje-interacciones', clientId, input.reserva.airtable_id],
      });
    },
  });
}
