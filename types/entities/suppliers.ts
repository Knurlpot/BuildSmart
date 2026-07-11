// Mirrors suppliers in schema v3 (BuildSmart_schema_v3.sql). Wire format
// (snake_case vs camelCase) UNVERIFIED against the backend — confirm before
// trusting at runtime.
import type { PhRegion } from './common';

export interface Suppliers {
  supplier_id: number;
  supplier_name: string;
  supplier_address: string;
  warehouse_loc?: string;
  city: string;
  region: PhRegion;
  contact_email: string;
  contact_number: string;
  supplier_type: 'Distributor' | 'Warehouse' | 'Retailer';
  status: 'Active' | 'Inactive';
}
