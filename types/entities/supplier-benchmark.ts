// 1:1 with Suppliers — supplier_ID is both PK and FK here, no separate identity column
export interface SupplierBenchmark {
  supplier_ID: number;
  average_price_score: number;
  update_frequency_score: number;
  reliability_score: number;
  delivery_score: number;
  overall_score: number;
}