'use client';

import { useMemo, useState } from 'react';
import {
  F,
  FUENTES,
  PALETTE,
  PERIODS,
  SISTEMAS,
  conRespuesta,
  esCalificado,
  esDescartado,
  fmtDelta,
  fmtInt,
  firstNonEmpty,
  inRange,
  parseWall,
  pct,
  periodRange,
  smoothPath,
  type Lead,
  type Wall,
} from './logica';

// Bento grid del Panel del Director General — port del render de director.js.
// Los estilos inline se conservan tal cual (paridad visual con el legacy).

export default function PanelDirector({ leads }: { leads: Lead[] }) {
  const [period, setPeriod] = useState('30d');
  const [campanaFilter, setCampanaFilter] = useState<string | null>(null);
  const [fuenteFilter, setFuenteFilter] = useState<string | null>(null);

  const { cur, prev, chip } = useMemo(() => {
    const { start, end, prevStart, prevEnd } = periodRange(period);
    const passesChips = (l: Lead) => {
      if (campanaFilter && F.campana(l) !== campanaFilter) return false;
      if (fuenteFilter && F.fuente(l) !== fuenteFilter) return false;
      return true;
    };
    const chip = leads.filter(passesChips);
    return {
      cur: chip.filter((l) => inRange(l, start, end)),
      prev: chip.filter((l) => inRange(l, prevStart, prevEnd)),
      chip,
    };
  }, [leads, period, campanaFilter, fuenteFilter]);

  const periodLabel = (PERIODS.find((p) => p.key === period) || {}).label || '';

  // --- Métricas del hero / funnel ---
  const calificados = cur.filter(esCalificado).length;
  const califPrev = prev.filter(esCalificado).length;
  const total = cur.length;
  const conResp = cur.filter(conRespuesta).length;
  const descartados = cur.filter(esDescartado).length;
  const dCitas = fmtDelta(calificados, califPrev);

  const toggleCampana = (k: string | null) => setCampanaFilter((cf) => (cf === k ? null : k));
  const toggleFuente = (k: string | null) => setFuenteFilter((ff) => (ff === k ? null : k));

  return (
    <div
      className="dg-wrap"
      style={{
        minHeight: '100%',
        background: '#F5F6F8',
        backgroundImage: 'radial-gradient(1100px 520px at 80% -14%, rgba(10,108,255,0.07), transparent 60%)',
        fontFamily: "'Inter',sans-serif",
        color: '#1D1D1F',
        padding: '40px 48px 72px',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0A6CFF' }}>
              Inteligencia comercial · intra
            </div>
            <div id="dg-client-name" style={{ fontSize: 27, fontWeight: 600, letterSpacing: '-0.02em', color: '#1D1D1F', marginTop: 7 }}>
              Logic Systems
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div id="periods" style={{ display: 'inline-flex', gap: 3, padding: 4, borderRadius: 13, background: '#E8E8ED' }}>
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    padding: '7px 13px',
                    borderRadius: 10,
                    transition: 'all 160ms ease',
                    ...(p.key === period
                      ? { background: '#FFFFFF', color: '#0A6CFF', boxShadow: '0 1px 3px rgba(16,24,40,0.12)' }
                      : { background: 'transparent', color: '#6E6E73' }),
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 15px',
                borderRadius: 999,
                background: '#E7F7EF',
                border: '1px solid #C7EEDB',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#1FB36B', animation: 'pulseDot 2.4s infinite' }}></span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0E8F53' }}>Agente activo · 24/7</span>
            </div>
          </div>
        </div>

        {/* FILTROS */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 18px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#A1A1A6', marginRight: 2 }}>
              Sistema
            </span>
            <div id="sysChips" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Chip label="Todos" active={!campanaFilter} onClick={() => setCampanaFilter(null)} />
              {SISTEMAS.map((k) => (
                <Chip key={k} label={k} active={campanaFilter === k} onClick={() => toggleCampana(k)} />
              ))}
            </div>
          </div>
          <span style={{ width: 1, height: 22, background: '#E3E3E8' }}></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#A1A1A6', marginRight: 2 }}>
              Fuente
            </span>
            <div id="srcChips" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Chip label="Todas" active={!fuenteFilter} onClick={() => setFuenteFilter(null)} />
              {FUENTES.map((k) => (
                <Chip key={k} label={k} active={fuenteFilter === k} onClick={() => toggleFuente(k)} />
              ))}
            </div>
          </div>
        </div>

        {/* BENTO GRID */}
        <div className="dg-bento" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {/* HERO */}
          <div
            className="dg-hero lift"
            style={{
              gridColumn: '1',
              gridRow: '1 / span 2',
              display: 'flex',
              flexDirection: 'column',
              background: '#FFFFFF',
              borderRadius: 24,
              boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 28px rgba(16,24,40,0.05)',
              padding: 26,
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#86868B', lineHeight: 1.35 }}>
              Citas / demos de 90 min agendadas
            </div>
            <div style={{ fontSize: 84, lineHeight: 0.86, fontWeight: 600, letterSpacing: '-0.04em', color: '#0A6CFF', marginTop: 14 }}>
              {fmtInt(calificados)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 18 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 11px',
                  borderRadius: 999,
                  background: '#E7F7EF',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#0E8F53',
                }}
              >
                ↑ <span>{dCitas}</span>
              </span>
              <span style={{ fontSize: 12.5, color: '#86868B' }}>vs. periodo anterior</span>
            </div>

            <div style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid #ECECEF' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', color: '#1D1D1F', marginBottom: 16 }}>
                Del primer mensaje a la demo
              </div>
              <div id="funnel">
                {[
                  { name: 'Mensajes recibidos', value: total, color: PALETTE[0] },
                  { name: 'Leads calificados', value: conResp, color: PALETTE[3] },
                  { name: 'Citas agendadas', value: calificados, color: PALETTE[1] },
                ].map((s) => (
                  <div key={s.name} style={{ marginBottom: 15 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ fontSize: 12.5, color: '#6E6E73' }}>{s.name}</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F' }}>{fmtInt(s.value)}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: '#EFF1F5', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 999,
                          width: `${pct(s.value, Math.max(1, total))}%`,
                          background: s.color,
                          transition: 'width 600ms cubic-bezier(0.2,0.7,0.2,1)',
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#6E6E73', lineHeight: 1.5, marginTop: 16 }}>
                El agente descartó <strong style={{ color: '#1D1D1F' }}>{fmtInt(descartados)} leads</strong> sin perfil y
                ahorró <strong style={{ color: '#0A6CFF' }}>~{fmtInt(descartados * 0.25)} h</strong> a tu equipo este
                periodo.
              </div>
            </div>
          </div>

          {/* TREND */}
          <div
            className="dg-trend lift"
            style={{
              gridColumn: '2 / span 3',
              gridRow: '1',
              background: '#FFFFFF',
              borderRadius: 24,
              boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 28px rgba(16,24,40,0.05)',
              padding: '26px 28px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#86868B', whiteSpace: 'nowrap' }}>
                  Tendencia de agendamiento
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: '#1D1D1F', marginTop: 8 }}>
                  <span>{fmtInt(calificados)}</span> demos · <span>{periodLabel}</span>
                </div>
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 11px',
                  borderRadius: 999,
                  background: '#E7F7EF',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#0E8F53',
                }}
              >
                ↑ <span>{dCitas}</span>
              </span>
            </div>
            <div style={{ marginTop: 14 }}>
              <GraficaTendencia cur={cur} period={period} />
            </div>
          </div>

          {/* DONUT */}
          <div
            className="dg-donut lift"
            style={{
              gridColumn: '2',
              gridRow: '2',
              background: '#FFFFFF',
              borderRadius: 24,
              boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 28px rgba(16,24,40,0.05)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#86868B', marginBottom: 8 }}>
              Tasa de agendamiento
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <Donut rate={pct(calificados, conResp)} />
              <div style={{ fontSize: 12.5, color: '#6E6E73', lineHeight: 1.45, textAlign: 'center', maxWidth: 210 }}>
                de cada lead calificado termina en demo agendada
              </div>
            </div>
          </div>

          {/* FUENTE */}
          <div
            className="dg-sources lift"
            style={{
              gridColumn: '3',
              gridRow: '2',
              background: '#FFFFFF',
              borderRadius: 24,
              boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 28px rgba(16,24,40,0.05)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <i className="ph ph-broadcast" style={{ fontSize: 16, color: '#0A6CFF' }}></i>
              <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#86868B' }}>
                Fuente de los leads
              </span>
            </div>
            <Fuentes cur={cur} onFiltra={toggleFuente} />
          </div>

          {/* SISTEMA TOP */}
          <SistemaTop cur={cur} prev={prev} />

          {/* SISTEMAS */}
          <div
            className="dg-products lift"
            style={{
              gridColumn: '1 / span 4',
              gridRow: '3',
              background: '#FFFFFF',
              borderRadius: 24,
              boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 28px rgba(16,24,40,0.05)',
              padding: '28px 30px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: '#1D1D1F' }}>
                Estadísticas por sistema
              </span>
              <span style={{ fontSize: 12.5, color: '#86868B' }}>
                Demos agendadas por producto · <span>{periodLabel}</span>
              </span>
            </div>
            <Sistemas cur={cur} prev={prev} onFiltra={toggleCampana} />
          </div>

          {/* SEGUIMIENTO */}
          <div
            className="dg-agenda lift"
            style={{
              gridColumn: '1 / span 4',
              gridRow: '4',
              background: '#FFFFFF',
              borderRadius: 24,
              boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 28px rgba(16,24,40,0.05)',
              padding: '26px 30px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: '#1D1D1F' }}>Agenda de demos</span>
              <span style={{ fontSize: 12.5, color: '#0A6CFF', fontWeight: 600, cursor: 'pointer' }}>Ver agenda completa →</span>
            </div>
            <div style={{ fontSize: 12.5, color: '#86868B', marginBottom: 6 }}>
              Próximas reuniones de 90 min con prospectos calificados
            </div>
            <Agenda leads={chip} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12.5,
        fontWeight: 500,
        padding: '6px 13px',
        borderRadius: 999,
        transition: 'all 160ms ease',
        ...(active
          ? { background: '#0A6CFF', color: '#fff', border: '1px solid #0A6CFF' }
          : { background: '#fff', color: '#3A3A3C', border: '1px solid #E3E3E8' }),
      }}
    >
      {label}
    </button>
  );
}

function Donut({ rate }: { rate: number }) {
  const r = 52,
    c = 2 * Math.PI * r,
    off = c * (1 - rate / 100);
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#EFF1F5" strokeWidth="14" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke="#0A6CFF"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={c.toFixed(1)}
        strokeDashoffset={off.toFixed(1)}
        transform="rotate(-90 70 70)"
        style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.2,0.7,0.2,1)' }}
      />
      <text x="70" y="70" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="30" fontWeight="600" fill="#0A6CFF">
        {rate}%
      </text>
      <text x="70" y="92" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="11" fill="#86868B">
        agendan
      </text>
    </svg>
  );
}

function Fuentes({ cur, onFiltra }: { cur: Lead[]; onFiltra: (k: string) => void }) {
  const total = cur.length || 1;
  const counts: Record<string, number> = {};
  cur.forEach((l) => {
    const k = F.fuente(l);
    counts[k] = (counts[k] || 0) + 1;
  });
  const top = FUENTES.map((k) => ({ key: k, count: counts[k] || 0 }));
  const max = Math.max(1, ...top.map((g) => g.count));
  return (
    <div id="sources">
      {top.map((g, i) => {
        const color = PALETTE[i % PALETTE.length];
        return (
          <div key={g.key} style={{ marginBottom: 14, cursor: 'pointer' }} onClick={() => onFiltra(g.key)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3A3A3C' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: color }}></span>
                {g.key}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>{pct(g.count, total)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: '#EFF1F5', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pct(g.count, max)}%`,
                  background: color,
                  borderRadius: 999,
                  transition: 'width 600ms cubic-bezier(0.2,0.7,0.2,1)',
                }}
              ></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function conteosPorSistema(cur: Lead[], prev: Lead[]) {
  const curByCamp: Record<string, number> = {},
    prevByCamp: Record<string, number> = {};
  cur.forEach((l) => {
    const k = F.campana(l);
    curByCamp[k] = (curByCamp[k] || 0) + 1;
  });
  prev.forEach((l) => {
    const k = F.campana(l);
    prevByCamp[k] = (prevByCamp[k] || 0) + 1;
  });
  const groups = SISTEMAS.map((k) => ({ key: k, count: curByCamp[k] || 0 }));
  return { groups, prevByCamp };
}

function SistemaTop({ cur, prev }: { cur: Lead[]; prev: Lead[] }) {
  const totalLeads = cur.length || 1;
  const { groups, prevByCamp } = conteosPorSistema(cur, prev);
  const topG = groups.slice().sort((a, b) => b.count - a.count)[0];
  const hay = topG && topG.count > 0;
  return (
    <div
      className="dg-top lift"
      style={{
        gridColumn: '4',
        gridRow: '2',
        background: 'linear-gradient(160deg, #EAF2FF 0%, #F4F8FF 100%)',
        border: '1px solid #DCE9FF',
        borderRadius: 24,
        boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 28px rgba(10,108,255,0.08)',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#0A6CFF' }}>
        Sistema más solicitado
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div id="topShare" style={{ fontSize: 46, fontWeight: 600, letterSpacing: '-0.03em', color: '#093A8C', lineHeight: 1 }}>
          {hay ? pct(topG.count, totalLeads) + '%' : '—'}
        </div>
        <div id="topName" style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F', marginTop: 12 }}>
          {hay ? topG.key : 'Sin datos'}
        </div>
        <div style={{ fontSize: 12.5, color: '#3A6CB0', marginTop: 6 }}>
          <span>{hay ? fmtInt(topG.count) : '0'}</span> demos · ↑{' '}
          <span>{hay ? fmtDelta(topG.count, prevByCamp[topG.key] || 0) : '0%'}</span> vs. periodo
        </div>
      </div>
    </div>
  );
}

function Sistemas({ cur, prev, onFiltra }: { cur: Lead[]; prev: Lead[]; onFiltra: (k: string) => void }) {
  const totalLeads = cur.length || 1;
  const { groups, prevByCamp } = conteosPorSistema(cur, prev);
  const max = Math.max(1, ...groups.map((g) => g.count));
  return (
    <div id="products" className="dg-products-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      {groups.map((g, i) => {
        const color = PALETTE[i % PALETTE.length];
        const delta = fmtDelta(g.count, prevByCamp[g.key] || 0);
        return (
          <div
            key={g.key}
            className="card-lift"
            style={{ background: '#FBFBFD', border: '1px solid #EEF0F3', borderRadius: 18, padding: 20, cursor: 'pointer' }}
            onClick={() => onFiltra(g.key)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flex: 'none' }}></span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {g.key}
              </span>
            </div>
            <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em', color: '#0A6CFF', lineHeight: 1 }}>
              {fmtInt(g.count)}
            </div>
            <div style={{ fontSize: 12, color: '#86868B', marginTop: 8 }}>demos agendadas · {pct(g.count, totalLeads)}%</div>
            <div style={{ height: 6, borderRadius: 999, background: '#E9ECF1', overflow: 'hidden', marginTop: 14 }}>
              <div
                style={{
                  height: '100%',
                  width: `${pct(g.count, max)}%`,
                  background: color,
                  borderRadius: 999,
                  transition: 'width 600ms cubic-bezier(0.2,0.7,0.2,1)',
                }}
              ></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: '#E7F7EF',
                  color: '#0E8F53',
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                ↑ {delta} vs. periodo
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GraficaTendencia({ cur, period }: { cur: Lead[]; period: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const { start, end } = periodRange(period);
  const e = end || new Date();
  const s = start || new Date(e.getTime() - 90 * 86400000);
  const totalDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
  const N = Math.min(Math.max(totalDays, 2), 12);
  const spanMs = (e.getTime() - s.getTime()) / N;
  const buckets = Array.from({ length: N }, (_, i) => ({
    count: 0,
    date: new Date(s.getTime() + spanMs * (i + 0.5)),
  }));
  cur.filter(esCalificado).forEach((l) => {
    const f = F.fecha(l);
    if (!f) return;
    const idx = Math.floor((f.getTime() - s.getTime()) / spanMs);
    if (idx >= 0 && idx < N) buckets[idx].count++;
  });

  const W = 900,
    H = 130,
    padX = 14,
    padY = 16;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const stepX = (W - padX * 2) / Math.max(1, N - 1);
  const pts: [number, number][] = buckets.map((b, i) => [padX + i * stepX, H - padY - (b.count / max) * (H - padY * 2)]);
  const linePath = smoothPath(pts);
  const areaPath = linePath + ` L${(W - padX).toFixed(1)} ${H - padY} L${padX} ${H - padY} Z`;
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function onMove(ev: React.MouseEvent<SVGSVGElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const vx = ((ev.clientX - rect.left) / rect.width) * W;
    let idx = Math.round((vx - padX) / stepX);
    idx = Math.max(0, Math.min(N - 1, idx));
    setHover(idx);
  }

  const p = hover != null ? pts[hover] : null;
  const b = hover != null ? buckets[hover] : null;

  return (
    <div className="dg-trend-wrap" style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg
        className="dg-trend-svg"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', height: 'auto', overflow: 'visible' }}
        onMouseMove={onMove}
      >
        <defs>
          <linearGradient id="dgTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0A6CFF" stopOpacity="0.16" />
            <stop offset="1" stopColor="#0A6CFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#dgTrendFill)" />
        <path d={linePath} fill="none" stroke="#0A6CFF" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((pt, i) => (
          <circle key={i} cx={pt[0].toFixed(1)} cy={pt[1].toFixed(1)} r="2.5" fill="#fff" stroke="#0A6CFF" strokeWidth="1.5" />
        ))}
        {p && (
          <>
            <line x1={p[0]} y1={padY} x2={p[0]} y2={H - padY} stroke="#0A6CFF" strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />
            <circle cx={p[0]} cy={p[1]} r="5" fill="#0A6CFF" stroke="#fff" strokeWidth="2.5" />
          </>
        )}
      </svg>
      <div
        className="dg-trend-tip"
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          transform: 'translate(-50%,-125%)',
          background: '#0B1220',
          color: '#fff',
          padding: '6px 10px',
          borderRadius: 8,
          fontSize: 11.5,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          opacity: p ? 1 : 0,
          transition: 'opacity 120ms',
          boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
          left: p ? `${(p[0] / W) * 100}%` : 0,
          top: p ? `${(p[1] / H) * 100}%` : 0,
        }}
      >
        {b ? `${b.count} ${b.count === 1 ? 'demo' : 'demos'} · ${b.date.getDate()} ${meses[b.date.getMonth()]}` : ''}
      </div>
    </div>
  );
}

// Agenda de demos: ordenada por la fecha de la DEMO (demo_inicio), no la del lead.
// Próximas primero (ascendente), luego recientes (descendente). Recibe la lista ya
// filtrada por chips (sistema/fuente) pero SIN filtro de periodo — una agenda mira
// fechas de demo. La hora sale LITERAL de parseWall (sin conversión de zona).
type DemoItem = { l: Lead; w: Wall };
function Agenda({ leads }: { leads: Lead[] }) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const finDeHoy = new Date(todayStart.getTime() + 86400000);

  const demos = leads
    .map((l) => ({ l, w: parseWall(firstNonEmpty(l.demo_inicio)) }))
    .filter((x) => x.w !== null) as DemoItem[];
  const futuras = demos
    .filter((x) => x.w.date >= todayStart)
    .sort((a, b) => a.w.date.getTime() - b.w.date.getTime());
  const pasadas = demos
    .filter((x) => x.w.date < todayStart)
    .sort((a, b) => b.w.date.getTime() - a.w.date.getTime());
  const items = [...futuras, ...pasadas.slice(0, Math.max(0, 15 - futuras.length))];

  if (!items.length) {
    return (
      <div id="noDemos" style={{ padding: '30px 0', textAlign: 'center', color: '#86868B', fontSize: 13.5 }}>
        No hay demos agendadas con este filtro.
      </div>
    );
  }

  // Agrupar por día conservando el orden (Map preserva el orden de inserción).
  const byDay = new Map<string, { d: Date; arr: DemoItem[] }>();
  items.forEach(({ l, w }) => {
    const key = `${w.date.getFullYear()}-${w.date.getMonth()}-${w.date.getDate()}`;
    if (!byDay.has(key)) byDay.set(key, { d: w.date, arr: [] });
    byDay.get(key)!.arr.push({ l, w });
  });
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  return (
    <div id="demoGroups">
      {[...byDay.values()].map((group) => {
        const g = group.d;
        const dayPast = g < todayStart;
        return (
          <div key={g.toISOString()} style={{ marginTop: 22 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                marginBottom: 12,
                paddingBottom: 10,
                borderBottom: '1px solid #F2F2F5',
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600, color: dayPast ? '#86868B' : '#1D1D1F' }}>{dias[g.getDay()]}</span>
              <span style={{ fontSize: 12.5, color: '#86868B' }}>
                {g.getDate()} {meses[g.getMonth()]}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: '#A1A1A6',
                  whiteSpace: 'nowrap',
                }}
              >
                {group.arr.length} demo{group.arr.length !== 1 ? 's' : ''}
              </span>
            </div>
            {group.arr.map(({ l, w }, i) => {
              const soft = dayPast ? '#FAFAFB' : ['#F5F8FF', '#F4FBF7', '#FFF9F0'][i % 3];
              const accent = PALETTE[i % PALETTE.length];
              let estColor = '#0E8F53';
              let estLabel = 'Próxima';
              if (w.date >= todayStart && w.date < finDeHoy) {
                estColor = '#0A6CFF';
                estLabel = 'Hoy';
              } else if (w.date < now) {
                estColor = '#86868B';
                estLabel = 'Realizada';
              }
              const hora = String(w.h).padStart(2, '0') + ':' + String(w.mi).padStart(2, '0');
              const sub = [F.telefono(l), l.empresa, F.campana(l)].filter(Boolean).join(' · ');
              return (
                <div
                  key={i}
                  className="card-lift"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '13px 16px',
                    borderRadius: 14,
                    background: soft,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ flex: 'none', width: 58, textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.01em' }}>{hora}</div>
                    <div style={{ fontSize: 10.5, color: '#86868B', marginTop: 2 }}>90 min</div>
                  </div>
                  <div style={{ flex: 'none', width: 4, height: 40, borderRadius: 999, background: accent }}></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {F.nombre(l)}
                    </div>
                    <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sub}
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 11px',
                      borderRadius: 999,
                      background: '#FFFFFF',
                      boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: estColor }}></span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: estColor }}>{estLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
