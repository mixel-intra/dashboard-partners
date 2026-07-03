'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAdminSupabase } from '@/lib/supabase/adminClient';
import { getSession } from '@/lib/auth/session';
import {
  mapAirtableRecord,
  normalizarEventosConfig,
  type EventoLead,
  type EventosConfig,
  type Interaccion,
} from './tipos';

// Data hooks del CRM de eventos — compartidos entre /pipeline y el dashboard.
// Todas las llamadas a Airtable pasan por /api/proxy (CORS), igual que el legacy.

export function useEventosConfig(clientId: string | null) {
  return useQuery({
    queryKey: ['eventos-config', clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<EventosConfig> => {
      const { data, error } = await getAdminSupabase()
        .from('clients_config')
        .select('eventos_config')
        .eq('id_slug', clientId)
        .single();
      if (error || !data) throw new Error('Error cargando configuración');
      return normalizarEventosConfig(data.eventos_config);
    },
  });
}

export function useEventosLeads(clientId: string | null, config: EventosConfig | undefined) {
  return useQuery({
    queryKey: ['eventos-leads', clientId],
    enabled: !!config?.apiKey,
    queryFn: async (): Promise<EventoLead[]> => {
      const { apiKey, baseId, tableName } = config!;
      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return (data.records || []).map(mapAirtableRecord);
    },
  });
}

export function useInteracciones(clientId: string | null, airtableId: string | null) {
  return useQuery({
    queryKey: ['event-interacciones', clientId, airtableId],
    enabled: !!clientId && !!airtableId,
    queryFn: async (): Promise<Interaccion[]> => {
      const { data, error } = await getAdminSupabase()
        .from('event_interacciones')
        .select('*')
        .eq('client_slug', clientId)
        .eq('airtable_record_id', airtableId)
        .order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    },
  });
}

// Port de saveAll(): PATCH del Estado en Airtable (vía proxy), inserta en
// `ventas` cuando pasa a Venta, y registra la interacción en event_interacciones.
export function useGuardarSeguimiento(clientId: string | null, config: EventosConfig | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lead: EventoLead;
      newStatus: string;
      tipo: string;
      resultado: string;
    }) => {
      const { lead, newStatus, tipo, resultado } = input;
      const originalStatus = lead.estado;
      const statusChanged = !!newStatus && newStatus !== originalStatus;

      const session = getSession();
      const userName = session ? session.name : 'Desconocido';
      const userId = session ? session.id : null;
      const supabase = getAdminSupabase();

      if (statusChanged) {
        const { apiKey, baseId, tableName } = config!;
        const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${lead.airtable_id}`;
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { Estado: newStatus } }),
        });
        if (!response.ok) throw new Error(`Airtable PATCH ${response.status}`);

        if (newStatus === 'Venta' && originalStatus !== 'Venta') {
          await supabase.from('ventas').insert([
            {
              client_slug: clientId,
              monto: lead.total_estimado || 0,
              fecha: new Date().toISOString().split('T')[0],
              descripcion: `Evento vendido: ${lead.nombre} - ${lead.tipo_evento || ''} ${lead.pax || ''} pax`,
              registrado_por: userName,
            },
          ]);
        }
      }

      const logText = resultado
        ? statusChanged
          ? `[${originalStatus} → ${newStatus}] ${resultado}`
          : resultado
        : statusChanged
          ? `Estatus cambiado: ${originalStatus} → ${newStatus}`
          : '';

      if (logText) {
        await supabase.from('event_interacciones').insert([
          {
            client_slug: clientId,
            airtable_record_id: lead.airtable_id,
            tipo: resultado ? tipo : 'nota',
            resultado: logText,
            vendedor_nombre: userName,
            vendedor_id: userId,
          },
        ]);
      }

      return { statusChanged };
    },
    onSuccess: (_res, input) => {
      queryClient.invalidateQueries({ queryKey: ['eventos-leads', clientId] });
      queryClient.invalidateQueries({
        queryKey: ['event-interacciones', clientId, input.lead.airtable_id],
      });
    },
  });
}
