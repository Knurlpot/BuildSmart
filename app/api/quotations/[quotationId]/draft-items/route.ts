import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext, withTransaction } from "../../pricing";

type Params = { params: Promise<{ quotationId: string }> };

type DraftQuotationLine = {
  item_code: number | string;
  item_name: string;
  unit: string;
  category?: "Material" | "Labor";
  quantity: number;
  unit_price: number | null;
  total_cost: number | null;
  source_type: "Uploaded" | "DPWH";
  selected_supplier_id?: number | null;
};

type DraftItemsPayload = {
  items: DraftQuotationLine[];
  total_material_cost: number;
  total_service_cost: number;
  grand_total: number;
};

type NormalizedDraftLine = {
  item_code: number;
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_cost: number;
  source_type: "DPWH" | "Supplier" | "Internal";
  supplier_id: number | null;
  source_price_id: number | null;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const { quotationId } = await params;
  const quoteId = Number(quotationId);
  if (!Number.isInteger(quoteId)) return badRequest("Invalid quotation id.");

  const body = (await request.json().catch(() => null)) as DraftItemsPayload | null;
  if (!body || !Array.isArray(body.items)) return badRequest("Draft items are required.");

  const materialItems = body.items.filter(
    (line) => line.category !== "Labor" && line.unit_price !== null && line.total_cost !== null
  );
  if (materialItems.some((line) => !(Number(line.quantity) > 0) || !(Number(line.unit_price) > 0))) {
    return badRequest("Every saved material needs a quantity and unit price.");
  }

  try {
    const saved = await withTransaction(async (client) => {
      const quote = await client.query<{ quote_id: number }>(
        "SELECT quote_id FROM quotation WHERE quote_id = $1 AND company_id = $2 AND user_id = $3 LIMIT 1",
        [quoteId, auth.companyId, auth.userId]
      );
      if (!quote.rows[0]) return null;

      await client.query("DELETE FROM quotation_items WHERE quote_id = $1", [quoteId]);

      const mergedItems = new Map<number, NormalizedDraftLine>();
      for (const line of materialItems) {
        const rawItemCode = Number(line.item_code);
        let itemCode = Number.isInteger(rawItemCode) ? rawItemCode : null;
        if (itemCode === null) {
          const itemName = clean(line.item_name) || "Quoted material";
          const unit = clean(line.unit) || "unit";
          const created = await client.query<{ item_code: number }>(
            `WITH fallback_category AS (
               SELECT category_id
               FROM category
               WHERE category_type = 'Others'
               ORDER BY category_id
               LIMIT 1
             )
             INSERT INTO items (
               category_id, company_id, item_name, brand, unit, item_source, description
             )
             SELECT fallback_category.category_id, $1, $2, 'Unspecified', $3, 'Internal', $2
             FROM fallback_category
             RETURNING item_code`,
            [auth.companyId, itemName, unit]
          );
          itemCode = created.rows[0]?.item_code ?? null;
        }
        if (itemCode === null) throw new Error(`Could not save material ${line.item_name}.`);

        const requestedSupplierId = line.source_type === "DPWH" ? null : parseInteger(line.selected_supplier_id);
        const supplier =
          requestedSupplierId === null
            ? null
            : await client.query<{ supplier_id: number }>(
                "SELECT supplier_id FROM suppliers WHERE supplier_id = $1 AND status = 'Active' LIMIT 1",
                [requestedSupplierId]
              );
        const supplierId = supplier?.rows[0]?.supplier_id ?? null;
        const dbSourceType = line.source_type === "DPWH" ? "DPWH" : supplierId === null ? "Internal" : "Supplier";
        const sourcePrice = supplierId === null
          ? null
          : await client.query<{ historicalrec_id: number }>(
              `SELECT historicalrec_id
               FROM historical_price_record
               WHERE item_code = $1
                 AND supplier_id = $2
                 AND price_source = 'Supplier'
               ORDER BY effective_date DESC, recorded_at DESC, historicalrec_id DESC
               LIMIT 1`,
              [itemCode, supplierId]
            );
        const sourcePriceId = sourcePrice?.rows[0]?.historicalrec_id ?? null;
        const quantity = Number(line.quantity);
        const totalCost = Number(Number(line.total_cost).toFixed(2));
        const existing = mergedItems.get(itemCode);
        if (existing) {
          const nextQuantity = existing.quantity + quantity;
          const nextTotal = existing.total_cost + totalCost;
          const sameSupplier = existing.supplier_id === supplierId;
          const sameSource = existing.source_type === dbSourceType;
          mergedItems.set(itemCode, {
            ...existing,
            quantity: nextQuantity,
            total_cost: nextTotal,
            unit_price: nextQuantity > 0 ? nextTotal / nextQuantity : existing.unit_price,
            source_type: sameSource ? existing.source_type : "Internal",
            supplier_id: sameSupplier ? existing.supplier_id : null,
            source_price_id: sameSupplier ? existing.source_price_id : null,
          });
          continue;
        }

        mergedItems.set(itemCode, {
          item_code: itemCode,
          item_name: line.item_name,
          unit: line.unit,
          quantity,
          unit_price: Number(line.unit_price),
          total_cost: totalCost,
          source_type: dbSourceType,
          supplier_id: supplierId,
          source_price_id: sourcePriceId,
        });
      }

      const insertedItems = [];
      for (const line of mergedItems.values()) {
        const unitCost = Number(line.unit_price.toFixed(2));
        const totalCost = Number(line.total_cost.toFixed(2));
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
          [quoteId, line.item_code, line.supplier_id, line.quantity, unitCost, totalCost, line.source_type, line.source_price_id]
        );
        insertedItems.push(itemResult.rows[0]);
      }

      await client.query(
        `UPDATE quotation
         SET total_material_cost = $1,
             total_service_cost = $2,
             grand_total = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE quote_id = $4 AND company_id = $5`,
        [
          Number(body.total_material_cost.toFixed(2)),
          Number(body.total_service_cost.toFixed(2)),
          Number(body.grand_total.toFixed(2)),
          quoteId,
          auth.companyId,
        ]
      );

      return insertedItems;
    });

    if (!saved) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    return NextResponse.json({ items: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save draft quotation items.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
