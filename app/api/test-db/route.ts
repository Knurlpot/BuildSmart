import { testConnection } from '@/lib/db';

export async function GET() {
  const result = await testConnection();
  return Response.json({ result });
}