'use client';

import { useEffect, useState } from 'react';
import { getAdminSupabase } from '@/lib/supabase/adminClient';

// "Salud de Canales (Kommo)" — port del script inline de legacy/admin.html
// (bloque akh*, líneas 2103-2224). Sección interna solo-Intra dentro del
// editor de cliente; se recarga cada vez que se activa su pestaña del snav.

const CANALES = ['whatsapp', 'instagram', 'facebook', 'telegram', 'email', 'livechat', 'telefonia'];
const LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  telegram: 'Telegram',
  email: 'Email',
  livechat: 'Live Chat',
  telefonia: 'Telefonía',
};
const ICON: Record<string, string> = {
  whatsapp: 'logo-whatsapp',
  instagram: 'logo-instagram',
  facebook: 'logo-facebook',
  telegram: 'paper-plane-outline',
  email: 'mail-outline',
  livechat: 'chatbubbles-outline',
  telefonia: 'call-outline',
};

interface CanalCfg {
  canal: string;
  esperado: boolean | null;
  umbral_horas: number | null;
}
interface CanalHb {
  canal: string;
  ultima_senal: string | null;
  en_alerta: boolean | null;
}

function ago(iso: string | null): string {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'hace <1 min';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function status(cfg: CanalCfg | undefined, hb: CanalHb | undefined) {
  if (!cfg || !cfg.esperado) return { key: 'off', label: 'Apagado', dot: 'off' };
  const last = hb && hb.ultima_senal ? new Date(hb.ultima_senal).getTime() : null;
  if (last === null) return { key: 'idle', label: 'Sin señal aún', dot: 'idle' };
  const ageH = (Date.now() - last) / 3600000;
  if (ageH <= (cfg.umbral_horas || 6)) return { key: 'ok', label: 'Conectado', dot: 'ok' };
  return { key: 'down', label: 'Caído', dot: 'down' };
}

export default function SaludCanales({
  clientSlug,
  visible,
  recarga,
}: {
  clientSlug: string | null;
  visible: boolean;
  // Contador que el padre incrementa con cada click en la pestaña —
  // el legacy recargaba en CADA click al botón "Salud de Canales".
  recarga: number;
}) {
  const [cfgMap, setCfgMap] = useState<Map<string, CanalCfg>>(new Map());
  const [hbMap, setHbMap] = useState<Map<string, CanalHb>>(new Map());
  const [slackUrl, setSlackUrl] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [cargado, setCargado] = useState(false);
  const [slackGuardado, setSlackGuardado] = useState(false);

  function db() {
    return getAdminSupabase();
  }

  async function cargar() {
    const slug = clientSlug;
    if (!slug) return;
    setHookUrl(`${location.origin}/api/kommo/heartbeat?client=${slug}`);
    try {
      const [cfgRes, hbRes, accRes] = await Promise.all([
        db().from('kommo_channel_config').select('canal,esperado,umbral_horas').eq('account_slug', slug),
        db().from('kommo_channel_heartbeats').select('canal,ultima_senal,en_alerta').eq('account_slug', slug),
        db().from('clients_config').select('kommo_slack_webhook_url').eq('id_slug', slug).single(),
      ]);
      setCfgMap(new Map(((cfgRes.data || []) as CanalCfg[]).map((r) => [r.canal, r])));
      setHbMap(new Map(((hbRes.data || []) as CanalHb[]).map((r) => [r.canal, r])));
      if (accRes.data) setSlackUrl((accRes.data as any).kommo_slack_webhook_url || '');
      setCargado(true);
    } catch (e) {
      console.error('[akh] load', e);
    }
  }

  // El legacy recarga cada vez que se hace click en la pestaña "Salud de Canales".
  useEffect(() => {
    if (visible) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, recarga]);

  async function toggle(canal: string, currentlyOn: boolean) {
    const slug = clientSlug;
    if (!slug) return;
    const on = !currentlyOn;
    try {
      await db()
        .from('kommo_channel_config')
        .upsert(
          { account_slug: slug, canal, esperado: on, updated_at: new Date().toISOString() },
          { onConflict: 'account_slug,canal' }
        );
      cargar();
    } catch (e: any) {
      console.error('[akh] toggle', e);
      alert('Error: ' + e.message);
    }
  }

  async function guardarUmbral(canal: string, val: string) {
    const slug = clientSlug;
    if (!slug) return;
    const umbral = Math.max(1, parseInt(val, 10) || 6);
    try {
      await db()
        .from('kommo_channel_config')
        .upsert(
          { account_slug: slug, canal, umbral_horas: umbral, esperado: true, updated_at: new Date().toISOString() },
          { onConflict: 'account_slug,canal' }
        );
      cargar();
    } catch (e) {
      console.error('[akh] umbral', e);
    }
  }

  async function guardarSlack() {
    const slug = clientSlug;
    if (!slug) return;
    const url = (slackUrl || '').trim();
    try {
      await db().from('clients_config').update({ kommo_slack_webhook_url: url || null }).eq('id_slug', slug);
      setSlackGuardado(true);
      setTimeout(() => setSlackGuardado(false), 1500);
    } catch (e: any) {
      console.error('[akh] slack', e);
      alert('Error: ' + e.message);
    }
  }

  function copiarHook() {
    if (hookUrl && navigator.clipboard) navigator.clipboard.writeText(hookUrl);
  }

  // Contadores del resumen
  let ok = 0,
    down = 0,
    idle = 0,
    off = 0;
  const tarjetas = cargado
    ? CANALES.map((canal) => {
        const cfg = cfgMap.get(canal);
        const hb = hbMap.get(canal);
        const st = status(cfg, hb);
        if (st.key === 'ok') ok++;
        else if (st.key === 'down') down++;
        else if (st.key === 'idle') idle++;
        else off++;
        const esperado = !!(cfg && cfg.esperado);
        const umbral = cfg && cfg.umbral_horas != null ? cfg.umbral_horas : 6;
        const a = hb && hb.ultima_senal ? ago(hb.ultima_senal) : '—';
        return { canal, st, esperado, umbral, a };
      })
    : [];

  return (
    <div className="sc sc-accent-amber" id="sec-kommo" style={{ display: visible ? undefined : 'none' }}>
      <div className="sc-head">
        <div className="sc-icon sci-amber">
          <ion-icon name="pulse-outline"></ion-icon>
        </div>
        <div className="sc-labels">
          <span className="sc-eyebrow">Monitoreo interno · solo Intra</span>
          <span className="sc-title">Salud de Canales (Kommo)</span>
        </div>
      </div>
      <div className="sc-body">
        <p className="hint" style={{ marginBottom: 12 }}>
          Estado en vivo de los canales de Kommo de este entorno. Un canal “esperado” sin señal
          dentro de su umbral pasa a 🔴 y dispara alerta en Slack. <b>El cliente final no ve esto.</b>
        </p>
        <div id="akh-summary" className="akh-summary" style={{ marginBottom: 12 }}>
          {cargado && (
            <>
              <span className="akh-chip">
                <span className="akh-dot ok"></span>
                {ok} OK
              </span>
              <span className="akh-chip">
                <span className="akh-dot down"></span>
                {down} caídos
              </span>
              {idle > 0 && (
                <span className="akh-chip">
                  <span className="akh-dot idle"></span>
                  {idle} sin señal
                </span>
              )}
              <span className="akh-chip">
                <span className="akh-dot off"></span>
                {off} apagados
              </span>
            </>
          )}
        </div>
        <div id="akh-grid" className="akh-grid">
          {tarjetas.map(({ canal, st, esperado, umbral, a }) => (
            <div className="akh-ch" key={canal}>
              <div className="akh-ch-top">
                <div className="akh-ch-name">
                  <ion-icon name={ICON[canal]}></ion-icon>
                  {LABEL[canal]}
                </div>
                <span className={`akh-status ${st.key}`}>
                  <span className={`akh-dot ${st.dot}`}></span>
                  {st.label}
                </span>
              </div>
              <div className="akh-ago">Última señal: {a}</div>
              <div className="akh-ctrls">
                <label className="akh-umbral">
                  Umbral{' '}
                  <input
                    type="number"
                    min={1}
                    // key incluye el umbral para re-sincronizar el defaultValue tras recargar
                    key={`${canal}:${umbral}`}
                    defaultValue={umbral}
                    disabled={!esperado}
                    onBlur={(e) => {
                      if (e.target.value !== String(umbral)) guardarUmbral(canal, e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />{' '}
                  h
                </label>
                <button type="button" className={`akh-toggle ${esperado ? 'on' : ''}`} onClick={() => toggle(canal, esperado)}>
                  {esperado ? 'Esperado' : 'Apagado'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="fg-group" style={{ marginTop: 18 }}>
          <label className="fgl" htmlFor="akh-slack">
            Slack Incoming Webhook de este entorno (opcional)
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              id="akh-slack"
              className="fi"
              placeholder="https://hooks.slack.com/services/…  (vacío = canal de respaldo)"
              value={slackUrl}
              onChange={(e) => setSlackUrl(e.target.value)}
            />
            <button type="button" className="akh-mini" onClick={guardarSlack}>
              {slackGuardado ? '✓ Guardado' : 'Guardar Slack'}
            </button>
          </div>
        </div>

        <div className="fg-group" style={{ marginTop: 14 }}>
          <label className="fgl" htmlFor="akh-hook">
            URL del webhook receptor (pégala en n8n/Kommo)
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="text" id="akh-hook" className="fi" readOnly value={hookUrl} />
            <button type="button" className="akh-mini" onClick={copiarHook}>
              Copiar
            </button>
            <button type="button" className="akh-mini" onClick={cargar}>
              Actualizar
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Header <b>X-Webhook-Secret</b> · body <code>{'{"canal":"{{ origin }}"}'}</code> (el endpoint mapea{' '}
            <code>waba</code>→whatsapp, <code>instagram_business</code>→instagram).
          </p>
        </div>
      </div>
    </div>
  );
}
