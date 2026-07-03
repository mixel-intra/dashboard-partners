// api/scrape-reviews.js
// Social listening pipeline: Bright Data Scraper APIs → Claude → tabla `reviews` del admin.
//
// Arquitectura: tabla única en el admin Supabase con columna hotel_id (= clients_config.id_slug).
// No se toca el Supabase de cada cliente (ese sigue siendo para datos operacionales).
//
// Modos de invocación:
//   GET  /api/scrape-reviews              → cron job (todos los hoteles con social_listening unlocked)
//   POST /api/scrape-reviews?client=slug  → manual (botón "Ejecutar scrape ahora")
//
// Variables de entorno requeridas (Vercel):
//   ADMIN_SUPABASE_URL, ADMIN_SUPABASE_SERVICE_KEY  → admin con bypass RLS para escribir
//   BRIGHT_DATA_API_TOKEN                            → Bright Data Web Scraper API
//   ANTHROPIC_API_KEY                                → Claude (sentiment + categoría)
//   CRON_SECRET (opcional)                           → si está set, GET requiere ?secret=... o header

const { createClient } = require('@supabase/supabase-js');

// Dataset IDs de Bright Data (Web Scraper API)
const BD_DATASETS = {
    google:      'gd_luzfs1dn2oa0teb81',
    tripadvisor: 'gd_l4dx9j9sscpvs7no2',
    booking:     'gd_m5mbdl081229ln6t4a'
};

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const BD_POLL_INTERVAL_MS = 5000;
const BD_POLL_MAX_MS = 5 * 60 * 1000;  // 5 min

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Cron secret (si está configurado, valida)
    if (process.env.CRON_SECRET) {
        const provided = req.query?.secret
            || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
        if (provided !== process.env.CRON_SECRET) {
            return res.status(401).json({ error: 'unauthorized' });
        }
    }

    const adminUrl = process.env.ADMIN_SUPABASE_URL;
    const adminKey = process.env.ADMIN_SUPABASE_SERVICE_KEY;
    if (!adminUrl || !adminKey) {
        return res.status(500).json({ error: 'ADMIN_SUPABASE_URL / ADMIN_SUPABASE_SERVICE_KEY missing' });
    }
    if (!process.env.BRIGHT_DATA_API_TOKEN) {
        return res.status(500).json({ error: 'BRIGHT_DATA_API_TOKEN missing' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });
    }

    const admin = createClient(adminUrl, adminKey, { auth: { persistSession: false } });
    const targetSlug = req.query?.client || null;

    try {
        // 1. Obtener los hoteles elegibles
        let query = admin.from('clients_config')
            .select('id_slug, name, hotel_services, social_listening_config')
            .eq('client_type', 'hotel');
        if (targetSlug) query = query.eq('id_slug', targetSlug);

        const { data: clients, error: cErr } = await query;
        if (cErr) return res.status(500).json({ error: 'admin db: ' + cErr.message });

        const eligible = (clients || []).filter(c => {
            const slService = c.hotel_services?.social_listening;
            if (slService !== 'unlocked') return false;
            const cfg = c.social_listening_config || {};
            if (!cfg.google_maps_url && !cfg.tripadvisor_url && !cfg.booking_url) return false;
            // Si es cron (GET) y no es manual, respeta scrape_frequency_hours
            if (!targetSlug && cfg.last_scraped_at) {
                const lastMs = new Date(cfg.last_scraped_at).getTime();
                const freqMs = (cfg.scrape_frequency_hours || 24) * 60 * 60 * 1000;
                if (Date.now() - lastMs < freqMs) return false;
            }
            return true;
        });

        const results = [];
        for (const client of eligible) {
            const r = await scrapeClient(admin, client);
            results.push(r);
        }

        return res.status(200).json({ ok: true, count: results.length, results });
    } catch (err) {
        console.error('scrape-reviews fatal:', err);
        return res.status(500).json({ error: err.message, stack: err.stack });
    }
};

