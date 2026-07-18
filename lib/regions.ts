// Philippine administrative regions used for the region filter across analytics
// pages. This is a fixed geographic taxonomy, not fabricated business data —
// distinct from supplier/material records, which must always come from the API.
// Uses schema v3's official region values (e.g. 'Region IV-A', not the colloquial
// 'CALABARZON') so these match the CHECK constraints on suppliers/historical_price_record/
// quotation exactly — see types/entities/common.ts's PhRegion for the full 18-value set.
export const REGIONS = ['All', 'NCR', 'Region I', 'Region III', 'Region IV-A', 'Region VII', 'Region XI'];

// Full 18-region set, for real data-entry dropdowns (e.g. "which region to fetch DPWH
// prices for") where the short filter list above would silently exclude a region DPWH
// actually publishes for. Re-exported from PH_REGIONS (types/entities/common.ts) rather
// than duplicated here — that file is the value set matching every region CHECK
// constraint; this is just where region-related UI already imports from.
export { PH_REGIONS as ALL_REGIONS } from '@/types/entities/common';
