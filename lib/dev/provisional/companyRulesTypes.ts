// PROVISIONAL — shape pending backend schema decision, do not treat as final.
//
// Schema v3 has a confirmed table for exactly ONE of the six CPRM rule types:
// `supplier_discount_rule` (see types/entities/supplier-discount-rule.ts). The other five
// — scope templates, material rules, labor rules, pricing strategy, unit rules — have NO
// agreed table yet; the backend is still choosing between design options. Everything in
// this file is a frontend-only staging shape derived from the CPRM activity diagram, not
// a schema mirror. Field names, nullability, and even which fields end up on which table
// are all subject to change once the backend decides. Do NOT promote any of this to
// types/entities/ until that decision lands — these are deliberately kept out of the
// "authoritative schema mirror" directory so nobody mistakes them for confirmed shapes.
//
// client-side ids (`*_id: string`) below are STAGING keys only, generated with a simple
// counter/random string — never treat them as database ids and never send them expecting
// the backend to honor them as real primary keys; a real backend would assign its own.
import type { CategoryType } from '@/types/entities/category';
import type { PhRegion } from '@/types/entities/common';

export type RuleStatus = 'Active' | 'Disabled';

// ── 1. Scope Templates ──────────────────────────────────────────────────────
export interface ScopeTemplate {
  scope_template_id: string;
  template_name: string;
  service_specialization: string;
  material_categories: CategoryType[];
  status: RuleStatus;
}

// ── 2. Material Rules ───────────────────────────────────────────────────────
// PROVISIONAL fallback options — the diagram names the step ("set fallback rule") but not
// its value set; these are a plausible placeholder, not a confirmed enumeration.
export const MATERIAL_FALLBACK_RULES = [
  'Use next priority material',
  'Use cheapest available',
  'Flag for manual review',
] as const;
export type MaterialFallbackRule = (typeof MATERIAL_FALLBACK_RULES)[number];

export interface MaterialRuleEntry {
  material_rule_id: string;
  scope_template_id: string;
  category: CategoryType;
  preferred_material: string;
  material_priority: number;
  fallback_rule: MaterialFallbackRule;
}

// ── 3. Labor Rules ──────────────────────────────────────────────────────────
export const LABOR_FALLBACK_RULES = [
  'Use regional average rate',
  'Use previous rate',
  'Flag for manual review',
] as const;
export type LaborFallbackRule = (typeof LABOR_FALLBACK_RULES)[number];

export interface LaborRule {
  labor_rule_id: string;
  region: PhRegion;
  labor_trade: string;
  labor_rate: number;
  productivity_index: number;
  fallback_rule: LaborFallbackRule;
  status: RuleStatus;
}

// ── 4. Pricing Strategy ─────────────────────────────────────────────────────
// 'Practical' | 'Premium' are CLAUDE.md-documented product concepts (Section 1: "generates
// Practical and Premium quotations"), not fabricated — but there is still no
// quotation_tier column/table backing this selection.
export const QUOTATION_TIERS = ['Practical', 'Premium'] as const;
export type QuotationTier = (typeof QUOTATION_TIERS)[number];

export interface PricingStrategyRule {
  pricing_strategy_id: string;
  quotation_tier: QuotationTier;
  markup_percentage: number;
  contingency_percentage: number;
  overhead_percentage: number;
  profit_margin_percentage: number;
  status: RuleStatus;
}

// ── 5. Unit Rules ───────────────────────────────────────────────────────────
export interface UnitRule {
  unit_rule_id: string;
  category: CategoryType;
  conversion_label: string; // e.g. "bag -> kg" — free text, diagram doesn't specify a fixed unit list
  conversion_factor: number;
  wastage_allowance_percentage: number;
  status: RuleStatus;
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

export interface ExistingRuleSummary {
  rule_id: string;
  rule_kind: RuleKind;
  label: string;
  detail: string;
  status: RuleStatus;
}
