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
// not a confirmed enumeration. Only used by the "By Trade" scope (general-contractor
// model) — "By Treatment" is deliberately free text, per the schema's own note not to
// over-constrain it with an enum yet.
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

// v6 Correction 2 — ADVISORY only: a saved reference of suggested categories for a kind of
// job, not an enforced package and not linked to anything else. Creating/editing one has
// no side effects on Material or Unit Rules.
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

// v6 Correction 3 — a flat, standalone list picked from the catalog (item_code/name pairs
// match lib/dev/fixtures/itemsCatalog.ts), no scope-template grouping (see the ⚠️ SCHEMA
// GAP note in companyRulesTypes.ts). mr-3/mr-4 demonstrate the "priority-ranked
// alternatives" case within one category: two Finishing paints, priority 1 vs 2.
export const materialRulesFixture: MaterialRuleEntry[] = [
  {
    rule_id: 'mr-1',
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
    category: 'Finishing',
    preferred_item_code: '5011',
    preferred_item_name: 'Exterior Acrylic Paint, Weatherproof',
    material_priority: 1,
    fallback_rule: 'Flag for manual review',
    is_active: true,
    effective_date: '2025-02-02',
  },
  {
    rule_id: 'mr-4',
    category: 'Finishing',
    preferred_item_code: '5012',
    preferred_item_name: 'Interior Latex Paint',
    material_priority: 2,
    fallback_rule: 'Use cheapest available',
    is_active: true,
    effective_date: '2025-02-02',
  },
];

// v6 Correction 1 — RESTRUCTURED for the two real pricing models:
//   lr-1/lr-2: TREATMENT-scoped (specialty subcontractor) — one crew, one region, rate
//              varies by which system is applied. Both carry a rush uplift.
//   lr-3/lr-4: TRADE-scoped (general contractor) — rate varies by trade (+ region).
//   lr-5:      GENERAL/fallback — everything null, used when nothing more specific matches.
// fallback_rule is gone (see companyRulesTypes.ts's LaborRule doc comment for why).
export const laborRulesFixture: LaborRule[] = [
  {
    rule_id: 'lr-1',
    treatment_type: 'Cementitious Waterproofing',
    labor_trade: null,
    region: null,
    labor_rate: 500,
    rush_multiplier_percentage: 25,
    productivity_index: null,
    is_active: true,
    effective_date: '2025-01-01',
  },
  {
    rule_id: 'lr-2',
    treatment_type: 'Elastomeric Waterproofing',
    labor_trade: null,
    region: null,
    labor_rate: 650,
    rush_multiplier_percentage: 20,
    productivity_index: null,
    is_active: true,
    effective_date: '2025-01-01',
  },
  {
    rule_id: 'lr-3',
    treatment_type: null,
    labor_trade: 'Mason',
    region: 'NCR',
    labor_rate: 850,
    rush_multiplier_percentage: null,
    productivity_index: 1.1,
    is_active: true,
    effective_date: '2025-01-01',
  },
  {
    rule_id: 'lr-4',
    treatment_type: null,
    labor_trade: 'Electrician',
    region: 'Region III',
    labor_rate: 920,
    rush_multiplier_percentage: null,
    productivity_index: 0.95,
    is_active: true,
    effective_date: '2025-01-01',
  },
  {
    rule_id: 'lr-5',
    treatment_type: null,
    labor_trade: null,
    region: null,
    labor_rate: 750,
    rush_multiplier_percentage: null,
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
// item inside ur-2's category (Finishing) — demonstrates the precedence the UI explains:
// item-level (5% wastage) beats category-level (10% wastage) for that one item, every
// other Finishing material still uses the category default.
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
// v6: Material Rule is now included (no longer grouped under a Scope Template — see
// Correction 3), so it's a standalone list like every other rule type.
export const existingRulesFixture: ExistingRuleSummary[] = [
  ...scopeTemplatesFixture.map((t) => ({
    rule_id: t.rule_id,
    rule_kind: 'Scope Template' as const,
    label: t.template_name,
    detail: t.service_specialization,
    status: envelopeStatus(t),
    effective_date: t.effective_date,
  })),
  ...materialRulesFixture.map((m) => ({
    rule_id: m.rule_id,
    rule_kind: 'Material Rule' as const,
    label: m.preferred_item_name,
    detail: `${m.category} · priority ${m.material_priority}`,
    status: envelopeStatus(m),
    effective_date: m.effective_date,
  })),
  ...laborRulesFixture.map((l) => ({
    rule_id: l.rule_id,
    rule_kind: 'Labor Rule' as const,
    label:
      l.treatment_type !== null
        ? l.treatment_type
        : l.labor_trade !== null
          ? `${l.labor_trade} — ${l.region}`
          : 'General Labor Rule',
    detail: `₱${l.labor_rate}${l.treatment_type !== null ? '/sqm' : '/day'}`,
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
// edit-in-place branch and the Manage Existing Rules dependency warning are both
// reviewable, not just the happy path. Now a Treatment-scoped rule (lr-1).
export const RULE_ID_IN_USE = 'lr-1';
