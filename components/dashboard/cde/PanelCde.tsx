'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Chart as ChartJS,
  ArcElement,
  DoughnutController,
  Tooltip,
  Legend,
  type Chart,
} from 'chart.js';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import { useToast } from '@/components/ui/Toast';
import {
  CDE_MESES,
  CDE_MES_LABEL,
  CDE_PIE_COLORS,
  CDE_SLUG,
  cdeCenterLabel,
  cdeConteos,
  cdeDefaultMonth,
  cdeMotivo,
  cdePieEntries,
  cdeStage,
  type CdePieEntry,
} from './logica';

ChartJS.register(ArcElement, DoughnutController, Tooltip, Legend);

// Módulo CDE (casa-de-empeño): dona de motivos de venta perdida + modal
// ampliado + modal de detalle de lead + cajón de Inversión en Publicidad
// (tabla ad_spend). Port de renderCdeExtra() y cde* de dashboard.js.
//
// El re-acomodo de las tarjetas KPI (6 en una fila, ROI oculto, etiquetas
// "Empeños cerrados"/"ROAS"/"Inversión en Publicidad") se hace en el
// componente de KPIs vía cdeCalcularRoas/cdeConteos (ver logica.ts).

const fmt = (n: number) => '$' + Number(n).toLocaleString('en-US');

export function useAdSpend(enabled = true) {
  const { adminSupabase } = useClientConfig();
  return useQuery({
    queryKey: ['cde-ad-spend'],
    enabled,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data } = await adminSupabase
        .from('ad_spend')
        .select('periodo, monto')
        .eq('account_slug', CDE_SLUG);
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        map[r.periodo] = Number(r.monto) || 0;
      });
      return map;
    },
  });
}

export default function PanelCde({
  leads,
  investOpen,
  onCloseInvest,
  onOpenLead,
}: {
  /** Leads YA filtrados por el rango global (state.filteredLeads). */
  leads: any[];
  /** El cajón de inversión lo abre el sidebar (botón cash) o la card-6. */
  investOpen: boolean;
  onCloseInvest: () => void;
  /** Se ignora si no se pasa; la tabla abre el detalle por su cuenta. */
  onOpenLead?: (lead: any) => void;
}) {
  const [pieModalOpen, setPieModalOpen] = useState(false);
  const [leadModal, setLeadModal] = useState<any | null>(null);

  const { perdidos } = useMemo(() => cdeConteos(leads), [leads]);
  const { entries, total } = useMemo(() => cdePieEntries(perdidos), [perdidos]);

  // Sin wrapper <section>: la tarjeta del pie debe ser hija DIRECTA del
  // split-row-grid (cde-2col) para que el grid la acomode junto a la gráfica
  // (los modales/cajón son fixed, no afectan el layout).
  return (
    <>
      <TarjetaPie entries={entries} total={total} onAmpliar={() => setPieModalOpen(true)} />
      {pieModalOpen && (
        <ModalPie entries={entries} total={total} onClose={() => setPieModalOpen(false)} />
      )}
      {leadModal && <ModalLead lead={leadModal} onClose={() => setLeadModal(null)} />}
      <CajonInversion open={investOpen} onClose={onCloseInvest} leads={leads} />
    </>
  );
}

// ── Dona inline (tarjeta) ──
function TarjetaPie({
  entries,
  total,
  onAmpliar,
}: {
  entries: CdePieEntry[];
  total: number;
  onAmpliar: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!entries.length) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }
    const names = entries.map((e) => e.label);
    const data = {
      labels: entries.map((e) => `${e.label} · ${e.n} (${Math.round((e.n / total) * 100)}%)`),
      datasets: [
        {
          data: entries.map((e) => e.n),
          backgroundColor: CDE_PIE_COLORS,
          borderColor: 'rgba(15,18,35,0.55)',
          borderWidth: 2,
          hoverOffset: 18, // la sección se separa al pasar el cursor
          hoverBorderColor: 'rgba(255,255,255,0.35)',
        },
      ],
    };
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%' as const,
      layout: { padding: { top: 6, bottom: 6 } },
      interaction: { mode: 'nearest' as const, intersect: true },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    };
    if (chartRef.current) {
      chartRef.current.data = data as any;
      chartRef.current.options = options as any;
      (chartRef.current as any).$cdeNames = names;
      chartRef.current.update();
    } else {
      chartRef.current = new ChartJS(canvas.getContext('2d')!, {
        type: 'doughnut',
        data,
        options,
        plugins: [cdeCenterLabel],
      });
      (chartRef.current as any).$cdeNames = names;
    }
  }, [entries, total]);

  useEffect(() => () => chartRef.current?.destroy(), []);

  return (
    <div
      className="card-quantix big-chart-card"
      id="cde-pie-card"
      style={{ display: 'flex', flexDirection: 'column' }}
      onClick={() => entries.length && onAmpliar()}
      title="Clic para ampliar el detalle"
    >
      <div
        className="card-header"
        style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}
      >
        <div>
          <span className="label-sub">MOTIVOS · {total} VENTAS PERDIDAS</span>
          <h3 className="section-headline" style={{ fontSize: '1.5rem', margin: 0 }}>
            Razones de venta perdida
          </h3>
        </div>
        <button type="button" className="cde-expand-btn">
          <ion-icon name="expand-outline"></ion-icon> Ampliar
        </button>
      </div>
      <div className="cde-pie-body" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ position: 'relative', width: '100%', minHeight: 0 }}>
          <canvas id="cde-pie" ref={canvasRef} style={{ display: entries.length ? 'block' : 'none' }}></canvas>
        </div>
        <div id="cde-pie-detail" className="cde-detail">
          {entries.length > 0 && <DesglosePie entries={entries} total={total} />}
        </div>
      </div>
      {entries.length === 0 && (
        <div id="cde-pie-empty" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Sin motivos registrados en el periodo.
        </div>
      )}
    </div>
  );
}

