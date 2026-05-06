import { NextRequest } from 'next/server';
import { getApiBase } from '../../../../lib/api';
import { signedBackendHeaders } from '../../../../lib/serverHmac';

type Params = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Params) {
  return proxy(request, ctx, 'GET');
}

export async function POST(request: NextRequest, ctx: Params) {
  return proxy(request, ctx, 'POST');
}

async function proxy(request: NextRequest, ctx: Params, method: 'GET' | 'POST') {
  const { path } = await ctx.params;
  const backendPath = `/api/${path.join('/')}${request.nextUrl.search}`;
  const body = method === 'POST' ? await request.text() : undefined;
  const response = await fetch(`${getApiBase()}${backendPath}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : {}),
      ...signedBackendHeaders(method, backendPath),
    },
    body,
    cache: 'no-store',
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
    },
  });
}
