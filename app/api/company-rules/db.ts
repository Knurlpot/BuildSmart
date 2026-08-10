import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { PoolClient } from "pg";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";
import type {
  LaborRule,
  MaterialRuleEntry,
  PricingStrategyRule,
  ScopeTemplate,
  SupplierRuleEntry,
  UnitRule,
  ExistingRuleSummary,
  PriceSource,
} from "@/lib/dev/provisional/companyRulesTypes";
import type { CategoryType } from "@/types/entities/category";
import type { PhRegion } from "@/types/entities/common";

export type RuleKindParam = "scope-templates" | "material-rules" | "labor-rules" | "pricing-strategy" | "unit-rules" | "supplier-rules";

export type CompanyRulesPayload = {
  scopeTemplates: ScopeTemplate[];
  materialRules: MaterialRuleEntry[];
  laborRules: LaborRule[];
  pricingStrategies: PricingStrategyRule[];
  unitRules: UnitRule[];
  supplierRules: SupplierRuleEntry[];
  existingRules: ExistingRuleSummary[];
};

type RuleMeta = Record<string, unknown>;

export async function companyIdFor(request: NextRequest) {
  const session = readSession(request);
  if (!session) return null;
  const result = await pool.query<{ company_id: number }>(
    "SELECT company_id FROM users WHERE user_id = $1 LIMIT 1",
    [session.userId]
  );
  return result.rows[0]?.company_id ?? null;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function asDate(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
}

function meta(value: unknown): RuleMeta {
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RuleMeta) : {};
  } catch {
    return {};
  }
}

function sourceToCompanyRuleSource(source: PriceSource) {
  if (source === "Supplier") return "Supplier";
  if (source === "Internal") return "Uploaded";
  return "Government";
}

function materialFallbackToCompanyRuleFallback(fallback: unknown) {
  if (fallback === "Use next priority material") return "Nearest";
  if (fallback === "Use cheapest available") return "Lowest Equivalent";
  return "Manual";
}

function quotationTierToStrategyType(tier: unknown) {
  return tier === "Premium" ? "Premium" : "Practical";
}

async function categoryId(client: PoolClient, category: CategoryType | null) {
  if (!category) return null;
  const result = await client.query<{ category_id: number }>(
    "SELECT category_id FROM category WHERE category_type = $1 LIMIT 1",
    [category]
  );
  return result.rows[0]?.category_id ?? null;
}

