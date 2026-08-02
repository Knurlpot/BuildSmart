import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext, priceLine, withTransaction } from "../../pricing";

type Params = { params: Promise<{ quotationId: string }> };

type QuoteItemRow = {
  quote_item_id: number;
  item_code: number;
  supplier_id: number | null;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  is_price_locked: boolean;
  item_name: string;
};

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const { quotationId } = await params;
  const quoteId = Number(quotationId);
  const body = (await request.json().catch(() => ({}))) as { locked_item_ids?: number[] };
  const lockedItemIds = new Set((body.locked_item_ids ?? []).filter(Number.isInteger));
  if (!Number.isInteger(quoteId)) return NextResponse.json({ error: "Invalid quotation id." }, { status: 400 });

  try {
    const result = await withTransaction(async (client) => {
      const quoteResult = await client.query<{
        quote_id: number;
        project_region: string;
        total_service_cost: number;
      }>(
        `SELECT quote_id, project_region, total_service_cost::float AS total_service_cost
         FROM quotation
         WHERE quote_id = $1 AND company_id = $2
         FOR UPDATE`,
        [quoteId, auth.companyId]
      );
      const quotation = quoteResult.rows[0];
      if (!quotation) throw new Error("Quotation not found.");

      const itemResult = await client.query<QuoteItemRow>(
        `SELECT qi.quote_item_id, qi.item_code, qi.supplier_id, qi.quantity::float AS quantity,
                qi.unit_cost::float AS unit_cost, qi.total_cost::float AS total_cost,
                qi.is_price_locked, i.item_name
         FROM quotation_items qi
         JOIN items i ON i.item_code = qi.item_code
         WHERE qi.quote_id = $1
         ORDER BY qi.quote_item_id
         FOR UPDATE OF qi`,
        [quoteId]
      );

      let refreshedCount = 0;
      let lockedCount = 0;
      let skippedCount = 0;
      let newTotalMaterialCost = 0;
      let totalImpact = 0;
      const priceChanges = [];

      for (const item of itemResult.rows) {
        if (item.is_price_locked || lockedItemIds.has(item.quote_item_id)) {
          lockedCount += 1;
          newTotalMaterialCost += item.total_cost;
          continue;
        }

        let priced;
        try {
          priced = await priceLine(
            client,
            auth.companyId,
            quotation.project_region,
            item.item_code,
            item.quantity,
            item.supplier_id
          );
        } catch {
          skippedCount += 1;
          newTotalMaterialCost += item.total_cost;
          continue;
        }

        const costDifference = Number((priced.total_cost - item.total_cost).toFixed(2));
        const percentChange = item.total_cost > 0 ? (costDifference / item.total_cost) * 100 : 0;

        await client.query(
          `INSERT INTO quotation_price_history (
             quote_item_id, unit_cost_before, unit_cost_after, total_cost_before,
             total_cost_after, changed_reason, changed_by_user_id
           )
           VALUES ($1, $2, $3, $4, $5, 'Manual Refresh', $6)`,
          [item.quote_item_id, item.unit_cost, priced.unit_cost, item.total_cost, priced.total_cost, auth.userId]
        );

        await client.query(
          `UPDATE quotation_items
           SET unit_cost = $1,
               final_unit_price = $1,
               total_cost = $2,
               source_type = $3,
               source_price_id = $4,
               last_refreshed_at = CURRENT_TIMESTAMP
           WHERE quote_item_id = $5`,
          [priced.unit_cost, priced.total_cost, priced.source_type, priced.source_price_id, item.quote_item_id]
        );

        refreshedCount += 1;
        newTotalMaterialCost += priced.total_cost;
        totalImpact += costDifference;
        priceChanges.push({
          quote_item_id: item.quote_item_id,
          item_code: item.item_code,
          item_name: item.item_name,
          old_unit_cost: item.unit_cost,
          new_unit_cost: priced.unit_cost,
          percent_change: Number(percentChange.toFixed(2)),
          total_cost_impact: costDifference,
        });
      }

      newTotalMaterialCost = Number(newTotalMaterialCost.toFixed(2));
      totalImpact = Number(totalImpact.toFixed(2));
      await client.query(
        `UPDATE quotation
         SET total_material_cost = $1,
             grand_total = $1 + total_service_cost,
             updated_at = CURRENT_TIMESTAMP
         WHERE quote_id = $2`,
        [newTotalMaterialCost, quoteId]
      );

      return {
        quote_id: quoteId,
        refreshed_count: refreshedCount,
        locked_count: lockedCount,
        skipped_count: skippedCount,
        price_changes: priceChanges,
        new_total_material_cost: newTotalMaterialCost,
        total_impact: totalImpact,
        last_refreshed_at: new Date().toISOString(),
        requires_client_approval: Math.abs(totalImpact) > 1000,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refresh quotation prices.";
    return NextResponse.json({ error: message }, { status: message === "Quotation not found." ? 404 : 500 });
  }
}
