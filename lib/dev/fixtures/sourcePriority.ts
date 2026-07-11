// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Backs GET/PUT /api/pricelist/source-priority.
// Matches SourcePriorityEntry exactly (hooks/usePricelistSourcePriority.ts). The three
// `source` values are the actual historical_price_record.price_source enum, not fabricated
// data. 'Internal' is a valid price_source too but has no ranking entry here yet — this
// list was never extended to cover it, flag to backend/product if that's an oversight.
import type { SourcePriorityEntry } from "@/hooks/usePricelistSourcePriority";

export const sourcePriorityFixture: SourcePriorityEntry[] = [
  { source: "Supplier", rank: 1 },
  { source: "DPWH", rank: 2 },
  { source: "PSA", rank: 3 },
];
