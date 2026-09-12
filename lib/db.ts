import { Pool } from 'pg';

function databaseSslConfig() {
  if (process.env.NODE_ENV !== 'production') return false;

  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  return ca ? { rejectUnauthorized, ca } : { rejectUnauthorized };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: databaseSslConfig(),
});

export async function query<T = unknown>(text: string, params?: unknown[]) {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function testConnection() {
  const result = await pool.query('SELECT NOW()');
  return result.rows[0];
}
