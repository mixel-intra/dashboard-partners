'use client';

import { createContext, useContext, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAdminSupabase } from '@/lib/supabase/adminClient';

// Port de loadConfig() + initializeClientSupabase() del legacy:
// lee ?client=<slug> → fila de clients_config → configs derivadas + cliente
// Supabase per-tenant (fallback al admin si el cliente no tiene URL/key).

export type ClientType = 'hotel' | 'inmobiliaria' | 'otro';

export interface ConfigCliente {
  clientName: string;
  webhookUrl: string;
  investment: number;
  investmentUpdatedAt: string | null;
  sales: number;
  clientLogo: string | null;
  clientLogoDark: string | null;
  clientLogoLight: string | null;
  themePrimary: string;
  themeSecondary: string;
}

export interface RestaurantConfig {
  airtableWebhookUrl: string;
  confirmWebhookUrl: string;
  crmLeadUrlTemplate: string;
}

export interface AirtableConfig {
  apiKey: string;
  baseId: string;
  tableName: string;
}

interface ClientConfigValue {
  clientId: string | null;
  cargando: boolean;
  error: Error | null;
  config: ConfigCliente | null;
  clientType: ClientType;
  rawConfig: any;
  restaurantConfig: RestaurantConfig;
  hospedajeConfig: AirtableConfig;
  eventosConfig: AirtableConfig;
  /** Cliente Supabase per-tenant (datos operacionales); admin como fallback. */
  clientSupabase: SupabaseClient;
  /** Cliente admin (clients_config, reviews, kommo_*, ventas…). */
  adminSupabase: SupabaseClient;
}

const Ctx = createContext<ClientConfigValue | null>(null);

export function useClientConfig(): ClientConfigValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useClientConfig debe usarse dentro de <ClientConfigProvider>');
  return v;
}

export function ClientConfigProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('client');

  const q = useQuery({
    queryKey: ['clients_config', clientId],
    enabled: !!clientId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await getAdminSupabase()
        .from('clients_config')
        .select('*')
        .eq('id_slug', clientId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const raw = q.data || null;

  const value = useMemo<ClientConfigValue>(() => {
    const admin = getAdminSupabase();

    const config: ConfigCliente | null = raw
      ? {
          clientName: raw.name,
          webhookUrl: raw.webhook_url,
          investment: raw.investment,
          investmentUpdatedAt: raw.investment_updated_at || null,
          sales: raw.sales_goal,
          clientLogo: raw.logo_url,
          clientLogoDark: raw.logo_url || null,
          clientLogoLight: raw.logo_url_light || raw.logo_url || null,
          themePrimary: '#7551FF',
          themeSecondary: '#01F1E3',
        }
      : null;

    // Per-tenant, memoizado por slug (semántica exacta de initializeClientSupabase)
    let clientSupabase = admin;
    if (raw?.supabase_url && raw?.supabase_anon_key) {
      clientSupabase = createClient(raw.supabase_url, raw.supabase_anon_key);
    }

    const restConfig = raw?.restaurant_config || {};
    const hspConfig = raw?.hospedaje_config || {};
    const evtConfig = raw?.eventos_config || {};

    return {
      clientId,
      cargando: !!clientId && q.isLoading,
      error: (q.error as Error) || null,
      config,
      clientType: (raw?.client_type as ClientType) || 'otro',
      rawConfig: raw,
      restaurantConfig: {
        airtableWebhookUrl: restConfig.airtable_webhook_url || '',
        confirmWebhookUrl: restConfig.confirm_webhook_url || '',
        crmLeadUrlTemplate: restConfig.crm_lead_url_template || '',
      },
      hospedajeConfig: {
        apiKey: hspConfig.api_key || '',
        baseId: hspConfig.base_id || '',
        tableName: hspConfig.table_name || '',
      },
      eventosConfig: {
        apiKey: evtConfig.api_key || '',
        baseId: evtConfig.base_id || '',
        tableName: evtConfig.table_name || '',
      },
      clientSupabase,
      adminSupabase: admin,
    };
  }, [raw, clientId, q.isLoading, q.error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
