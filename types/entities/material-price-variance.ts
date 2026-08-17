// Mirrors material_price_variance (singular — renamed in schema v3) in
// BuildSmart_schema_v3.sql. Computed/derived data — likely read-only on the
// frontend (job output or view, not a form).
//
// v3 change (B): this table now also hosts PSA CMRPI commodity-group INDEX
// movement, alongside BuildSmart's own per-item variance:
//   - variance_source 'Internal' rows: item_code set, commodity_group null —
//     the existing per-item peso % change.
//   - variance_source 'PSA' rows: item_code null, commodity_group set (e.g.
//     'Masonry Materials') — PSA's per-commodity-group index YoY %, never a
//     single item's peso price. PSA rows may adjust DPWH CMPD benchmarks for
//     variance analysis, but they are not direct transactable rates.
export interface MaterialPriceVariance {
  mpv_id: number;
  item_code: number | null; // null for 'PSA' rows
  variance_source: 'Internal' | 'PSA';
  commodity_group: string | null; // set only for 'PSA' rows
  effective_date: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: number;
  percent_change: number; // Internal: item peso %; PSA: index YoY %
  trend_direction: 'Up' | 'Down' | 'Stable';
  is_significant_spike: boolean; // threshold >=15%, per manuscript
}
