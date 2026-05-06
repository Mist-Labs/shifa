import { z } from 'zod';

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  corsOrigins: string[] | true;
  jwtSecret: string;
  maxUploadBytes: number;
  databaseUrl?: string;
  googleApiKey?: string;
  clinicalAiModel: string;
  hmacSecret?: string;
  requireHmac: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const nodeEnv = parsed.NODE_ENV;
  const jwtSecret = parsed.JWT_SECRET || '';

  if (nodeEnv === 'production' && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters in production');
  }

  return {
    env: nodeEnv,
    host: parsed.HOST,
    port: parsed.PORT,
    corsOrigins: parseCorsOrigins(parsed.CORS_ORIGINS, nodeEnv),
    jwtSecret: jwtSecret || 'shifa_dev_secret_do_not_use_in_production',
    maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
    databaseUrl: parsed.DATABASE_URL,
    googleApiKey: parsed.GOOGLE_API_KEY || parsed.GEMINI_API_KEY,
    clinicalAiModel: parsed.CLINICAL_AI_MODEL,
    hmacSecret: parsed.SHIFA_HMAC_SECRET,
    requireHmac: parsed.SHIFA_REQUIRE_HMAC,
  };
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGINS: z.string().optional(),
    JWT_SECRET: z.string().optional(),
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
    DATABASE_URL: z.string().url().optional(),
    GOOGLE_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    CLINICAL_AI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
    SHIFA_HMAC_SECRET: z.string().optional(),
    SHIFA_REQUIRE_HMAC: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .passthrough();

function parseCorsOrigins(value: string | undefined, env: AppConfig['env']): string[] | true {
  if (!value || value.trim() === '') {
    return env === 'production' ? [] : true;
  }

  if (value.trim() === '*') return true;

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
