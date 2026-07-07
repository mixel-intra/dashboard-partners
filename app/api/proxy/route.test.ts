import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, OPTIONS, POST } from './route';

// El proxy es el transporte de ~8 features (Airtable, webhooks n8n):
// estos tests congelan su contrato (CORS, forward de Authorization,
// passthrough de status, 502 en respuestas no-JSON).

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function req(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

describe('GET /api/proxy', () => {
  it('sin ?url → 400 con el mensaje del legacy', async () => {
    const res = await GET(req('http://localhost/api/proxy'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'No se proporcionó una URL' });
  });

  it('proxya el JSON del destino con CORS abierto', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const destino = encodeURIComponent('https://n8n.example.com/webhook/x');
    const res = await GET(req(`http://localhost/api/proxy?url=${destino}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: 1 });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(fetchMock).toHaveBeenCalledWith('https://n8n.example.com/webhook/x', expect.anything());
  });

  it('reenvía el header Authorization (lo necesita Airtable)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await GET(
      req(`http://localhost/api/proxy?url=${encodeURIComponent('https://api.airtable.com/v0/x')}`, {
        headers: { Authorization: 'Bearer token-123' },
      })
    );
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.headers['Authorization']).toBe('Bearer token-123');
  });

  it('error del destino → passthrough del status + detail truncado', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 422, statusText: 'Unprocessable' }));
    const res = await GET(req(`http://localhost/api/proxy?url=${encodeURIComponent('https://x.com')}`));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('Unprocessable');
    expect(body.detail).toBe('boom');
  });

  it('respuesta OK pero no-JSON → 502', async () => {
    fetchMock.mockResolvedValue(new Response('<html>no soy json</html>', { status: 200 }));
    const res = await GET(req(`http://localhost/api/proxy?url=${encodeURIComponent('https://x.com')}`));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('La respuesta del webhook no es JSON válido');
  });

  it('excepción de red → 500 con mensaje', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const res = await GET(req(`http://localhost/api/proxy?url=${encodeURIComponent('https://x.com')}`));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('fetch failed');
  });
});

describe('POST /api/proxy', () => {
  it('reenvía el body como JSON con Content-Type', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await POST(
      req(`http://localhost/api/proxy?url=${encodeURIComponent('https://x.com')}`, {
        method: 'POST',
        body: JSON.stringify({ hola: 'mundo' }),
      })
    );
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.body).toBe('{"hola":"mundo"}');
  });
});

describe('OPTIONS /api/proxy', () => {
  it('preflight responde 200 (paridad con el legacy, que NO usaba 204 aquí)', () => {
    const res = OPTIONS();
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });
});
