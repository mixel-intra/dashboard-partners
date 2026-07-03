import { type NextRequest } from 'next/server';
import { EnvFaltanteError } from '@/lib/api/env';
import { adminAnonClient } from '@/lib/api/supabaseServer';
import { escapeHtml, render } from '@/lib/leadTemplate';

// Página pública /lead?id=<lead_id> — port de legacy/lead.html.
// El legacy renderizaba client-side y reemplazaba el documento entero con
// document.write(). Aquí el fetch y el render pasan al SERVIDOR y se devuelve
// el HTML final directo: misma semántica (los <script> de la plantilla se
// ejecutan igual), sin flash del spinner. SIN auth (es la URL que n8n
// comparte: share_url de /api/leads/ingest).

function errorPage(title: string, sub: string): Response {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#0A0618">
    <title>${escapeHtml(title)}</title>
    <style>
        html, body { margin: 0; padding: 0; height: 100%; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
            background: #F2F2F7; color: #333;
            display: flex; align-items: center; justify-content: center;
        }
        .ll-card {
            background: #fff;
            border-radius: 14px;
            padding: 26px 30px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08);
            text-align: center;
            max-width: 360px;
            margin: 16px;
        }
        .ll-title  { font-size: 16px; font-weight: 700; color: #0A0A0A; margin-bottom: 6px; }
        .ll-sub    { font-size: 13px; color: #6E6E73; line-height: 1.5; }
        code { background: #F0F0F3; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="ll-card">
        <div class="ll-title">${title}</div>
        <div class="ll-sub">${sub}</div>
    </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const leadId = params.get('id') || params.get('lead');
  if (!leadId) {
    return errorPage('Lead no especificado', 'Falta el parámetro <code>?id=&lt;lead_id&gt;</code> en la URL.');
  }

  let supabase;
  try {
    supabase = adminAnonClient();
  } catch (e: any) {
    if (e instanceof EnvFaltanteError) return errorPage('Error de configuración', escapeHtml(e.message));
    throw e;
  }

  try {
    // 1) Buscar el lead en qualified_leads (incluye el client_id)
    const { data: lead, error: lErr } = await supabase
      .from('qualified_leads')
      .select('client_id, payload')
      .eq('lead_id', String(leadId))
      .maybeSingle();

    if (lErr) return errorPage('Error consultando la base', escapeHtml(lErr.message));
    if (!lead) {
      return errorPage(
        'Lead no encontrado',
        `No existe un lead calificado con ID <code>${escapeHtml(leadId)}</code>. ` +
          'Verifica con tu administrador que el lead haya sido sincronizado.'
      );
    }

    // 2) Cargar la plantilla del cliente
    const { data: cfg, error: cErr } = await supabase
      .from('clients_config')
      .select('name, lead_template')
      .eq('id_slug', lead.client_id)
      .single();

    if (cErr) return errorPage('Error consultando la plantilla', escapeHtml(cErr.message));
    if (!cfg || !cfg.lead_template || !cfg.lead_template.html) {
      return errorPage(
        'Plantilla no configurada',
        `El cliente <code>${escapeHtml(lead.client_id)}</code> aún no tiene plantilla HTML configurada.`
      );
    }

    // 3) Renderizar y devolver el documento completo
    const html = render(cfg.lead_template.html, lead.payload || {});
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (err: any) {
    return errorPage('Error inesperado', escapeHtml(err.message));
  }
}
