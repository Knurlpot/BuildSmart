// Mirrors historical_price_record (singular — renamed in schema v3) in
// BuildSmart_schema_v3.sql. Wire format (snake_case vs camelCase) UNVERIFIED
// against the backend — confirm before trusting at runtime.
//
// v3 change (A): supplier_id is NULLABLE. 'Supplier' rows carry a supplier_id;
// 'DPWH' / 'PSA' / 'Internal' rows have no supplier and are null. This resolves
// the earlier "no supplier column" flag from the Upload Pricelist rework — that
// flag is now stale, do not re-raise it.
//
// effective_date is the canonical price period. quarter/year are retained only
// for deprecated compatibility with older quarterly publications.
import type { PhRegion } from './common';

export interface HistoricalPriceRecord {
  historicalrec_id: number;
  item_code: number; // FK -> Items.item_code (confirmed, not item_id)
  supplier_id: number | null; // null for DPWH/PSA/Internal rows
  price_source: 'DPWH' | 'PSA' | 'Supplier' | 'Internal';
  region?: PhRegion; // should match Suppliers.region vocabulary exactly
  effective_date: string;
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null;
  year?: number | null;
  price: number;
  recorded_at: string;
}
