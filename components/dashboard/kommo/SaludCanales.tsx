'use client';

import { useQuery } from '@tanstack/react-query';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { useToast } from '@/components/ui/Toast';
import { getSession } from '@/lib/auth/session';

// SALUD DE CANALES (Kommo) — bloque INTERNO dentro del dashboard.
// Port de initChannelHealth()/fetchChannelHealth()/renderChannelHealth() +
// chhSetUmbral()/chhToggle() de legacy/src/dashboard.js.
// Solo visible para usuarios de Intra (session.role === 'admin'); el shell ya
// gatea la pestaña, pero el componente re-verifica el rol por defensa.
// Lee/escribe en el Supabase ADMIN (tablas kommo_channel_config y
// kommo_channel_heartbeats, por account_slug = clientId).

const CHH_CANALES = ['whatsapp', 'instagram', 'facebook', 'telegram', 'email', 'livechat', 'telefonia'];
const CHH_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  telegram: 'Telegram',
  email: 'Email',
  livechat: 'Live Chat',
  telefonia: 'Telefonía',
};
const CHH_ICON: Record<string, string> = {
  whatsapp: 'logo-whatsapp',
  instagram: 'logo-instagram',
  facebook: 'logo-facebook',
  telegram: 'paper-plane-outline',
  email: 'mail-outline',
  livechat: 'chatbubbles-outline',
  telefonia: 'call-outline',
};

interface ChannelConfig {
  canal: string;
  esperado: boolean;
  umbral_horas: number | null;
}

interface ChannelHeartbeat {
  canal: string;
  ultima_senal: string | null;
  en_alerta: boolean | null;
}

interface ChhEstado {
  key: 'ok' | 'down' | 'idle' | 'off';
  label: string;
  dot: string;
}

function chhStatus(cfg: ChannelConfig | undefined, hb: ChannelHeartbeat | undefined): ChhEstado {
  if (!cfg || !cfg.esperado) return { key: 'off', label: 'Apagado', dot: 'off' };
  const last = hb?.ultima_senal ? new Date(hb.ultima_senal).getTime() : null;
  if (last === null) return { key: 'idle', label: 'Sin señal aún', dot: 'idle' };
  const ageH = (Date.now() - last) / 3600000;
  if (ageH <= (cfg.umbral_horas || 6)) return { key: 'ok', label: 'Conectado', dot: 'ok' };
  return { key: 'down', label: 'Caído', dot: 'down' };
}

