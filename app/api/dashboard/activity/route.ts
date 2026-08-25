import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { authContext, isAuthContext } from "@/app/api/quotations/pricing";

export async function GET(request: NextRequest) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const result = await pool.query(
    `SELECT q.quote_id::text AS activity_id,
            'quotation'::text AS activity_type,
            q.project_name AS title,
            q.status::text AS status,
            COALESCE(q.updated_at, q.created_at)::text AS occurred_at
     FROM quotation q
     WHERE q.company_id = $1
       AND q.user_id = $2
     ORDER BY occurred_at DESC
     LIMIT 5`,
    [auth.companyId, auth.userId]
  );

  return NextResponse.json(result.rows);
}
