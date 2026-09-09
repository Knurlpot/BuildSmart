import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { authContext, isAuthContext } from "../../pricing";

type Params = { params: Promise<{ quotationId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const { quotationId } = await params;
  const quoteId = Number(quotationId);
  if (!Number.isInteger(quoteId)) return NextResponse.json({ error: "Invalid quotation id." }, { status: 400 });

  const owned = await pool.query("SELECT 1 FROM quotation WHERE quote_id = $1 AND company_id = $2", [
    quoteId,
    auth.companyId,
  ]);
  if (!owned.rowCount) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });

  const history = await pool.query(
    `SELECT qph.price_history_id, qph.quote_item_id, qi.item_code, i.item_name,
            qph.unit_cost_before::float AS unit_cost_before,
            qph.unit_cost_after::float AS unit_cost_after,
            qph.total_cost_before::float AS total_cost_before,
            qph.total_cost_after::float AS total_cost_after,
            qph.changed_at::text AS changed_at,
            qph.changed_reason,
            qph.changed_by_user_id
     FROM quotation_price_history qph
     JOIN quotation_items qi ON qi.quote_item_id = qph.quote_item_id
     JOIN items i ON i.item_code = qi.item_code
     WHERE qi.quote_id = $1
     ORDER BY qph.changed_at DESC, qph.price_history_id DESC`,
    [quoteId]
  );

  return NextResponse.json({ quote_id: quoteId, price_changes: history.rows });
}
