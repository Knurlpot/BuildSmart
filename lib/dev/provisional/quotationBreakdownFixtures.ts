// MOCK FIXTURES + derivation math for Part 2's presentational shell. See
// quotationBreakdownTypes.ts for the full schema-gap inventory this trades against.
//
// deriveMockItemLines below is the "structurally real, values mock" contract in code: the
// FORMULA (area x coverage x wastage = qty; qty x unit price = total; + labor/equipment/
// contingency/OCM/profit; VAT and downpayment as separate bottom lines) is exactly what a
// real derivation would do. Only the RATES/suppliers/pricing-reference dates are fixtures —
// none of it claims to come from a real pricelist/supplier/rule lookup.
import { stagingId } from './quotationGenerationTypes';
import type { DraftSegment } from '@/features/quotation-generation/lib/draftSegment';
import { isSegmentIncluded } from '@/features/quotation-generation/lib/draftSegment';
import type {
  ItemCategory,
  PricelistBasis,
  ProvisionalItemLine,
  ProvisionalPricingReference,
  ProvisionalQuotationTierResult,
  ProvisionalServiceCost,
  ProvisionalSupplierOption,
  ProvisionalTier,
} from './quotationBreakdownTypes';

interface SupplierFixture {
  supplier_id: number;
  supplier_name: string;
  practical_price: number;
  premium_price: number;
  quantity_available: number | null; // null = internal crew / not stock-tracked (labor)
}

interface ItemFixtureDef {
  item_code: string;
  category: ItemCategory;
  item_name_practical: string;
  item_name_premium: string;
  unit: string;
  coverage_factor: number; // material: sqm-per-sqm coverage; labor: hours per sqm
  wastage_percentage: number;
  uploaded: { practical: number; premium: number };
  dpwh: { practical: number; premium: number };
  suppliers: SupplierFixture[];
}

