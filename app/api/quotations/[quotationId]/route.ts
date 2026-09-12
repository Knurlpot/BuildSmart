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
            q.project_region, q.input_method, q.status, q.accepted_tier, q.total_material_cost::float AS total_material_cost,
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
            NULLIF(to_jsonb(qi)->>'supplier_id', '')::integer AS supplier_id, i.item_name,
            qi.quantity::float AS quantity, qi.unit_cost::float AS unit_cost,
            qi.markup_percentage::float AS markup_percentage,
            qi.final_unit_price::float AS final_unit_price, qi.total_cost::float AS total_cost,
            qi.source_type, NULLIF(to_jsonb(qi)->>'source_price_id', '')::integer AS source_price_id,
            to_jsonb(qi)->>'last_refreshed_at' AS last_refreshed_at,
            COALESCE(NULLIF(to_jsonb(qi)->>'is_price_locked', '')::boolean, FALSE) AS is_price_locked,
            COALESCE(NULLIF(to_jsonb(qi)->>'original_unit_cost', '')::numeric, qi.unit_cost)::float AS original_unit_cost
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
  const breakdownSnapshot = await pool.query(
    `SELECT quote_id, tier, pricelist_basis,
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
     LIMIT 1`,
    [quoteId]
  );
  const breakdownItems = await pool.query(
    `SELECT line_id, segment_draft_id, segment_name, floor_level, treatment_type,
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
            selected_supplier_id
     FROM quotation_breakdown_items
     WHERE quote_id = $1
     ORDER BY breakdown_item_id`,
    [quoteId]
  );
  const savedSnapshot = breakdownSnapshot.rows[0];
  const finalizedBreakdownSnapshot = savedSnapshot
    ? {
        tier: savedSnapshot.tier,
        pricelist_basis_at_finalize: savedSnapshot.pricelist_basis,
        finalized_at: savedSnapshot.finalized_at,
        result: {
          tier: savedSnapshot.tier,
          items: breakdownItems.rows.map((line) => ({
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
            supplier_options: [],
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
      }
    : null;

  return NextResponse.json({ ...quotation, finalized_breakdown_snapshot: finalizedBreakdownSnapshot, client: client?.rows[0] ?? null, items: items.rows });
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
