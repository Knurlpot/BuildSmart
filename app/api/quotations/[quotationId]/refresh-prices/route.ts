import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext, priceLine, withTransaction } from "../../pricing";

type Params = { params: Promise<{ quotationId: string }> };

type QuoteItemRow = {
  quote_item_id: number;
  item_code: number;
  line_id?: string;
  supplier_id: number | null;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  is_price_locked: boolean;
  item_name: string;
};

type PriceChange = {
  quote_item_id: number;
  line_id: string | null;
  item_code: number;
  item_name: string;
  old_unit_cost: number;
  new_unit_cost: number;
  percent_change: number;
  total_cost_impact: number;
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
      const latestVersion = await client.query<{ version_number: number }>(
        `SELECT version_number
         FROM quotation_breakdown_snapshot
         WHERE quote_id = $1
         ORDER BY version_number DESC
         LIMIT 1`,
        [quoteId]
      ).catch(() => ({ rows: [] }));
      const latestVersionNumber = latestVersion.rows[0]?.version_number ?? null;
      const breakdownItemResult = latestVersionNumber === null
        ? { rows: [] as QuoteItemRow[] }
        : await client.query<QuoteItemRow>(
            `SELECT 0 AS quote_item_id,
                    line_id,
                    item_code::integer AS item_code,
                    CASE WHEN source_type = 'DPWH' THEN NULL ELSE selected_supplier_id END AS supplier_id,
                    quantity::float AS quantity,
                    unit_price::float AS unit_cost,
                    total_cost::float AS total_cost,
                    FALSE AS is_price_locked,
                    item_name
             FROM quotation_breakdown_items
             WHERE quote_id = $1
               AND version_number = $2
               AND category = 'Material'
               AND item_code ~ '^[0-9]+$'
               AND unit_price IS NOT NULL
             ORDER BY breakdown_item_id`,
            [quoteId, latestVersionNumber]
          ).catch(() => ({ rows: [] as QuoteItemRow[] }));
      const refreshItems = breakdownItemResult.rows.length > 0 ? breakdownItemResult.rows : itemResult.rows;

      let refreshedCount = 0;
      let lockedCount = 0;
      let skippedCount = 0;
      let newTotalMaterialCost = 0;
      let totalImpact = 0;
      const priceChanges: PriceChange[] = [];

      for (const item of refreshItems) {
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

        if (item.quote_item_id > 0) {
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
        }

        refreshedCount += 1;
        newTotalMaterialCost += priced.total_cost;
        totalImpact += costDifference;
        if (Math.abs(costDifference) > 0) {
          priceChanges.push({
            quote_item_id: item.quote_item_id,
            line_id: item.line_id ?? null,
            item_code: item.item_code,
            item_name: item.item_name,
            old_unit_cost: item.unit_cost,
            new_unit_cost: priced.unit_cost,
            percent_change: Number(percentChange.toFixed(2)),
            total_cost_impact: costDifference,
          });
        }
      }

      newTotalMaterialCost = Number(newTotalMaterialCost.toFixed(2));
      totalImpact = Number(totalImpact.toFixed(2));
      await client.query(
        `UPDATE quotation
         SET total_material_cost = $1,
             grand_total = $1 + total_service_cost,
             updated_by_user_id = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE quote_id = $3`,
        [newTotalMaterialCost, auth.userId, quoteId]
      );

      if (Math.abs(totalImpact) > 0) {
        const versionColumn = await client.query(
          `SELECT 1
           FROM information_schema.columns
           WHERE table_name = 'quotation_breakdown_snapshot'
             AND column_name = 'version_number'
           LIMIT 1`
        );
        if (versionColumn.rows.length > 0) {
          const latestSnapshot = await client.query(
            `SELECT *
             FROM quotation_breakdown_snapshot
             WHERE quote_id = $1
             ORDER BY version_number DESC
             LIMIT 1`,
            [quoteId]
          );
          const sourceSnapshot = latestSnapshot.rows[0];
          if (sourceSnapshot) {
            const nextVersion = Number(sourceSnapshot.version_number) + 1;
            const previousVersion = Number(sourceSnapshot.version_number);
            const changedByLineId = new Map(
              priceChanges
                .filter((change) => change.line_id)
                .map((change) => [String(change.line_id), change])
            );
            const changedByItemCode = new Map(priceChanges.map((change) => [String(change.item_code), change]));
            const sourceItems = await client.query(
              `SELECT *
               FROM quotation_breakdown_items
               WHERE quote_id = $1 AND version_number = $2
               ORDER BY breakdown_item_id`,
              [quoteId, previousVersion]
            );
            const adjustedItems = sourceItems.rows.map((line) => {
              const change = changedByLineId.get(String(line.line_id)) ?? changedByItemCode.get(String(line.item_code));
              if (!change || line.category !== "Material") return line;
              const quantity = Number(line.quantity);
              const totalCost = Number((quantity * change.new_unit_cost).toFixed(2));
              return {
                ...line,
                unit_price: change.new_unit_cost,
                total_cost: totalCost,
                recorded_at: new Date().toISOString(),
              };
            });
            const materialsSubtotal = Number(adjustedItems
              .filter((line) => line.category === "Material")
              .reduce((sum, line) => sum + Number(line.total_cost ?? 0), 0)
              .toFixed(2));
            const serviceSubtotal = Number(sourceSnapshot.service_subtotal);
            const baseForMarkup = Number((materialsSubtotal + serviceSubtotal).toFixed(2));
            const ocmAmount = Number((baseForMarkup * (Number(sourceSnapshot.ocm_percentage) / 100)).toFixed(2));
            const profitAmount = Number((baseForMarkup * (Number(sourceSnapshot.profit_margin_percentage) / 100)).toFixed(2));
            const subtotalBeforeVat = Number((baseForMarkup + ocmAmount + profitAmount).toFixed(2));
            const vatAmount = sourceSnapshot.vat_inclusive
              ? Number((subtotalBeforeVat * (Number(sourceSnapshot.vat_rate_percentage) / 100)).toFixed(2))
              : 0;
            const versionGrandTotal = Number((subtotalBeforeVat + vatAmount).toFixed(2));

            await client.query(
              `UPDATE quotation
               SET total_material_cost = $1,
                   total_service_cost = $2,
                   grand_total = $3,
                   updated_by_user_id = $4,
                   updated_at = CURRENT_TIMESTAMP
               WHERE quote_id = $5`,
              [materialsSubtotal, serviceSubtotal, versionGrandTotal, auth.userId, quoteId]
            );

            await client.query(
              `INSERT INTO quotation_breakdown_snapshot (
                 quote_id, version_number, tier, pricelist_basis, materials_subtotal,
                 labor_cost, rush_job_cost, equipment_cost, contingency_cost, other_cost,
                 service_subtotal, ocm_percentage, ocm_amount, profit_margin_percentage,
                 profit_amount, subtotal_before_vat, vat_rate_percentage, vat_taxable_base,
                 vat_amount, vat_inclusive, grand_total, timeline_label, warranty_label,
                 lifespan_label, material_grade_label, finalized_at
               )
               VALUES (
                 $1, $2, $3, $4, $5,
                 $6, $7, $8, $9, $10,
                 $11, $12, $13, $14,
                 $15, $16, $17, $18,
                 $19, $20, $21, $22, $23,
                 $24, $25, CURRENT_TIMESTAMP
               )`,
              [
                quoteId,
                nextVersion,
                sourceSnapshot.tier,
                sourceSnapshot.pricelist_basis,
                materialsSubtotal,
                sourceSnapshot.labor_cost,
                sourceSnapshot.rush_job_cost,
                sourceSnapshot.equipment_cost,
                sourceSnapshot.contingency_cost,
                sourceSnapshot.other_cost,
                serviceSubtotal,
                sourceSnapshot.ocm_percentage,
                ocmAmount,
                sourceSnapshot.profit_margin_percentage,
                profitAmount,
                subtotalBeforeVat,
                sourceSnapshot.vat_rate_percentage,
                subtotalBeforeVat,
                vatAmount,
                sourceSnapshot.vat_inclusive,
                versionGrandTotal,
                sourceSnapshot.timeline_label,
                sourceSnapshot.warranty_label,
                sourceSnapshot.lifespan_label,
                sourceSnapshot.material_grade_label,
              ]
            );

            for (const line of adjustedItems) {
              await client.query(
                `INSERT INTO quotation_breakdown_items (
                   quote_id, version_number, line_id, segment_draft_id, segment_name, floor_level,
                   treatment_type, category, item_code, item_name, unit, derived_area_sqm,
                   derived_coverage_per_sqm, derived_wastage_percentage, quantity, unit_price,
                   total_cost, source_type, is_overridden, price_source, region, brand, quarter,
                   year, recorded_at, labor_rule_scope, labor_rule_label, worker_count,
                   rush_multiplier_percentage, productivity_index, selected_supplier_id,
                   selected_supplier_name
                 )
                 VALUES (
                   $1, $2, $3, $4, $5, $6,
                   $7, $8, $9, $10, $11, $12,
                   $13, $14, $15, $16,
                   $17, $18, $19, $20, $21, $22, $23,
                   $24, $25, $26, $27, $28,
                   $29, $30, $31,
                   $32
                 )`,
                [
                  quoteId,
                  nextVersion,
                  line.line_id,
                  line.segment_draft_id,
                  line.segment_name,
                  line.floor_level,
                  line.treatment_type,
                  line.category,
                  line.item_code,
                  line.item_name,
                  line.unit,
                  line.derived_area_sqm,
                  line.derived_coverage_per_sqm,
                  line.derived_wastage_percentage,
                  line.quantity,
                  line.unit_price,
                  line.total_cost,
                  line.source_type,
                  line.is_overridden,
                  line.price_source,
                  line.region,
                  line.brand,
                  line.quarter,
                  line.year,
                  line.recorded_at,
                  line.labor_rule_scope,
                  line.labor_rule_label,
                  line.worker_count,
                  line.rush_multiplier_percentage,
                  line.productivity_index,
                  line.selected_supplier_id,
                  line.selected_supplier_name,
                ]
              );
            }

            const sourceSupplierOptions = await client.query(
              `SELECT *
               FROM quotation_breakdown_supplier_options
               WHERE quote_id = $1 AND version_number = $2
               ORDER BY breakdown_supplier_option_id`,
              [quoteId, previousVersion]
            );
            for (const option of sourceSupplierOptions.rows) {
              const sourceLine = adjustedItems.find((line) => line.line_id === option.line_id);
              const change = sourceLine
                ? changedByLineId.get(String(sourceLine.line_id)) ?? changedByItemCode.get(String(sourceLine.item_code))
                : undefined;
              const isChangedSelectedSupplier =
                change && sourceLine && String(sourceLine.selected_supplier_id) === String(option.supplier_id);
              await client.query(
                `INSERT INTO quotation_breakdown_supplier_options (
                   quote_id, version_number, line_id, supplier_id, supplier_name, brand, location,
                   unit_price, original_unit_price, quantity_available, source_type
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                  quoteId,
                  nextVersion,
                  option.line_id,
                  option.supplier_id,
                  option.supplier_name,
                  option.brand,
                  option.location,
                  isChangedSelectedSupplier ? change.new_unit_cost : option.unit_price,
                  option.original_unit_price,
                  option.quantity_available,
                  option.source_type,
                ]
              );
            }
          }
        }
      }

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
    if (message === "Quotation not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("Unable to refresh quotation prices", error);
    return NextResponse.json({ error: "Unable to refresh quotation prices." }, { status: 500 });
  }
}