// Keyed by TREATMENT_TYPES (quotationGenerationTypes.ts) — the same fixed list Configure
// Segments offers. A segment whose treatment_type isn't one of these (blank, or a custom
// "Other…" value) has NO entry here on purpose — that's the missing-rule case, resolved
// only in Minor Revision (Part A/D), never guessed here.
const TREATMENT_ITEM_FIXTURES: Record<string, ItemFixtureDef[]> = {
  'Cementitious Waterproofing': [
    {
      item_code: 'CEM-MEM',
      category: 'Material',
      item_name_practical: 'Cementitious Waterproofing Membrane, 2-coat (Standard Grade)',
      item_name_premium: 'Cementitious Waterproofing Membrane, 2-coat (Premium Imported Grade)',
      unit: 'sqm',
      coverage_factor: 1.0,
      wastage_percentage: 10,
      uploaded: { practical: 1450, premium: 2180 },
      dpwh: { practical: 1685, premium: 2530 },
      suppliers: [
        { supplier_id: 5101, supplier_name: 'Sika Philippines Inc.', practical_price: 1450, premium_price: 2180, quantity_available: 450 },
        { supplier_id: 5102, supplier_name: 'Mapei Philippines Corp.', practical_price: 1320, premium_price: 1980, quantity_available: 180 },
        { supplier_id: 5103, supplier_name: 'Fosroc Philippines', practical_price: 1595, premium_price: 2395, quantity_available: 600 },
      ],
    },
    {
      item_code: 'CEM-LAB',
      category: 'Labor',
      item_name_practical: 'Labor — Waterproofing Crew (Cementitious application)',
      item_name_premium: 'Labor — Certified Waterproofing Specialist (Cementitious application)',
      unit: 'hr',
      coverage_factor: 0.6,
      wastage_percentage: 0,
      uploaded: { practical: 380, premium: 480 },
      dpwh: { practical: 420, premium: 530 },
      suppliers: [
        { supplier_id: 5201, supplier_name: 'JC In-house Crew', practical_price: 380, premium_price: 480, quantity_available: null },
        { supplier_id: 5202, supplier_name: 'Sub-contractor A', practical_price: 420, premium_price: 510, quantity_available: null },
      ],
    },
  ],
  'Elastomeric Waterproofing': [
    {
      item_code: 'ELA-MEM',
      category: 'Material',
      item_name_practical: 'Elastomeric Waterproofing Coating, 2-coat (Standard Grade)',
      item_name_premium: 'Elastomeric Waterproofing Coating, 2-coat (Premium Imported Grade)',
      unit: 'sqm',
      coverage_factor: 1.0,
      wastage_percentage: 12,
      uploaded: { practical: 1280, premium: 1920 },
      dpwh: { practical: 1490, premium: 2225 },
      suppliers: [
        { supplier_id: 5104, supplier_name: 'Davies Paints Philippines', practical_price: 1280, premium_price: 1920, quantity_available: 320 },
        { supplier_id: 5105, supplier_name: 'Boysen Coatings', practical_price: 1195, premium_price: 1795, quantity_available: 150 },
      ],
    },
    {
      item_code: 'ELA-LAB',
      category: 'Labor',
      item_name_practical: 'Labor — Waterproofing Crew (Elastomeric application)',
      item_name_premium: 'Labor — Certified Waterproofing Specialist (Elastomeric application)',
      unit: 'hr',
      coverage_factor: 0.5,
      wastage_percentage: 0,
      uploaded: { practical: 360, premium: 460 },
      dpwh: { practical: 395, premium: 500 },
      suppliers: [
        { supplier_id: 5201, supplier_name: 'JC In-house Crew', practical_price: 360, premium_price: 460, quantity_available: null },
        { supplier_id: 5203, supplier_name: 'Sub-contractor B', practical_price: 340, premium_price: 440, quantity_available: null },
      ],
    },
  ],
  'Polyurethane (PU) Waterproofing': [
    {
      item_code: 'PU-MEM',
      category: 'Material',
      item_name_practical: 'Polyurethane Waterproofing Membrane, liquid-applied (Standard Grade)',
      item_name_premium: 'Polyurethane Waterproofing Membrane, liquid-applied (Premium Imported Grade)',
      unit: 'sqm',
      coverage_factor: 1.0,
      wastage_percentage: 8,
      uploaded: { practical: 1650, premium: 2475 },
      dpwh: { practical: 1915, premium: 2870 },
      suppliers: [
        { supplier_id: 5106, supplier_name: 'Sika Philippines Inc.', practical_price: 1650, premium_price: 2475, quantity_available: 400 },
        { supplier_id: 5107, supplier_name: 'Tremco Philippines', practical_price: 1780, premium_price: 2670, quantity_available: 90 },
      ],
    },
    {
      item_code: 'PU-LAB',
      category: 'Labor',
      item_name_practical: 'Labor — Waterproofing Crew (PU application)',
      item_name_premium: 'Labor — Certified Waterproofing Specialist (PU application)',
      unit: 'hr',
      coverage_factor: 0.7,
      wastage_percentage: 0,
      uploaded: { practical: 400, premium: 500 },
      dpwh: { practical: 440, premium: 550 },
      suppliers: [{ supplier_id: 5201, supplier_name: 'JC In-house Crew', practical_price: 400, premium_price: 500, quantity_available: null }],
    },
  ],
  'Torch-Applied Membrane': [
    {
      item_code: 'TAM-MEM',
      category: 'Material',
      item_name_practical: 'Torch-Applied Bituminous Membrane, 4mm (Standard Grade)',
      item_name_premium: 'Torch-Applied Bituminous Membrane, 4mm (Premium Imported Grade)',
      unit: 'sqm',
      coverage_factor: 1.05,
      wastage_percentage: 15,
      uploaded: { practical: 1596, premium: 2394 },
      dpwh: { practical: 1855, premium: 2780 },
      suppliers: [
        { supplier_id: 5108, supplier_name: 'Fosroc Philippines', practical_price: 1596, premium_price: 2394, quantity_available: 600 },
        { supplier_id: 5109, supplier_name: 'Ardex Philippines', practical_price: 1470, premium_price: 2205, quantity_available: 120 },
      ],
    },
    {
      item_code: 'TAM-LAB',
      category: 'Labor',
      item_name_practical: 'Labor — Torch-Applied Membrane Crew (heat-welding)',
      item_name_premium: 'Labor — Certified Torch-Applied Membrane Specialist',
      unit: 'hr',
      coverage_factor: 0.65,
      wastage_percentage: 0,
      uploaded: { practical: 410, premium: 510 },
      dpwh: { practical: 450, premium: 560 },
      suppliers: [{ supplier_id: 5202, supplier_name: 'Sub-contractor A', practical_price: 410, premium_price: 510, quantity_available: null }],
    },
  ],
};