function chhAgo(iso: string | null): string {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'hace <1 min';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export default function SaludCanales() {
  const { clientId, adminSupabase } = useClientConfig();
  const showToast = useToast();

  // Candado por ROL: solo Intra (admin). El cliente no lo ve.
  const session = getSession();
  const esIntra = !!(session && session.role === 'admin');

  const q = useQuery({
    queryKey: ['channel-health', clientId],
    enabled: esIntra && !!clientId,
    // Paridad con el setInterval(fetchChannelHealth, 60000) del legacy
    refetchInterval: 60000,
    queryFn: async () => {
      const [cfgRes, hbRes] = await Promise.all([
        adminSupabase
          .from('kommo_channel_config')
          .select('canal, esperado, umbral_horas')
          .eq('account_slug', clientId),
        adminSupabase
          .from('kommo_channel_heartbeats')
          .select('canal, ultima_senal, en_alerta')
          .eq('account_slug', clientId),
      ]);
      return {
        cfg: new Map<string, ChannelConfig>((cfgRes.data || []).map((r: any) => [r.canal, r])),
        hb: new Map<string, ChannelHeartbeat>((hbRes.data || []).map((r: any) => [r.canal, r])),
      };
    },
  });

  if (!esIntra) return null;

  const cfgMap = q.data?.cfg || new Map<string, ChannelConfig>();
  const hbMap = q.data?.hb || new Map<string, ChannelHeartbeat>();

  async function setUmbral(canal: string, val: string) {
    const umbral = Math.max(1, parseInt(val, 10) || 6);
    try {
      await adminSupabase.from('kommo_channel_config').upsert(
        {
          account_slug: clientId,
          canal,
          umbral_horas: umbral,
          esperado: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'account_slug,canal' }
      );
      showToast(`Umbral de ${CHH_LABEL[canal]}: ${umbral}h`, 'success');
      q.refetch();
    } catch (e) {
      console.error('[chh] umbral', e);
    }
  }

  async function toggleCanal(canal: string, currentlyOn: boolean) {
    const on = !currentlyOn;
    try {
      await adminSupabase.from('kommo_channel_config').upsert(
        {
          account_slug: clientId,
          canal,
          esperado: on,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'account_slug,canal' }
      );
      showToast(`${CHH_LABEL[canal]} ${on ? 'activado' : 'apagado'}`, 'success');
      q.refetch();
    } catch (e) {
      console.error('[chh] toggle', e);
    }
  }

  // Conteos del resumen
  let ok = 0,
    down = 0,
    idle = 0,
    off = 0;
  const cards = CHH_CANALES.map((canal) => {
    const cfg = cfgMap.get(canal);
    const hb = hbMap.get(canal);
    const st = chhStatus(cfg, hb);
    if (st.key === 'ok') ok++;
    else if (st.key === 'down') down++;
    else if (st.key === 'idle') idle++;
    else off++;
    const esperado = !!(cfg && cfg.esperado);
    const umbral = cfg && cfg.umbral_horas != null ? cfg.umbral_horas : 6;
    const ago = hb?.ultima_senal ? chhAgo(hb.ultima_senal) : '—';
    return (
      <div className="chh-ch" key={canal}>
        <div className="chh-ch-top">
          <div className="chh-ch-name">
            <ion-icon name={CHH_ICON[canal]}></ion-icon>
            {CHH_LABEL[canal]}
          </div>
          <span className={`chh-status ${st.key}`}>
            <span className={`chh-dot ${st.dot}`}></span>
            {st.label}
          </span>
        </div>
        <div className="chh-ago">Última señal: {ago}</div>
        <div className="chh-ch-ctrls">
          <label className="chh-umbral">
            Umbral{' '}
            <input
              type="number"
              min={1}
              // key re-monta el input cuando el umbral cambia en servidor
              key={`${canal}-${umbral}`}
              defaultValue={umbral}
              disabled={!esperado}
              onBlur={(e) => {
                if (e.target.value !== String(umbral)) setUmbral(canal, e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />{' '}
            h
          </label>
          <button
            className={`chh-toggle ${esperado ? 'on' : ''}`}
            onClick={() => toggleCanal(canal, esperado)}
          >
            {esperado ? 'Esperado' : 'Apagado'}
          </button>
        </div>
      </div>
    );
  });

  return (
    <section id="channel-health-panel" className="chh-panel">
      <div className="chh-card">
        <div className="chh-head">
          <div className="chh-title">
            <ion-icon name="pulse-outline"></ion-icon> Salud de Canales{' '}
            <span className="chh-intra">solo Intra</span>
          </div>
          <div className="chh-actions">
            <div className="chh-summary" id="chh-summary">
              <span className="chh-chip">
                <span className="chh-dot ok"></span>
                {ok} OK
              </span>
              <span className="chh-chip">
                <span className="chh-dot down"></span>
                {down} caídos
              </span>
              {idle > 0 && (
                <span className="chh-chip">
                  <span className="chh-dot idle"></span>
                  {idle} sin señal
                </span>
              )}
              <span className="chh-chip">
                <span className="chh-dot off"></span>
                {off} apagados
              </span>
            </div>
            <button className="chh-toggle" onClick={() => q.refetch()}>
              <ion-icon name="refresh-outline"></ion-icon> Actualizar
            </button>
          </div>
        </div>
        <div className="chh-sub">
          Monitoreo interno de canales de Kommo. <b>El cliente final no ve este bloque.</b>
        </div>
        <div className="chh-grid" id="chh-grid">
          {cards}
        </div>
      </div>
    </section>
  );
}
