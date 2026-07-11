// Mirrors items in schema v3 (BuildSmart_schema_v3.sql). Wire format
// (snake_case vs camelCase) UNVERIFIED against the backend — confirm before
// trusting at runtime.
export interface Items {
  item_code: number;
  category_id: number;
  company_id?: number | null; // nullable FK — NULL for items not scoped to a company (e.g. DPWH/PSA catalog items)
  item_name: string;
  material: string;
  brand: string;
  quality?: string; // free text in v3 (no CHECK constraint) — do not re-add a Budget/Standard/Premium union
  unit: string;
  size_width?: number;
  size_length?: number;
  color?: string;
  item_source: 'DPWH' | 'PSA' | 'Supplier' | 'Internal';
  description?: string;
}
