import { getDatabase } from '../db/sqlite';

type SqlArg = string | number | null;

export async function executeSql(sql: string, args: SqlArg[] = []) {
  const db = await getDatabase();
  return db.execAsync([{ sql, args }], false);
}

export async function selectRows<T = any>(sql: string, args: SqlArg[] = []): Promise<T[]> {
  const db = await getDatabase();
  const result = await db.execAsync([{ sql, args }], true);
  const first = result[0] as any;
  return first?.rows ?? [];
}
