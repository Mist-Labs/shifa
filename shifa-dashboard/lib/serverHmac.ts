import { createHmac } from 'node:crypto';

export function signedBackendHeaders(method: string, pathWithQuery: string): HeadersInit {
  const secret = process.env.SHIFA_HMAC_SECRET;
  const timestamp = Date.now().toString();
  if (!secret) return {};

  const signature = createHmac('sha256', secret)
    .update([method.toUpperCase(), pathWithQuery, timestamp].join('\n'))
    .digest('hex');

  return {
    'x-shifa-timestamp': timestamp,
    'x-shifa-signature': signature,
  };
}
