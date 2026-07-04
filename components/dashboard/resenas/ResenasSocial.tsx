'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClientConfig } from '@/lib/config/ClientConfigProvider';
import TarjetaResena, { Estrellas } from './TarjetaResena';
import {
  SL_FILTROS_INICIALES,
  analyzeReviews,
  getFilteredReviews,
  slIniciales,
  type Review,
  type SLFiltros,
  type TopicStat,
} from './logica';

// Panel de Social Listening — Reputación (#social-listening-panel).
// Port de fetchSocialListeningReviews() + renderSocialListeningPanel() +
// renderReviewsList() + wireSocialListeningFilters() de legacy/src/dashboard.js.
// Las reviews viven en una tabla única del ADMIN Supabase, filtradas por hotel_id.

const TABS: { label: string; sentiment: string; priority: string; className: string; countId: string }[] = [
  { label: 'Todas', sentiment: '', priority: '', className: '', countId: 'sl-tab-count-all' },
  { label: 'Positivas', sentiment: 'positive', priority: '', className: 'sl-stab-pos', countId: 'sl-tab-count-pos' },
  { label: 'Atención', sentiment: 'neutral', priority: '', className: 'sl-stab-neu', countId: 'sl-tab-count-neu' },
  { label: 'Negativas', sentiment: 'negative', priority: '', className: 'sl-stab-neg', countId: 'sl-tab-count-neg' },
  { label: 'Urgentes', sentiment: '', priority: 'high', className: 'sl-stab-urgent', countId: 'sl-tab-count-urgent' },
];

