// PROVISIONAL — Part 2 (Generate → Practical/Premium → breakdown → revise → finalize) shell
// types. Field NAMES below follow `part2_schema_addendum.sql` (the backend-facing ALTER
// script this frontend is built against) wherever a field maps to a proposed column, so
// the shapes line up the day backend applies it. This is a PRESENTATIONAL SHELL only — see
// quotationBreakdownFixtures.ts for the mock math these types carry.
//
// ‼️ HONESTY LINE: nothing under lib/dev/ is ever presented as a real, persisted, or
// backend-computed number. Every peso figure downstream of these types traces back to a
// fixture rate in quotationBreakdownFixtures.ts, not a real pricelist/rule/derivation
// lookup. Confidence is never fabricated — see ProvisionalPricingReference.confidence.
//
// FULL SCHEMA-GAP INVENTORY (from part2_schema_addendum.sql unless noted otherwise):
// - project_segments.treatment_type, is_rush, site_condition_notes — the addendum's #1;
//   treatment_type is "THE linchpin" (its own words) since it selects both labor rate and
//   material list. draftSegment.ts already tracks is_rush/treatment_type client-side as
//   staging fields; this file is what actually CONSUMES them for pricing.
// - quotation.vat_inclusive, vat_amount, quote_group_id, tier,
//   is_selected — addendum #2. VAT is a per-quotation DECISION (some clients decline it);
//   the RATE default is company_rule.vat_percentage (addendum #4).
// - quotation_items.segment_id, derived_area_sqm, derived_coverage_per_sqm,
//   derived_wastage_percentage, is_overridden — addendum #3. Also: the addendum replaces
//   quotation_items' UNIQUE(quote_id, item_code) with UNIQUE(quote_id, segment_id,
//   item_code) — the CURRENT live constraint would reject the same material appearing for
//   two different segments (e.g. the same primer on both a roof deck and a firewall).
// - rule_labor.treatment_type, rush_multiplier_percentage (+ region/labor_trade made
//   nullable) — addendum #5. Lets a specialty subcontractor price labor by TREATMENT
//   instead of only region+trade.
// - supplier_item_stock (quantity_available per supplier per item) — NOT in the addendum at
//   all. This is an EXTRA gap this task surfaces on top of it: Supplier Benchmarking's
//   "can this supplier actually fulfil the quantity" flag has no real column anywhere to
//   read stock from. Flagged distinctly below wherever it's used.
// - A "confidence" field for price provenance — NOT in the addendum, not in any real table.
//   There is no computed basis for this anywhere yet; see ProvisionalPricingReference.

import type { HistoricalPriceRecord } from '@/types/entities/historical-price-record';
import type { PhRegion } from '@/types/entities/common';
import type { Client, Quotation } from '@/types/entities';
import type { DraftSegment } from '@/features/quotation-generation/lib/draftSegment';
import type { InputMethod, WizardPhase } from '@/features/quotation-generation/lib/workflowSteps';
import type { BlueprintFloor } from './quotationGenerationTypes';
import type { LaborRule, MaterialRuleEntry, QuotationTier } from './companyRulesTypes';

export type ProvisionalTier = QuotationTier;
export const PROVISIONAL_TIERS: ProvisionalTier[] = ['Practical', 'Premium'];

// Part B — "price the quote off Uploaded Pricelist vs DPWH-CMPD." Maps to the REAL
// items.item_source / historical_price_record.price_source enum ('DPWH' | 'PSA' | 'Supplier'
// | 'Internal') — 'Uploaded' here means the company's own uploaded pricelist, i.e. an
// 'Internal'-sourced item; 'DPWH' means the published DPWH CMPD rate for the same item.
export type PricelistBasis = 'Uploaded' | 'DPWH';

