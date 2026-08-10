import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { authContext, isAuthContext } from "./pricing";

export async function GET(request: NextRequest) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const result = await pool.query(
    `SELECT q.quote_id, q.company_id, q.user_id, q.client_id, c.client_name,
            q.project_name, q.project_location, q.project_region, q.input_method, q.status,
            q.total_material_cost::float AS total_material_cost,
            q.total_service_cost::float AS total_service_cost,
            q.grand_total::float AS grand_total,
            q.created_at::text AS created_at, q.updated_at::text AS updated_at
     FROM quotation q
     LEFT JOIN client c ON c.client_id = q.client_id AND c.company_id = q.company_id
     WHERE q.company_id = $1
     ORDER BY q.created_at DESC, q.quote_id DESC`,
    [auth.companyId]
  );

  return NextResponse.json(result.rows);
}
