// PROVISIONAL — shape pending backend schema decision, do not treat as final. Backs the
// dev-mock endpoints in lib/dev/mockFetch.ts for /api/company-rules/*. See
// companyRulesTypes.ts for why none of this is a schema mirror.
import type { CategoryType } from '@/types/entities/category';
import type {
  ExistingRuleSummary,
  LaborRule,
  MaterialRuleEntry,
  PricingStrategyRule,
  ScopeTemplate,
  UnitRule,
} from './companyRulesTypes';

// PROVISIONAL — labor trades are free text on the diagram, this is a representative list,
// not a confirmed enumeration.
export const laborTradeOptionsFixture: string[] = [
  'Mason',
  'Carpenter',
  'Electrician',
  'Plumber',
  'Painter',
  'Steel Fabricator',
  'Tile Setter',
  'General Laborer',
];

// PROVISIONAL — representative material names per category, for the "select preferred
// material" dropdown. Not sourced from a real items lookup (none is confirmed here).
export const materialsByCategoryFixture: Record<CategoryType, string[]> = {
  Structural: ['Deformed Steel Rebar, 12mm', 'Portland Cement, Type 1', 'Concrete Hollow Block, 6"'],
  Architectural: ['Ceramic Floor Tile, 60x60cm', 'Kiln-dried Timber Plank, 2x6', 'Marine Plywood, 3/4"'],
  Electrical: ['PVC Electrical Conduit, 20mm', 'Copper Ground Wire, 8mm', 'Circuit Breaker, 20A'],
  Mechanical: ['HVAC Duct Panel', 'Exhaust Fan Unit', 'Pump Assembly'],
  Plumbing: ['Copper Plumbing Fitting, Elbow 1/2"', 'PPR Pipe, 20mm', 'Gate Valve, 1/2"'],
  Finishing: ['Exterior Acrylic Paint, Weatherproof', 'Interior Latex Paint', 'Wood Varnish'],
  Hardware: ['Galvanized Steel Angle Bar, 2mm', 'Hex Bolt Set', 'Door Hinge, Heavy-Duty'],
  Others: ['Site Signage', 'Temporary Fencing', 'Safety Equipment Set'],
};

export const scopeTemplatesFixture: ScopeTemplate[] = [
  {
    scope_template_id: 'st-1',
    template_name: 'Standard Roof Retrofit',
    service_specialization: 'Roofing Installation',
    material_categories: ['Structural', 'Hardware', 'Finishing'],
    status: 'Active',
  },
  {
    scope_template_id: 'st-2',
    template_name: 'Interior Waterproofing Package',
    service_specialization: 'Waterproofing Systems',
    material_categories: ['Structural', 'Finishing'],
    status: 'Active',
  },
  {
    scope_template_id: 'st-3',
    template_name: 'Full Electrical Rewire',
    service_specialization: 'Electrical Works',
    material_categories: ['Electrical', 'Hardware'],
    status: 'Active',
  },
];

// Deliberately incomplete for scope_template_id 'st-1' (only Structural configured, out of
// 3 categories) so the Material Rules form's "highlight missing materials" state is
// reviewable — Hardware and Finishing should show as needing attention.
export const materialRulesFixture: MaterialRuleEntry[] = [
  {
    material_rule_id: 'mr-1',
    scope_template_id: 'st-1',
    category: 'Structural',
    preferred_material: 'Deformed Steel Rebar, 12mm',
    material_priority: 1,
    fallback_rule: 'Use next priority material',
  },
  {
    material_rule_id: 'mr-2',
    scope_template_id: 'st-2',
    category: 'Structural',
    preferred_material: 'Portland Cement, Type 1',
    material_priority: 1,
    fallback_rule: 'Use cheapest available',
  },
  {
    material_rule_id: 'mr-3',
    scope_template_id: 'st-2',
    category: 'Finishing',
    preferred_material: 'Exterior Acrylic Paint, Weatherproof',
    material_priority: 1,
    fallback_rule: 'Flag for manual review',
  },
];

export const laborRulesFixture: LaborRule[] = [
  {
    labor_rule_id: 'lr-1',
    region: 'NCR',
    labor_trade: 'Mason',
    labor_rate: 850,
    productivity_index: 1.1,
    fallback_rule: 'Use regional average rate',
    status: 'Active',
  },
  {
    labor_rule_id: 'lr-2',
    region: 'Region III',
    labor_trade: 'Electrician',
    labor_rate: 920,
    productivity_index: 0.95,
    fallback_rule: 'Use previous rate',
    status: 'Active',
  },
];

export const pricingStrategyFixture: PricingStrategyRule[] = [
  {
    pricing_strategy_id: 'ps-1',
    quotation_tier: 'Practical',
    markup_percentage: 12,
    contingency_percentage: 5,
    overhead_percentage: 8,
    profit_margin_percentage: 10,
    status: 'Active',
  },
  {
    pricing_strategy_id: 'ps-2',
    quotation_tier: 'Premium',
    markup_percentage: 22,
    contingency_percentage: 8,
    overhead_percentage: 12,
    profit_margin_percentage: 18,
    status: 'Active',
  },
];

export const unitRulesFixture: UnitRule[] = [
  {
    unit_rule_id: 'ur-1',
    category: 'Structural',
    conversion_label: 'bag -> kg',
    conversion_factor: 40,
    wastage_allowance_percentage: 5,
    status: 'Active',
  },
  {
    unit_rule_id: 'ur-2',
    category: 'Finishing',
    conversion_label: 'gal -> m2 coverage',
    conversion_factor: 32,
    wastage_allowance_percentage: 8,
    status: 'Active',
  },
];

// Derived, not hand-duplicated, so it can never drift from the per-type fixtures above —
// this mirrors what a real /api/company-rules/existing endpoint would likely aggregate.
export const existingRulesFixture: ExistingRuleSummary[] = [
  ...scopeTemplatesFixture.map((t) => ({
    rule_id: t.scope_template_id,
    rule_kind: 'Scope Template' as const,
    label: t.template_name,
    detail: t.service_specialization,
    status: t.status,
  })),
  ...laborRulesFixture.map((l) => ({
    rule_id: l.labor_rule_id,
    rule_kind: 'Labor Rule' as const,
    label: `${l.labor_trade} — ${l.region}`,
    detail: `₱${l.labor_rate}/day`,
    status: l.status,
  })),
  ...pricingStrategyFixture.map((p) => ({
    rule_id: p.pricing_strategy_id,
    rule_kind: 'Pricing Strategy' as const,
    label: `${p.quotation_tier} Tier`,
    detail: `${p.markup_percentage}% markup`,
    status: p.status,
  })),
  ...unitRulesFixture.map((u) => ({
    rule_id: u.unit_rule_id,
    rule_kind: 'Unit Rule' as const,
    label: `${u.category} (${u.conversion_label})`,
    detail: `${u.wastage_allowance_percentage}% wastage`,
    status: u.status,
  })),
];

// A rule this fixture marks as "referenced in an active quotation" so the Manage Existing
// Rules dependency-warning branch is reviewable, not just the happy path.
export const RULE_ID_IN_USE = 'lr-1';
