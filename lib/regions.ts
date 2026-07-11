// Philippine administrative regions used for the region filter across analytics
// pages. This is a fixed geographic taxonomy, not fabricated business data —
// distinct from supplier/material records, which must always come from the API.
// Uses schema v3's official region values (e.g. 'Region IV-A', not the colloquial
// 'CALABARZON') so these match the CHECK constraints on suppliers/historical_price_record/
// quotation exactly — see types/entities/common.ts's PhRegion for the full 18-value set.
export const REGIONS = ['All', 'NCR', 'Region I', 'Region III', 'Region IV-A', 'Region VII', 'Region XI'];