// Part B tab 1's Pricing Reference panel. Reuses HistoricalPriceRecord's REAL field names
// (price_source/region/quarter/year/recorded_at all already exist on that table) — only
// `confidence` is new, and it is not a real column anywhere. It is ALWAYS null here: there
// is no computed basis for a price-confidence score yet. The UI must render this as a
// labeled-but-blank field, never a fabricated "High/Medium/Low." It only ever gets a value
// the day a real computation backs it.
export interface ProvisionalPricingReference {
  price_source: HistoricalPriceRecord['price_source'];
  region: PhRegion | null;
  brand: string | null;
  quarter: HistoricalPriceRecord['quarter'];
  year: number | null;
  recorded_at: string | null;
  confidence: null;
}

// Part B/D — a supplier option for ONE item line, with PRICE (real concept) and STOCK
// (entirely provisional — see file header, not even in the addendum). `fulfils_quantity`
// is derived (quantity_available >= the line's required quantity), not stored.
export interface ProvisionalSupplierOption {
  supplier_id: number; // fixture, mirrors a real suppliers.supplier_id
  supplier_name: string;
  brand: string | null;
  location?: string | null;
  unit_price: number;
  original_unit_price?: number;
  quantity_available: number | null; // PROVISIONAL, no supplier_item_stock table exists
  source_type: PricelistBasis;
  applied_supplier_rules?: {
    rule_type: 'Bulk Discount' | 'Negotiated Price' | 'Preferred Supplier';
    label: string;
  }[];
}

export type ItemCategory = 'Material' | 'Labor';

// Part C — ITEM-LEVEL, not service-level: one row per specific material/labor line a
// segment's treatment requires, not one lump row per segment. This is what
// quotation_items becomes once treatment_type + material rules exist to derive it for
// real; today every field is fixture-driven.
export interface ProvisionalItemLine {
  line_id: string; // staging id ONLY — never a quotation_items.quote_item_id
  segment_draft_id: string; // -> quotation_items.segment_id (addendum #3, does not exist yet)
  segment_name: string;
  floor_level: string;
  treatment_type: string | null; // real DraftSegment field; the COLUMN is addendum #1
  category: ItemCategory;
  item_code: string; // fixture code, mirrors items.item_code
  item_name: string; // the SPECIFIC material/labor description (Part C's whole point)
  unit: string;
  // Derivation audit trail — addendum #3's derived_area_sqm/derived_coverage_per_sqm/
  // derived_wastage_percentage, all nullable there (NULL = manually entered, not derived).
  // Formula: quantity = derived_area_sqm x derived_coverage_per_sqm x (1 + wastage/100).
  derived_area_sqm: number | null;
  derived_coverage_per_sqm: number | null;
  derived_wastage_percentage: number | null;
  quantity: number; // -> quotation_items.quantity (REAL column)
  unit_price: number | null; // -> quotation_items.unit_cost (REAL column); null = no rate on file
  total_cost: number | null; // null while unit_price is null
  source_type: PricelistBasis; // which basis currently prices this line
  is_overridden: boolean; // addendum #3 — does a human override the derived value
  pricing_reference: ProvisionalPricingReference;
  labor_rule_scope?: 'Treatment' | 'Trade' | 'General';
  labor_rule_label?: string;
  worker_count?: number | null;
  rush_multiplier_percentage?: number | null;
  productivity_index?: number | null;
  supplier_options: ProvisionalSupplierOption[]; // Part B/D — benchmarking + Minor Revision's picker
  selected_supplier_id: number | null; // which of supplier_options is currently priced in
}

// Part B — Cost Summary's Labor/Equipment/Contingency/Other come from
// quotation_service_cost, which ALREADY EXISTS in the live schema (labor_cost/
// equipment_cost/contingency_cost/other_cost/subtotal are all real columns — see
// types/entities/quotation-service-cost.ts). labor_cost here always equals the sum of this
// tier's Labor-category ProvisionalItemLines, so the BOQ and the summary never disagree;
// equipment_cost/contingency_cost/other_cost are quote-level fixture amounts (not itemized
// per segment) standing in for what a real quotation_service_cost row would hold.
export interface ProvisionalServiceCost {
  labor_cost: number;
  rush_job_cost: number;
  equipment_cost: number;
  contingency_cost: number;
  other_cost: number; // "PPE, mobilization" per Part B
  subtotal: number;
}

