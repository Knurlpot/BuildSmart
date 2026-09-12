import { testConnection } from '@/lib/db';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const result = await testConnection();
  return Response.json({ result });
}