// PH standard VAT rate — -> company_rule.vat_percentage (addendum #4, default 12.00). Used
// here only as a plausible fixture default, not a configured value read from a real row.
export const VAT_RATE_PERCENTAGE = 12;
const DEFAULT_DOWNPAYMENT_PERCENTAGE = 30;

interface TierPricingFixture {
  ocm_percentage: number;
  profit_margin_percentage: number;
  timeline_label: string;
  warranty_label: string;
  material_grade_label: string;
}

const TIER_PRICING_FIXTURE: Record<ProvisionalTier, TierPricingFixture> = {
  Practical: {
    ocm_percentage: 8,
    profit_margin_percentage: 10,
    timeline_label: '8–10 weeks',
    warranty_label: '1-year workmanship',
    material_grade_label: 'Standard Grade',
  },
  Premium: {
    ocm_percentage: 10,
    profit_margin_percentage: 15,
    timeline_label: '5–7 weeks',
    warranty_label: '3-year comprehensive',
    material_grade_label: 'Premium / Imported Grade',
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pricingReferenceFor(basis: PricelistBasis): ProvisionalPricingReference {
  // DPWH publishes quarterly (quarter/year present, no recorded_at date); an uploaded/
  // internal pricelist has an upload timestamp instead, no quarter — matches
  // HistoricalPriceRecord's documented nullability semantics exactly.
  return basis === 'DPWH'
    ? { price_source: 'DPWH', region: 'NCR', quarter: 'Q2', year: 2026, recorded_at: null, confidence: null }
    : { price_source: 'Internal', region: null, quarter: null, year: null, recorded_at: '2026-06-01T09:00:00.000Z', confidence: null };
}

function supplierOptionsFor(def: ItemFixtureDef, tier: ProvisionalTier, basis: PricelistBasis): ProvisionalSupplierOption[] {
  return def.suppliers.map((s) => ({
    supplier_id: s.supplier_id,
    supplier_name: s.supplier_name,
    unit_price: tier === 'Practical' ? s.practical_price : s.premium_price,
    quantity_available: s.quantity_available,
    source_type: basis,
  }));
}

function buildLine(seg: DraftSegment, def: ItemFixtureDef, tier: ProvisionalTier, basis: PricelistBasis): ProvisionalItemLine {
  const qty = round2(seg.area_sqm * def.coverage_factor * (1 + def.wastage_percentage / 100));
  const basisPrices = basis === 'DPWH' ? def.dpwh : def.uploaded;
  const unitPrice = tier === 'Practical' ? basisPrices.practical : basisPrices.premium;
  const suppliers = supplierOptionsFor(def, tier, basis);
  return {
    line_id: stagingId('item'),
    segment_draft_id: seg.draft_id,
    segment_name: seg.segment_name,
    floor_level: seg.floor_level,
    treatment_type: seg.treatment_type,
    category: def.category,
    item_code: def.item_code,
    item_name: tier === 'Practical' ? def.item_name_practical : def.item_name_premium,
    unit: def.unit,
    derived_area_sqm: seg.area_sqm,
    derived_coverage_per_sqm: def.coverage_factor,
    derived_wastage_percentage: def.wastage_percentage,
    quantity: qty,
    unit_price: unitPrice,
    total_cost: round2(qty * unitPrice),
    source_type: basis,
    is_overridden: false,
    pricing_reference: pricingReferenceFor(basis),
    supplier_options: suppliers,
    selected_supplier_id: suppliers[0]?.supplier_id ?? null,
  };
}

/** A segment whose treatment has no fixture entry (blank, or a custom "Other…" value) still
 * gets ONE placeholder Material line so it's visible and resolvable in Minor Revision — it
 * just starts with no price at all, never a guessed one. */
function buildMissingRuleLine(seg: DraftSegment, basis: PricelistBasis): ProvisionalItemLine {
  return {
    line_id: stagingId('item'),
    segment_draft_id: seg.draft_id,
    segment_name: seg.segment_name,
    floor_level: seg.floor_level,
    treatment_type: seg.treatment_type,
    category: 'Material',
    item_code: 'UNRATED',
    item_name: seg.treatment_type ? `${seg.treatment_type} (no rate on file)` : 'Treatment not specified (no rate on file)',
    unit: 'sqm',
    derived_area_sqm: seg.area_sqm,
    derived_coverage_per_sqm: 1.0,
    derived_wastage_percentage: 10,
    quantity: round2(seg.area_sqm * 1.1),
    unit_price: null,
    total_cost: null,
    source_type: basis,
    is_overridden: false,
    pricing_reference: pricingReferenceFor(basis),
    supplier_options: [],
    selected_supplier_id: null,
  };
}

/** Builds the INITIAL (no overrides yet) item-level lines for one tier, given the current
 * pricelist basis. Pure — same segments+basis always produce the same starting lines. */
export function deriveMockItemLines(segments: DraftSegment[], tier: ProvisionalTier, basis: PricelistBasis): ProvisionalItemLine[] {
  const lines: ProvisionalItemLine[] = [];
  for (const seg of segments.filter(isSegmentIncluded)) {
    const treatment = seg.treatment_type?.trim() || null;
    const defs = treatment ? TREATMENT_ITEM_FIXTURES[treatment] : undefined;
    if (!defs) {
      lines.push(buildMissingRuleLine(seg, basis));
      continue;
    }
    for (const def of defs) lines.push(buildLine(seg, def, tier, basis));
  }
  return lines;
}

/** Part B/D — re-prices the CURRENT line set to a new pricelist basis (Uploaded <-> DPWH).
 * A manually overridden line (Minor Revision changed its qty/price/supplier) is a deliberate
 * human decision and STAYS as the user left it; only non-overridden lines re-price to the
 * new basis's fixture rate — same "override always wins" contract Replit's
 * MinorRevisionPanel reference uses for its own price-reference toggle. */
export function retargetItemLinesBasis(
  segments: DraftSegment[],
  currentItems: ProvisionalItemLine[],
  tier: ProvisionalTier,
  newBasis: PricelistBasis
): ProvisionalItemLine[] {
  const fresh = deriveMockItemLines(segments, tier, newBasis);
  const currentByKey = new Map(currentItems.map((l) => [`${l.segment_draft_id}:${l.item_code}`, l]));
  return fresh.map((freshLine) => {
    const current = currentByKey.get(`${freshLine.segment_draft_id}:${freshLine.item_code}`);
    return current?.is_overridden ? current : freshLine;
  });
}

/** Quote-level fixture standing in for a real quotation_service_cost row (equipment_cost/
 * contingency_cost/other_cost are NOT itemized per segment — see quotationBreakdownTypes.ts
 * ProvisionalServiceCost). labor_cost always equals the sum of this tier's Labor-category
 * item lines, so the summary and the BOQ never disagree. */
function deriveMockServiceCost(items: ProvisionalItemLine[], materialsSubtotal: number, tier: ProvisionalTier): ProvisionalServiceCost {
  const laborCost = round2(items.filter((l) => l.category === 'Labor').reduce((sum, l) => sum + (l.total_cost ?? 0), 0));
  const equipmentPct = tier === 'Practical' ? 0.06 : 0.08;
  const contingencyPct = tier === 'Practical' ? 0.04 : 0.05;
  const otherPct = tier === 'Practical' ? 0.03 : 0.035; // PPE, mobilization
  const equipmentCost = round2(materialsSubtotal * equipmentPct);
  const contingencyCost = round2(materialsSubtotal * contingencyPct);
  const otherCost = round2(materialsSubtotal * otherPct);
  return {
    labor_cost: laborCost,
    equipment_cost: equipmentCost,
    contingency_cost: contingencyCost,
    other_cost: otherCost,
    subtotal: round2(laborCost + equipmentCost + contingencyCost + otherCost),
  };
}

/** Recomputes total_cost for ONE item line after a Minor Revision edit (quantity, unit
 * price, or switching supplier). Callers own the item array in local state; this just keeps
 * one line internally consistent. Only callable from Minor Revision — the Breakdown view
 * never mutates lines (Part A). */
export function recomputeItemLine(
  line: ProvisionalItemLine,
  patch: Partial<Pick<ProvisionalItemLine, 'quantity' | 'unit_price' | 'selected_supplier_id' | 'item_name'>>
): ProvisionalItemLine {
  const next: ProvisionalItemLine = { ...line, ...patch };
  if ('selected_supplier_id' in patch && patch.selected_supplier_id !== null) {
    const sup = line.supplier_options.find((s) => s.supplier_id === patch.selected_supplier_id);
    if (sup) next.unit_price = sup.unit_price;
  }
  if ('quantity' in patch || 'unit_price' in patch || 'selected_supplier_id' in patch || 'item_name' in patch) {
    next.is_overridden = true;
  }
  next.total_cost = next.unit_price !== null ? round2(next.quantity * next.unit_price) : null;
  return next;
}

/** Aggregates a set of (possibly overridden) item lines into a full tier result. VAT and
 * downpayment are separate bottom lines, never folded into any single item. Lines still
 * missing a rate (total_cost null) are excluded from the taxable base until resolved in
 * Minor Revision — an unresolved missing-rule line contributes nothing rather than a
 * fabricated placeholder amount. */
export function computeTierResult(
  tier: ProvisionalTier,
  items: ProvisionalItemLine[],
  options?: { vatInclusive?: boolean; downpaymentPercentage?: number }
): ProvisionalQuotationTierResult {
  const pricingFixture = TIER_PRICING_FIXTURE[tier];
  const vatInclusive = options?.vatInclusive ?? true;
  const downpaymentPercentage = options?.downpaymentPercentage ?? DEFAULT_DOWNPAYMENT_PERCENTAGE;

  const materialsSubtotal = round2(items.filter((l) => l.category === 'Material').reduce((sum, l) => sum + (l.total_cost ?? 0), 0));
  const serviceCost = deriveMockServiceCost(items, materialsSubtotal, tier);

  const baseForMarkup = materialsSubtotal + serviceCost.subtotal;
  const ocmAmount = round2(baseForMarkup * (pricingFixture.ocm_percentage / 100));
  const profitAmount = round2(baseForMarkup * (pricingFixture.profit_margin_percentage / 100));
  const subtotalBeforeVat = round2(baseForMarkup + ocmAmount + profitAmount);

  const vatAmount = vatInclusive ? round2(subtotalBeforeVat * (VAT_RATE_PERCENTAGE / 100)) : 0;
  const grandTotal = round2(subtotalBeforeVat + vatAmount);
  const downpaymentAmount = round2(grandTotal * (downpaymentPercentage / 100));

  return {
    tier,
    items,
    materials_subtotal: materialsSubtotal,
    service_cost: serviceCost,
    ocm_percentage: pricingFixture.ocm_percentage,
    ocm_amount: ocmAmount,
    profit_margin_percentage: pricingFixture.profit_margin_percentage,
    profit_amount: profitAmount,
    subtotal_before_vat: subtotalBeforeVat,
    vat: { rate_percentage: VAT_RATE_PERCENTAGE, taxable_base: subtotalBeforeVat, amount: vatAmount },
    vat_inclusive: vatInclusive,
    downpayment_percentage: downpaymentPercentage,
    downpayment_amount: downpaymentAmount,
    grand_total: grandTotal,
    timeline_label: pricingFixture.timeline_label,
    warranty_label: pricingFixture.warranty_label,
    material_grade_label: pricingFixture.material_grade_label,
  };
}

export function fmtPeso(n: number): string {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
