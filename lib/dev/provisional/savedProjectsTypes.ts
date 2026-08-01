// PROVISIONAL — Open Projects' mock persistence layer. There is no real backend endpoint
// that saves a finalized quotation yet (Finalize doesn't call any API — see
// savedProjectsStore.ts), and quote_group_id/tier/is_selected don't exist on `quotation`
// until part2_schema_addendum.sql is applied. This module exists so Open Projects has
// something real to read across a route change, in the same spirit as everything else
// under lib/dev/: structurally faithful, values/persistence mocked.
import type { PricelistBasis, ProvisionalQuotationTierResult, ProvisionalTier } from './quotationBreakdownTypes';
import type { BlueprintFloor } from './quotationGenerationTypes';
import type { DraftSegment } from '@/features/quotation-generation/lib/draftSegment';

// Task 6, Part C — ONE entry in a quote's price-refresh history. version_number 1 is always
// the ORIGINAL (identical to the snapshot's own `result`/`finalized_at`, see below) and is
// never mutated; "Refresh Prices" only ever APPENDS a new entry, never rewrites an existing
// one. price_reference_date is what lets the UI show "how current" a version's prices are —
// for the original this equals finalized_at; for a refresh it's when the refresh ran (the
// mock's "as of" date — see priceRefreshFixtures.ts for why this is a mock, not a real feed).
export interface SavedQuoteVersion {
  version_id: string; // staging id
  version_number: number; // 1 = original, increments with each refresh
  price_reference_date: string; // ISO — "as of" date of this version's prices
  created_at: string; // when this version was produced
  result: ProvisionalQuotationTierResult;
}

// One tier's FROZEN result, as it looked the moment Finalize ran. `result` is never
// recomputed after this is created — see savedProjectsStore.ts's snapshot-integrity
// comment. Reading a saved project must always display exactly what was finalized, even
// if the fixture rates driving live quotes change later.
export interface SavedQuoteSnapshot {
  quote_id: number; // fixture id, mirrors quotation.quote_id
  tier: ProvisionalTier; // -> quotation.tier (addendum)
  quote_group_id: string; // -> quotation.quote_group_id (addendum) — ties this to its sibling
  is_selected: boolean | null; // -> quotation.is_selected (addendum) — null until the
  // contractor marks which tier the client picked (Part C's "Mark as Accepted" toggle)
  pricelist_basis_at_finalize: PricelistBasis; // which basis priced this snapshot
  finalized_at: string; // ISO date this snapshot was frozen
  // ALWAYS equal to versions[0].result — the ORIGINAL, frozen forever. Audit trail: whatever
  // was finalized (and, presumably, sent to the client) must remain exactly reconstructable
  // even after any number of price refreshes. Never reassign this field after creation.
  result: ProvisionalQuotationTierResult;
  // Ordered oldest -> newest. versions[0] mirrors `result`/`finalized_at` exactly (the
  // original); later entries are "Refresh Prices" outputs. UI defaults to showing the LATEST
  // entry, with the original always separately viewable — see [projectId]/page.tsx.
  versions: SavedQuoteVersion[];
}

// A "project" here is the CONTRACTOR-FACING grouping of one quote_group's two tier
// versions — nothing in the live schema represents this as a single row (a real
// `quotation` row is always exactly one tier). This shape exists purely for Open
// Projects' list/detail UI.
export interface SavedProjectRecord {
  project_id: string; // staging id
  quote_group_id: string;
  client_id: number;
  client_name: string;
  project_name: string;
  project_location: string;
  project_region: string;
  status: 'Draft' | 'Final'; // mirrors quotation.status's real enum
  created_at: string;
  updated_at: string;
  quotes: Record<ProvisionalTier, SavedQuoteSnapshot>;
  // Task 7, Part B — Segment Breakdown's split-view blueprint preview, frozen at Finalize
  // the same way pricing is (see savedProjectsStore.ts's snapshot-integrity comment) —
  // shared by both tiers (one blueprint per project, not per tier). null = this quote
  // wasn't blueprint-sourced (Quick Measurement/Manual); the breakdown gracefully degrades
  // to a segment list instead. Seed projects are null on purpose — they were never actually
  // scanned, so claiming a blueprint here would be exactly the fabrication this codebase's
  // honesty convention rules out.
  blueprintFloors: BlueprintFloor[] | null;
  // The DraftSegment[] this project's blueprint (if any) was scanned into — carries
  // polygon_coords/confidence_score that ProvisionalItemLine doesn't. Only meaningful
  // alongside blueprintFloors; empty array when blueprintFloors is null.
  segmentsSnapshot: DraftSegment[];
}
