// Computed/derived data — likely read-only on the frontend (job output or view, not a form)
export interface MaterialPriceVariance {
  variance_ID: number;
  item_code: number;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: number;
  percent_change: number;
  trend_direction: 'Up' | 'Down' | 'Stable';
  is_significant_spike: boolean; // threshold >=15%, per manuscript
}