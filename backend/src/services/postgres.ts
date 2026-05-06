import pg from 'pg';
import { loadConfig } from '../config.js';

let pool: pg.Pool | undefined;

export function getPostgresPool(): pg.Pool | undefined {
  const config = loadConfig();
  if (!config.databaseUrl) return undefined;

  pool ??= new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  return pool;
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
