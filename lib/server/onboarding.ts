import "server-only";

import { pool } from "@/lib/server/db";

type CountRow = {
  count: string;
};

export async function resolvePersistedOnboardingStep(companyId: number): Promise<number> {
  const [
    supplierCatalogResult,
    dpwhCatalogResult,
    materialRuleResult,
    laborRuleResult,
    pricingStrategyResult,
    unitRuleResult,
  ] = await Promise.all([
    pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM items i
       WHERE i.item_source = 'Supplier'
         AND (i.company_id IS NULL OR i.company_id = $1)
         AND EXISTS (
           SELECT 1
           FROM historical_price_record hp
           WHERE hp.item_code = i.item_code
             AND hp.price_source = 'Supplier'
         )`,
      [companyId]
    ),
    pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM historical_price_record hp
       JOIN items i ON i.item_code = hp.item_code
       WHERE hp.price_source = 'DPWH'
         AND i.item_source = 'DPWH'`,
    ),
    pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM company_rule cr
       JOIN rule_category_detail rcd ON rcd.rule_id = cr.rule_id
       WHERE cr.company_id = $1
         AND cr.work_type = 'Material Rule'
         AND cr.status = 'Active'`,
      [companyId]
    ),
    pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM company_rule cr
       JOIN rule_labor rl ON rl.rule_id = cr.rule_id
       WHERE cr.company_id = $1
         AND cr.work_type = 'Labor Rule'`,
      [companyId]
    ),
    pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM company_rule cr
       JOIN rule_pricing rp ON rp.rule_id = cr.rule_id
       WHERE cr.company_id = $1
         AND cr.work_type = 'Pricing Strategy'
         AND cr.status = 'Active'`,
      [companyId]
    ),
    pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM unit_rule
       WHERE company_id = $1`,
      [companyId]
    ),
  ]);

  const supplierCatalogCount = Number(supplierCatalogResult.rows[0]?.count ?? 0);
  const dpwhCatalogCount = Number(dpwhCatalogResult.rows[0]?.count ?? 0);
  const materialRuleCount = Number(materialRuleResult.rows[0]?.count ?? 0);
  const laborRuleCount = Number(laborRuleResult.rows[0]?.count ?? 0);
  const pricingStrategyCount = Number(pricingStrategyResult.rows[0]?.count ?? 0);
  const unitRuleCount = Number(unitRuleResult.rows[0]?.count ?? 0);

  const hasPricelist = supplierCatalogCount > 0 || dpwhCatalogCount > 0;
  if (!hasPricelist) return 0;

  const hasCompanyRules =
    materialRuleCount > 0 &&
    laborRuleCount > 0 &&
    pricingStrategyCount > 0 &&
    unitRuleCount > 0;

  return hasCompanyRules ? 2 : 1;
}
