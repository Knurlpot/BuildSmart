export interface HistoricalPriceRecord {
  price_record_ID: number;
  item_code: number; // FK -> Items.item_code (confirmed, not item_id)
  source: 'DPWH' | 'Supplier_Upload' | 'PSA';
  region?: string; // should match Suppliers.region vocabulary exactly
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: number;
  price: number;
  recorded_at: string;
}