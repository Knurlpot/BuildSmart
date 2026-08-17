// Mirrors suppliers table with enriched benchmark metrics.
// Excludes Reliability & Delivery (not tracked), includes:
// - price_stability_score: How consistent supplier pricing is (0-100)
// - item_count: Number of items supplied
// - trend_direction: Aggregate price trend (Up/Down/Stable)
// - best_for_value_score: Value metric combining price, stability, and catalog size
export interface SupplierBenchmark {
  benchmark_id: number;
  supplier_id: number;
  average_price_score: number;
  update_frequency_score: number;
  overall_score: number;
  price_stability_score: number;
  item_count: number;
  trend_direction: string;
  best_for_value_score: number;
}
