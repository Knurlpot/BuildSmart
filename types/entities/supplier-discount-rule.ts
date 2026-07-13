// Mirrors supplier_discount_rule (singular — renamed in schema v3) in
// BuildSmart_schema_v3.sql. Wire format (snake_case vs camelCase) UNVERIFIED
// against the backend — confirm before trusting at runtime.
//
// PK is supplierdisc_id (not discount_rule_id) — matches CLAUDE.md's naming
// note that this table is one of the two PK exceptions. rule_type casing is
// Title Case with spaces, exactly as the v3 CHECK constraint spells it — this
// supersedes any earlier lowercase-second-word note.
export interface SupplierDiscountRule {
  supplierdisc_id: number;
  company_id: number;
  supplier_id: number;
  rule_type: 'Bulk Discount' | 'Negotiated Price' | 'Minimum Order' | 'Preferred Supplier';
  minimum_order_amount?: number;
  discount_percentage_rate?: number;
  fixed_discount_amount?: number;
  effective_date: string;
  expiration_date?: string;
  is_active: boolean;
}
