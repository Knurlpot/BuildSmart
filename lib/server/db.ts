import "server-only";

import { Pool, type QueryResultRow } from "pg";

declare global {
  var __buildsmartPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required");
}

function databaseSslConfig() {
  if (process.env.NODE_ENV !== "production") return false;

  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");

  return ca ? { rejectUnauthorized, ca } : { rejectUnauthorized };
}

export const pool =
  globalThis.__buildsmartPool ??
  new Pool({
    connectionString,
    ssl: databaseSslConfig(),
  });

if (!globalThis.__buildsmartPool) {
  globalThis.__buildsmartPool = pool;
}

export async function query<T extends QueryResultRow>(text: string, values?: unknown[]) {
  return pool.query<T>(text, values);
}

export async function testConnection() {
  const result = await pool.query<{ now: Date }>("SELECT NOW()");
  return result.rows[0];
}
