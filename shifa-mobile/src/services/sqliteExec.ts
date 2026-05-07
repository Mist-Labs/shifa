import { getDatabase } from '../db/sqlite';

type SqlArg = string | number | null;

export async function executeSql(sql: string, args: SqlArg[] = []) {
  const db = await getDatabase();
  return db.runAsync(sql, args);
}

export async function selectRows<T = any>(sql: string, args: SqlArg[] = []): Promise<T[]> {
  const db = await getDatabase();
  return db.getAllAsync<T>(sql, args);
}
