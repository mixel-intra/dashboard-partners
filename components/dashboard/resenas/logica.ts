// Lógica del panel de Social Listening — Reputación.
// Port 1:1 de analyzeReviews() + getFilteredSocialListeningReviews() de
// legacy/src/dashboard.js. El análisis se computa localmente (sin llamar a
// Claude) porque cada review ya viene pre-procesada en la BD (tabla `reviews`).

export interface Review {
  id?: string | number;
  hotel_id?: string;
  source: string;
  author?: string | null;
  author_avatar_url?: string | null;
  rating?: number | null;
  title?: string | null;
  body?: string | null;
  summary?: string | null;
  review_date?: string | null;
  review_url?: string | null;
  sentiment?: string | null; // 'positive' | 'neutral' | 'negative'
  category?: string | null;
  priority?: string | null; // 'high' = urgente
  topics?: string[] | null;
}

export interface TopicStat {
  topic: string;
  total: number;
  pos: number;
  neu: number;
  neg: number;
  score?: number;
  sentiment?: string;
}

export interface AnalisisReviews {
  strengths: TopicStat[];
  improvements: TopicStat[];
  urgent: Review[];
  topTopics: TopicStat[];
  recommendation: string;
}

export interface SLFiltros {
  sentiment: string;
  priority: string;
  source: string;
  sort: string; // 'recent' | 'oldest' | 'worst' | 'best'
}

export const SL_FILTROS_INICIALES: SLFiltros = {
  sentiment: '',
  priority: '',
  source: '',
  sort: 'recent',
};

// Etiquetas compartidas
export const SL_SOURCE_LABELS: Record<string, string> = {
  google: 'Google',
  tripadvisor: 'TripAdvisor',
  booking: 'Booking',
};

export const SL_CATEGORY_LABELS: Record<string, string> = {
  service: 'Servicio',
  cleanliness: 'Limpieza',
  location: 'Ubicación',
  food: 'Comida',
  price: 'Precio',
  rooms: 'Habitaciones',
  amenities: 'Amenidades',
  other: 'Otro',
};

export const SL_SENTIMENT_LABELS: Record<string, string> = {
  positive: 'Positivo',
  neutral: 'Neutral',
  negative: 'Negativo',
};

