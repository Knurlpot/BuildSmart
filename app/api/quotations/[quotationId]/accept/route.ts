import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext, withTransaction } from "../../pricing";

type Params = { params: Promise<{ quotationId: string }> };

type AcceptedQuotationLine = {
  item_code: number | string;
  category?: "Material" | "Labor";
  quantity: number;
  unit_price: number | null;
  total_cost: number | null;
  source_type: "Uploaded" | "DPWH";
  source_price_id?: number | null;
};

type AcceptQuotationPayload = {
  tier: "Practical" | "Premium";
  items: AcceptedQuotationLine[];
  total_material_cost: number;
  total_service_cost: number;
  grand_total: number;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const { quotationId } = await params;
  const quoteId = Number(quotationId);
  if (!Number.isInteger(quoteId)) return badRequest("Invalid quotation id.");

  const body = (await request.json().catch(() => null)) as AcceptQuotationPayload | null;
  if (!body || !["Practical", "Premium"].includes(body.tier)) {
    return badRequest("Accepted quotation tier is required.");
  }

  const pricedItems = body.items.filter((line) => line.unit_price !== null && line.total_cost !== null);
  if (pricedItems.length !== body.items.length) {
    return badRequest("Resolve all missing prices before accepting this quotation.");
  }

  const catalogItems = pricedItems.filter((line) => line.category !== "Labor");
  if (catalogItems.some((line) => !Number.isInteger(Number(line.item_code)) || !(Number(line.quantity) > 0) || !(Number(line.unit_price) > 0))) {
    return badRequest("Every accepted quotation item needs a catalog item, quantity, and unit price.");
  }

  try {
    const accepted = await withTransaction(async (client) => {
      const quote = await client.query<{ quote_id: number }>(
        "SELECT quote_id FROM quotation WHERE quote_id = $1 AND company_id = $2 AND user_id = $3 LIMIT 1",
        [quoteId, auth.companyId, auth.userId]
      );
      if (!quote.rows[0]) return null;

      await client.query("DELETE FROM quotation_items WHERE quote_id = $1", [quoteId]);

      const insertedItems = [];
      for (const line of catalogItems) {
        const unitCost = Number(line.unit_price);
        const totalCost = Number(line.total_cost);
        const itemResult = await client.query(
          `INSERT INTO quotation_items (
             quote_id, item_code, supplier_id, quantity, unit_cost, markup_percentage,
             final_unit_price, total_cost, source_type, source_price_id, original_unit_cost
           )
           VALUES ($1, $2, NULL, $3, $4, 0, $4, $5, $6, $7, $4)
           RETURNING quote_item_id, quote_id, item_code, supplier_id, quantity::float AS quantity,
                     unit_cost::float AS unit_cost, markup_percentage::float AS markup_percentage,
                     final_unit_price::float AS final_unit_price, total_cost::float AS total_cost,
                     source_type, source_price_id, last_refreshed_at::text AS last_refreshed_at,
                     is_price_locked, original_unit_cost::float AS original_unit_cost`,
          [
            quoteId,
            Number(line.item_code),
            Number(line.quantity),
            unitCost,
            totalCost,
            line.source_type === "DPWH" ? "DPWH" : "Supplier",
            line.source_price_id ?? null,
          ]
        );
        const quoteItem = itemResult.rows[0];
        insertedItems.push(quoteItem);

        await client.query(
          `INSERT INTO quotation_price_history (
             quote_item_id, unit_cost_before, unit_cost_after, total_cost_before,
             total_cost_after, changed_reason, changed_by_user_id
           )
           VALUES ($1, $2, $2, $3, $3, $4, $5)`,
          [quoteItem.quote_item_id, quoteItem.unit_cost, quoteItem.total_cost, "Manual Override", auth.userId]
        );
      }

      const result = await client.query(
        `UPDATE quotation
         SET status = 'Final',
             total_material_cost = $1,
             total_service_cost = $2,
             grand_total = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE quote_id = $4 AND company_id = $5
         RETURNING quote_id, company_id, user_id, client_id, project_name, project_location,
                   project_region, input_method, status, total_material_cost::float AS total_material_cost,
                   total_service_cost::float AS total_service_cost, grand_total::float AS grand_total,
                   created_at::text AS created_at, updated_at::text AS updated_at`,
        [
          Number(body.total_material_cost.toFixed(2)),
          Number(body.total_service_cost.toFixed(2)),
          Number(body.grand_total.toFixed(2)),
          quoteId,
          auth.companyId,
        ]
      );

      return { ...result.rows[0], accepted_tier: body.tier, items: insertedItems };
    });

    if (!accepted) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    return NextResponse.json(accepted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to accept quotation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
