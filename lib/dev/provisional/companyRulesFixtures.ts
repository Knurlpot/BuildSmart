// PROVISIONAL — shape pending backend confirmation. Backs the dev-mock endpoints in
// lib/dev/mockFetch.ts for /api/company-rules/*. See companyRulesTypes.ts for why none of
// this is a schema mirror. item_code references below (e.g. '5001', '5011') match
// lib/dev/fixtures/itemsCatalog.ts — kept as strings here since every id in this file is a
// client-side staging key, never a real database id.
import {
  envelopeStatus,
  type ExistingRuleSummary,
  type LaborRule,
  type MaterialRuleEntry,
  type PricingStrategyRule,
  type ScopeTemplate,
  type UnitRule,
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

export const scopeTemplatesFixture: ScopeTemplate[] = [
  {
    rule_id: 'st-1',
    template_name: 'Standard Roof Retrofit',
    service_specialization: 'Roofing Installation',
    material_categories: ['Structural', 'Hardware', 'Finishing'],
    is_active: true,
    effective_date: '2025-01-15',
  },
  {
    rule_id: 'st-2',
    template_name: 'Interior Waterproofing Package',
    service_specialization: 'Waterproofing Systems',
    material_categories: ['Structural', 'Finishing'],
    is_active: true,
    effective_date: '2025-02-01',
  },
  {
    rule_id: 'st-3',
    template_name: 'Full Electrical Rewire',
    service_specialization: 'Electrical Works',
    material_categories: ['Electrical', 'Hardware'],
    is_active: true,
    effective_date: '2025-03-10',
  },
];

// Deliberately incomplete for scope_rule_id 'st-1' (only Structural configured, out of 3
// categories) so the Material Rules form's "highlight missing materials" state is
// reviewable — Hardware and Finishing should show as needing attention. item_code/name
// pairs match lib/dev/fixtures/itemsCatalog.ts (Part B: real catalog items, not free text).
export const materialRulesFixture: MaterialRuleEntry[] = [
  {
    rule_id: 'mr-1',
    scope_rule_id: 'st-1',
    category: 'Structural',
    preferred_item_code: '5001',
    preferred_item_name: 'Deformed Steel Rebar, 12mm',
    material_priority: 1,
    fallback_rule: 'Use next priority material',
    is_active: true,
    effective_date: '2025-01-16',
  },
  {
    rule_id: 'mr-2',
    scope_rule_id: 'st-2',
    category: 'Structural',
    preferred_item_code: '5002',
    preferred_item_name: 'Portland Cement, Type 1',
    material_priority: 1,
    fallback_rule: 'Use cheapest available',
    is_active: true,
    effective_date: '2025-02-02',
  },
  {
    rule_id: 'mr-3',
    scope_rule_id: 'st-2',
    category: 'Finishing',
    preferred_item_code: '5011',
    preferred_item_name: 'Exterior Acrylic Paint, Weatherproof',
    material_priority: 1,
    fallback_rule: 'Flag for manual review',
    is_active: true,
    effective_date: '2025-02-02',
  },
];

// lr-3 is the GENERAL/fallback rule (Part E) — region/labor_trade both null, applied when
// no specific rule matches. lr-1/lr-2 are SPECIFIC rules (region+trade set), which
// precedence favors over lr-3 whenever both could apply.
export const laborRulesFixture: LaborRule[] = [
  {
    rule_id: 'lr-1',
    region: 'NCR',
    labor_trade: 'Mason',
    labor_rate: 850,
    productivity_index: 1.1,
    fallback_rule: 'Use regional average rate',
    is_active: true,
    effective_date: '2025-01-01',
  },
  {
    rule_id: 'lr-2',
    region: 'Region III',
    labor_trade: 'Electrician',
    labor_rate: 920,
    productivity_index: 0.95,
    fallback_rule: 'Use previous rate',
    is_active: true,
    effective_date: '2025-01-01',
  },
  {
    rule_id: 'lr-3',
    region: null,
    labor_trade: null,
    labor_rate: 750,
    productivity_index: null,
    is_active: true,
    effective_date: '2025-01-01',
  },
];

export const pricingStrategyFixture: PricingStrategyRule[] = [
  {
    rule_id: 'ps-1',
    quotation_tier: 'Practical',
    markup_percentage: 12,
    contingency_percentage: 5,
    overhead_percentage: 8,
    profit_margin_percentage: 10,
    vat_percentage: 12,
    is_active: true,
    effective_date: '2025-01-01',
  },
  {
    rule_id: 'ps-2',
    quotation_tier: 'Premium',
    markup_percentage: 22,
    contingency_percentage: 8,
    overhead_percentage: 12,
    profit_margin_percentage: 18,
    vat_percentage: 12,
    is_active: true,
    effective_date: '2025-01-01',
  },
];

// ur-1/ur-2 are CATEGORY-level defaults; ur-3 is an ITEM-level override for one specific
// item inside ur-2's category (Finishing) — demonstrates the precedence Part B asks the UI
// to explain: item-level (5% wastage) beats category-level (10% wastage) for that one item,
// every other Finishing material still uses the category default.
export const unitRulesFixture: UnitRule[] = [
  {
    rule_id: 'ur-1',
    category: 'Structural',
    item_code: null,
    item_name: null,
    conversion_factor: 40,
    wastage_allowance_percentage: 5,
    is_active: true,
    effective_date: '2025-01-05',
  },
  {
    rule_id: 'ur-2',
    category: 'Finishing',
    item_code: null,
    item_name: null,
    conversion_factor: 32,
    wastage_allowance_percentage: 10,
    is_active: true,
    effective_date: '2025-01-05',
  },
  {
    rule_id: 'ur-3',
    category: null,
    item_code: '5011',
    item_name: 'Exterior Acrylic Paint, Weatherproof',
    conversion_factor: 30,
    wastage_allowance_percentage: 5,
    is_active: true,
    effective_date: '2025-02-20',
  },
];

// Derived, not hand-duplicated, so it can never drift from the per-type fixtures above —
// this mirrors what a real /api/company-rules/existing endpoint would likely aggregate.
// Material Rules are deliberately excluded (as before v5) — they're grouped under their
// owning Scope Template rather than surfaced as standalone cross-type rows.
export const existingRulesFixture: ExistingRuleSummary[] = [
  ...scopeTemplatesFixture.map((t) => ({
    rule_id: t.rule_id,
    rule_kind: 'Scope Template' as const,
    label: t.template_name,
    detail: t.service_specialization,
    status: envelopeStatus(t),
    effective_date: t.effective_date,
  })),
  ...laborRulesFixture.map((l) => ({
    rule_id: l.rule_id,
    rule_kind: 'Labor Rule' as const,
    label: l.region === null && l.labor_trade === null ? 'General Labor Rule' : `${l.labor_trade} — ${l.region}`,
    detail: `₱${l.labor_rate}/day`,
    status: envelopeStatus(l),
    effective_date: l.effective_date,
  })),
  ...pricingStrategyFixture.map((p) => ({
    rule_id: p.rule_id,
    rule_kind: 'Pricing Strategy' as const,
    label: `${p.quotation_tier} Tier`,
    detail: `${p.markup_percentage}% markup`,
    status: envelopeStatus(p),
    effective_date: p.effective_date,
  })),
  ...unitRulesFixture.map((u) => ({
    rule_id: u.rule_id,
    rule_kind: 'Unit Rule' as const,
    label: u.item_name ?? u.category ?? 'Unit Rule',
    detail: `${u.wastage_allowance_percentage}% wastage`,
    status: envelopeStatus(u),
    effective_date: u.effective_date,
  })),
];

// A rule this fixture marks as "referenced in an active quotation" so the supersede-vs-
// edit-in-place branch (Part D) and the Manage Existing Rules dependency warning are both
// reviewable, not just the happy path.
export const RULE_ID_IN_USE = 'lr-1';
