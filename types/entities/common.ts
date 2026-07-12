// Shared region enum — the exact 18-value set used by every CHECK(region IN (...))
// constraint in schema v3 (suppliers.region, supplier_region.region,
// historical_price_record.region, quotation.project_region). Kept in one place so
// the four entity files don't each redeclare the union independently.
//
// Distinct from lib/regions.ts: that file is a UI filter shortlist (a handful of
// regions the dev fixtures cover), not the full schema enum — don't conflate them.
export type PhRegion =
  | 'Region I'
  | 'Region II'
  | 'Region III'
  | 'Region IV-A'
  | 'Region IV-B'
  | 'Region V'
  | 'Region VI'
  | 'Region VII'
  | 'Region VIII'
  | 'Region IX'
  | 'Region X'
  | 'Region XI'
  | 'Region XII'
  | 'Region XIII'
  | 'CAR'
  | 'NCR'
  | 'NIR'
  | 'BARMM';

/** Runtime companion to PhRegion — for real data-entry dropdowns needing all 18 values (not lib/regions.ts's filter shortlist). */
export const PH_REGIONS: PhRegion[] = [
  'Region I',
  'Region II',
  'Region III',
  'Region IV-A',
  'Region IV-B',
  'Region V',
  'Region VI',
  'Region VII',
  'Region VIII',
  'Region IX',
  'Region X',
  'Region XI',
  'Region XII',
  'Region XIII',
  'CAR',
  'NCR',
  'NIR',
  'BARMM',
];
