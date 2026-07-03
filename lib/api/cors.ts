import { NextResponse } from 'next/server';

// Mismos headers CORS abiertos que el legacy (api/*.js → sendCors).
// El proxy y los endpoints se consumen también desde n8n y orígenes externos.

export function corsHeaders(methods = 'GET, POST, PATCH, PUT, DELETE, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function corsJson(data: unknown, status = 200, methods?: string) {
  return NextResponse.json(data, { status, headers: corsHeaders(methods) });
}

export function corsPreflight(methods?: string, status = 204) {
  return new NextResponse(null, { status, headers: corsHeaders(methods) });
}
