// PROVISIONAL — Open Projects' mock persistence layer. There is no real backend endpoint
// that saves a finalized quotation yet (Finalize doesn't call any API — see
// savedProjectsStore.ts), and quote_group_id/tier/is_selected don't exist on `quotation`
// until part2_schema_addendum.sql is applied. This module exists so Open Projects has
// something real to read across a route change, in the same spirit as everything else
// under lib/dev/: structurally faithful, values/persistence mocked.
import type { PricelistBasis, ProvisionalQuotationTierResult, ProvisionalTier } from './quotationBreakdownTypes';

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
  result: ProvisionalQuotationTierResult;
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
}
