export interface SupplierDiscountRule {
  discount_rule_ID: number;
  company_ID: number;
  supplier_ID: number;
  rule_type: 'Bulk_Discount' | 'Negotiated_Price' | 'Minimum_Order' | 'Preferred_Supplier';
  minimum_order_amount?: number;
  discount_percentage?: number;
  fixed_discount_amount?: number;
  effective_date: string;
  expiration_date?: string;
  is_active: boolean;
}