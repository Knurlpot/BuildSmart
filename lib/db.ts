import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function query<T = unknown>(text: string, params?: unknown[]) {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function testConnection() {
  const result = await pool.query('SELECT NOW()');
  return result.rows[0];
}
