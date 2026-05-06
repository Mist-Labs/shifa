import { createHmac, timingSafeEqual } from 'node:crypto';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { AppConfig } from '../config.js';

const MAX_SKEW_MS = 5 * 60 * 1000;
const PUBLIC_PREFIXES = ['/health', '/ready', '/metrics', '/docs', '/documentation'];

export function registerHmacAuth(app: FastifyInstance, config: AppConfig): void {
  if (!config.requireHmac) return;
  if (!config.hmacSecret || config.hmacSecret.length < 32) {
    throw new Error('SHIFA_HMAC_SECRET must be at least 32 characters when SHIFA_REQUIRE_HMAC=true');
  }

  app.addHook('onRequest', async (request, reply) => {
    if (isPublicRoute(request.url)) return;

    const timestamp = header(request, 'x-shifa-timestamp');
    const signature = header(request, 'x-shifa-signature');
    if (!timestamp || !signature) {
      return reply.code(401).send({ error: 'missing HMAC authentication headers' });
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
      return reply.code(401).send({ error: 'stale HMAC timestamp' });
    }

    const expected = signRequest(config.hmacSecret!, request.method, request.url, timestamp);
    if (!safeEqual(signature, expected)) {
      return reply.code(401).send({ error: 'invalid HMAC signature' });
    }
  });
}

export function signRequest(secret: string, method: string, pathWithQuery: string, timestamp: string): string {
  return createHmac('sha256', secret)
    .update([method.toUpperCase(), pathWithQuery, timestamp].join('\n'))
    .digest('hex');
}

function isPublicRoute(url: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`));
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
