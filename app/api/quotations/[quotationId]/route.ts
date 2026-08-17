import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { authContext, isAuthContext } from "../pricing";

type Params = { params: Promise<{ quotationId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const { quotationId } = await params;
  const quoteId = Number(quotationId);
  if (!Number.isInteger(quoteId)) return NextResponse.json({ error: "Invalid quotation id." }, { status: 400 });

  const quoteResult = await pool.query(
    `SELECT quote_id, company_id, user_id, client_id, project_name, project_location,
            project_region, input_method, status, total_material_cost::float AS total_material_cost,
            total_service_cost::float AS total_service_cost, grand_total::float AS grand_total,
            created_at::text AS created_at, updated_at::text AS updated_at
     FROM quotation
     WHERE quote_id = $1 AND company_id = $2`,
    [quoteId, auth.companyId]
  );
  const quotation = quoteResult.rows[0];
  if (!quotation) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });

  const items = await pool.query(
    `SELECT qi.quote_item_id, qi.quote_id, qi.item_code, qi.supplier_id, i.item_name,
            qi.quantity::float AS quantity, qi.unit_cost::float AS unit_cost,
            qi.markup_percentage::float AS markup_percentage,
            qi.final_unit_price::float AS final_unit_price, qi.total_cost::float AS total_cost,
            qi.source_type, qi.source_price_id, qi.last_refreshed_at::text AS last_refreshed_at,
            qi.is_price_locked, qi.original_unit_cost::float AS original_unit_cost
     FROM quotation_items qi
     JOIN items i ON i.item_code = qi.item_code
     WHERE qi.quote_id = $1
     ORDER BY qi.quote_item_id`,
    [quoteId]
  );

  return NextResponse.json({ ...quotation, items: items.rows });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const { quotationId } = await params;
  const quoteId = Number(quotationId);
  const body = (await request.json().catch(() => null)) as { input_method?: "Manual" | "Blueprint" | "Hybrid" } | null;
  if (!Number.isInteger(quoteId) || !body?.input_method) {
    return NextResponse.json({ error: "Quotation id and input_method are required." }, { status: 400 });
  }

  const result = await pool.query(
    `UPDATE quotation
     SET input_method = $1, updated_at = CURRENT_TIMESTAMP
     WHERE quote_id = $2 AND company_id = $3
     RETURNING quote_id, company_id, user_id, client_id, project_name, project_location,
               project_region, input_method, status, total_material_cost::float AS total_material_cost,
               total_service_cost::float AS total_service_cost, grand_total::float AS grand_total,
               created_at::text AS created_at, updated_at::text AS updated_at`,
    [body.input_method, quoteId, auth.companyId]
  );

  if (!result.rows[0]) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const { quotationId } = await params;
  const quoteId = Number(quotationId);
  if (!Number.isInteger(quoteId)) return NextResponse.json({ error: "Invalid quotation id." }, { status: 400 });

  const result = await pool.query(
    `DELETE FROM quotation
     WHERE quote_id = $1 AND company_id = $2 AND status = 'Draft'
     RETURNING quote_id`,
    [quoteId, auth.companyId]
  );

  if (!result.rows[0]) return NextResponse.json({ error: "Draft quotation not found." }, { status: 404 });
  return NextResponse.json({ deleted: true, quote_id: result.rows[0].quote_id });
}
