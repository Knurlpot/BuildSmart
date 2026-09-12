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
  finalized_breakdown_snapshot?: {
    tier?: "Practical" | "Premium";
    pricelist_basis_at_finalize?: "Uploaded" | "DPWH";
    result?: {
      items?: Array<AcceptedQuotationLine & {
        line_id?: string;
        segment_draft_id?: string;
        segment_name?: string;
        floor_level?: string;
        treatment_type?: string | null;
        item_name?: string;
        unit?: string;
        derived_area_sqm?: number | null;
        derived_coverage_per_sqm?: number | null;
        derived_wastage_percentage?: number | null;
        is_overridden?: boolean;
        pricing_reference?: {
          price_source?: "DPWH" | "PSA" | "Supplier" | "Internal";
          region?: string | null;
          brand?: string | null;
          quarter?: "Q1" | "Q2" | "Q3" | "Q4" | null;
          year?: number | null;
          recorded_at?: string | null;
        };
        labor_rule_scope?: "Treatment" | "Trade" | "General";
        labor_rule_label?: string;
        worker_count?: number | null;
        rush_multiplier_percentage?: number | null;
        productivity_index?: number | null;
        selected_supplier_id?: number | null;
        supplier_options?: Array<{
          supplier_id: number;
          supplier_name: string;
          brand?: string | null;
          location?: string | null;
          unit_price: number;
          original_unit_price?: number;
          quantity_available?: number | null;
          source_type?: "Uploaded" | "DPWH";
        }>;
      }>;
      materials_subtotal?: number;
      service_cost?: {
        labor_cost?: number;
        rush_job_cost?: number;
        equipment_cost?: number;
        contingency_cost?: number;
        other_cost?: number;
        subtotal?: number;
      };
      ocm_percentage?: number;
      ocm_amount?: number;
      profit_margin_percentage?: number;
      profit_amount?: number;
      subtotal_before_vat?: number;
      vat?: {
        rate_percentage?: number;
        taxable_base?: number;
        amount?: number;
      };
      vat_inclusive?: boolean;
      grand_total?: number;
      timeline_label?: string;
      warranty_label?: string;
      lifespan_label?: string;
      material_grade_label?: string;
    };
  };
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

  const materialItems = pricedItems.filter((line) => line.category !== "Labor");
  if (materialItems.some((line) => !(Number(line.quantity) > 0) || !(Number(line.unit_price) > 0))) {
    return badRequest("Every accepted material needs a quantity and unit price.");
  }
  const catalogItems = materialItems.filter((line) => Number.isInteger(Number(line.item_code)));
  const omittedNonCatalogItems = materialItems.length - catalogItems.length;

  const aggregatedCatalogItems = Array.from(
    catalogItems.reduce((itemsByCode, line) => {
      const itemCode = Number(line.item_code);
      const quantity = Number(line.quantity);
      const totalCost = Number(line.total_cost);
      const dbSourceType = line.source_type === "DPWH" ? "DPWH" : "Supplier";
      const existing = itemsByCode.get(itemCode);

      if (existing) {
        existing.quantity += quantity;
        existing.totalCost += totalCost;
        if (existing.dbSourceType !== dbSourceType) existing.dbSourceType = "Internal";
      } else {
        itemsByCode.set(itemCode, { itemCode, quantity, totalCost, dbSourceType });
      }
      return itemsByCode;
    }, new Map<number, { itemCode: number; quantity: number; totalCost: number; dbSourceType: "DPWH" | "Supplier" | "Internal" }>()).values()
  );

  try {
    const accepted = await withTransaction(async (client) => {
      const quote = await client.query<{ quote_id: number }>(
        "SELECT quote_id FROM quotation WHERE quote_id = $1 AND company_id = $2 LIMIT 1",
        [quoteId, auth.companyId]
      );
      if (!quote.rows[0]) return null;

      await client.query("DELETE FROM quotation_items WHERE quote_id = $1", [quoteId]);
      await client.query("DELETE FROM quotation_breakdown_supplier_options WHERE quote_id = $1", [quoteId]);
      await client.query("DELETE FROM quotation_breakdown_items WHERE quote_id = $1", [quoteId]);
      await client.query("DELETE FROM quotation_breakdown_snapshot WHERE quote_id = $1", [quoteId]);

      const insertedItems = [];
      for (const line of aggregatedCatalogItems) {
        const unitCost = line.totalCost / line.quantity;
        const totalCost = line.totalCost;
        const itemResult = await client.query(
          `INSERT INTO quotation_items (
             quote_id, item_code, quantity, unit_cost, markup_percentage,
             final_unit_price, total_cost, source_type
           )
           VALUES ($1, $2, $3, $4, 0, $4, $5, $6)
           RETURNING quote_item_id, quote_id, item_code, NULL::integer AS supplier_id,
                     quantity::float AS quantity,
                     unit_cost::float AS unit_cost, markup_percentage::float AS markup_percentage,
                     final_unit_price::float AS final_unit_price, total_cost::float AS total_cost,
                     source_type, NULL::integer AS source_price_id, NULL::text AS last_refreshed_at,
                     FALSE AS is_price_locked, unit_cost::float AS original_unit_cost`,
          [
            quoteId,
            line.itemCode,
            line.quantity,
            unitCost,
            totalCost,
            line.dbSourceType,
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
             accepted_tier = $1,
             total_material_cost = $2,
             total_service_cost = $3,
             grand_total = $4,
             updated_by_user_id = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE quote_id = $6 AND company_id = $7
         RETURNING quote_id, company_id, user_id, updated_by_user_id, client_id, project_name, project_location,
                   project_region, input_method, status, accepted_tier, total_material_cost::float AS total_material_cost,
                   total_service_cost::float AS total_service_cost, grand_total::float AS grand_total,
                   created_at::text AS created_at, updated_at::text AS updated_at`,
        [
          body.tier,
          Number(body.total_material_cost.toFixed(2)),
          Number(body.total_service_cost.toFixed(2)),
          Number(body.grand_total.toFixed(2)),
          auth.userId,
          quoteId,
          auth.companyId,
        ]
      );
      const breakdown = body.finalized_breakdown_snapshot?.result;
      if (breakdown) {
        await client.query(
          `INSERT INTO quotation_breakdown_snapshot (
             quote_id, version_number, tier, pricelist_basis, materials_subtotal, labor_cost, rush_job_cost,
             equipment_cost, contingency_cost, other_cost, service_subtotal, ocm_percentage,
             ocm_amount, profit_margin_percentage, profit_amount, subtotal_before_vat,
             vat_rate_percentage, vat_taxable_base, vat_amount, vat_inclusive, grand_total,
             timeline_label, warranty_label, lifespan_label, material_grade_label
           )
           VALUES (
             $1, 1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11,
             $12, $13, $14, $15,
             $16, $17, $18, $19, $20,
             $21, $22, $23, $24
           )`,
          [
            quoteId,
            body.finalized_breakdown_snapshot?.tier ?? body.tier,
            body.finalized_breakdown_snapshot?.pricelist_basis_at_finalize ?? "Uploaded",
            breakdown.materials_subtotal ?? body.total_material_cost,
            breakdown.service_cost?.labor_cost ?? 0,
            breakdown.service_cost?.rush_job_cost ?? 0,
            breakdown.service_cost?.equipment_cost ?? 0,
            breakdown.service_cost?.contingency_cost ?? 0,
            breakdown.service_cost?.other_cost ?? 0,
            breakdown.service_cost?.subtotal ?? body.total_service_cost,
            breakdown.ocm_percentage ?? 0,
            breakdown.ocm_amount ?? 0,
            breakdown.profit_margin_percentage ?? 0,
            breakdown.profit_amount ?? 0,
            breakdown.subtotal_before_vat ?? body.total_material_cost + body.total_service_cost,
            breakdown.vat?.rate_percentage ?? 0,
            breakdown.vat?.taxable_base ?? breakdown.subtotal_before_vat ?? body.total_material_cost + body.total_service_cost,
            breakdown.vat?.amount ?? 0,
            breakdown.vat_inclusive ?? false,
            breakdown.grand_total ?? body.grand_total,
            breakdown.timeline_label ?? "",
            breakdown.warranty_label ?? "",
            breakdown.lifespan_label ?? "",
            breakdown.material_grade_label ?? "",
          ]
        );

        for (const [index, line] of (breakdown.items ?? []).entries()) {
          const selectedSupplier = line.selected_supplier_id === null || line.selected_supplier_id === undefined
            ? undefined
            : line.supplier_options?.find((supplier) => String(supplier.supplier_id) === String(line.selected_supplier_id));
          const supplierByPrice = line.unit_price === null || line.unit_price === undefined
            ? undefined
            : line.supplier_options?.find((supplier) => Math.abs(supplier.unit_price - line.unit_price!) < 0.005);
          await client.query(
            `INSERT INTO quotation_breakdown_items (
               quote_id, version_number, line_id, segment_draft_id, segment_name, floor_level, treatment_type,
               category, item_code, item_name, unit, derived_area_sqm, derived_coverage_per_sqm,
               derived_wastage_percentage, quantity, unit_price, total_cost, source_type,
               is_overridden, price_source, region, brand, quarter, year, recorded_at,
               labor_rule_scope, labor_rule_label, worker_count, rush_multiplier_percentage,
               productivity_index, selected_supplier_id, selected_supplier_name
             )
             VALUES (
               $1, 1, $2, $3, $4, $5, $6,
               $7, $8, $9, $10, $11, $12,
               $13, $14, $15, $16, $17,
               $18, $19, $20, $21, $22, $23, $24,
               $25, $26, $27, $28,
               $29, $30, $31
             )`,
            [
              quoteId,
              line.line_id ?? `finalized-line-${index + 1}`,
              line.segment_draft_id ?? "saved-finalized-quotation",
              line.segment_name ?? "Saved Quotation",
              line.floor_level ?? "Finalized Project",
              line.treatment_type ?? null,
              line.category ?? "Material",
              String(line.item_code),
              line.item_name ?? String(line.item_code),
              line.unit ?? "unit",
              line.derived_area_sqm ?? null,
              line.derived_coverage_per_sqm ?? null,
              line.derived_wastage_percentage ?? null,
              Number(line.quantity ?? 0),
              line.unit_price,
              line.total_cost,
              line.source_type ?? "Uploaded",
              line.is_overridden ?? false,
              line.pricing_reference?.price_source ?? "Internal",
              line.pricing_reference?.region ?? null,
              line.pricing_reference?.brand ?? null,
              line.pricing_reference?.quarter ?? null,
              line.pricing_reference?.year ?? null,
              line.pricing_reference?.recorded_at ?? null,
              line.labor_rule_scope ?? null,
              line.labor_rule_label ?? null,
              line.worker_count ?? null,
              line.rush_multiplier_percentage ?? null,
              line.productivity_index ?? null,
              line.selected_supplier_id ?? null,
              selectedSupplier?.supplier_name ?? supplierByPrice?.supplier_name ?? null,
            ]
          );

          for (const supplier of line.supplier_options ?? []) {
            await client.query(
              `INSERT INTO quotation_breakdown_supplier_options (
                 quote_id, version_number, line_id, supplier_id, supplier_name, brand, location,
                 unit_price, original_unit_price, quantity_available, source_type
               )
               VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               ON CONFLICT (quote_id, version_number, line_id, supplier_id) DO UPDATE
               SET supplier_name = EXCLUDED.supplier_name,
                   brand = EXCLUDED.brand,
                   location = EXCLUDED.location,
                   unit_price = EXCLUDED.unit_price,
                   original_unit_price = EXCLUDED.original_unit_price,
                   quantity_available = EXCLUDED.quantity_available,
                   source_type = EXCLUDED.source_type`,
              [
                quoteId,
                line.line_id ?? `finalized-line-${index + 1}`,
                supplier.supplier_id,
                supplier.supplier_name,
                supplier.brand ?? null,
                supplier.location ?? null,
                supplier.unit_price,
                supplier.original_unit_price ?? null,
                supplier.quantity_available ?? null,
                supplier.source_type ?? line.source_type ?? "Uploaded",
              ]
            );
          }
        }
      }

      return {
        ...result.rows[0],
        accepted_tier: body.tier,
        items: insertedItems,
        omitted_non_catalog_items: omittedNonCatalogItems,
      };
    });

    if (!accepted) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    return NextResponse.json(accepted);
  } catch (error) {
    console.error("Unable to accept quotation", error);
    return NextResponse.json({ error: "Unable to accept quotation." }, { status: 500 });
  }
}
