'use client';

// Hook de datos de leads — port de fetchData() + generateFakeHotelLeads() de
// legacy/src/dashboard.js sobre TanStack Query.
//
// Comportamiento (paridad con el legacy):
// - Los leads vienen del webhook de n8n (config.webhookUrl) SIEMPRE vía
//   /api/proxy?url=<encodeURIComponent(...)> con GET (igual que fetchData).
// - webhookUrl === 'DEMO' → modo demo con datos ficticios de hotel.
// - CEFEMEX Capital (usaRangoServidor) consulta por rango en el SERVIDOR:
//   agrega ?desde=<epoch>&hasta=<epoch> y re-fetchea cuando cambia el rango
//   (el rango entra al queryKey solo para cefemex).
// - En error, el legacy deja leads=[] y el dashboard pinta vacío — se conserva.

import { useCallback } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { SLUGS, esCasaDeEmpeno } from '@/lib/slugs';
import { normalizeStatus, parseCustomDate, type FiltrosGlobales, type Lead } from '@/lib/dashboard/filtros';
import type { ClientType } from '@/lib/config/ClientConfigProvider';

// CEFEMEX Capital consulta los leads por rango de fechas en el servidor;
// los demás clientes traen todo una vez y filtran en memoria.
export function usaRangoServidor(clientId: string | null | undefined): boolean {
  return clientId === SLUGS.CEFEMEX;
}

// Rango "mes en curso" (port de setRangoMesEnCurso) — arranque de CEFEMEX.
export function rangoMesEnCurso(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// --- Fake Data Generator (modo DEMO para hoteles sin webhook real) ---
// Port literal de generateFakeHotelLeads().
export function generateFakeHotelLeads(): any[] {
  const nombres = [
    'María González', 'Carlos Hernández', 'Ana López', 'Roberto Martínez',
    'Laura García', 'Fernando Rodríguez', 'Patricia Sánchez', 'Miguel Ángel Torres',
    'Gabriela Ramírez', 'José Luis Flores', 'Claudia Morales', 'Alejandro Díaz',
    'Verónica Cruz', 'Ricardo Mendoza', 'Isabel Ortega', 'Daniel Vargas',
    'Sofía Castillo', 'Eduardo Ríos', 'Carmen Jiménez', 'Andrés Navarro',
    'Mariana Ruiz', 'Juan Pablo Reyes', 'Diana Guerrero', 'Héctor Medina',
    'Valeria Peña', 'Francisco Aguilar', 'Lucía Domínguez', 'Sergio Romero',
    'Paulina Herrera', 'Raúl Estrada', 'Natalia Bautista', 'Óscar Delgado',
    'Andrea Vega', 'Luis Enrique Salazar', 'Mónica Acosta', 'Jorge Contreras',
    'Teresa Fuentes', 'Emilio Guzmán', 'Adriana Campos', 'Pablo Sandoval',
    'Daniela Ibarra', 'Arturo Espinoza', 'Renata Figueroa', 'Iván Lara',
    'Fernanda Cabrera', 'Ximena Palacios', 'Gustavo Cervantes', 'Rosa Elena Soto',
  ];

  const statuses = [
    { estatus: 'CALIFICADO EVENTO', weight: 22 },
    { estatus: 'CALIFICADO RESERVA', weight: 18 },
    { estatus: 'CALIFICADO DAYPASS', weight: 14 },
    { estatus: 'CALIFICADO RESTAURANTE', weight: 10 },
    { estatus: 'NUEVO', weight: 15 },
    { estatus: 'CONTACTADO', weight: 12 },
    { estatus: 'EN SEGUIMIENTO', weight: 9 },
  ];

  const utmSources = ['facebook', 'google', 'instagram', 'tiktok', null, null];
  const utmMediums = ['cpc', 'social', 'organic', 'referral', null, null];
  const utmCampaigns = ['promo-verano', 'bodas-2026', 'daypass-especial', 'hotel-branding', null, null, null];

  const totalLeads = 48 + Math.floor(Math.random() * 15); // 48-62 leads
  const leads: any[] = [];
  const totalWeight = statuses.reduce((s, st) => s + st.weight, 0);

  for (let i = 0; i < totalLeads; i++) {
    // Fecha aleatoria dentro de los últimos 45 días
    const daysAgo = Math.floor(Math.random() * 45);
    const hour = 8 + Math.floor(Math.random() * 12);
    const min = Math.floor(Math.random() * 60);
    const sec = Math.floor(Math.random() * 60);
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, min, sec, 0);

    const dayStr = d.getDate();
    const monStr = d.getMonth() + 1;
    const yearStr = d.getFullYear();
    const ampm = hour >= 12 ? 'p.m.' : 'a.m.';
    const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const fecha = `${dayStr}/${monStr}/${yearStr}, ${h12}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')} ${ampm}`;

    // Seleccionar estatus por peso
    let rand = Math.random() * totalWeight;
    let estatus = statuses[0].estatus;
    for (const st of statuses) {
      rand -= st.weight;
      if (rand <= 0) {
        estatus = st.estatus;
        break;
      }
    }

    leads.push({
      id_lead: 20900000 + i,
      nombre: nombres[i % nombres.length],
      precio: 0,
      estatus: estatus,
      estatus_id: 100000000 + i,
      fecha_creacion: fecha,
      utm_source: utmSources[Math.floor(Math.random() * utmSources.length)],
      utm_medium: utmMediums[Math.floor(Math.random() * utmMediums.length)],
      utm_campaign: utmCampaigns[Math.floor(Math.random() * utmCampaigns.length)],
      utm_content: null,
      respuesta_ai: null,
    });
  }

  return leads;
}

