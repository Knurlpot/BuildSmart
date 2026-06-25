export interface Suppliers {
  supplier_ID: number;
  supplier_name: string;
  supplier_address: string;
  warehouse_loc?: string;
  city?: string;
  region?: string;
  contact_email: string;
  contact_number: string;
  supplier_type?: 'Distributor' | 'Warehouse' | 'Retailer';
  status: 'Active' | 'Inactive';
}