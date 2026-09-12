import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { authContext, isAuthContext } from "./pricing";

export async function GET(request: NextRequest) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const result = await pool.query(
    `SELECT q.quote_id, q.company_id, q.user_id, q.updated_by_user_id, q.client_id, c.client_name,
            q.project_name, q.project_location, q.project_region, q.input_method, q.status, q.accepted_tier,
            q.total_material_cost::float AS total_material_cost,
            q.total_service_cost::float AS total_service_cost,
            q.grand_total::float AS grand_total,
            qbs.timeline_label,
            qbs.warranty_label,
            qbs.lifespan_label,
            qbs.material_grade_label,
            trim(concat_ws(' ', updater.first_name, updater.last_name)) AS updated_by_user_name,
            updater.email AS updated_by_user_email,
            q.created_at::text AS created_at, q.updated_at::text AS updated_at
     FROM quotation q
     LEFT JOIN client c ON c.client_id = q.client_id AND c.company_id = q.company_id
     LEFT JOIN users updater ON updater.user_id = COALESCE(q.updated_by_user_id, q.user_id)
     LEFT JOIN quotation_breakdown_snapshot qbs ON qbs.quote_id = q.quote_id
     WHERE q.company_id = $1
     ORDER BY q.updated_at DESC, q.created_at DESC, q.quote_id DESC`,
    [auth.companyId]
  );

  return NextResponse.json(result.rows);
}
