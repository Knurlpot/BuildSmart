// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Backs the assumed GET /api/suppliers
// endpoint (hooks/useSuppliers.ts). `Suppliers` is a real, confirmed entity (schema v3,
// types/entities/suppliers.ts) — supplier_id values here match
// lib/dev/fixtures/supplierBenchmarks.ts's roster (501-505) so Supplier Rules and Supplier
// Benchmarking reference the SAME company supplier list, not two disconnected ones.
import type { Suppliers } from '@/types/entities';

export const suppliersFixture: Suppliers[] = [
  {
    supplier_id: 501,
    supplier_name: 'Coastal Building Supply',
    supplier_address: '88 Ortigas Ave Ext, Pasig City',
    city: 'Pasig City',
    region: 'NCR',
    contact_email: 'sales@coastalbuilding.example',
    contact_number: '+63 917 200 1188',
    supplier_type: 'Distributor',
    status: 'Active',
  },
  {
    supplier_id: 502,
    supplier_name: 'Northline Hardware Co.',
    supplier_address: 'MacArthur Hwy, San Fernando',
    city: 'San Fernando',
    region: 'Region III',
    contact_email: 'orders@northlinehardware.example',
    contact_number: '+63 918 330 4477',
    supplier_type: 'Retailer',
    status: 'Active',
  },
  {
    supplier_id: 503,
    supplier_name: 'Terra Bright Materials',
    supplier_address: 'Governor’s Dr, Dasmariñas',
    city: 'Dasmariñas',
    region: 'Region IV-A',
    contact_email: 'inquiries@terrabrightmaterials.example',
    contact_number: '+63 919 552 6690',
    supplier_type: 'Distributor',
    status: 'Active',
  },
  {
    supplier_id: 504,
    supplier_name: 'Pinnacle Construction Supply',
    supplier_address: '21 Quirino Hwy, Quezon City',
    city: 'Quezon City',
    region: 'NCR',
    contact_email: 'sales@pinnacleconstruction.example',
    contact_number: '+63 917 804 3321',
    supplier_type: 'Warehouse',
    status: 'Active',
  },
  {
    supplier_id: 505,
    supplier_name: 'Harborview Trading Co.',
    supplier_address: 'F. Ramos St, Cebu City',
    city: 'Cebu City',
    region: 'Region VII',
    contact_email: 'trading@harborview.example',
    contact_number: '+63 920 115 2288',
    supplier_type: 'Distributor',
    status: 'Inactive',
  },
];