export async function fetchCompanyRules(companyId: number): Promise<CompanyRulesPayload> {
  const [scopeResult, materialResult, laborResult, pricingResult, unitResult, supplierResult] = await Promise.all([
    pool.query(
      `SELECT st.scope_template_id, st.template_name, st.specialization, st.description, st.status,
              st.date_created, COALESCE(array_agg(c.category_type) FILTER (WHERE c.category_type IS NOT NULL), '{}') AS categories
       FROM scope_template st
       LEFT JOIN scope_template_category stc ON stc.scope_template_id = st.scope_template_id
       LEFT JOIN category c ON c.category_id = stc.category_id
       WHERE st.company_id = $1
       GROUP BY st.scope_template_id
       ORDER BY st.date_created DESC, st.scope_template_id DESC`,
      [companyId]
    ),
    pool.query(
      `SELECT cr.rule_id, cr.rule_name, cr.checklist_items, cr.status, cr.date_created,
              rcd.material_priority, rcd.fallback_rule, c.category_type, i.item_name
       FROM company_rule cr
       JOIN rule_category_detail rcd ON rcd.rule_id = cr.rule_id
       JOIN category c ON c.category_id = rcd.category_id
       LEFT JOIN items i ON i.item_code = rcd.preferred_item_code
       WHERE cr.company_id = $1 AND cr.work_type = 'Material Rule'
       ORDER BY cr.date_created DESC, cr.rule_id DESC`,
      [companyId]
    ),
    pool.query(
      `SELECT cr.rule_id, cr.checklist_items, cr.status, cr.date_created, rl.region, rl.labor_trade,
              rl.labor_rate, rl.productivity_index
       FROM company_rule cr
       JOIN rule_labor rl ON rl.rule_id = cr.rule_id
       WHERE cr.company_id = $1 AND cr.work_type = 'Labor Rule'
       ORDER BY cr.date_created DESC, cr.rule_id DESC`,
      [companyId]
    ),
    pool.query(
      `SELECT cr.rule_id, cr.checklist_items, cr.status, cr.date_created, rp.quotation_tier,
              rp.markup_percentage, rp.contingency_percentage, rp.overhead_percentage, rp.profit_margin_percentage
       FROM company_rule cr
       JOIN rule_pricing rp ON rp.rule_id = cr.rule_id
       WHERE cr.company_id = $1 AND cr.work_type = 'Pricing Strategy'
       ORDER BY cr.date_created DESC, cr.rule_id DESC`,
      [companyId]
    ),
    pool.query(
      `SELECT ur.unit_rule_id, ur.category_id, ur.unit_name, ur.unit_abbreviation, ur.conversion_to_base_unit,
              ur.description, ur.status, ur.created_at, c.category_type
       FROM unit_rule ur
       LEFT JOIN category c ON c.category_id = ur.category_id
       WHERE ur.company_id = $1
       ORDER BY ur.created_at DESC, ur.unit_rule_id DESC`,
      [companyId]
    ),
    pool.query(
      `SELECT sdr.supplierdisc_id, sdr.supplier_id, s.supplier_name, sdr.rule_type,
              sdr.minimum_order_amount::float AS minimum_order_amount,
              sdr.discount_percentage_rate::float AS discount_percentage_rate,
              sdr.fixed_discount_amount::float AS fixed_discount_amount,
              sdr.effective_date::text AS effective_date,
              sdr.expiration_date::text AS expiration_date,
              sdr.is_active
       FROM supplier_discount_rule sdr
       JOIN suppliers s ON s.supplier_id = sdr.supplier_id
       WHERE sdr.company_id = $1
       ORDER BY sdr.effective_date DESC, sdr.supplierdisc_id DESC`,
      [companyId]
    ),
  ]);

  const scopeTemplates: ScopeTemplate[] = scopeResult.rows.map((row) => {
    const parsed = meta(row.description);
    return {
      rule_id: `st-${row.scope_template_id}`,
      template_name: row.template_name,
      service_specialization: row.specialization,
      material_categories: row.categories,
      others_description: typeof parsed.others_description === "string" ? parsed.others_description : undefined,
      is_active: row.status === "Active",
      effective_date: asDate(row.date_created),
    };
  });

  const materialRules: MaterialRuleEntry[] = materialResult.rows.map((row) => {
    const parsed = meta(row.checklist_items);
    const prioritySource = (parsed.priority_source as PriceSource | undefined) ?? "Supplier";
    return {
      rule_id: `mr-${row.rule_id}`,
      category: row.category_type,
      preferred_item_code: String(parsed.preferred_item_code ?? ""),
      preferred_item_name: row.item_name ?? row.rule_name,
      material_priority: Number(row.material_priority),
      priority_source: prioritySource,
      fallback_rule: row.fallback_rule,
      is_active: row.status === "Active",
      effective_date: asDate(row.date_created),
    };
  });

  const laborRules: LaborRule[] = laborResult.rows.map((row) => {
    const parsed = meta(row.checklist_items);
    return {
      rule_id: `lr-${row.rule_id}`,
      treatment_type: typeof parsed.treatment_type === "string" ? parsed.treatment_type : null,
      labor_trade: typeof parsed.labor_trade === "string" ? parsed.labor_trade : null,
      region: (typeof parsed.region === "string" ? parsed.region : null) as PhRegion | null,
      labor_rate: Number(row.labor_rate),
      rush_multiplier_percentage:
        typeof parsed.rush_multiplier_percentage === "number" ? parsed.rush_multiplier_percentage : null,
      productivity_index: row.productivity_index === null ? null : Number(row.productivity_index),
      is_active: row.status === "Active",
      effective_date: asDate(row.date_created),
    };
  });

  const pricingStrategies: PricingStrategyRule[] = pricingResult.rows.map((row) => {
    const parsed = meta(row.checklist_items);
    return {
      rule_id: `ps-${row.rule_id}`,
      quotation_tier: row.quotation_tier,
      markup_percentage: Number(row.markup_percentage),
      contingency_percentage: Number(row.contingency_percentage),
      overhead_percentage: Number(row.overhead_percentage),
      profit_margin_percentage: Number(row.profit_margin_percentage),
      vat_percentage: typeof parsed.vat_percentage === "number" ? parsed.vat_percentage : 0,
      is_active: row.status === "Active",
      effective_date: asDate(row.date_created),
    };
  });

  const unitRules: UnitRule[] = unitResult.rows.map((row) => {
    const parsed = meta(row.description);
    return {
      rule_id: `ur-${row.unit_rule_id}`,
      category: row.category_type,
      item_code: typeof parsed.item_code === "string" ? parsed.item_code : null,
      item_name: typeof parsed.item_name === "string" ? parsed.item_name : null,
      conversion_factor: Number(row.conversion_to_base_unit ?? 1),
      wastage_allowance_percentage:
        typeof parsed.wastage_allowance_percentage === "number" ? parsed.wastage_allowance_percentage : 0,
      is_active: row.status === "Active",
      effective_date: asDate(row.created_at),
    };
  });

  const supplierRules: SupplierRuleEntry[] = supplierResult.rows.map((row) => ({
    rule_id: `sr-${row.supplierdisc_id}`,
    supplier_id: Number(row.supplier_id),
    supplier_name: row.supplier_name,
    rule_type: row.rule_type,
    minimum_order_amount: row.minimum_order_amount === null ? null : Number(row.minimum_order_amount),
    discount_percentage_rate: row.discount_percentage_rate === null ? null : Number(row.discount_percentage_rate),
    fixed_discount_amount: row.fixed_discount_amount === null ? null : Number(row.fixed_discount_amount),
    effective_date: row.effective_date,
    expiration_date: row.expiration_date,
    is_active: Boolean(row.is_active),
  }));

  return {
    scopeTemplates,
    materialRules,
    laborRules,
    pricingStrategies,
    unitRules,
    supplierRules,
    existingRules: [
      ...scopeTemplates.map((rule) => ({
        rule_id: rule.rule_id,
        rule_kind: "scope-template" as const,
        label: rule.template_name,
        detail: rule.service_specialization,
        effective_date: rule.effective_date,
        status: rule.is_active ? "Active" as const : "Disabled" as const,
      })),
      ...materialRules.map((rule) => ({
        rule_id: rule.rule_id,
        rule_kind: "material-rule" as const,
        label: rule.preferred_item_name,
        detail: `${rule.category} · ${rule.material_priority} - ${rule.priority_source} · ${rule.fallback_rule}`,
        effective_date: rule.effective_date,
        status: rule.is_active ? "Active" as const : "Disabled" as const,
      })),
      ...laborRules.map((rule) => ({
        rule_id: rule.rule_id,
        rule_kind: "labor-rule" as const,
        label: rule.treatment_type ?? rule.labor_trade ?? "General Labor Rule",
        detail: `₱${rule.labor_rate}`,
        effective_date: rule.effective_date,
        status: rule.is_active ? "Active" as const : "Disabled" as const,
      })),
      ...pricingStrategies.map((rule) => ({
        rule_id: rule.rule_id,
        rule_kind: "pricing-strategy" as const,
        label: `${rule.quotation_tier} Tier`,
        detail: `${rule.markup_percentage}% markup`,
        effective_date: rule.effective_date,
        status: rule.is_active ? "Active" as const : "Disabled" as const,
      })),
      ...unitRules.map((rule) => ({
        rule_id: rule.rule_id,
        rule_kind: "unit-rule" as const,
        label: rule.item_name ?? rule.category ?? "Unit Rule",
        detail: `${rule.wastage_allowance_percentage}% wastage`,
        effective_date: rule.effective_date,
        status: rule.is_active ? "Active" as const : "Disabled" as const,
      })),
    ],
  };
}