export function slIniciales(author?: string | null): string {
  return (author || '?')
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────
// Análisis: extrae fortalezas / áreas de mejora / urgentes / top topics
// ─────────────────────────────────────────────────────────────────────
export function analyzeReviews(all: Review[]): AnalisisReviews {
  // Frecuencia de topics por sentimiento
  const topicStats = new Map<string, TopicStat>(); // topic → { total, pos, neu, neg }
  const categoryStats = new Map<string, { category: string; total: number; pos: number; neg: number }>();

  for (const r of all) {
    const sentiment = r.sentiment || 'neutral';
    (r.topics || []).forEach((t) => {
      const key = String(t).toLowerCase().trim();
      if (!key) return;
      const cur = topicStats.get(key) || { topic: key, total: 0, pos: 0, neu: 0, neg: 0 };
      cur.total++;
      if (sentiment === 'positive') cur.pos++;
      else if (sentiment === 'negative') cur.neg++;
      else cur.neu++;
      topicStats.set(key, cur);
    });
    if (r.category) {
      const c = categoryStats.get(r.category) || { category: r.category, total: 0, pos: 0, neg: 0 };
      c.total++;
      if (sentiment === 'positive') c.pos++;
      if (sentiment === 'negative') c.neg++;
      categoryStats.set(r.category, c);
    }
  }

  const topics = [...topicStats.values()];
  topics.forEach((t) => {
    t.score = (t.pos - t.neg) / Math.max(1, t.total);
    t.sentiment = t.pos > t.neg ? 'positive' : t.neg > t.pos ? 'negative' : 'neutral';
  });

  // Fortalezas: topics mayormente positivos, por conteo absoluto de positivos
  const strengths = topics
    .filter((t) => t.pos >= 2 && (t.score || 0) > 0)
    .sort((a, b) => b.pos - a.pos)
    .slice(0, 4);

  // Áreas de mejora: topics mayormente negativos (o con al menos 2 negativos)
  const improvements = topics
    .filter((t) => t.neg >= 2 || (t.neg >= 1 && (t.score || 0) < 0))
    .sort((a, b) => b.neg - a.neg)
    .slice(0, 4);

  // Urgentes: reviews con priority = high (se usa su summary)
  const urgent = all
    .filter((r) => r.priority === 'high')
    .sort(
      (a, b) => new Date(b.review_date || 0).getTime() - new Date(a.review_date || 0).getTime()
    )
    .slice(0, 4);

  // Recomendación: frase de acción contextual
  const topNegativeCategory = [...categoryStats.values()]
    .filter((c) => c.neg >= 2)
    .sort((a, b) => b.neg - a.neg)[0];
  const urgentCount = urgent.length;

  const categoryLabels: Record<string, string> = {
    service: 'servicio al huésped',
    cleanliness: 'limpieza y mantenimiento',
    location: 'ubicación',
    food: 'desayuno y alimentos',
    price: 'política de precios y cargos extra',
    rooms: 'estado de habitaciones',
    amenities: 'amenidades y servicios complementarios',
    other: 'experiencia general',
  };

  let recommendation: string;
  if (urgentCount >= 3 && topNegativeCategory) {
    recommendation = `Priorizar revisión de ${categoryLabels[topNegativeCategory.category]} — ${urgentCount} reseñas urgentes recientes señalan problemas críticos. Considerar respuesta directa a los huéspedes afectados y plan de acción a 30 días con el equipo operativo.`;
  } else if (urgentCount >= 1 && topNegativeCategory) {
    recommendation = `Atender prioritariamente las ${urgentCount} reseña${urgentCount > 1 ? 's' : ''} urgente${urgentCount > 1 ? 's' : ''} y reforzar protocolo de ${categoryLabels[topNegativeCategory.category]}.`;
  } else if (topNegativeCategory) {
    recommendation = `Revisar el área de ${categoryLabels[topNegativeCategory.category]}, donde se concentran ${topNegativeCategory.neg} comentarios negativos. Sin urgencias críticas, pero patrón claro a corregir.`;
  } else if (strengths.length > 0) {
    recommendation = `Reputación estable sin patrones críticos. Capitalizar las fortalezas (${strengths
      .slice(0, 2)
      .map((s) => s.topic)
      .join(', ')}) en marketing y mantener consistencia operativa.`;
  } else {
    recommendation =
      'Datos insuficientes para una recomendación específica. Aumentar volumen de reseñas para análisis más profundo.';
  }

  // Top topics para chips (todos, por total)
  const topTopics = topics.sort((a, b) => b.total - a.total).slice(0, 12);

  return { strengths, improvements, urgent, topTopics, recommendation };
}

// ─────────────────────────────────────────────────────────────────────
// Filtros + orden
// ─────────────────────────────────────────────────────────────────────
export function getFilteredReviews(reviews: Review[], f: SLFiltros): Review[] {
  let arr = reviews.filter((r) => {
    if (f.source && r.source !== f.source) return false;
    if (f.sentiment && r.sentiment !== f.sentiment) return false;
    if (f.priority && r.priority !== f.priority) return false;
    return true;
  });
  const sortMode = f.sort || 'recent';
  arr = arr.slice().sort((a, b) => {
    if (sortMode === 'recent')
      return new Date(b.review_date || 0).getTime() - new Date(a.review_date || 0).getTime();
    if (sortMode === 'oldest')
      return new Date(a.review_date || 0).getTime() - new Date(b.review_date || 0).getTime();
    if (sortMode === 'worst') return (a.rating || 0) - (b.rating || 0);
    if (sortMode === 'best') return (b.rating || 0) - (a.rating || 0);
    return 0;
  });
  return arr;
}
