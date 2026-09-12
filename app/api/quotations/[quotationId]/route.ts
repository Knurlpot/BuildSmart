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
    `SELECT q.quote_id, q.company_id, q.user_id, q.updated_by_user_id, q.client_id, q.project_name, q.project_location,
            q.project_region, q.input_method, q.blueprint_file_path, q.status, q.accepted_tier, q.total_material_cost::float AS total_material_cost,
            q.total_service_cost::float AS total_service_cost, q.grand_total::float AS grand_total,
            trim(concat_ws(' ', creator.first_name, creator.last_name)) AS created_by_user_name,
            creator.email AS created_by_user_email,
            trim(concat_ws(' ', updater.first_name, updater.last_name)) AS updated_by_user_name,
            updater.email AS updated_by_user_email,
            q.created_at::text AS created_at, q.updated_at::text AS updated_at
     FROM quotation q
     LEFT JOIN users creator ON creator.user_id = q.user_id
     LEFT JOIN users updater ON updater.user_id = COALESCE(q.updated_by_user_id, q.user_id)
     WHERE q.quote_id = $1 AND q.company_id = $2`,
    [quoteId, auth.companyId]
  );
  const quotation = quoteResult.rows[0];
  if (!quotation) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });

  const items = await pool.query(
    `SELECT qi.quote_item_id, qi.quote_id, qi.item_code,
            qi.supplier_id, i.item_name,
            qi.quantity::float AS quantity, qi.unit_cost::float AS unit_cost,
            qi.markup_percentage::float AS markup_percentage,
            qi.final_unit_price::float AS final_unit_price, qi.total_cost::float AS total_cost,
            qi.source_type, qi.source_price_id,
            qi.last_refreshed_at::text AS last_refreshed_at,
            qi.is_price_locked,
            COALESCE(qi.original_unit_cost, qi.unit_cost)::float AS original_unit_cost
     FROM quotation_items qi
     JOIN items i ON i.item_code = qi.item_code
     WHERE qi.quote_id = $1
     ORDER BY qi.quote_item_id`,
    [quoteId]
  );
  const client = quotation.client_id
    ? await pool.query(
        `SELECT c.client_id, c.company_id, c.client_name, c.contact_person, c.contact_email, c.contact_number,
                c.client_address,
                CASE WHEN quote_counts.project_count > 0 THEN 'Returning' ELSE 'New' END AS client_type,
                c.notes, c.status, c.created_at::text AS created_at,
                quote_counts.project_count AS quotation_project_count
         FROM client c
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS project_count
           FROM quotation q
           WHERE q.client_id = c.client_id AND q.company_id = c.company_id
         ) quote_counts ON TRUE
         WHERE c.client_id = $1 AND c.company_id = $2
         LIMIT 1`,
        [quotation.client_id, auth.companyId]
      )
    : null;
  const breakdownVersionColumn = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_name = 'quotation_breakdown_snapshot'
       AND column_name = 'version_number'
     LIMIT 1`
  );
  const hasBreakdownVersions = breakdownVersionColumn.rows.length > 0;
  const breakdownSnapshot = await pool.query(
    `SELECT quote_id, ${hasBreakdownVersions ? "version_number" : "1 AS version_number"}, tier, pricelist_basis,
            materials_subtotal::float AS materials_subtotal,
            labor_cost::float AS labor_cost,
            rush_job_cost::float AS rush_job_cost,
            equipment_cost::float AS equipment_cost,
            contingency_cost::float AS contingency_cost,
            other_cost::float AS other_cost,
            service_subtotal::float AS service_subtotal,
            ocm_percentage::float AS ocm_percentage,
            ocm_amount::float AS ocm_amount,
            profit_margin_percentage::float AS profit_margin_percentage,
            profit_amount::float AS profit_amount,
            subtotal_before_vat::float AS subtotal_before_vat,
            vat_rate_percentage::float AS vat_rate_percentage,
            vat_taxable_base::float AS vat_taxable_base,
            vat_amount::float AS vat_amount,
            vat_inclusive,
            grand_total::float AS grand_total,
            timeline_label, warranty_label, lifespan_label, material_grade_label,
            finalized_at::text AS finalized_at
     FROM quotation_breakdown_snapshot
     WHERE quote_id = $1
     ORDER BY ${hasBreakdownVersions ? "version_number" : "breakdown_snapshot_id"} DESC`,
    [quoteId]
  );
  const selectedSupplierNameColumn = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_name = 'quotation_breakdown_items'
       AND column_name = 'selected_supplier_name'
     LIMIT 1`
  );
  const selectedSupplierNameSelect = selectedSupplierNameColumn.rows.length > 0
    ? "selected_supplier_name"
    : "NULL::text AS selected_supplier_name";
  const breakdownItems = await pool.query(
    `SELECT ${hasBreakdownVersions ? "version_number" : "1 AS version_number"}, line_id, segment_draft_id, segment_name, floor_level, treatment_type,
            category, item_code, item_name, unit,
            derived_area_sqm::float AS derived_area_sqm,
            derived_coverage_per_sqm::float AS derived_coverage_per_sqm,
            derived_wastage_percentage::float AS derived_wastage_percentage,
            quantity::float AS quantity,
            unit_price::float AS unit_price,
            total_cost::float AS total_cost,
            source_type, is_overridden, price_source, region, brand, quarter, year,
            recorded_at::text AS recorded_at,
            labor_rule_scope, labor_rule_label, worker_count,
            rush_multiplier_percentage::float AS rush_multiplier_percentage,
            productivity_index::float AS productivity_index,
            selected_supplier_id, ${selectedSupplierNameSelect}
     FROM quotation_breakdown_items
     WHERE quote_id = $1
     ORDER BY ${hasBreakdownVersions ? "version_number DESC," : ""} breakdown_item_id`,
    [quoteId]
  );
  const supplierOptions = await pool.query(
    `SELECT ${hasBreakdownVersions ? "version_number" : "1 AS version_number"}, line_id, supplier_id, supplier_name, brand, location,
            unit_price::float AS unit_price,
            original_unit_price::float AS original_unit_price,
            quantity_available::float AS quantity_available,
            source_type
     FROM quotation_breakdown_supplier_options
     WHERE quote_id = $1
     ORDER BY ${hasBreakdownVersions ? "version_number DESC," : ""} breakdown_supplier_option_id`,
    [quoteId]
  ).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "42P01") {
      return { rows: [] };
    }
    throw error;
  });
  const supplierOptionsByLine = supplierOptions.rows.reduce((map, option) => {
    const key = `${option.version_number}:${option.line_id}`;
    const list = map.get(key) ?? [];
    list.push({
      supplier_id: option.supplier_id,
      supplier_name: option.supplier_name,
      brand: option.brand,
      location: option.location,
      unit_price: option.unit_price,
      original_unit_price: option.original_unit_price,
      quantity_available: option.quantity_available,
      source_type: option.source_type,
    });
    map.set(key, list);
    return map;
  }, new Map<string, Array<{
    supplier_id: number;
    supplier_name: string;
    brand: string | null;
    location: string | null;
    unit_price: number;
    original_unit_price: number | null;
    quantity_available: number | null;
    source_type: "Uploaded" | "DPWH";
  }>>());
  const buildBreakdownSnapshot = (savedSnapshot: (typeof breakdownSnapshot.rows)[number]) => {
    const versionNumber = Number(savedSnapshot.version_number ?? 1);
    const versionItems = breakdownItems.rows.filter((line) => Number(line.version_number ?? 1) === versionNumber);
    return {
        tier: savedSnapshot.tier,
        version_number: versionNumber,
        pricelist_basis_at_finalize: savedSnapshot.pricelist_basis,
        finalized_at: savedSnapshot.finalized_at,
        result: {
          tier: savedSnapshot.tier,
          items: versionItems.map((line) => ({
            line_id: line.line_id,
            segment_draft_id: line.segment_draft_id,
            segment_name: line.segment_name,
            floor_level: line.floor_level,
            treatment_type: line.treatment_type,
            category: line.category,
            item_code: line.item_code,
            item_name: line.item_name,
            unit: line.unit,
            derived_area_sqm: line.derived_area_sqm,
            derived_coverage_per_sqm: line.derived_coverage_per_sqm,
            derived_wastage_percentage: line.derived_wastage_percentage,
            quantity: line.quantity,
            unit_price: line.unit_price,
            total_cost: line.total_cost,
            source_type: line.source_type,
            is_overridden: line.is_overridden,
            pricing_reference: {
              price_source: line.price_source,
              region: line.region,
              brand: line.brand,
              quarter: line.quarter,
              year: line.year,
              recorded_at: line.recorded_at,
              confidence: null,
            },
            labor_rule_scope: line.labor_rule_scope,
            labor_rule_label: line.labor_rule_label,
            worker_count: line.worker_count,
            rush_multiplier_percentage: line.rush_multiplier_percentage,
            productivity_index: line.productivity_index,
            supplier_options: supplierOptionsByLine.get(`${versionNumber}:${line.line_id}`) ?? (line.selected_supplier_id && line.selected_supplier_name && line.unit_price !== null
              ? [{
                  supplier_id: line.selected_supplier_id,
                  supplier_name: line.selected_supplier_name,
                  brand: line.brand,
                  unit_price: line.unit_price,
                  quantity_available: null,
                  source_type: line.source_type,
                }]
              : []),
            selected_supplier_id: line.selected_supplier_id,
          })),
          materials_subtotal: savedSnapshot.materials_subtotal,
          service_cost: {
            labor_cost: savedSnapshot.labor_cost,
            rush_job_cost: savedSnapshot.rush_job_cost,
            equipment_cost: savedSnapshot.equipment_cost,
            contingency_cost: savedSnapshot.contingency_cost,
            other_cost: savedSnapshot.other_cost,
            subtotal: savedSnapshot.service_subtotal,
          },
          ocm_percentage: savedSnapshot.ocm_percentage,
          ocm_amount: savedSnapshot.ocm_amount,
          profit_margin_percentage: savedSnapshot.profit_margin_percentage,
          profit_amount: savedSnapshot.profit_amount,
          subtotal_before_vat: savedSnapshot.subtotal_before_vat,
          vat: {
            rate_percentage: savedSnapshot.vat_rate_percentage,
            taxable_base: savedSnapshot.vat_taxable_base,
            amount: savedSnapshot.vat_amount,
          },
          vat_inclusive: savedSnapshot.vat_inclusive,
          grand_total: savedSnapshot.grand_total,
          timeline_label: savedSnapshot.timeline_label,
          warranty_label: savedSnapshot.warranty_label,
          lifespan_label: savedSnapshot.lifespan_label,
          material_grade_label: savedSnapshot.material_grade_label,
        },
      };
  };
  const breakdownVersions = breakdownSnapshot.rows.map(buildBreakdownSnapshot);
  const finalizedBreakdownSnapshot = breakdownVersions[0] ?? null;

  return NextResponse.json({ ...quotation, finalized_breakdown_snapshot: finalizedBreakdownSnapshot, finalized_breakdown_versions: breakdownVersions, client: client?.rows[0] ?? null, items: items.rows });
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
     SET input_method = $1, updated_by_user_id = $2, updated_at = CURRENT_TIMESTAMP
     WHERE quote_id = $3 AND company_id = $4
     RETURNING quote_id, company_id, user_id, updated_by_user_id, client_id, project_name, project_location,
               project_region, input_method, status, accepted_tier, total_material_cost::float AS total_material_cost,
               total_service_cost::float AS total_service_cost, grand_total::float AS grand_total,
               created_at::text AS created_at, updated_at::text AS updated_at`,
    [body.input_method, auth.userId, quoteId, auth.companyId]
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
     WHERE quote_id = $1 AND company_id = $2 AND user_id = $3
     RETURNING quote_id`,
    [quoteId, auth.companyId, auth.userId]
  );

  if (!result.rows[0]) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
  return NextResponse.json({ deleted: true, quote_id: result.rows[0].quote_id });
}
