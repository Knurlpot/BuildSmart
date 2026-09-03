import "server-only";

import { pool } from "@/lib/server/db";

export async function resolvePersistedOnboardingStep(companyId: number): Promise<number> {
  const result = await pool.query<{
    price_count: string;
    material_rule_count: string;
    supplier_rule_count: string;
    labor_rule_count: string;
    pricing_rule_count: string;
    unit_rule_count: string;
  }>(
    `SELECT
       ((
         SELECT COUNT(*)
         FROM historical_price_record h
         JOIN items i ON i.item_code = h.item_code
         WHERE i.company_id = $1
       ) + (
         SELECT COUNT(*)
         FROM price_list_upload
         WHERE company_id = $1 AND processing_status = 'completed'
       ))::text AS price_count,
       (
         SELECT COUNT(*)
         FROM company_rule
         WHERE company_id = $1 AND work_type = 'Material Rule' AND status = 'Active'
       )::text AS material_rule_count,
       (
         SELECT COUNT(*)
         FROM supplier_discount_rule
         WHERE company_id = $1 AND is_active = TRUE
       )::text AS supplier_rule_count,
       (
         SELECT COUNT(*)
         FROM company_rule
         WHERE company_id = $1 AND work_type = 'Labor Rule' AND status = 'Active'
       )::text AS labor_rule_count,
       (
         SELECT COUNT(*)
         FROM company_rule
         WHERE company_id = $1 AND work_type = 'Pricing Strategy' AND status = 'Active'
       )::text AS pricing_rule_count,
       (
         SELECT COUNT(*)
         FROM unit_rule
         WHERE company_id = $1 AND status = 'Active'
       )::text AS unit_rule_count`,
    [companyId]
  );

  const row = result.rows[0];
  if (!row || Number(row.price_count) <= 0) return 0;

  const rulesConfigured =
    Number(row.material_rule_count) > 0 &&
    Number(row.supplier_rule_count) > 0 &&
    Number(row.labor_rule_count) > 0 &&
    Number(row.pricing_rule_count) > 0 &&
    Number(row.unit_rule_count) > 0;

  return rulesConfigured ? 2 : 1;
}
