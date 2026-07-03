import { type NextRequest } from 'next/server';
import { corsJson, corsPreflight } from '@/lib/api/cors';

// Proxy serverless para evitar errores de CORS con webhooks de n8n y Airtable.
// Port 1:1 de legacy/api/proxy.js — sigue siendo un proxy ABIERTO (paridad);
// follow-up documentado: eliminarlo moviendo esos fetch a route handlers.

async function handleProxy(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return corsJson({ error: 'No se proporcionó una URL' }, 400);
  }

  try {
    const targetUrl = decodeURIComponent(url);
    console.log(`Proxying ${req.method} to:`, targetUrl);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'Vercel-Proxy/1.0',
    };

    // Forward del header Authorization (necesario para Airtable)
    const authHeader = req.headers.get('authorization');
    if (authHeader) headers['Authorization'] = authHeader;

    const fetchOptions: RequestInit = { method: req.method, headers };

    if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
      headers['Content-Type'] = 'application/json';
      const body = await req.text();
      if (body) fetchOptions.body = body;
    }

    const response = await fetch(targetUrl, fetchOptions);
    const responseText = await response.text();

    if (!response.ok) {
      console.error('Webhook error:', response.status, responseText.substring(0, 500));
      return corsJson(
        {
          error: 'Error del webhook: ' + response.statusText,
          status: response.status,
          detail: responseText.substring(0, 500),
        },
        response.status
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr: any) {
      console.error('JSON parse error:', parseErr.message, responseText.substring(0, 500));
      return corsJson(
        {
          error: 'La respuesta del webhook no es JSON válido',
          detail: responseText.substring(0, 200),
        },
        502
      );
    }

    return corsJson(data, 200);
  } catch (error: any) {
    console.error('Proxy Error:', error.message, error.stack);
    return corsJson({ error: error.message, type: error.name }, 500);
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PATCH = handleProxy;
export const PUT = handleProxy;
export const DELETE = handleProxy;
export function OPTIONS() {
  // El proxy legacy respondía 200 al preflight (los demás endpoints usan 204).
  return corsPreflight(undefined, 200);
}
