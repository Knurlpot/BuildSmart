// PROVISIONAL — shape pending backend confirmation. Modeled on
// BuildSmart_schema_v5.sql's "company_rule envelope + per-category detail table" design
// (Option 2, approved and built by the backend team) — NOT promoted to types/entities/
// because that exact DDL hasn't been confirmed as the final, live schema. Promote once
// the backend confirms.
//
// SHAPE: every configured rule = one company_rule envelope row (rule_id, rule_category,
// rule_name, is_active, effective_date, expiration_date, superseded_by_rule_id) + exactly
// one category-specific detail row (rule_scope / rule_material / rule_labor / rule_pricing
// / rule_unit) sharing that SAME rule_id as its primary key. The interfaces below flatten
// envelope + detail into one object per rule — a frontend view-model simplification (what
// a real GET endpoint would almost certainly return pre-joined), not a wire-format claim.
//
// client-side ids (`rule_id: string`) are STAGING keys only (stagingId()), generated with
// a counter/random string — never a real database id, never sent expecting the backend to
// honor it as a real primary key; a real backend assigns its own INT identity.
import type { CategoryType } from '@/types/entities/category';
import type { PhRegion } from '@/types/entities/common';

export type RuleCategoryKind = 'Scope' | 'Material' | 'Supplier' | 'Labor' | 'Pricing' | 'Unit';

// v5: rules are edited by SUPERSESSION once referenced by a quotation, not mutation — see
// confirmOrSupersede() in useCompanyRulesProvisional.ts. Shared by every rule type.
export interface RuleEnvelope {
  rule_id: string;
  is_active: boolean;
  effective_date: string; // ISO date (YYYY-MM-DD)
  expiration_date?: string | null;
  superseded_by_rule_id?: string | null;
}

export type RuleStatus = 'Active' | 'Disabled';

/** Derives the Active/Disabled badge every list view already renders, from is_active. */
export function envelopeStatus(e: Pick<RuleEnvelope, 'is_active'>): RuleStatus {
  return e.is_active ? 'Active' : 'Disabled';
}

// ── 1. Scope Templates (rule_scope + rule_scope_category) ───────────────────
export interface ScopeTemplate extends RuleEnvelope {
  template_name: string; // -> company_rule.rule_name
  service_specialization: string; // -> rule_scope.service_specialization
  material_categories: CategoryType[]; // -> rule_scope_category junction rows
  // Part G: rule_scope.description is REQUIRED only when 'Others' is one of the selected
  // categories (there's otherwise no schema change needed — the column already exists).
  others_description?: string;
}

// ── 2. Material Rules (rule_material) ────────────────────────────────────────
export const MATERIAL_FALLBACK_RULES = [
  'Use next priority material',
  'Use cheapest available',
  'Flag for manual review',
] as const;
export type MaterialFallbackRule = (typeof MATERIAL_FALLBACK_RULES)[number];

export interface MaterialRuleEntry extends RuleEnvelope {
  // Frontend-only linkage back to the ScopeTemplate that generated this row (its
  // rule_id) — there is no such column on rule_material; used purely to group rows by
  // template in the UI (the wizard and the per-template completeness table both need it).
  scope_rule_id: string;
  category: CategoryType; // display form of rule_material.category_id
  // Part B: -> rule_material.preferred_item_code (FK to items, nullable in the schema).
  // The FORM still requires picking one (matches the existing "Configured" UX) — the type
  // stays nullable only to be honest about what the schema itself permits.
  preferred_item_code: string | null;
  preferred_item_name: string; // denormalized display label, avoids a second catalog lookup per row
  material_priority: number;
  fallback_rule: MaterialFallbackRule;
}

// ── 3. Labor Rules (rule_labor) ──────────────────────────────────────────────
export const LABOR_FALLBACK_RULES = [
  'Use regional average rate',
  'Use previous rate',
  'Flag for manual review',
] as const;
export type LaborFallbackRule = (typeof LABOR_FALLBACK_RULES)[number];

