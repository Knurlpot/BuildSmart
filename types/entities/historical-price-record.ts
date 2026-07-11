// Mirrors historical_price_records in the authoritative SQL. Wire format (snake_case vs camelCase)
// UNVERIFIED against the backend — confirm before trusting at runtime.
export interface HistoricalPriceRecord {
  historicalrec_id: number;
  item_code: number; // FK -> Items.item_code (confirmed, not item_id)
  source: 'DPWH' | 'PSA' | 'Supplier Upload';
  region?: string; // should match Suppliers.region vocabulary exactly
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: number;
  price: number;
  recorded_at: string;
}
