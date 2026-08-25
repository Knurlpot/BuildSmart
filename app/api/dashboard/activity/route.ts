import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { authContext, isAuthContext } from "@/app/api/quotations/pricing";

export async function GET(request: NextRequest) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const result = await pool.query(
    `SELECT activity_id, activity_type, title, status, occurred_at::text AS occurred_at
     FROM (
       SELECT q.quote_id::text AS activity_id,
              'quotation'::text AS activity_type,
              q.project_name AS title,
              q.status::text AS status,
              COALESCE(q.updated_at, q.created_at) AS occurred_at
       FROM quotation q
       WHERE q.company_id = $1
         AND q.user_id = $2

       UNION ALL

       SELECT plu.upload_id::text AS activity_id,
              'pricelist'::text AS activity_type,
              plu.file_name AS title,
              plu.processing_status::text AS status,
              plu.upload_timestamp AS occurred_at
       FROM price_list_upload plu
       WHERE plu.company_id = $1
     ) activity
     ORDER BY occurred_at DESC
     LIMIT 5`,
    [auth.companyId, auth.userId]
  );

  return NextResponse.json(result.rows);
}
