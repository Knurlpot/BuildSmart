import "server-only";

import { Pool } from "pg";

declare global {
  var __buildsmartPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required");
}

export const pool =
  globalThis.__buildsmartPool ??
  new Pool({
    connectionString,
  });

if (!globalThis.__buildsmartPool) {
  globalThis.__buildsmartPool = pool;
}

export async function query<T>(text: string, values?: unknown[]) {
  return pool.query<T>(text, values);
}