// Normalización post-fetch (cuerpo de fetchData tras obtener rawData).
function normalizarLeads(rawData: any[], clientType: ClientType, clientId: string | null): Lead[] {
  // Normalize leads — extraer tipo_servicio del campo crudo (tipo_servicio o estatus)
  let leads: Lead[] = rawData.map((lead) => {
    const rawSource = (lead.tipo_servicio || lead.estatus || '').toLowerCase();
    let tipoServicio: string | null = null;
    if (rawSource.includes('restaurante')) tipoServicio = 'Restaurante';
    else if (rawSource.includes('daypass') || rawSource.includes('day pass')) tipoServicio = 'DayPass';
    else if (rawSource.includes('reserva')) tipoServicio = 'Reserva';
    else if (rawSource.includes('evento')) tipoServicio = 'Evento';

    return {
      ...lead,
      tipo_servicio: tipoServicio,
      estatus: normalizeStatus(lead.estatus, clientType, clientId),
      fecha_parsed: parseCustomDate(lead.fecha_creacion),
    };
  });

  // Para hoteles: fallback si el lead no tiene tipo_servicio identificable
  if (clientType === 'hotel') {
    leads.forEach((lead, i) => {
      if (!lead.tipo_servicio) {
        const bucket = i % 20;
        if (bucket < 8) lead.tipo_servicio = 'DayPass';
        else if (bucket < 14) lead.tipo_servicio = 'Reserva';
        else if (bucket < 18) lead.tipo_servicio = 'Evento';
        else lead.tipo_servicio = 'Restaurante';
      }
    });
  }

  // CEFEMEX Casa de Empeño: conservar la ETAPA REAL de cada lead (sin reescribir).
  // estatus_original se usa para clasificar el funnel (cdeStage).
  if (esCasaDeEmpeno(clientId)) {
    leads = leads.map((lead) => ({ ...lead, estatus_original: lead.estatus }));
  }

  return leads;
}

export interface UseLeadsResult {
  leads: Lead[];
  /** Primera carga (sin datos todavía). */
  cargando: boolean;
  /** Re-fetch en curso (p. ej. CEFEMEX al cambiar el rango) — para el overlay "Actualizando datos…". */
  actualizando: boolean;
  refetch: () => void;
}

/**
 * Leads del cliente activo. `filters` solo se usa para el rango server-side de
 * CEFEMEX (los demás clientes traen todo una vez y filtran en memoria con
 * applyGlobalFilters).
 */
export function useLeads(filters: FiltrosGlobales): UseLeadsResult {
  const { clientId, config, clientType } = useClientConfig();
  const webhookUrl = config?.webhookUrl || '';
  const rangoServidor = usaRangoServidor(clientId);

  // El rango entra al queryKey SOLO para cefemex (re-fetch keyed por [start,end]).
  const rangoKey = rangoServidor
    ? [filters.start ? filters.start.getTime() : null, filters.end ? filters.end.getTime() : null]
    : [];

  const q = useQuery<Lead[]>({
    queryKey: ['leads', clientId, webhookUrl, ...rangoKey],
    enabled: !!clientId && !!webhookUrl,
    staleTime: Infinity, // el legacy solo re-fetchea cuando el usuario lo pide
    placeholderData: keepPreviousData, // cefemex: conserva datos previos mientras re-consulta
    queryFn: async () => {
      const isDemoMode = webhookUrl === 'DEMO';
      try {
        let rawData: any[];

        if (isDemoMode) {
          rawData = generateFakeHotelLeads();
        } else {
          let leadsUrl = webhookUrl;
          // CEFEMEX Capital: el webhook filtra los leads por rango de fechas en el servidor
          if (rangoServidor && filters.start && filters.end) {
            const desde = Math.floor(filters.start.getTime() / 1000);
            const hasta = Math.floor(filters.end.getTime() / 1000);
            leadsUrl += (leadsUrl.includes('?') ? '&' : '?') + `desde=${desde}&hasta=${hasta}`;
          }
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(leadsUrl)}`;
          const response = await fetch(proxyUrl);
          if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
          rawData = await response.json();
        }

        return normalizarLeads(rawData, clientType, clientId);
      } catch (error) {
        // Paridad con fetchData: en error el dashboard pinta vacío (no truena).
        console.error('Fetch Data Failed:', error);
        return [];
      }
    },
  });

  const refetch = useCallback(() => {
    void q.refetch();
  }, [q.refetch]);

  return {
    leads: q.data || [],
    cargando: q.isLoading,
    actualizando: q.isFetching && !q.isLoading,
    refetch,
  };
}
