import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Supabase mockeado: capturamos el upsert para verificar la fila exacta.
const upsertMock = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/api/supabaseServer', () => ({
  ingestClient: () => ({ from: () => ({ upsert: upsertMock }) }),
}));

import { POST } from './route';

// Este endpoint lo llama n8n con Bearer LEADS_INGEST_SECRET; el share_url
// que devuelve es la URL pública que se comparte (/lead?id=…).

function post(body: unknown, auth?: string) {
  return POST(
    new NextRequest(
      new Request('http://localhost/api/leads/ingest', {
        method: 'POST',
        headers: auth ? { Authorization: auth } : {},
        body: JSON.stringify(body),
      })
    )
  );
}

beforeEach(() => {
  vi.stubEnv('LEADS_INGEST_SECRET', 'secreto-test');
  upsertMock.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/leads/ingest', () => {
  it('sin Bearer o con secret equivocado → 401', async () => {
    expect((await post({ client_id: 'x', lead_id: '1' })).status).toBe(401);
    expect((await post({ client_id: 'x', lead_id: '1' }, 'Bearer malo')).status).toBe(401);
  });

  it('faltan client_id/lead_id → 400', async () => {
    const res = await post({ payload: {} }, 'Bearer secreto-test');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('client_id y lead_id');
  });

  it('payload no-objeto → 400', async () => {
    const res = await post({ client_id: 'x', lead_id: '1', payload: 'texto' }, 'Bearer secreto-test');
    expect(res.status).toBe(400);
  });

  it('upsert correcto: fila normalizada + share_url con /lead?id=', async () => {
    const res = await post(
      {
        client_id: 'casa-de-empeño',
        lead_id: 12345, // numérico: debe stringificarse
        payload: { nombre: 'Ana', sucursal_sugerida: 'Mérida Centro', estatus: 'Empeño Oro' },
      },
      'Bearer secreto-test'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.share_url).toBe('https://reporteintra.vercel.app/lead?id=12345');

    const [fila, opts] = upsertMock.mock.calls[0] as any[];
    expect(fila).toMatchObject({
      lead_id: '12345',
      client_id: 'casa-de-empeño',
      sucursal: 'Mérida Centro', // extraída del payload si no viene explícita
      estatus: 'Empeño Oro',
    });
    expect(opts).toEqual({ onConflict: 'lead_id' });
  });

  it('acepta los alias del contrato de n8n (client/entorno, id/leadId, data)', async () => {
    const res = await post(
      { entorno: 'cliente-x', leadId: 'L-9', data: { estado: 'ok' } },
      'Bearer secreto-test'
    );
    expect(res.status).toBe(200);
    const [fila] = upsertMock.mock.calls[0] as any[];
    expect(fila.client_id).toBe('cliente-x');
    expect(fila.lead_id).toBe('L-9');
    expect(fila.estatus).toBe('ok'); // payload.estado como fallback de estatus
  });

  it('sucursal/estatus explícitos ganan sobre los del payload', async () => {
    await post(
      {
        client_id: 'x',
        lead_id: '1',
        payload: { sucursal_sugerida: 'A', estatus: 'p1' },
        sucursal: 'B',
        estatus: 'p2',
      },
      'Bearer secreto-test'
    );
    const [fila] = upsertMock.mock.calls[0] as any[];
    expect(fila.sucursal).toBe('B');
    expect(fila.estatus).toBe('p2');
  });
});
