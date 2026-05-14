import pg from 'pg';
import { loadConfig } from '../config.js';

let pool: pg.Pool | undefined;

export function getPostgresPool(): pg.Pool | undefined {
  const config = loadConfig();
  if (!config.databaseUrl) return undefined;
  const requiresSsl = /[?&]sslmode=require\b/i.test(config.databaseUrl);
  const connectionString = requiresSsl ? stripSslMode(config.databaseUrl) : config.databaseUrl;

  pool ??= new pg.Pool({
    connectionString,
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  return pool;
}

function stripSslMode(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete('sslmode');
  return url.toString();
}

export async function checkPostgres(): Promise<'disabled' | 'ok' | 'error'> {
  const db = getPostgresPool();
  if (!db) return 'disabled';

  try {
    await db.query('SELECT 1');
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function closePostgres(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}
