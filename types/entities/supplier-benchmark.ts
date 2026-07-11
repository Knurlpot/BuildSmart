// Mirrors supplier_benchmarks in the authoritative SQL. Wire format (snake_case vs camelCase)
// UNVERIFIED against the backend — confirm before trusting at runtime.
export interface SupplierBenchmark {
  benchmark_id: number;
  supplier_id: number;
  average_price_score: number;
  update_frequency_score: number;
  reliability_score: number;
  delivery_score: number;
  overall_score: number;
}
