// Mirrors quotation_items in the authoritative SQL. Wire format (snake_case vs
// camelCase) UNVERIFIED against the backend — confirm before trusting at runtime.
//
// source_type is the per-line pricing-source audit trail. 'PSA' stays in the
// enum for schema completeness but the operational quotation engine must NOT
// price from PSA — PSA is analytics-only (see material-price-variance.ts).
export interface QuotationsItems {
  quote_item_id: number;
  quote_id: number;
  item_code: number;
  quantity: number;
  unit_cost: number;
  markup_percentage: number;
  final_unit_price: number;
  total_cost: number;
  source_type: 'DPWH' | 'PSA' | 'Internal' | 'Supplier';
}
