// Mirrors supplier_benchmark (singular — renamed in schema v3) in BuildSmart_schema_v3.sql.
// Wire format (snake_case vs camelCase) UNVERIFIED against the backend — confirm before
// trusting at runtime. Already matched v3's field names/casing exactly; no field changes
// needed this pass.
export interface SupplierBenchmark {
  benchmark_id: number;
  supplier_id: number;
  average_price_score: number;
  update_frequency_score: number;
  reliability_score: number;
  delivery_score: number;
  overall_score: number;
}
