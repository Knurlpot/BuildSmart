// PROVISIONAL — shape pending backend confirmation. Modeled on
// BuildSmart_schema_v6.sql's "company_rule envelope + per-category detail table" design
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
// v6 CORRECTION 2: ADVISORY ONLY, not an enforced package. Client: "No packages as no two
// areas are the same" — every job starts from a site assessment, treatment chosen per-area
// by severity. But also: "there can be suggested materials used but not instantly put in
// system." So this stays a saved, optional reference a user can create for their own
// memory ("here's what I usually spec for a roof retrofit") — it does NOT drive, gate, or
// pre-populate Material/Unit Rules. There is no wizard and no forced next step.
export interface ScopeTemplate extends RuleEnvelope {
  template_name: string; // -> company_rule.rule_name
  service_specialization: string; // -> rule_scope.service_specialization
  material_categories: CategoryType[]; // -> rule_scope_category junction rows — SUGGESTED categories, not enforced
  // Part G: rule_scope.description is REQUIRED only when 'Others' is one of the selected
  // categories (there's otherwise no schema change needed — the column already exists).
  others_description?: string;
}

// ── 2. Material Rules (rule_material) ────────────────────────────────────────
// v6 CORRECTION 3: a flat, standalone list of "preferred item + fallback" records, picked
// straight from the catalog — NOT one-material-per-category, NOT grouped under a Scope
// Template. A real "system" (e.g. a waterproofing build-up) needs primer AND membrane AND
// topcoat together, not one alternative chosen from a dropdown; category is filtering
// metadata on the picker, not the organizing structure of this list.
//
// ⚠️ SCHEMA GAP (flagged, not fixed here): rule_material.rule_id is the PRIMARY KEY, so
// each row is exactly ONE material, and there is no FK from rule_material back to a scope
// template. "Several materials belonging to one named system/template" cannot currently be
// persisted as a group — only as N independent rule_material rows that happen to share no
// linking column. See this task's closing summary for what the backend would need to add
// (e.g. a rule_material_group table, or a scope_rule_id column) if grouping is wanted.
export const MATERIAL_FALLBACK_RULES = [
  'Use next priority material',
  'Use cheapest available',
  'Flag for manual review',
] as const;
export type MaterialFallbackRule = (typeof MATERIAL_FALLBACK_RULES)[number];

export interface MaterialRuleEntry extends RuleEnvelope {
  category: CategoryType; // -> rule_material.category_id. Filtering metadata, not the organizing key.
  // -> rule_material.preferred_item_code (FK to items, nullable in the schema). The catalog
  // picker always sets this in practice; stays nullable in the type to be honest about
  // what the schema itself permits.
  preferred_item_code: string | null;
  preferred_item_name: string; // denormalized display label, avoids a second catalog lookup per row
  material_priority: number; // 1 = preferred, 2 = fallback, ... — rank among alternatives for the same need
  fallback_rule: MaterialFallbackRule; // the "if the supplier runs out" case — client-confirmed real
}

// ── 3. Labor Rules (rule_labor) ──────────────────────────────────────────────
// v6 CORRECTION 1 — RESTRUCTURED. Client: "Base rate per kind of treatment" (a specialty
// subcontractor keys on TREATMENT — they have one crew, one region, and what changes the
// rate is which system they're applying: cementitious vs elastomeric vs torch-applied). A
// GENERAL CONTRACTOR instead keys on TRADE (mason vs electrician), optionally by region.
// Both models are real, so a rule is scoped by exactly ONE of three axes (matches the v6
// chk_rule_labor_scope CHECK — treatment XOR trade(+region) XOR nothing):
export type LaborRuleScope = 'Treatment' | 'Trade' | 'General';

export interface LaborRule extends RuleEnvelope {
  treatment_type: string | null; // e.g. 'Cementitious', 'Elastomeric', 'Torch-applied' — free text (schema note: don't over-constrain with an enum yet)
  labor_trade: string | null;
  region: PhRegion | null; // only meaningful alongside labor_trade
  labor_rate: number; // the BASE rate
  // v6 NEW: rushed jobs cost more (client: "extra on-call people", 20-30% more). % uplift
  // on labor_rate, applied only when a quotation is flagged rushed. Null = no rush uplift
  // defined for this rule. (Nothing yet records THAT a quotation is rushed — that's a
  // v6 schema OPEN ITEM, not something this pass can wire end-to-end.)
  rush_multiplier_percentage: number | null;
  productivity_index: number | null;
  // CORRECTION 1 DECISION: fallback_rule REMOVED (was optional in the prior pass). Two
  // independent rounds of client validation now agree the General rule already IS the
  // fallback — keeping a second, separate "fallback rule" dropdown alongside it was
  // redundant and confusing. See this task's closing summary.
}

export function laborRuleScope(r: Pick<LaborRule, 'treatment_type' | 'labor_trade'>): LaborRuleScope {
  if (r.treatment_type !== null) return 'Treatment';
  if (r.labor_trade !== null) return 'Trade';
  return 'General';
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
  // v6 CORRECTION 5: client — VAT is "added on the bottom of the bill", a separate line,
  // NOT baked into the per-sqm price. There is no separate on/off column in the schema —
  // vat_percentage is NOT NULL DEFAULT 12.00. The form's "Apply 12% VAT" toggle is a
  // client-side convenience only: OFF submits 0 (a valid rate meaning "no VAT line for
  // this strategy"), ON reveals the field defaulting to 12. Whether VAT is actually
  // applied to a given QUOTE is a separate, per-quotation decision
  // (quotation.vat_inclusive) — this field only sets the rate a strategy would charge if
  // VAT is applied.
  vat_percentage: number;
}

// ── 5. Unit Rules (rule_unit) ────────────────────────────────────────────────
// v6 CORRECTION 4: targets EITHER a specific catalog item OR a whole category, never
// both/neither (matches chk_rule_unit_target). An item-level rule overrides its category's
// rule. Client confirmed both concepts are real: known coverage per sqm for a given
// material, and a consistent wastage % added on top.
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
// v6: Material Rule now included (previously excluded because rows were grouped under a
// Scope Template and shown there instead — that grouping is gone as of Correction 3, so
// Material Rules are now a standalone list like every other rule type and belong here too.
export const RULE_KINDS = [
  'Scope Template',
  'Material Rule',
  'Labor Rule',
  'Pricing Strategy',
  'Unit Rule',
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

// Which CPRM tab owns a given cross-type row — drives the "jump to the owning tab"
// navigation from Manage Existing Rules.
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
  effective_date: string;
}
