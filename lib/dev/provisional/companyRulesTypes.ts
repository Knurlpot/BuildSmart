import type { CategoryType } from "@/types/entities/category";
import type { PhRegion } from "@/types/entities/common";

export const MATERIAL_FALLBACK_RULES = ["Lowest Equivalent", "Nearest", "Manual"] as const;
export type MaterialFallbackRule = (typeof MATERIAL_FALLBACK_RULES)[number];

export const QUOTATION_TIERS = ["Practical", "Standard", "Premium"] as const;
export type QuotationTier = (typeof QUOTATION_TIERS)[number];

export type RuleKind = "scope-template" | "material-rule" | "labor-rule" | "pricing-strategy" | "unit-rule";

export const RULE_KIND_TAB: Record<RuleKind, string> = {
  "scope-template": "scope-templates",
  "material-rule": "material-rules",
  "labor-rule": "labor-rules",
  "pricing-strategy": "pricing-strategy",
  "unit-rule": "unit-rules",
};

export interface RuleBase {
  rule_id: string;
  is_active: boolean;
  effective_date: string;
}

export interface ScopeTemplate extends RuleBase {
  template_name: string;
  service_specialization: string;
  material_categories: CategoryType[];
  others_description?: string;
}

export interface MaterialRuleEntry extends RuleBase {
  category: CategoryType;
  preferred_item_code: string;
  preferred_item_name: string;
  material_priority: number;
  fallback_rule: MaterialFallbackRule;
}

export type LaborRuleScope = "Treatment" | "Trade" | "General";

export interface LaborRule extends RuleBase {
  treatment_type: string | null;
  labor_trade: string | null;
  region: PhRegion | null;
  labor_rate: number;
  rush_multiplier_percentage: number | null;
  productivity_index: number | null;
}

export interface PricingStrategyRule extends RuleBase {
  quotation_tier: QuotationTier;
  markup_percentage: number;
  contingency_percentage: number;
  overhead_percentage: number;
  profit_margin_percentage: number;
  vat_percentage: number;
}

export type UnitRuleTargetKind = "category" | "item";

export interface UnitRule extends RuleBase {
  category: CategoryType | null;
  item_code: string | null;
  item_name: string | null;
  conversion_factor: number;
  wastage_allowance_percentage: number;
}

export interface ExistingRuleSummary {
  rule_id: string;
  rule_kind: RuleKind;
  label: string;
  detail: string;
  effective_date: string;
  status: "Active" | "Disabled";
}

export function laborRuleScope(rule: LaborRule): LaborRuleScope {
  if (rule.treatment_type) return "Treatment";
  if (rule.labor_trade) return "Trade";
  return "General";
}

export function unitRuleTargetKind(rule: UnitRule): UnitRuleTargetKind {
  return rule.item_code ? "item" : "category";
}