export async function createRule(companyId: number, kind: RuleKindParam, body: Record<string, unknown>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (kind === "scope-templates") {
      const inserted = await client.query<{ scope_template_id: number }>(
        `INSERT INTO scope_template (company_id, template_name, specialization, scope_of_work, work_type, description)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING scope_template_id`,
        [
          companyId,
          body.template_name,
          body.service_specialization,
          body.template_name,
          "Scope Template",
          JSON.stringify({ others_description: body.others_description ?? null }),
        ]
      );
      for (const category of (body.material_categories as CategoryType[]) ?? []) {
        const id = await categoryId(client, category);
        if (id) {
          await client.query(
            "INSERT INTO scope_template_category (scope_template_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [inserted.rows[0].scope_template_id, id]
          );
        }
      }
    } else if (kind === "material-rules") {
      const category = await categoryId(client, body.category as CategoryType);
      const source = body.priority_source as PriceSource;
      const rule = await client.query<{ rule_id: number }>(
        `INSERT INTO company_rule (company_id, rule_name, specialization, scope_of_work, work_type, checklist_items,
          primary_source, fallback_rule, strategy_type)
         VALUES ($1, $2, $3, $4, 'Material Rule', $5, $6, $7, 'Standard') RETURNING rule_id`,
        [
          companyId,
          body.preferred_item_name,
          body.category,
          body.category,
          JSON.stringify({ preferred_item_code: body.preferred_item_code, priority_source: source }),
          sourceToCompanyRuleSource(source),
          materialFallbackToCompanyRuleFallback(body.fallback_rule),
        ]
      );
      await client.query(
        `INSERT INTO rule_category_detail (rule_id, category_id, preferred_item_code, material_priority, fallback_rule)
         VALUES ($1, $2, $3, $4, $5)`,
        [rule.rows[0].rule_id, category, Number(body.preferred_item_code), body.material_priority, body.fallback_rule]
      );
    } else if (kind === "labor-rules") {
      const metaBody = {
        treatment_type: body.treatment_type,
        labor_trade: body.labor_trade,
        region: body.region,
        rush_multiplier_percentage: body.rush_multiplier_percentage,
      };
      const label = (body.treatment_type || body.labor_trade || "General Labor Rule") as string;
      const rule = await client.query<{ rule_id: number }>(
        `INSERT INTO company_rule (company_id, rule_name, specialization, scope_of_work, work_type, checklist_items,
          primary_source, fallback_rule, strategy_type)
         VALUES ($1, $2, 'General', 'Labor', 'Labor Rule', $3, 'Uploaded', 'Manual', 'Standard') RETURNING rule_id`,
        [companyId, label, JSON.stringify(metaBody)]
      );
      await client.query(
        `INSERT INTO rule_labor (rule_id, region, labor_trade, labor_rate, productivity_index, fallback_rule)
         VALUES ($1, $2, $3, $4, $5, 'Manual')`,
        [
          rule.rows[0].rule_id,
          body.region || "NCR",
          body.labor_trade || body.treatment_type || "General",
          body.labor_rate,
          body.productivity_index,
        ]
      );
    } else if (kind === "pricing-strategy") {
      const rule = await client.query<{ rule_id: number }>(
        `INSERT INTO company_rule (company_id, rule_name, specialization, scope_of_work, work_type, checklist_items,
          primary_source, fallback_rule, strategy_type)
         VALUES ($1, $2, 'General', 'Pricing', 'Pricing Strategy', $3, 'Uploaded', 'Manual', $4) RETURNING rule_id`,
        [
          companyId,
          `${body.quotation_tier} Pricing Strategy`,
          JSON.stringify({ vat_percentage: body.vat_percentage }),
          quotationTierToStrategyType(body.quotation_tier),
        ]
      );
      await client.query(
        `INSERT INTO rule_pricing (rule_id, quotation_tier, markup_percentage, contingency_percentage, overhead_percentage, profit_margin_percentage)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          rule.rows[0].rule_id,
          body.quotation_tier,
          body.markup_percentage,
          body.contingency_percentage,
          body.overhead_percentage,
          body.profit_margin_percentage,
        ]
      );
    } else if (kind === "unit-rules") {
      const id = await categoryId(client, body.category as CategoryType | null);
      const description = JSON.stringify({
        item_code: body.item_code,
        item_name: body.item_name,
        wastage_allowance_percentage: body.wastage_allowance_percentage,
      });
      await client.query(
        `INSERT INTO unit_rule (company_id, category_id, unit_name, unit_abbreviation, conversion_to_base_unit, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          companyId,
          id,
          body.item_name || body.category || "Unit Rule",
          String(body.item_code || body.category || "unit").slice(0, 10),
          body.conversion_factor,
          description,
        ]
      );
    } else if (kind === "supplier-rules") {
      await client.query(
        `INSERT INTO supplier_discount_rule (
           company_id, supplier_id, rule_type, minimum_order_amount,
           discount_percentage_rate, fixed_discount_amount, effective_date,
           expiration_date, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          companyId,
          body.supplier_id,
          body.rule_type,
          body.minimum_order_amount ?? null,
          body.discount_percentage_rate ?? null,
          body.fixed_discount_amount ?? null,
          body.effective_date,
          body.expiration_date || null,
          body.is_active ?? true,
        ]
      );
    }

    await client.query("COMMIT");
    return await fetchCompanyRules(companyId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setRuleStatus(companyId: number, ruleId: string, status: "Active" | "Inactive") {
  const [prefix, rawId] = ruleId.split("-");
  const id = Number(rawId);
  if (!Number.isFinite(id)) throw new Error("Invalid rule id");

  if (prefix === "sr") {
    await pool.query(
      "UPDATE supplier_discount_rule SET is_active = $1 WHERE company_id = $2 AND supplierdisc_id = $3",
      [status === "Active", companyId, id]
    );
  } else if (prefix === "st") {
    await pool.query("UPDATE scope_template SET status = $1, date_updated = NOW() WHERE company_id = $2 AND scope_template_id = $3", [
      status,
      companyId,
      id,
    ]);
  } else if (prefix === "ur") {
    await pool.query("UPDATE unit_rule SET status = $1, updated_at = NOW() WHERE company_id = $2 AND unit_rule_id = $3", [
      status,
      companyId,
      id,
    ]);
  } else {
    await pool.query("UPDATE company_rule SET status = $1 WHERE company_id = $2 AND rule_id = $3", [status, companyId, id]);
  }
  return fetchCompanyRules(companyId);
}