async function scrapeClient(admin, client) {
    const slug = client.id_slug;
    const cfg = client.social_listening_config || {};

    const summary = { client: slug, sources: {}, inserted: 0, errors: [] };

    for (const [source, url] of [
        ['google',      cfg.google_maps_url],
        ['tripadvisor', cfg.tripadvisor_url],
        ['booking',     cfg.booking_url]
    ]) {
        if (!url) continue;
        try {
            const rawReviews = await scrapeSource(source, url);
            const inserted = await ingestReviews(admin, slug, source, rawReviews);
            summary.sources[source] = { fetched: rawReviews.length, inserted };
            summary.inserted += inserted;
        } catch (err) {
            console.error(`[${slug}/${source}]`, err.message);
            summary.errors.push({ source, error: err.message });
        }
    }

    // Actualiza last_scraped_at en el admin
    const newCfg = {
        ...cfg,
        last_scraped_at: new Date().toISOString(),
        last_scrape_status: summary.errors.length ? 'error' : 'ok',
        last_scrape_error: summary.errors.length ? summary.errors.map(e => `${e.source}:${e.error}`).join(' | ') : null
    };
    await admin.from('clients_config')
        .update({ social_listening_config: newCfg })
        .eq('id_slug', slug);

    return summary;
}

// ─────────────────────────────────────────────────────────────────────
// Bright Data Web Scraper API
// docs: https://docs.brightdata.com/scraping-automation/web-scraper-api/
// ─────────────────────────────────────────────────────────────────────
async function scrapeSource(source, url) {
    const datasetId = BD_DATASETS[source];
    if (!datasetId) throw new Error('unknown source ' + source);

    // 1. trigger
    const triggerRes = await fetch(
        `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${datasetId}&include_errors=true`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.BRIGHT_DATA_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([{ url }])
        }
    );
    if (!triggerRes.ok) {
        const t = await triggerRes.text();
        throw new Error(`BD trigger ${triggerRes.status}: ${t.slice(0, 200)}`);
    }
    const trigger = await triggerRes.json();
    const snapshotId = trigger.snapshot_id || trigger.collection_id;
    if (!snapshotId) throw new Error('BD trigger: no snapshot_id in ' + JSON.stringify(trigger));

    // 2. poll
    const start = Date.now();
    while (Date.now() - start < BD_POLL_MAX_MS) {
        const sRes = await fetch(
            `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
            { headers: { 'Authorization': `Bearer ${process.env.BRIGHT_DATA_API_TOKEN}` } }
        );
        if (sRes.status === 200) {
            const data = await sRes.json();
            return Array.isArray(data) ? data : [data];
        }
        if (sRes.status === 202) {
            // still running
            await sleep(BD_POLL_INTERVAL_MS);
            continue;
        }
        const t = await sRes.text();
        throw new Error(`BD snapshot ${sRes.status}: ${t.slice(0, 200)}`);
    }
    throw new Error('BD snapshot timeout');
}

// ─────────────────────────────────────────────────────────────────────
// Normalización + dedup + análisis Claude + insert
// ─────────────────────────────────────────────────────────────────────
async function ingestReviews(admin, hotelId, source, raw) {
    const normalized = raw.map(r => normalize(source, r)).filter(r => r && r.source_review_id);
    if (!normalized.length) return 0;

    // Filtrar las que ya existen (dedup por hotel_id + source + source_review_id)
    const ids = normalized.map(r => r.source_review_id);
    const { data: existing } = await admin
        .from('reviews')
        .select('source_review_id')
        .eq('hotel_id', hotelId)
        .eq('source', source)
        .in('source_review_id', ids);
    const have = new Set((existing || []).map(e => e.source_review_id));
    const fresh = normalized.filter(r => !have.has(r.source_review_id));
    if (!fresh.length) return 0;

    // Análisis Claude en batches
    const analyzed = await analyzeBatch(fresh);

    // Insert (upsert por unique(hotel_id, source, source_review_id))
    const rows = analyzed.map(r => ({
        hotel_id: hotelId,
        source: r.source,
        source_review_id: r.source_review_id,
        author: r.author,
        author_avatar_url: r.author_avatar_url,
        rating: r.rating,
        title: r.title,
        body: r.body,
        language: r.language,
        review_date: r.review_date,
        review_url: r.review_url,
        raw_json: r.raw_json,
        sentiment: r.sentiment,
        category: r.category,
        priority: r.priority,
        summary: r.summary,
        topics: r.topics,
        analyzed_at: r.analyzed_at,
        analysis_model: r.analysis_model
    }));

    const { error } = await admin.from('reviews')
        .upsert(rows, { onConflict: 'hotel_id,source,source_review_id' });
    if (error) throw new Error('admin db insert: ' + error.message);
    return rows.length;
}

function normalize(source, r) {
    // Bright Data devuelve esquemas distintos por dataset. Mapeo defensivo:
    // si el campo no existe, dejamos null y guardamos el raw_json completo
    // para poder hacer reanálisis sin re-scrapear.
    const pick = (...keys) => {
        for (const k of keys) {
            const v = r?.[k];
            if (v !== undefined && v !== null && v !== '') return v;
        }
        return null;
    };

    const rating = parseFloat(pick('rating', 'review_rating', 'stars', 'score'));
    // Booking usa escala 1-10, normalizamos a /5
    const normalizedRating = source === 'booking' && rating > 5
        ? Math.round((rating / 2) * 10) / 10
        : (isNaN(rating) ? null : rating);

    return {
        source,
        source_review_id: String(pick('review_id', 'id', 'reviewId') || ''),
        author:            pick('author_name', 'reviewer_name', 'user_name', 'author'),
        author_avatar_url: pick('author_image', 'reviewer_avatar', 'user_avatar'),
        rating:            normalizedRating,
        title:             pick('review_title', 'title'),
        body:              pick('review_text', 'review', 'text', 'comment', 'body'),
        language:          pick('language', 'review_language'),
        review_date:       parseDate(pick('review_date', 'date', 'published_at', 'created_at')),
        review_url:        pick('review_url', 'url'),
        raw_json:          r
    };
}

function parseDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

// ─────────────────────────────────────────────────────────────────────
// Claude analysis — batch para bajar costo
// ─────────────────────────────────────────────────────────────────────
async function analyzeBatch(reviews) {
    const BATCH = 15;
    const out = [];
    for (let i = 0; i < reviews.length; i += BATCH) {
        const slice = reviews.slice(i, i + BATCH);
        const analyzed = await callClaude(slice);
        out.push(...analyzed);
    }
    return out;
}

async function callClaude(reviews) {
    const items = reviews.map((r, idx) => ({
        idx,
        rating: r.rating,
        title: r.title || '',
        body: (r.body || '').slice(0, 2000)
    }));

    const prompt = `Analiza estas reseñas de hotel y responde con un JSON array donde cada elemento tiene exactamente:
{ "idx": number, "sentiment": "positive"|"neutral"|"negative", "category": "service"|"cleanliness"|"location"|"food"|"price"|"rooms"|"amenities"|"other", "priority": "high"|"medium"|"low", "summary": "una sola línea en español ≤120 chars", "topics": ["1-3 tópicos en español, lowercase, sin tildes raras"] }

Reglas:
- priority "high" solo si requiere respuesta urgente (queja seria, problema sanitario, fraude reportado, daño físico).
- summary en ESPAÑOL siempre, aunque la review esté en inglés.
- Devuelve SOLO el JSON array, sin texto extra ni markdown.

Reviews:
${JSON.stringify(items, null, 2)}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }]
        })
    });
    if (!res.ok) {
        const t = await res.text();
        throw new Error(`Claude ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) { throw new Error('Claude returned non-JSON: ' + cleaned.slice(0, 300)); }

    const now = new Date().toISOString();
    return reviews.map((r, idx) => {
        const a = parsed.find(p => p.idx === idx) || {};
        return {
            ...r,
            sentiment: a.sentiment || null,
            category: a.category || null,
            priority: a.priority || null,
            summary: a.summary || null,
            topics: Array.isArray(a.topics) ? a.topics : null,
            analyzed_at: now,
            analysis_model: CLAUDE_MODEL
        };
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
