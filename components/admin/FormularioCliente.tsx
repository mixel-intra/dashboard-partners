'use client';

import { useEffect, useRef, useState } from 'react';
import { getAdminSupabase } from '@/lib/supabase/adminClient';
import { emptyTemplate } from '@/lib/leadTemplate';
import { serializarPlantilla, type PlantillaCampos } from './tipos';
import EditorPlantillaLead from './EditorPlantillaLead';
import SaludCanales from './SaludCanales';
import DisparadorScrape from './DisparadorScrape';

// Editor de entornos (clients_config) — port del formulario gigante de
// legacy/admin.html + selectClient()/save handler de legacy/src/backoffice.js.
// El upsert replica campo por campo el newConfig del legacy (mismas columnas,
// mismos shapes JSON, mismos defaults/coerciones).

interface FormState extends PlantillaCampos {
  clientId: string;
  name: string;
  clientType: string;
  webhookUrl: string;
  investment: string;
  sales: string;
  adInvestment: string;
  logoUrl: string;
  logoUrlLight: string;
  themePrimary: string;
  themeSecondary: string;
  hexPrimary: string;
  hexSecondary: string;
  huePrimary: string;
  hueSecondary: string;
  cardLabels: { title: string; desc: string }[];
  hotelEventos: string;
  hotelReservas: string;
  hotelDaypass: string;
  hotelRestaurante: string;
  hotelSocial: string;
  restAirtableWebhook: string;
  restConfirmWebhook: string;
  hspApiKey: string;
  hspBaseId: string;
  hspTableName: string;
  evtApiKey: string;
  evtBaseId: string;
  evtTableName: string;
  slGoogleUrl: string;
  slTripadvisorUrl: string;
  slBookingUrl: string;
  slFrequency: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// Metadatos de los 7 nodos de "Mapeo de Variables" (markup de admin.html).
const NODOS = [
  { num: '01', icon: 'pulse-outline', clase: 'nc1', phTitle: 'Título Principal', phDesc: 'VARIABLE / DESCRIPCIÓN' },
  { num: '02', icon: 'swap-vertical', clase: 'nc2', phTitle: 'Título Principal', phDesc: 'VARIABLE / DESCRIPCIÓN' },
  { num: '03', icon: 'pie-chart-outline', clase: 'nc3', phTitle: 'Título Principal', phDesc: 'VARIABLE / DESCRIPCIÓN' },
  { num: '04', icon: 'rocket-outline', clase: 'nc4', phTitle: 'Título Principal', phDesc: 'VARIABLE / DESCRIPCIÓN' },
  { num: '05', icon: 'people-outline', clase: 'nc1', phTitle: 'Título Principal', phDesc: 'VARIABLE / DESCRIPCIÓN' },
  { num: '06', icon: 'wallet-outline', clase: 'nc2', phTitle: 'Título', phDesc: '(Opcional)' },
  { num: '07', icon: 'pricetag-outline', clase: 'nc3', phTitle: 'Título', phDesc: '(Opcional)' },
];

// Metadatos de los servicios del hotel (id → etiqueta/ícono/orden de opciones).
const SERVICIOS_HOTEL: {
  campo: 'hotelEventos' | 'hotelReservas' | 'hotelDaypass' | 'hotelRestaurante' | 'hotelSocial';
  id: string;
  icon: string;
  nombre: string;
  opciones: [string, string][];
}[] = [
  { campo: 'hotelEventos', id: 'hotel-service-eventos', icon: 'calendar-outline', nombre: 'Eventos', opciones: [['unlocked', 'Habilitado'], ['locked', 'Bloqueado'], ['hidden', 'Oculto']] },
  { campo: 'hotelReservas', id: 'hotel-service-reservas', icon: 'bookmark-outline', nombre: 'Reservas', opciones: [['unlocked', 'Habilitado'], ['locked', 'Bloqueado'], ['hidden', 'Oculto']] },
  { campo: 'hotelDaypass', id: 'hotel-service-daypass', icon: 'sunny-outline', nombre: 'Day Pass', opciones: [['unlocked', 'Habilitado'], ['locked', 'Bloqueado'], ['hidden', 'Oculto']] },
  { campo: 'hotelRestaurante', id: 'hotel-service-restaurante', icon: 'restaurant-outline', nombre: 'Restaurante', opciones: [['unlocked', 'Habilitado'], ['locked', 'Bloqueado'], ['hidden', 'Oculto']] },
  // Reputación tiene "Bloqueado" primero en el markup legacy
  { campo: 'hotelSocial', id: 'hotel-service-social-listening', icon: 'star-outline', nombre: 'Reputación', opciones: [['locked', 'Bloqueado'], ['unlocked', 'Habilitado'], ['hidden', 'Oculto']] },
];

// Port exacto de hueToHex() del legacy (h ∈ [0,360] → hex con s=v=1).
function hueToHex(h: number): string {
  const s = 1;
  const v = 1;
  const i = Math.floor(h / 60);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Port de uploadLogo() — sube al bucket `logos` y regresa el publicUrl.
async function uploadLogo(clientId: string, file: File): Promise<string> {
  // Limpiamos el clientId y la extensión para evitar caracteres raros
  const cleanId = clientId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const fileExt = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Generamos un nombre ultra-limpio
  const fileName = `${cleanId}-${Date.now()}.${fileExt}`;
  const filePath = fileName;
  const supabase = getAdminSupabase();

  const { error } = await supabase.storage.from('logos').upload(filePath, file, { upsert: true });

  if (error) {
    console.error('Error detallado de Supabase Storage:', error);
    if (error.message.includes('Bucket not found')) {
      alert('Error: No se encontró el bucket "logos".');
    } else {
      alert('Error al subir el logo: ' + error.message);
    }
    throw error;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('logos').getPublicUrl(filePath);

  return publicUrl;
}

// Estado del formulario para "Nuevo Cliente" — equivale a adminForm.reset()
// del legacy: cada control regresa a su default del markup.
function formNuevo(): FormState {
  return {
    clientId: '',
    name: '',
    clientType: 'otro',
    webhookUrl: '',
    investment: '',
    sales: '',
    adInvestment: '',
    logoUrl: '',
    logoUrlLight: '',
    themePrimary: '#7551FF',
    themeSecondary: '#01F1E3',
    hexPrimary: '#7551FF',
    hexSecondary: '#01F1E3',
    huePrimary: '255',
    hueSecondary: '176',
    cardLabels: Array.from({ length: 7 }, () => ({ title: '', desc: '' })),
    hotelEventos: 'unlocked',
    hotelReservas: 'locked',
    hotelDaypass: 'locked',
    hotelRestaurante: 'locked',
    hotelSocial: 'locked',
    restAirtableWebhook: '',
    restConfirmWebhook: '',
    hspApiKey: '',
    hspBaseId: '',
    hspTableName: '',
    evtApiKey: '',
    evtBaseId: '',
    evtTableName: '',
    slGoogleUrl: '',
    slTripadvisorUrl: '',
    slBookingUrl: '',
    slFrequency: '24',
    supabaseUrl: '',
    supabaseAnonKey: '',
    // adminForm.reset() del legacy también vacía los inputs de la plantilla
    tplHtml: '',
    tplLeadIdField: '',
    tplSucursalField: '',
    tplEstatusField: '',
    tplQualifiedStages: '',
  };
}

// Poblado del formulario desde la fila de clients_config — port de selectClient().
function formDesdeConfig(clientId: string, config: any): FormState {
  const hotelServices = config.hotel_services || {
    eventos: 'unlocked',
    reservas: 'locked',
    daypass: 'locked',
    restaurante: 'locked',
    social_listening: 'locked',
  };
  const restConfig = config.restaurant_config || {};
  const hspConfig = config.hospedaje_config || {};
  const evtConfig = config.eventos_config || {};
  const slConfig = config.social_listening_config || {};
  const cardLabels = config.card_labels || {};
  const tplGuardado = config.lead_template;
  const tpl = tplGuardado && Object.keys(tplGuardado).length ? tplGuardado : emptyTemplate();
  const themePrimary = config.theme_primary || '#7551FF';
  const themeSecondary = config.theme_secondary || '#01F1E3';

  return {
    clientId,
    name: config.name || '',
    clientType: config.client_type || 'otro',
    webhookUrl: config.webhook_url || '',
    investment: String(config.investment || 0),
    sales: String(config.sales_goal || 0),
    adInvestment: String(config.ad_investment || 0),
    logoUrl: config.logo_url || '',
    logoUrlLight: config.logo_url_light || '',
    themePrimary,
    themeSecondary,
    // updateThemePreview() sincroniza los hex en mayúsculas
    hexPrimary: themePrimary.toUpperCase(),
    hexSecondary: themeSecondary.toUpperCase(),
    // Los sliders de tono nunca se cargan desde la config (defaults del markup)
    huePrimary: '255',
    hueSecondary: '176',
    cardLabels: Array.from({ length: 7 }, (_, idx) => {
      const i = idx + 1;
      return {
        title: (cardLabels[i] && cardLabels[i].title) || '',
        desc: (cardLabels[i] && cardLabels[i].description) || '',
      };
    }),
    hotelEventos: hotelServices.eventos || 'unlocked',
    hotelReservas: hotelServices.reservas || 'locked',
    hotelDaypass: hotelServices.daypass || 'locked',
    hotelRestaurante: hotelServices.restaurante || 'locked',
    hotelSocial: hotelServices.social_listening || 'locked',
    restAirtableWebhook: restConfig.airtable_webhook_url || '',
    restConfirmWebhook: restConfig.confirm_webhook_url || '',
    hspApiKey: hspConfig.api_key || '',
    hspBaseId: hspConfig.base_id || '',
    hspTableName: hspConfig.table_name || '',
    evtApiKey: evtConfig.api_key || '',
    evtBaseId: evtConfig.base_id || '',
    evtTableName: evtConfig.table_name || '',
    slGoogleUrl: slConfig.google_maps_url || '',
    slTripadvisorUrl: slConfig.tripadvisor_url || '',
    slBookingUrl: slConfig.booking_url || '',
    slFrequency: String(slConfig.scrape_frequency_hours || 24),
    supabaseUrl: config.supabase_url || '',
    supabaseAnonKey: config.supabase_anon_key || '',
    tplHtml: tpl.html || '',
    tplLeadIdField: tpl.lead_id_field || 'id',
    tplSucursalField: tpl.sucursal_field || 'sucursal',
    tplEstatusField: tpl.estatus_field || 'estatus',
    tplQualifiedStages: Array.isArray(tpl.qualified_stages) ? tpl.qualified_stages.join(', ') : '',
  };
}

export default function FormularioCliente({
  clientId,
  config,
  saveStatusVisible,
  onSaved,
  onReselect,
  onDeleted,
}: {
  clientId: string | null; // null = "Nuevo Cliente"
  config: any; // fila de clients_config ({} para nuevo)
  saveStatusVisible: boolean; // "CAMBIOS GUARDADOS" (vive en el padre: sobrevive el remount post-guardado)
  onSaved: (clientId: string) => Promise<void> | void;
  onReselect: (clientId: string) => Promise<void> | void; // tras el scrape manual
  onDeleted: () => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    clientId === null ? formNuevo() : formDesdeConfig(clientId, config || {})
  );
  // El slug ya persistido (controla readOnly del ID, título y link de preview)
  const [savedClientId, setSavedClientId] = useState<string | null>(clientId);
  const [saving, setSaving] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [snavTarget, setSnavTarget] = useState('sec-identity');
  const [kommoTick, setKommoTick] = useState(0);

  const bodyRef = useRef<HTMLDivElement>(null);
  const idInputRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const logoLightFileRef = useRef<HTMLInputElement>(null);

  // Nuevo cliente: focus en el ID (igual que el legacy)
  useEffect(() => {
    if (clientId === null) idInputRef.current?.focus();
  }, [clientId]);

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  /* ── Motor visual: sincronía picker ↔ hex ↔ hue (updateThemePreview) ── */
  function setColor(cual: 'primary' | 'secondary', valor: string) {
    if (cual === 'primary') patch({ themePrimary: valor, hexPrimary: valor.toUpperCase() });
    else patch({ themeSecondary: valor, hexSecondary: valor.toUpperCase() });
  }

  function onHue(cual: 'primary' | 'secondary', valor: string) {
    const hex = hueToHex(Number(valor));
    if (cual === 'primary') patch({ huePrimary: valor, themePrimary: hex, hexPrimary: hex.toUpperCase() });
    else patch({ hueSecondary: valor, themeSecondary: hex, hexSecondary: hex.toUpperCase() });
  }

  // Port de syncHex(): solo aplica al picker si es un hex válido
  function onHex(cual: 'primary' | 'secondary', typed: string) {
    let val = typed.trim();
    if (val && !val.startsWith('#')) val = '#' + val;
    if (/^#[0-9A-F]{6}$/i.test(val)) {
      if (cual === 'primary') patch({ themePrimary: val, hexPrimary: val.toUpperCase() });
      else patch({ themeSecondary: val, hexSecondary: val.toUpperCase() });
    } else {
      if (cual === 'primary') patch({ hexPrimary: typed });
      else patch({ hexSecondary: typed });
    }
  }

  /* ── Visibilidad derivada (toggle* del legacy) ── */
  const esHotel = form.clientType === 'hotel';
  const mostrarRestWebhooks = esHotel && form.hotelRestaurante === 'unlocked';
  const mostrarSocial = esHotel && form.hotelSocial === 'unlocked';

  /* ── Navegación de secciones (snavShow del script inline) ── */
  function cambiarSeccion(target: string) {
    setSnavTarget(target);
    // El legacy recargaba la salud de canales con cada click en su pestaña
    if (target === 'sec-kommo') setKommoTick((t) => t + 1);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }

  /* ── Preview link (updatePreviewLink) ── */
  const relativeUrl = savedClientId ? `/?client=${savedClientId}` : null;

  function copiarLink() {
    if (!savedClientId) return;
    const fullUrl = `${window.location.origin}/?client=${savedClientId}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2000);
    });
  }

  /* ── Guardar (submit de #admin-form — byte-equivalente al legacy) ── */
  async function guardar(e: React.FormEvent) {
    e.preventDefault();

    const id = form.clientId.trim().toLowerCase().replace(/\s+/g, '-');
    if (!id) return;

    setSaving(true);
    try {
      let logoUrl = form.logoUrl;
      const archivoLogo = logoFileRef.current?.files?.[0];
      if (archivoLogo) {
        logoUrl = await uploadLogo(id, archivoLogo);
      }

      let logoUrlLight = form.logoUrlLight;
      const archivoLogoLight = logoLightFileRef.current?.files?.[0];
      if (archivoLogoLight) {
        logoUrlLight = await uploadLogo(id + '-light', archivoLogoLight);
      }

      // Build card labels JSON
      const cardLabels: Record<number, { title?: string; description?: string }> = {};
      for (let i = 1; i <= 7; i++) {
        const title = form.cardLabels[i - 1].title.trim();
        const desc = form.cardLabels[i - 1].desc.trim();
        if (title || desc) {
          cardLabels[i] = {};
          if (title) cardLabels[i].title = title;
          if (desc) cardLabels[i].description = desc;
        }
      }

      const newConfig = {
        id_slug: id,
        name: form.name.trim(),
        client_type: form.clientType || 'otro',
        webhook_url: form.webhookUrl,
        investment: parseFloat(form.investment) || 0,
        investment_updated_at: new Date().toISOString().split('T')[0],
        sales_goal: parseFloat(form.sales) || 0,
        ad_investment: parseFloat(form.adInvestment) || 0,
        logo_url: logoUrl,
        logo_url_light: logoUrlLight || null,
        theme_primary: form.themePrimary,
        theme_secondary: form.themeSecondary,
        card_labels: Object.keys(cardLabels).length > 0 ? cardLabels : {},
        hotel_services: {
          eventos: form.hotelEventos,
          reservas: form.hotelReservas,
          daypass: form.hotelDaypass,
          restaurante: form.hotelRestaurante,
          social_listening: form.hotelSocial,
        },
        restaurant_config: {
          airtable_webhook_url: form.restAirtableWebhook.trim(),
          confirm_webhook_url: form.restConfirmWebhook.trim(),
        },
        hospedaje_config: {
          api_key: form.hspApiKey.trim(),
          base_id: form.hspBaseId.trim(),
          table_name: form.hspTableName.trim(),
        },
        eventos_config: {
          api_key: form.evtApiKey.trim(),
          base_id: form.evtBaseId.trim(),
          table_name: form.evtTableName.trim(),
        },
        social_listening_config: {
          google_maps_url: form.slGoogleUrl.trim(),
          tripadvisor_url: form.slTripadvisorUrl.trim(),
          booking_url: form.slBookingUrl.trim(),
          scrape_frequency_hours: parseInt(form.slFrequency, 10) || 24,
          // Se preservan los metadatos de la última corrida (no editables aquí)
          last_scraped_at: config?.social_listening_config?.last_scraped_at || null,
          last_scrape_status: config?.social_listening_config?.last_scrape_status || null,
          last_scrape_error: config?.social_listening_config?.last_scrape_error || null,
        },
        supabase_url: form.supabaseUrl.trim() || null,
        supabase_anon_key: form.supabaseAnonKey.trim() || null,
        lead_template: serializarPlantilla(form),
      };

      const { error } = await getAdminSupabase().from('clients_config').upsert(newConfig);

      if (error) {
        console.error('Error saving config:', error);
        alert('Error al guardar: ' + error.message);
        return;
      }

      // Reset de los file inputs + refleja las URLs subidas
      if (logoFileRef.current) logoFileRef.current.value = '';
      if (logoLightFileRef.current) logoLightFileRef.current.value = '';
      patch({ logoUrl, logoUrlLight: logoUrlLight || '' });
      setSavedClientId(id);

      // El padre muestra "CAMBIOS GUARDADOS", recarga el registry y
      // re-selecciona el cliente (repobla el formulario desde la BD).
      await onSaved(id);
    } catch (err) {
      console.error('Save Flow Error:', err);
      alert('Error en el proceso de guardado');
    } finally {
      setSaving(false);
    }
  }

  /* ── Eliminar entorno ── */
  async function eliminar() {
    if (!savedClientId) return;

    if (
      confirm(`¿Estás seguro de que quieres eliminar a "${savedClientId}"? Se perderán todos sus datos en la nube.`)
    ) {
      const { error } = await getAdminSupabase().from('clients_config').delete().eq('id_slug', savedClientId);

      if (error) {
        console.error('Error deleting client:', error);
        alert('Error al eliminar: ' + error.message);
        return;
      }

      onDeleted();
    }
  }

  return (
    <div id="client-editor" className="animate-fade editor-wrap">
      {/* Topbar */}
      <div className="editor-topbar">
        <div className="editor-topbar-left">
          <div className="editor-eyebrow">
            <ion-icon name="radio-button-on"></ion-icon> Entorno Activo
          </div>
          <h2 id="editor-title" className="editor-title">
            {savedClientId ? `Gestión: ${savedClientId}` : 'Nuevo Cliente'}
          </h2>
        </div>
        <div className="editor-topbar-right">
          <span className="url-pill" id="dashboard-url-text">
            {relativeUrl || '*.intra.ai/…'}
          </span>
          <button
            type="button"
            id="copy-link-btn"
            className="btn btn-ghost btn-icon"
            title="Copiar URL"
            style={linkCopiado ? { color: '#10B981' } : undefined}
            onClick={copiarLink}
          >
            {linkCopiado ? <ion-icon name="checkmark-outline"></ion-icon> : <ion-icon name="copy-outline"></ion-icon>}
          </button>
          <a
            href={relativeUrl || '#'}
            id="preview-link"
            target="_blank"
            className="btn btn-launch"
            style={{ visibility: savedClientId ? 'visible' : 'hidden' }}
          >
            Abrir <ion-icon name="open-outline"></ion-icon>
          </a>
        </div>
      </div>

      {/* Section nav */}
      <nav className="snav" aria-label="Secciones">
        <button
          type="button"
          className={`snav-btn ${snavTarget === 'sec-identity' ? 'active' : ''}`}
          data-target="sec-identity"
          onClick={() => cambiarSeccion('sec-identity')}
        >
          <ion-icon name="build-outline"></ion-icon> Identidad
        </button>
        <button
          type="button"
          className={`snav-btn ${snavTarget === 'sec-vars' ? 'active' : ''}`}
          data-target="sec-vars"
          onClick={() => cambiarSeccion('sec-vars')}
        >
          <ion-icon name="git-network-outline"></ion-icon> Variables
        </button>
        <button
          type="button"
          className={`snav-btn ${snavTarget === 'sec-kommo' ? 'active' : ''}`}
          data-target="sec-kommo"
          onClick={() => cambiarSeccion('sec-kommo')}
        >
          <ion-icon name="pulse-outline"></ion-icon> Salud de Canales
        </button>
      </nav>

      {/* Scrollable form body */}
      <form id="admin-form" noValidate onSubmit={guardar}>
        <div className="editor-body" ref={bodyRef}>
          <p
            id="save-status"
            className="success-msg"
            style={{ alignSelf: 'flex-start', display: saveStatusVisible ? 'block' : 'none' }}
          >
            CAMBIOS GUARDADOS
          </p>

          {/* ── SECCIÓN 1: Identidad ── */}
          <div
            className="sc sc-accent-purple"
            id="sec-identity"
            style={{ display: snavTarget === 'sec-identity' ? undefined : 'none' }}
          >
            <div className="sc-head">
              <div className="sc-icon sci-purple">
                <ion-icon name="build-outline"></ion-icon>
              </div>
              <div className="sc-labels">
                <span className="sc-eyebrow">Configuración</span>
                <span className="sc-title">Identidad del Entorno</span>
              </div>
            </div>
            <div className="sc-body">
              <div className="fg" style={{ rowGap: 18 }}>
                <div className="fg-group">
                  <label className="fgl" htmlFor="client-id">
                    ID Slug
                  </label>
                  <input
                    type="text"
                    id="client-id"
                    className="fi"
                    placeholder="ej. hotel-nikche"
                    required
                    ref={idInputRef}
                    readOnly={savedClientId !== null}
                    value={form.clientId}
                    onChange={(e) => patch({ clientId: e.target.value })}
                  />
                </div>
                <div className="fg-group">
                  <label className="fgl" htmlFor="client-display-name">
                    Nombre Comercial
                  </label>
                  <input
                    type="text"
                    id="client-display-name"
                    className="fi"
                    placeholder="Nombre visible"
                    required
                    value={form.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </div>
                <div className="fg-group">
                  <label className="fgl" htmlFor="client-type">
                    Sector
                  </label>
                  <select
                    id="client-type"
                    className="fi"
                    value={form.clientType}
                    onChange={(e) => patch({ clientType: e.target.value })}
                  >
                    <option value="otro">Genérico</option>
                    <option value="hotel">Hospitalidad</option>
                    <option value="inmobiliaria">Real Estate</option>
                  </select>
                </div>
                <div className="fg-group">
                  <label className="fgl" htmlFor="webhook-url">
                    Endpoint de Datos (n8n Webhook)
                  </label>
                  {/* type=text para permitir "DEMO" (el legacy lo forzaba por JS) */}
                  <input
                    type="text"
                    id="webhook-url"
                    className="fi"
                    placeholder="https://… o DEMO"
                    required
                    value={form.webhookUrl}
                    onChange={(e) => patch({ webhookUrl: e.target.value })}
                  />
                </div>
                <div className="fg-group">
                  <label className="fgl" htmlFor="investment">
                    Inversión Benchmark ($) (Intra)
                  </label>
                  <input
                    type="number"
                    id="investment"
                    className="fi"
                    placeholder="0"
                    value={form.investment}
                    onChange={(e) => patch({ investment: e.target.value })}
                  />
                </div>
                <div className="fg-group">
                  <label className="fgl" htmlFor="sales">
                    Target de Ingresos ($)
                  </label>
                  <input
                    type="number"
                    id="sales"
                    className="fi"
                    placeholder="0"
                    value={form.sales}
                    onChange={(e) => patch({ sales: e.target.value })}
                  />
                </div>
                <div className="fg-group">
                  <label className="fgl" htmlFor="ad-investment">
                    Inversión en Publicidad ($) (Cliente)
                  </label>
                  <input
                    type="number"
                    id="ad-investment"
                    className="fi"
                    placeholder="0"
                    min={0}
                    value={form.adInvestment}
                    onChange={(e) => patch({ adInvestment: e.target.value })}
                  />
                </div>
                <div className="fg-group span2">
                  <label className="fgl" htmlFor="client-logo-file">
                    Logo — Modo Oscuro
                  </label>
                  <input type="file" id="client-logo-file" className="fi" accept="image/*" ref={logoFileRef} />
                </div>
                <div className="fg-group">
                  <label className="fgl" htmlFor="client-logo-light-file">
                    Logo — Modo Claro
                  </label>
                  <input
                    type="file"
                    id="client-logo-light-file"
                    className="fi"
                    accept="image/*"
                    ref={logoLightFileRef}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── SECCIÓN 2: Motor Visual (oculta, valores activos en background) ── */}
          <div className="sc sc-accent-blue hidden" id="sec-visual">
            <div className="sc-head">
              <div className="sc-icon sci-blue">
                <ion-icon name="color-filter-outline"></ion-icon>
              </div>
              <div className="sc-labels">
                <span className="sc-eyebrow">Personalización</span>
                <span className="sc-title">Motor Visual</span>
              </div>
            </div>
            <div className="sc-body">
              <div className="color-engine">
                {/* Primario */}
                <div className="color-module">
                  <span className="cm-label">Color Primario</span>
                  <div className="cm-row">
                    <div className="swatch-wrap" id="swatch-primary" style={{ background: form.themePrimary }}>
                      <input
                        type="color"
                        id="theme-primary"
                        className="color-picker-hidden"
                        value={form.themePrimary}
                        onChange={(e) => setColor('primary', e.target.value)}
                      />
                    </div>
                    <input
                      type="text"
                      id="hex-primary"
                      className="hex-input"
                      value={form.hexPrimary}
                      onChange={(e) => onHex('primary', e.target.value)}
                    />
                  </div>
                  <input
                    type="range"
                    id="hue-primary"
                    className="hue-slider"
                    min={0}
                    max={360}
                    value={form.huePrimary}
                    onChange={(e) => onHue('primary', e.target.value)}
                  />
                </div>

                {/* Secundario */}
                <div className="color-module">
                  <span className="cm-label">Color Secundario</span>
                  <div className="cm-row">
                    <div className="swatch-wrap" id="swatch-secondary" style={{ background: form.themeSecondary }}>
                      <input
                        type="color"
                        id="theme-secondary"
                        className="color-picker-hidden"
                        value={form.themeSecondary}
                        onChange={(e) => setColor('secondary', e.target.value)}
                      />
                    </div>
                    <input
                      type="text"
                      id="hex-secondary"
                      className="hex-input"
                      value={form.hexSecondary}
                      onChange={(e) => onHex('secondary', e.target.value)}
                    />
                  </div>
                  <input
                    type="range"
                    id="hue-secondary"
                    className="hue-slider"
                    min={0}
                    max={360}
                    value={form.hueSecondary}
                    onChange={(e) => onHue('secondary', e.target.value)}
                  />
                </div>

                {/* Live preview card (col 3) */}
                <div className="preview-panel">
                  <span className="preview-panel-lbl">Vista Previa en Tiempo Real</span>
                  <div id="theme-preview">
                    <div className="prev-row">
                      <div id="preview-icon" style={{ background: `${form.themePrimary}33`, color: form.themePrimary }}>
                        <ion-icon name="stats-chart"></ion-icon>
                      </div>
                      <div
                        id="preview-dot"
                        style={{ background: form.themePrimary, boxShadow: `0 0 15px ${form.themePrimary}` }}
                      ></div>
                    </div>
                    <div className="prev-metric-lbl">Métrica Principal</div>
                    <div className="prev-metric-val">$124k</div>
                    <div
                      id="preview-badge"
                      style={{ background: `${form.themeSecondary}26`, color: form.themeSecondary }}
                    >
                      +24% Rendimiento
                    </div>
                    <div className="prev-chart">
                      <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none">
                        <path
                          id="preview-path"
                          d="M0 25 Q 25 5, 50 15 T 100 0"
                          fill="none"
                          stroke={form.themePrimary}
                          strokeWidth={2}
                        />
                        <path
                          id="preview-area"
                          d="M0 25 Q 25 5, 50 15 T 100 0 L 100 30 L 0 30 Z"
                          fill={`${form.themePrimary}1a`}
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              {/* /color-engine */}
            </div>
          </div>

          {/* ── SECCIÓN 3: Variables ── */}
          <div
            className="sc sc-accent-green"
            id="sec-vars"
            style={{ display: snavTarget === 'sec-vars' ? undefined : 'none' }}
          >
            <div className="sc-head">
              <div className="sc-icon sci-green">
                <ion-icon name="git-network-outline"></ion-icon>
              </div>
              <div className="sc-labels">
                <span className="sc-eyebrow">Panel</span>
                <span className="sc-title">Mapeo de Variables</span>
              </div>
            </div>
            <div className="sc-body">
              <div className="nodes-grid">
                {NODOS.map((nodo, idx) => (
                  <div className={`map-node ${nodo.clase}`} key={nodo.num}>
                    <div className="node-head">
                      <div className="node-badge">{nodo.num}</div>
                      <ion-icon name={nodo.icon} class="node-icon"></ion-icon>
                    </div>
                    <input
                      type="text"
                      id={`card-${idx + 1}-title`}
                      className="node-input node-title"
                      placeholder={nodo.phTitle}
                      value={form.cardLabels[idx].title}
                      onChange={(e) => {
                        const cardLabels = form.cardLabels.map((c, i) =>
                          i === idx ? { ...c, title: e.target.value } : c
                        );
                        patch({ cardLabels });
                      }}
                    />
                    <input
                      type="text"
                      id={`card-${idx + 1}-desc`}
                      className="node-input node-desc"
                      placeholder={nodo.phDesc}
                      value={form.cardLabels[idx].desc}
                      onChange={(e) => {
                        const cardLabels = form.cardLabels.map((c, i) =>
                          i === idx ? { ...c, desc: e.target.value } : c
                        );
                        patch({ cardLabels });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── SECCIÓN 4: Servicios Hotel (visible solo para client_type=hotel) ── */}
          <div className={`sc sc-accent-amber ${esHotel ? '' : 'hidden'}`} id="hotel-services-section">
            <div className="sc-head">
              <div className="sc-icon sci-amber">
                <ion-icon name="bed-outline"></ion-icon>
              </div>
              <div className="sc-labels">
                <span className="sc-eyebrow">Hospitalidad</span>
                <span className="sc-title">Servicios del Hotel</span>
              </div>
            </div>
            <div className="sc-body">
              <p className="hint" style={{ marginBottom: 13 }}>
                Configura la visibilidad de cada módulo para dashboards tipo Hotel.
              </p>
              <div className="services-row">
                {SERVICIOS_HOTEL.map((svc) => (
                  <div className="service-card" key={svc.id}>
                    <div className="service-icon">
                      <ion-icon name={svc.icon}></ion-icon>
                    </div>
                    <span className="service-name">{svc.nombre}</span>
                    <select
                      id={svc.id}
                      className="fi"
                      style={{ padding: '7px 28px 7px 10px', fontSize: '0.76rem' }}
                      value={form[svc.campo]}
                      onChange={(e) => patch({ [svc.campo]: e.target.value } as Partial<FormState>)}
                    >
                      {svc.opciones.map(([val, lbl]) => (
                        <option key={val} value={val}>
                          {lbl}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Restaurant webhooks (hidden by default) */}
              <div id="restaurant-webhooks-section" className={mostrarRestWebhooks ? '' : 'hidden'}>
                <div className="sc-divider"></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
                  <div
                    className="sc-icon sci-amber"
                    style={{ width: 22, height: 22, borderRadius: 6, fontSize: '0.72rem', flexShrink: 0 }}
                  >
                    <ion-icon name="restaurant-outline"></ion-icon>
                  </div>
                  <span className="sc-eyebrow" style={{ color: 'var(--amber)' }}>
                    Webhooks Restaurante · AirTable
                  </span>
                </div>
                <div className="fg">
                  <div className="fg-group">
                    <label className="fgl">Webhook GET Reservas (n8n → AirTable)</label>
                    <input
                      type="text"
                      id="rest-airtable-webhook"
                      className="fi"
                      placeholder="https://n8n.../webhook/reservas-get"
                      value={form.restAirtableWebhook}
                      onChange={(e) => patch({ restAirtableWebhook: e.target.value })}
                    />
                  </div>
                  <div className="fg-group">
                    <label className="fgl">Webhook POST Confirmación (n8n → Kommo)</label>
                    <input
                      type="text"
                      id="rest-confirm-webhook"
                      className="fi"
                      placeholder="https://n8n.../webhook/reservas-confirm"
                      value={form.restConfirmWebhook}
                      onChange={(e) => patch({ restConfirmWebhook: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Hospedaje Airtable config (visible for hotels) */}
              <div id="hospedaje-config-section" className={esHotel ? '' : 'hidden'}>
                <div className="sc-divider"></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
                  <div
                    className="sc-icon sci-amber"
                    style={{ width: 22, height: 22, borderRadius: 6, fontSize: '0.72rem', flexShrink: 0 }}
                  >
                    <ion-icon name="bed-outline"></ion-icon>
                  </div>
                  <span className="sc-eyebrow" style={{ color: 'var(--amber)' }}>
                    Reservas de Hospedaje · AirTable (Premium)
                  </span>
                </div>
                <div className="fg">
                  <div className="fg-group">
                    <label className="fgl">Airtable API Key</label>
                    <input
                      type="password"
                      id="hsp-api-key"
                      className="fi"
                      placeholder="patXXXXXXXXXXX"
                      value={form.hspApiKey}
                      onChange={(e) => patch({ hspApiKey: e.target.value })}
                    />
                  </div>
                  <div className="fg-group">
                    <label className="fgl">Airtable Base ID</label>
                    <input
                      type="text"
                      id="hsp-base-id"
                      className="fi"
                      placeholder="appXXXXXXXXXXX"
                      value={form.hspBaseId}
                      onChange={(e) => patch({ hspBaseId: e.target.value })}
                    />
                  </div>
                  <div className="fg-group">
                    <label className="fgl">Nombre de la Tabla</label>
                    <input
                      type="text"
                      id="hsp-table-name"
                      className="fi"
                      placeholder="Reservas Calificadas"
                      value={form.hspTableName}
                      onChange={(e) => patch({ hspTableName: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Social Listening config (visible for hotels) */}
              <div id="social-listening-config-section" className={mostrarSocial ? '' : 'hidden'}>
                <div className="sc-divider"></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
                  <div
                    className="sc-icon sci-amber"
                    style={{ width: 22, height: 22, borderRadius: 6, fontSize: '0.72rem', flexShrink: 0 }}
                  >
                    <ion-icon name="star-outline"></ion-icon>
                  </div>
                  <span className="sc-eyebrow" style={{ color: 'var(--amber)' }}>
                    Social Listening · Reseñas online (Premium)
                  </span>
                </div>
                <p className="hint" style={{ marginBottom: 11 }}>
                  Pega la URL pública del hotel en cada plataforma. El sistema scrapea las reseñas 1 vez al día y las
                  analiza con Claude (sentimiento, categoría, prioridad).
                </p>
                <div className="fg">
                  <div className="fg-group">
                    <label className="fgl">
                      <ion-icon name="logo-google"></ion-icon> Google Maps URL
                    </label>
                    <input
                      type="text"
                      id="sl-google-url"
                      className="fi"
                      placeholder="https://maps.google.com/?cid=..."
                      value={form.slGoogleUrl}
                      onChange={(e) => patch({ slGoogleUrl: e.target.value })}
                    />
                  </div>
                  <div className="fg-group">
                    <label className="fgl">TripAdvisor URL</label>
                    <input
                      type="text"
                      id="sl-tripadvisor-url"
                      className="fi"
                      placeholder="https://www.tripadvisor.com.mx/Hotel_Review-..."
                      value={form.slTripadvisorUrl}
                      onChange={(e) => patch({ slTripadvisorUrl: e.target.value })}
                    />
                  </div>
                  <div className="fg-group">
                    <label className="fgl">Booking.com URL</label>
                    <input
                      type="text"
                      id="sl-booking-url"
                      className="fi"
                      placeholder="https://www.booking.com/hotel/mx/..."
                      value={form.slBookingUrl}
                      onChange={(e) => patch({ slBookingUrl: e.target.value })}
                    />
                  </div>
                  <div className="fg-group">
                    <label className="fgl">Frecuencia (horas)</label>
                    <input
                      type="number"
                      id="sl-frequency"
                      className="fi"
                      min={6}
                      max={168}
                      placeholder="24"
                      value={form.slFrequency}
                      onChange={(e) => patch({ slFrequency: e.target.value })}
                    />
                  </div>
                </div>
                <DisparadorScrape
                  clientSlugActual={form.clientId}
                  slConfig={config?.social_listening_config}
                  onDone={onReselect}
                />
              </div>

              {/* Eventos Airtable config (visible for hotels) */}
              <div id="eventos-config-section" className={esHotel ? '' : 'hidden'}>
                <div className="sc-divider"></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
                  <div
                    className="sc-icon sci-amber"
                    style={{ width: 22, height: 22, borderRadius: 6, fontSize: '0.72rem', flexShrink: 0 }}
                  >
                    <ion-icon name="calendar-outline"></ion-icon>
                  </div>
                  <span className="sc-eyebrow" style={{ color: 'var(--amber)' }}>
                    Seguimiento de Eventos · AirTable (Premium)
                  </span>
                </div>
                <div className="fg">
                  <div className="fg-group">
                    <label className="fgl">Airtable API Key</label>
                    <input
                      type="password"
                      id="evt-api-key"
                      className="fi"
                      placeholder="patXXXXXXXXXXX"
                      value={form.evtApiKey}
                      onChange={(e) => patch({ evtApiKey: e.target.value })}
                    />
                  </div>
                  <div className="fg-group">
                    <label className="fgl">Airtable Base ID</label>
                    <input
                      type="text"
                      id="evt-base-id"
                      className="fi"
                      placeholder="appXXXXXXXXXXX"
                      value={form.evtBaseId}
                      onChange={(e) => patch({ evtBaseId: e.target.value })}
                    />
                  </div>
                  <div className="fg-group">
                    <label className="fgl">Nombre de la Tabla</label>
                    <input
                      type="text"
                      id="evt-table-name"
                      className="fi"
                      placeholder="Leads"
                      value={form.evtTableName}
                      onChange={(e) => patch({ evtTableName: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── SECCIÓN 5: Infraestructura · Supabase del cliente ── */}
          <div className="sc sc-accent-blue" id="sec-infra">
            <div className="sc-head">
              <div className="sc-icon sci-blue">
                <ion-icon name="server-outline"></ion-icon>
              </div>
              <div className="sc-labels">
                <span className="sc-eyebrow">Infraestructura</span>
                <span className="sc-title">Supabase del cliente</span>
              </div>
            </div>
            <div className="sc-body">
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
                Datos del Supabase aislado donde viven las tablas operacionales del cliente (disponibilidad del
                restaurante, buffers del agente, etc.). Si lo dejas vacío, el dashboard usará el Supabase admin como
                fallback — funcional pero <strong>no recomendado en producción</strong>.
              </p>
              <div className="fg">
                <div className="fg-group">
                  <label className="fgl">Supabase URL</label>
                  <input
                    type="text"
                    id="client-supabase-url"
                    className="fi"
                    placeholder="https://xxxxxxxxxxxx.supabase.co"
                    value={form.supabaseUrl}
                    onChange={(e) => patch({ supabaseUrl: e.target.value })}
                  />
                </div>
                <div className="fg-group">
                  <label className="fgl">Supabase Anon Key (pública, embebida en el frontend)</label>
                  <input
                    type="password"
                    id="client-supabase-anon-key"
                    className="fi"
                    placeholder="eyJhbGciOiJIUzI1NiIs..."
                    value={form.supabaseAnonKey}
                    onChange={(e) => patch({ supabaseAnonKey: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── SECCIONES 6 y 7: Plantilla HTML del Lead + Directorio ── */}
          <EditorPlantillaLead campos={form} onChange={(p) => patch(p)} cfg={config} />

          {/* ── SECCIÓN: Salud de Canales (Kommo) — INTERNO Intra ── */}
          <SaludCanales clientSlug={savedClientId} visible={snavTarget === 'sec-kommo'} recarga={kommoTick} />
        </div>
        {/* /editor-body */}
      </form>

      {/* Sticky footer */}
      <div className="actions-footer">
        <button type="button" id="delete-client-btn" className="btn btn-danger" onClick={eliminar}>
          <ion-icon name="trash-outline"></ion-icon> Eliminar Entorno
        </button>
        <div className="footer-right">
          <button type="submit" form="admin-form" className="btn btn-primary" disabled={saving}>
            {saving ? (
              <span>
                <ion-icon name="sync-outline" class="spin"></ion-icon> Guardando...
              </span>
            ) : (
              <>
                Guardar Cambios <ion-icon name="checkmark-outline"></ion-icon>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
