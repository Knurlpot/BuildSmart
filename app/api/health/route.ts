// for verification of the database connection

import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/db';

export async function GET(request: Request) {
  const detailedHealthToken = process.env.HEALTHCHECK_SECRET?.trim();
  const suppliedToken = request.headers.get('x-healthcheck-secret')?.trim();

  if (process.env.NODE_ENV === 'production' && (!detailedHealthToken || suppliedToken !== detailedHealthToken)) {
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await testConnection();
    return NextResponse.json({ ok: true, time: result.now });
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