export interface ProvisionalVat {
  rate_percentage: number; // -> company_rule.vat_percentage (addendum #4, default 12.00)
  taxable_base: number;
  amount: number; // -> quotation.vat_amount (addendum #2)
}

export interface ProvisionalQuotationTierResult {
  tier: ProvisionalTier;
  items: ProvisionalItemLine[]; // item-level BOQ (Part C)
  materials_subtotal: number; // sum of Material-category item totals
  service_cost: ProvisionalServiceCost; // labor/equipment/contingency/other (Part B)
  ocm_percentage: number; // overhead — -> rule_pricing.overhead_percentage (REAL, rule-level)
  ocm_amount: number;
  profit_margin_percentage: number; // -> rule_pricing.profit_margin_percentage (REAL, rule-level)
  profit_amount: number;
  subtotal_before_vat: number;
  vat: ProvisionalVat;
  vat_inclusive: boolean; // -> quotation.vat_inclusive (addendum #2) — per-quote decision
  grand_total: number; // conceptually -> quotation.grand_total (REAL column); never written
  // back anywhere for real — Part 2 doesn't persist real derivations
  timeline_label: string; // decorative flavor text, not a stored/computed value
  warranty_label: string;
  lifespan_label: string;
  material_grade_label: string;
}

// Two tiers, siblings of ONE derivation run — the activity diagram's "Generate Practical
// and Premium quotes" step. quote_group_id/tier/is_selected are all addendum #2.
export interface ProvisionalQuoteGroup {
  quote_group_id: string; // -> quotation.quote_group_id (addendum #2)
  tiers: Partial<Record<ProvisionalTier, ProvisionalQuotationTierResult>>;
  selected_tier: ProvisionalTier | null; // -> quotation.is_selected (addendum #2)
}

export type RevisionType = 'Minor' | 'Structural';

export interface SavedQuoteVersion {
  version_id: string;
  version_number: number;
  result: ProvisionalQuotationTierResult;
  price_reference_date: string;
}

export interface SavedQuoteSnapshot {
  tier: ProvisionalTier;
  result: ProvisionalQuotationTierResult;
  versions: SavedQuoteVersion[];
  pricelist_basis_at_finalize: PricelistBasis;
  finalized_at: string;
  is_selected: boolean;
}

export interface SavedProjectRecord {
  project_id: string;
  source_quote_id?: number | null;
  client_id: number;
  client_name: string;
  project_name: string;
  project_location: string;
  project_region: string;
  status: 'Draft' | 'Final';
  accepted_tier?: ProvisionalTier | null;
  created_at: string;
  updated_at: string;
  quotes: Partial<Record<ProvisionalTier, SavedQuoteSnapshot>>;
  segmentsSnapshot: DraftSegment[];
  blueprintFloors: BlueprintFloor[] | null;
  resume_step?: WizardPhase;
  resume_method?: InputMethod;
  quotationSnapshot?: Quotation;
  clientSnapshot?: Client;
  blueprintFilePath?: string | null;
}

export interface FinalizedQuotationInput {
  quoteId?: number | null;
  acceptedTier: ProvisionalTier;
  clientId: number;
  clientName: string;
  projectName: string;
  projectLocation: string;
  projectRegion: string;
  tierItems: Partial<Record<ProvisionalTier, ProvisionalItemLine[]>>;
  pricelistBasis: PricelistBasis;
  segments: DraftSegment[];
  materialRules?: MaterialRuleEntry[];
  laborRules?: LaborRule[];
  blueprintFloors: BlueprintFloor[] | null;
}