// v5: region/labor_trade are NULLABLE. Both-null = the GENERAL/fallback rule (one static
// rate for everything unmatched); both-set = a SPECIFIC rule (region+trade), which takes
// precedence. Never one without the other (matches the schema's chk_rule_labor_scope).
export type LaborRuleScope = 'General' | 'Specific';

export interface LaborRule extends RuleEnvelope {
  region: PhRegion | null;
  labor_trade: string | null;
  labor_rate: number;
  productivity_index: number | null;
  // Part E DECISION: kept, not removed, even though a General rule now arguably makes
  // this redundant (the general rule IS the fallback) — see this task's closing summary.
  // Made OPTIONAL (was required): a General rule has no "regional average" to fall back
  // to beyond itself, so forcing a choice here doesn't make sense for that case.
  fallback_rule?: LaborFallbackRule;
}

export function laborRuleScope(r: Pick<LaborRule, 'region' | 'labor_trade'>): LaborRuleScope {
  return r.region === null && r.labor_trade === null ? 'General' : 'Specific';
}

// ── 4. Pricing Strategy (rule_pricing) ───────────────────────────────────────
// 'Practical' | 'Premium' are CLAUDE.md-documented product concepts, not fabricated — but
// rule_pricing.quotation_tier has no CHECK constraint in the schema, so the DB itself
// doesn't enforce this set; kept here as the client-side input constraint regardless.
export const QUOTATION_TIERS = ['Practical', 'Premium'] as const;
export type QuotationTier = (typeof QUOTATION_TIERS)[number];

export interface PricingStrategyRule extends RuleEnvelope {
  quotation_tier: QuotationTier;
  markup_percentage: number;
  contingency_percentage: number;
  overhead_percentage: number;
  profit_margin_percentage: number;
  // v5 NEW: the company's STANDARD VAT rate. There is no separate on/off column in the
  // schema — vat_percentage is NOT NULL DEFAULT 12.00. The form's "Apply 12% VAT" toggle
  // is a client-side convenience only: OFF submits 0 (a valid rate meaning "no VAT for
  // this strategy"), ON reveals the field defaulting to 12. Whether VAT is actually
  // applied to a given QUOTE is a separate, per-quotation decision
  // (quotation.vat_inclusive) — this field only sets the rate a strategy would charge if
  // VAT is applied.
  vat_percentage: number;
}

// ── 5. Unit Rules (rule_unit) ────────────────────────────────────────────────
// v5: targets EITHER a specific catalog item OR a whole category, never both/neither
// (matches chk_rule_unit_target). An item-level rule overrides its category's rule.
export type UnitRuleTargetKind = 'item' | 'category';

export interface UnitRule extends RuleEnvelope {
  category: CategoryType | null; // -> rule_unit.category_id (FK); null when item-level
  item_code: string | null; // -> rule_unit.item_code (FK to items); null when category-level
  item_name: string | null; // denormalized display label for item_code
  conversion_factor: number;
  wastage_allowance_percentage: number;
}

export function unitRuleTargetKind(r: Pick<UnitRule, 'item_code'>): UnitRuleTargetKind {
  return r.item_code !== null ? 'item' : 'category';
}

// ── Cross-type summary for Manage Existing Rules ────────────────────────────
export const RULE_KINDS = [
  'Scope Template',
  'Material Rule',
  'Labor Rule',
  'Pricing Strategy',
  'Unit Rule',
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

// Which CPRM tab owns a given cross-type row — drives the Part C/A "jump to the owning
// tab" navigation from Manage Existing Rules.
export const RULE_KIND_TAB: Record<RuleKind, string> = {
  'Scope Template': 'scope-templates',
  'Material Rule': 'material-rules',
  'Labor Rule': 'labor-rules',
  'Pricing Strategy': 'pricing-strategy',
  'Unit Rule': 'unit-rules',
};

export interface ExistingRuleSummary {
  rule_id: string;
  rule_kind: RuleKind;
  label: string;
  detail: string;
  status: RuleStatus;
  effective_date: string; // v5: NEW — Part D
}
