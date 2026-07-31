import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext, priceLine, withTransaction } from "../pricing";

type CreateItemPayload = {
  item_code: number;
  quantity: number;
  selected_supplier_id?: number | null;
};

type CreateQuotationPayload = {
  client_id?: number | null;
  project_name: string;
  project_location: string;
  project_region: string;
  input_method?: "Manual" | "Blueprint" | "Hybrid";
  items?: CreateItemPayload[];
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const body = (await request.json().catch(() => null)) as CreateQuotationPayload | null;
  if (!body?.project_name || !body.project_location || !body.project_region) {
    return badRequest("Project name, location, and region are required.");
  }

  const items = body.items ?? [];
  if (items.some((item) => !Number.isInteger(item.item_code) || !(Number(item.quantity) > 0))) {
    return badRequest("Every quotation item needs an item_code and quantity greater than zero.");
  }

  try {
    const quotation = await withTransaction(async (client) => {
      const pricedLines = [];
      let totalMaterialCost = 0;

      for (const item of items) {
        const priced = await priceLine(
          client,
          auth.companyId,
          body.project_region,
          item.item_code,
          Number(item.quantity),
          item.selected_supplier_id ?? null
        );
        pricedLines.push(priced);
        totalMaterialCost += priced.total_cost;
      }

      const quoteResult = await client.query(
        `INSERT INTO quotation (
           company_id, user_id, client_id, project_name, project_location, project_region,
           input_method, status, total_material_cost, total_service_cost, grand_total
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Draft', $8, 0, $8)
         RETURNING quote_id, company_id, user_id, client_id, project_name, project_location,
                   project_region, input_method, status, total_material_cost::float AS total_material_cost,
                   total_service_cost::float AS total_service_cost, grand_total::float AS grand_total,
                   created_at::text AS created_at, updated_at::text AS updated_at`,
        [
          auth.companyId,
          auth.userId,
          body.client_id ?? null,
          body.project_name,
          body.project_location,
          body.project_region,
          body.input_method ?? "Manual",
          Number(totalMaterialCost.toFixed(2)),
        ]
      );
      const quote = quoteResult.rows[0];

      const insertedItems = [];
      for (const line of pricedLines) {
        const itemResult = await client.query(
          `INSERT INTO quotation_items (
             quote_id, item_code, supplier_id, quantity, unit_cost, markup_percentage,
             final_unit_price, total_cost, source_type, source_price_id, original_unit_cost
           )
           VALUES ($1, $2, $3, $4, $5, 0, $5, $6, $7, $8, $5)
           RETURNING quote_item_id, quote_id, item_code, supplier_id, quantity::float AS quantity,
                     unit_cost::float AS unit_cost, markup_percentage::float AS markup_percentage,
                     final_unit_price::float AS final_unit_price, total_cost::float AS total_cost,
                     source_type, source_price_id, last_refreshed_at::text AS last_refreshed_at,
                     is_price_locked, original_unit_cost::float AS original_unit_cost`,
          [
            quote.quote_id,
            line.item_code,
            line.supplier_id,
            line.quantity,
            line.unit_cost,
            line.total_cost,
            line.source_type,
            line.source_price_id,
          ]
        );
        const quoteItem = itemResult.rows[0];
        insertedItems.push(quoteItem);

        await client.query(
          `INSERT INTO quotation_price_history (
             quote_item_id, unit_cost_before, unit_cost_after, total_cost_before,
             total_cost_after, changed_reason, changed_by_user_id
           )
           VALUES ($1, $2, $2, $3, $3, 'Initial Creation', $4)`,
          [quoteItem.quote_item_id, quoteItem.unit_cost, quoteItem.total_cost, auth.userId]
        );
      }

      return { ...quote, items: insertedItems };
    });

    return NextResponse.json(quotation, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create quotation.";
    return NextResponse.json({ error: message }, { status: message.startsWith("No price found") ? 400 : 500 });
  }
}
