'use client';

import { useState } from 'react';
import {
  SL_CATEGORY_LABELS,
  SL_SENTIMENT_LABELS,
  SL_SOURCE_LABELS,
  slIniciales,
  type Review,
} from './logica';

// Tarjeta individual de reseña + estrellas — port de renderSocialReviewCard()
// y renderStars() (incluye el toggle "Ver más"/"Ver menos").

export function Estrellas({ rating }: { rating: number }) {
  const full = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return (
    <>
      {'★'.repeat(full)}
      <span className="star-empty">{'★'.repeat(5 - full)}</span>
    </>
  );
}

export default function TarjetaResena({ review: r }: { review: Review }) {
  const [expanded, setExpanded] = useState(false);

  const ratingNum = typeof r.rating === 'number' ? r.rating.toFixed(1) : '—';
  const dateStr = r.review_date
    ? new Date(r.review_date).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
  const body = r.body || '';
  const needsToggle = body.length > 240;
  const initials = slIniciales(r.author);

  const cardClasses = ['sl-review'];
  if (r.sentiment) cardClasses.push('sl-sentiment-' + r.sentiment);
  if (r.priority === 'high') cardClasses.push('sl-priority-high');
  if (expanded) cardClasses.push('expanded');

  return (
    <article className={cardClasses.join(' ')}>
      <div className="sl-review-head">
        <div className="sl-review-author-block">
          {r.author_avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="sl-review-avatar" src={r.author_avatar_url} alt="" />
          ) : (
            <div className="sl-review-avatar">{initials}</div>
          )}
          <div className="sl-review-author-info">
            <div className="sl-review-author">{r.author || 'Anónimo'}</div>
            <div className="sl-review-date">{dateStr}</div>
          </div>
        </div>
        <span className={`sl-review-source sl-source-${r.source}`}>
          {SL_SOURCE_LABELS[r.source] || r.source}
        </span>
      </div>
      <div className="sl-review-rating-row">
        <span className="sl-review-rating">
          {typeof r.rating === 'number' ? <Estrellas rating={r.rating} /> : ''}
        </span>
        <span className="sl-review-rating-num">{ratingNum}</span>
      </div>
      {r.title && <h4 className="sl-review-title">{r.title}</h4>}
      <p className="sl-review-body">{body}</p>
      {needsToggle && (
        <button className="sl-review-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      )}
      {r.summary && (
        <div className="sl-summary">
          <span className="sl-summary-label">Resumen IA</span>
          {r.summary}
        </div>
      )}
      <div className="sl-review-tags">
        {r.sentiment && (
          <span
            className={`sl-tag sl-tag-${r.sentiment === 'positive' ? 'pos' : r.sentiment === 'neutral' ? 'neu' : 'neg'}`}
          >
            {SL_SENTIMENT_LABELS[r.sentiment]}
          </span>
        )}
        {r.category && (
          <span className="sl-tag sl-tag-category">{SL_CATEGORY_LABELS[r.category] || r.category}</span>
        )}
        {r.priority === 'high' && <span className="sl-tag sl-tag-urgent">Urgente</span>}
        {(r.topics || []).slice(0, 3).map((t, i) => (
          <span className="sl-tag" key={`${t}-${i}`}>
            {t}
          </span>
        ))}
      </div>
      {r.review_url && (
        <a className="sl-review-link" href={r.review_url} target="_blank" rel="noopener noreferrer">
          Ver en {SL_SOURCE_LABELS[r.source] || 'fuente'} ↗
        </a>
      )}
    </article>
  );
}