// Desglose (dot + nombre + n/% + barra proporcional) — compartido por pie inline y modal
function DesglosePie({ entries, total }: { entries: CdePieEntry[]; total: number }) {
  return (
    <>
      {entries.map((e, i) => {
        const color = CDE_PIE_COLORS[i % CDE_PIE_COLORS.length];
        const pct = total ? Math.round((e.n / total) * 100) : 0;
        return (
          <div className="cde-detail-row" key={e.label}>
            <span className="cde-dot" style={{ background: color }}></span>
            <span className="cde-detail-name" title={e.label}>
              {e.label}
            </span>
            <span className="cde-detail-pct">{pct}%</span>
            <span className="cde-detail-num">{e.n}</span>
            <span className="cde-bar">
              <i style={{ width: `${pct}%`, background: color }}></i>
            </span>
          </div>
        );
      })}
    </>
  );
}

// ── Modal ampliado de la dona ──
function ModalPie({ entries, total, onClose }: { entries: CdePieEntry[]; total: number; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') cerrar();
    }
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !entries.length) return;
    chartRef.current?.destroy();
    chartRef.current = new ChartJS(canvas.getContext('2d')!, {
      type: 'doughnut',
      data: {
        labels: entries.map((e) => `${e.label} · ${e.n} (${total ? Math.round((e.n / total) * 100) : 0}%)`),
        datasets: [
          {
            data: entries.map((e) => e.n),
            backgroundColor: CDE_PIE_COLORS,
            borderColor: 'rgba(15,18,35,0.55)',
            borderWidth: 2,
            hoverOffset: 22,
            hoverBorderColor: 'rgba(255,255,255,0.35)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        interaction: { mode: 'nearest', intersect: true },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
      plugins: [cdeCenterLabel],
    });
    (chartRef.current as any).$cdeNames = entries.map((e) => e.label);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [entries, total]);

  function cerrar() {
    setVisible(false);
    setTimeout(onClose, 180);
  }

  return (
    <div
      id="cde-pie-modal"
      className={`cde-ovl${visible ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div className="cde-modal-box">
        <div className="cde-modal-head">
          <div>
            <span className="label-sub">DETALLE · RAZONES DE VENTA PERDIDA</span>
            <h3 className="section-headline" id="cde-modal-title" style={{ fontSize: '1.6rem', margin: '4px 0 0' }}>
              Razones de venta perdida · {total} en total
            </h3>
          </div>
          <button type="button" className="cde-modal-close" onClick={cerrar} aria-label="Cerrar">
            &times;
          </button>
        </div>
        <div className="cde-modal-grid">
          <div className="cde-modal-canvas-wrap">
            <canvas id="cde-pie-modal-canvas" ref={canvasRef}></canvas>
          </div>
          <div id="cde-modal-detail" className="cde-detail cde-detail-grid">
            <DesglosePie entries={entries} total={total} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal de detalle de un lead (se abre al pulsar una fila de la tabla) ──
export function ModalLead({ lead, onClose }: { lead: any; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') cerrar();
    }
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cerrar() {
    setVisible(false);
    setTimeout(onClose, 180);
  }

  const stage = cdeStage(lead);
  const estado = lead.etiquetas_display || lead.estatus || '—';
  const fecha =
    lead.fecha_parsed && typeof lead.fecha_parsed.toLocaleDateString === 'function'
      ? lead.fecha_parsed.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
      : '—';
  const monto = Number(lead.precio || lead.price || 0);
  const motivo = stage === 'perdido' ? cdeMotivo(lead).label : '—';
  const main: [string, string][] = [
    ['Estado', estado],
    ['Fecha', fecha],
    ['Monto empeñado', monto > 0 ? fmt(monto) : '—'],
    ['Motivo (si perdido)', motivo],
  ];
  // Datos extra: campos primitivos no internos
  const skip = new Set(['nombre', 'estatus', 'estatus_original', 'etiquetas_display', 'fecha_parsed', 'precio', 'price', 'motivo_perdida']);
  const extra: [string, string][] = [];
  Object.keys(lead).forEach((k) => {
    if (skip.has(k)) return;
    const v = lead[k];
    if (v == null || typeof v === 'object') return;
    const s = String(v).trim();
    if (!s || s.length > 90) return;
    extra.push([k, s]);
  });

  const cell = ([k, v]: [string, string]) => (
    <div className="cde-lead-item" key={k}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );

  return (
    <div
      id="cde-lead-modal"
      className={`cde-ovl${visible ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div className="cde-modal-box">
        <div className="cde-modal-head">
          <div>
            <span className="label-sub">DETALLE DEL LEAD</span>
            <h3 className="section-headline" id="cde-lead-title" style={{ fontSize: '1.7rem', margin: '4px 0 0' }}>
              {lead.nombre || 'Lead'}
            </h3>
          </div>
          <button type="button" className="cde-modal-close" onClick={cerrar} aria-label="Cerrar">
            &times;
          </button>
        </div>
        <div id="cde-lead-body">
          <div className="cde-lead-grid">{main.map(cell)}</div>
          {extra.length > 0 && (
            <>
              <div className="cde-lead-sub">Más datos</div>
              <div className="cde-lead-grid">{extra.slice(0, 8).map(cell)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cajón lateral de captura de Inversión en Publicidad ──
function CajonInversion({ open, onClose, leads }: { open: boolean; onClose: () => void; leads: any[] }) {
  const { adminSupabase } = useClientConfig();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const spendQ = useAdSpend();
  const spendMap = useMemo(() => spendQ.data || {}, [spendQ.data]);

  const [mes, setMes] = useState(cdeDefaultMonth());
  const [monto, setMonto] = useState('');
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    setMonto(spendMap[mes] != null ? String(spendMap[mes]) : '');
  }, [mes, spendMap]);

  useEffect(() => {
    if (!open) return;
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);

  const guardar = useMutation({
    mutationFn: async () => {
      const periodo = mes || cdeDefaultMonth();
      const m = Math.max(0, parseFloat(monto) || 0);
      const { error } = await adminSupabase.from('ad_spend').upsert(
        { account_slug: CDE_SLUG, periodo, monto: m, updated_at: new Date().toISOString() },
        { onConflict: 'account_slug,periodo' }
      );
      if (error) throw error;
      return { periodo, m };
    },
    onSuccess: ({ periodo }) => {
      queryClient.invalidateQueries({ queryKey: ['cde-ad-spend'] });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 1400);
      showToast('Inversión guardada (' + (CDE_MES_LABEL[periodo] || periodo) + ')', 'success');
    },
    onError: (e: any) => {
      console.error('[cde] save spend', e);
      alert('Error: ' + e.message);
    },
  });

  return (
    <>
      <div id="cde-invest-backdrop" className={open ? 'open' : ''} onClick={onClose}></div>
      <div id="cde-invest-panel" className={open ? 'open' : ''}>
        <div className="vp-header">
          <div className="vp-title">
            <ion-icon name="wallet-outline"></ion-icon> Inversión en Publicidad
          </div>
          <button className="vp-close" onClick={onClose}>
            <ion-icon name="close-outline"></ion-icon>
          </button>
        </div>
        <div className="vp-form">
          <div className="vp-form-title">Registrar inversión mensual</div>
          <div className="vp-field">
            <label className="vp-label">Mes</label>
            <select id="cde-inv-mes" className="vp-input" value={mes} onChange={(e) => setMes(e.target.value)}>
              {CDE_MESES.map((m) => (
                <option key={m} value={m}>
                  {CDE_MES_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="vp-field">
            <label className="vp-label">Monto invertido ($)</label>
            <input
              type="number"
              id="cde-inv-monto"
              className="vp-input"
              min={0}
              placeholder="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div className="vp-actions">
            <button className="vp-btn-save" id="cde-inv-save" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              <ion-icon name="checkmark-outline"></ion-icon> {guardado ? '✓ Guardado' : 'Guardar inversión'}
            </button>
          </div>
        </div>
        <div className="vp-list">
          <div className="vp-list-header">
            <span className="vp-list-title">Inversión por mes</span>
          </div>
          <div id="cde-inv-list">
            {CDE_MESES.map((m) => (
              <div key={m} className={`cde-inv-row${m === mes ? ' active' : ''}`} onClick={() => setMes(m)}>
                <span className="m">{CDE_MES_LABEL[m]}</span>
                <span className="a">{fmt(spendMap[m] || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
