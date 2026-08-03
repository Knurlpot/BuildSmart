// Mirrors items in schema v3 (BuildSmart_schema_v3.sql). Wire format
// (snake_case vs camelCase) UNVERIFIED against the backend — confirm before
// trusting at runtime.
export interface Items {
  item_code: number;
  category_id: number;
  company_id?: number | null; // nullable FK — NULL for items not scoped to a company (e.g. DPWH/PSA catalog items)
  item_name: string;
  brand: string;
  unit: string;
  color?: string;
  item_source: 'DPWH' | 'PSA' | 'Supplier' | 'Internal';
  source_location?: string | null;
  description?: string;
}