export default function ResenasSocial() {
  const { clientId, adminSupabase } = useClientConfig();
  const [filtros, setFiltros] = useState<SLFiltros>(SL_FILTROS_INICIALES);

  const q = useQuery({
    queryKey: ['social-listening-reviews', clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await adminSupabase
        .from('reviews')
        .select('*')
        .eq('hotel_id', clientId)
        .order('review_date', { ascending: false })
        .limit(500);
      if (error) {
        console.error('social_listening fetch:', error);
        return [];
      }
      return data || [];
    },
  });

  const all = useMemo(() => q.data || [], [q.data]);
  const analysis = useMemo(() => analyzeReviews(all), [all]);
  const filtered = useMemo(() => getFilteredReviews(all, filtros), [all, filtros]);

  // Stats globales
  const ratings = all.map((r) => r.rating).filter((v): v is number => typeof v === 'number');
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const pos = all.filter((r) => r.sentiment === 'positive').length;
  const neu = all.filter((r) => r.sentiment === 'neutral').length;
  const neg = all.filter((r) => r.sentiment === 'negative').length;
  const urgentCount = all.filter((r) => r.priority === 'high').length;
  const tabCounts = [all.length, pos, neu, neg, urgentCount];

  // Distribución de sentimiento
  const distTotal = Math.max(1, pos + neu + neg);
  const pct = (n: number) => Math.round((n / distTotal) * 100);

  // Fuentes (Por plataforma)
  const sourceLabelsLargas: Record<string, string> = {
    google: 'Google Maps',
    tripadvisor: 'TripAdvisor',
    booking: 'Booking.com',
  };
  const sourceIcons: Record<string, string> = { google: 'G', tripadvisor: 'T', booking: 'B' };
  const bySrc: Record<string, { total: number; sum: number; n: number }> = {};
  for (const r of all) {
    const s = r.source;
    if (!bySrc[s]) bySrc[s] = { total: 0, sum: 0, n: 0 };
    bySrc[s].total++;
    if (typeof r.rating === 'number') {
      bySrc[s].sum += r.rating;
      bySrc[s].n++;
    }
  }
  const sourceOrder = ['google', 'tripadvisor', 'booking'].filter((s) => bySrc[s]);

  // Cards de topics (fortalezas / áreas de mejora)
  const topicCards = (items: TopicStat[], kind: 'pos' | 'neg') => {
    if (!items.length) return <div className="sl-ai-empty-card">Sin datos suficientes</div>;
    const maxCount = Math.max(...items.map((i) => (kind === 'pos' ? i.pos : i.neg)));
    return (
      <div className="sl-ai-grid">
        {items.slice(0, 4).map((i) => {
          const count = kind === 'pos' ? i.pos : i.neg;
          const total = i.total;
          const pctOfMax = Math.max(15, Math.round((count / maxCount) * 100));
          const label = kind === 'pos' ? 'mención' : 'queja';
          const sub =
            kind === 'pos'
              ? `${total} reseña${total > 1 ? 's' : ''} mencionan este tema`
              : `${total} reseña${total > 1 ? 's' : ''} reportan este tema`;
          return (
            <div className={`sl-ai-stat-card ${kind === 'pos' ? 'pos' : 'neg'}`} key={i.topic}>
              <div className="sl-ai-stat-num">
                {count}
                <small>{count > 1 ? label + 's' : label}</small>
              </div>
              <div className="sl-ai-stat-label">{i.topic}</div>
              <div className="sl-ai-stat-sub">{sub}</div>
              <div className="sl-ai-stat-bar">
                <span style={{ width: `${pctOfMax}%` }}></span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Cards de urgentes (atención inmediata)
  const urgentCards = (items: Review[]) => {
    if (!items.length) return <div className="sl-ai-empty-card">Sin reseñas urgentes ✓</div>;
    const sourceLabels: Record<string, string> = {
      google: 'Google',
      tripadvisor: 'TripAdvisor',
      booking: 'Booking',
    };
    return (
      <div className="sl-ai-urgent-list">
        {items.slice(0, 4).map((r, idx) => {
          const initials = slIniciales(r.author);
          const summary = r.summary || r.title || (r.body || '').slice(0, 90) + '…';
          return (
            <div className="sl-ai-urgent-row" key={r.id ?? idx}>
              <div className="sl-ai-urgent-head">
                <div className="sl-ai-urgent-avatar">{initials}</div>
                <div className="sl-ai-urgent-info">
                  <div className="sl-ai-urgent-name">{r.author || 'Anónimo'}</div>
                  <div className="sl-ai-urgent-meta">
                    <span className="sl-ai-urgent-stars">
                      {typeof r.rating === 'number' ? <Estrellas rating={r.rating} /> : ''}
                    </span>
                    <span className="sl-ai-urgent-source">{sourceLabels[r.source] || r.source}</span>
                  </div>
                </div>
              </div>
              <div className="sl-ai-urgent-summary">{summary}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div id="social-listening-panel" style={{ padding: '0 24px 28px' }}>
      {/* 1. AI EXECUTIVE SUMMARY */}
      <section className="sl-ai-summary">
        <div className="sl-ai-head">
          <div className="sl-ai-head-left">
            <div className="sl-ai-spark">✦</div>
            <div className="sl-ai-title-block">
              <span className="sl-eyebrow">Análisis inteligente</span>
              <h2 className="sl-h2">Resumen ejecutivo</h2>
            </div>
          </div>
          <div className="sl-ai-updated" id="sl-ai-updated">
            Generado por IA · ahora
          </div>
        </div>
        <div className="sl-ai-cols">
          <div className="sl-ai-col sl-ai-col-strengths">
            <div className="sl-ai-col-head">
              <span className="sl-ai-col-icon">✓</span>
              <span>Fortalezas</span>
            </div>
            <ul className="sl-ai-list" id="sl-ai-strengths">
              {topicCards(analysis.strengths, 'pos')}
            </ul>
          </div>
          <div className="sl-ai-col sl-ai-col-improve">
            <div className="sl-ai-col-head">
              <span className="sl-ai-col-icon">⚠</span>
              <span>Áreas de mejora</span>
            </div>
            <ul className="sl-ai-list" id="sl-ai-improvements">
              {topicCards(analysis.improvements, 'neg')}
            </ul>
          </div>
          <div className="sl-ai-col sl-ai-col-urgent">
            <div className="sl-ai-col-head">
              <span className="sl-ai-col-icon">!</span>
              <span>Atención inmediata</span>
            </div>
            <ul className="sl-ai-list" id="sl-ai-urgent">
              {urgentCards(analysis.urgent)}
            </ul>
          </div>
        </div>
        <div className="sl-ai-recommendation">
          <div className="sl-ai-rec-icon">💡</div>
          <div className="sl-ai-rec-body">
            <div className="sl-ai-rec-eyebrow">Acción recomendada</div>
            <p className="sl-ai-rec-text" id="sl-ai-recommendation">
              {analysis.recommendation}
            </p>
          </div>
        </div>
      </section>

      {/* 2. HERO STATS — Rating + Distribución + Fuentes */}
      <section className="sl-hero">
        <div className="sl-hero-card sl-hero-rating-card">
          <span className="sl-eyebrow">Reputación general</span>
          <div className="sl-hero-number">
            <span id="sl-avg-rating">{avg ? avg.toFixed(1) : '—'}</span>
            <small>/ 5</small>
          </div>
          <div className="sl-hero-stars" id="sl-hero-stars">
            <Estrellas rating={avg || 0} />
          </div>
          <div className="sl-hero-meta">
            <strong id="sl-total">{all.length}</strong> reseñas analizadas
          </div>
        </div>
        <div className="sl-hero-card sl-dist-block">
          <div className="sl-dist-title">
            <span className="sl-h3">Distribución de sentimiento</span>
            <span id="sl-dist-summary">{`${all.length} reseñas`}</span>
          </div>
          <div className="sl-dist-bar" id="sl-dist-bar">
            {pos > 0 && (
              <div className="sl-dist-segment positive" style={{ flexGrow: pos }} title={`${pos} positivas`}>
                {pct(pos)}%
              </div>
            )}
            {neu > 0 && (
              <div className="sl-dist-segment neutral" style={{ flexGrow: neu }} title={`${neu} neutras`}>
                {pct(neu)}%
              </div>
            )}
            {neg > 0 && (
              <div className="sl-dist-segment negative" style={{ flexGrow: neg }} title={`${neg} negativas`}>
                {pct(neg)}%
              </div>
            )}
          </div>
          <div className="sl-dist-legend">
            <div>
              <span className="swatch positive"></span> Positivas · <span id="sl-positive">{pos}</span>
            </div>
            <div>
              <span className="swatch neutral"></span> Neutras · <span id="sl-neutral">{neu}</span>
            </div>
            <div>
              <span className="swatch negative"></span> Negativas · <span id="sl-negative">{neg}</span>
            </div>
          </div>
        </div>
        <div className="sl-hero-card">
          <span className="sl-eyebrow">Por plataforma</span>
          <div className="sl-sources-list" id="sl-sources-list">
            {sourceOrder.length === 0 ? (
              <div style={{ color: 'var(--sl-text-dim)', fontSize: '0.82rem' }}>Sin datos</div>
            ) : (
              sourceOrder.map((s) => {
                const info = bySrc[s];
                const r = info.n ? (info.sum / info.n).toFixed(1) : '—';
                return (
                  <div className="sl-source-row" key={s}>
                    <div className={`sl-source-icon ${s}`}>{sourceIcons[s]}</div>
                    <div className="sl-source-info">
                      <div className="sl-source-name">{sourceLabelsLargas[s]}</div>
                      <div className="sl-source-count">
                        {info.total} reseña{info.total > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="sl-source-rating">
                      {r}
                      <small> / 5</small>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* 3. TOP TOPICS */}
      <section className="sl-topics-section">
        <div className="sl-topics-row">
          <h3 className="sl-h3">Temas más mencionados</h3>
          <span className="sl-eyebrow" id="sl-topics-count">{`${analysis.topTopics.length} temas`}</span>
        </div>
        <div className="sl-topic-chips" id="sl-topic-chips">
          {analysis.topTopics.length === 0 ? (
            <span style={{ color: 'var(--sl-text-dim)', fontSize: '0.82rem' }}>
              Sin temas identificados
            </span>
          ) : (
            analysis.topTopics.map((t) => (
              <span className={`sl-topic-chip ${t.sentiment}`} key={t.topic}>
                {t.topic} <em>{t.total}</em>
              </span>
            ))
          )}
        </div>
      </section>

      {/* 4. SENTIMENT TABS + FILTERS */}
      <div className="sl-controls">
        <div className="sl-sentiment-tabs" id="sl-sentiment-tabs">
          {TABS.map((t, i) => {
            const active = filtros.sentiment === t.sentiment && filtros.priority === t.priority;
            return (
              <button
                key={t.label}
                className={`sl-stab${t.className ? ` ${t.className}` : ''}${active ? ' active' : ''}`}
                data-sentiment={t.sentiment}
                data-priority={t.priority || undefined}
                onClick={() =>
                  setFiltros((f) => ({ ...f, sentiment: t.sentiment, priority: t.priority }))
                }
              >
                {t.label} <em id={t.countId}>{tabCounts[i]}</em>
              </button>
            );
          })}
        </div>
        <div className="sl-secondary-filters">
          <select
            id="sl-filter-source"
            className="sl-select"
            value={filtros.source}
            onChange={(e) => setFiltros((f) => ({ ...f, source: e.target.value }))}
          >
            <option value="">Todas las fuentes</option>
            <option value="google">Google Maps</option>
            <option value="tripadvisor">TripAdvisor</option>
            <option value="booking">Booking.com</option>
          </select>
          <select
            id="sl-filter-sort"
            className="sl-select"
            value={filtros.sort}
            onChange={(e) => setFiltros((f) => ({ ...f, sort: e.target.value }))}
          >
            <option value="recent">Más recientes</option>
            <option value="oldest">Más antiguas</option>
            <option value="worst">Peor calificadas</option>
            <option value="best">Mejor calificadas</option>
          </select>
        </div>
      </div>

      {/* 5. REVIEWS GRID */}
      <div id="sl-empty" className={`sl-empty${filtered.length === 0 ? '' : ' hidden'}`}>
        <ion-icon name="star-outline"></ion-icon>
        <h3>Aún no hay reseñas</h3>
        <p>El primer scrape se ejecuta en las próximas horas.</p>
      </div>
      <div id="sl-reviews-list" className="sl-reviews-list">
        {filtered.map((r, i) => (
          <TarjetaResena review={r} key={r.id ?? `${r.source}-${i}`} />
        ))}
      </div>
    </div>
  );
}
