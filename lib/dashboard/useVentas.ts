'use client';

// Ventas registradas por el partner — port de loadVentasForDashboard() +
// loadVentas()/saveVenta()/deleteVenta() (panel de ventas de legacy/index.html).
//
// La tabla `ventas` vive en el Supabase ADMIN (en el legacy ambos flujos usan
// `window.supabase`, que es el cliente admin), keyed por client_slug.
// Una sola query alimenta la Card 3 (Ventas) del dashboard Y la lista del
// panel; las mutaciones invalidan la query, con lo que la card se refresca
// sola (equivalente a refreshVentasDashboard() del legacy).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { getSession } from '@/lib/auth/session';
import type { Venta } from '@/lib/dashboard/filtros';

export interface NuevaVenta {
  monto: number;
  fecha: string; // YYYY-MM-DD
  descripcion: string;
}

export interface UseVentasResult {
  ventas: Venta[];
  cargando: boolean;
  /** Crea (sin id) o actualiza (con id) una venta. Lanza Error con el mensaje de Supabase. */
  guardarVenta: (venta: NuevaVenta & { id?: string | number }) => Promise<void>;
  /** Elimina una venta por id. Lanza Error con el mensaje de Supabase. */
  eliminarVenta: (id: string | number) => Promise<void>;
  refetch: () => void;
}

export function useVentas(): UseVentasResult {
  const { clientId, adminSupabase } = useClientConfig();
  const queryClient = useQueryClient();

  const q = useQuery<Venta[]>({
    queryKey: ['ventas', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      // Superset de las dos queries del legacy (dashboard pedía id/monto/fecha,
      // el panel pedía * ordenado por fecha desc).
      const { data, error } = await adminSupabase
        .from('ventas')
        .select('*')
        .eq('client_slug', clientId)
        .order('fecha', { ascending: false });
      // Paridad con loadVentasForDashboard: en error se trabaja con [].
      return error ? [] : ((data || []) as Venta[]);
    },
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['ventas', clientId] });

  const guardarMut = useMutation({
    mutationFn: async (venta: NuevaVenta & { id?: string | number }) => {
      const session = getSession();
      // Payload idéntico al saveVenta() del legacy.
      const payload = {
        client_slug: clientId,
        monto: venta.monto,
        fecha: venta.fecha,
        descripcion: venta.descripcion,
        registrado_por: session ? session.name || session.email || '' : '',
      };

      let error;
      if (venta.id) {
        ({ error } = await adminSupabase.from('ventas').update(payload).eq('id', venta.id));
      } else {
        ({ error } = await adminSupabase.from('ventas').insert([payload]));
      }
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });

  const eliminarMut = useMutation({
    mutationFn: async (id: string | number) => {
      const { error } = await adminSupabase.from('ventas').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });

  return {
    ventas: q.data || [],
    cargando: q.isLoading,
    guardarVenta: async (venta) => {
      await guardarMut.mutateAsync(venta);
    },
    eliminarVenta: async (id) => {
      await eliminarMut.mutateAsync(id);
    },
    refetch: () => void q.refetch(),
  };
}
