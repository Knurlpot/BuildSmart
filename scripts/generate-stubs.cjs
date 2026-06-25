const fs = require('fs');
const path = require('path');

// ============================================================
// 1. Define ALL files with their content
// ============================================================
const files = {
  // ---------- APP ROUTES (page.tsx stubs) ----------
  'app/(app)/dashboard/page.tsx':
`export default function DashboardPage() {
  return <div>Dashboard (placeholder)</div>;
}`,

  'app/(app)/blueprints/page.tsx':
`export default function BlueprintsPage() {
  return <div>Blueprints (placeholder)</div>;
}`,

  'app/(app)/projects/page.tsx':
`export default function ProjectsPage() {
  return <div>Projects (placeholder)</div>;
}`,

  'app/(app)/projects/[projectId]/page.tsx':
`export default function ProjectDetailPage() {
  return <div>Project Detail (placeholder)</div>;
}`,

  'app/(app)/quotations/page.tsx':
`export default function QuotationsPage() {
  return <div>Quotations (placeholder)</div>;
}`,

  'app/(app)/quotations/new/page.tsx':
`export default function NewQuotationPage() {
  return <div>New Quotation (placeholder)</div>;
}`,

  'app/(app)/quotations/[quotationId]/page.tsx':
`export default function QuotationDetailPage() {
  return <div>Quotation Detail (placeholder)</div>;
}`,

  'app/(app)/pricelist/page.tsx':
`export default function PricelistPage() {
  return <div>Pricelist (placeholder)</div>;
}`,

  'app/(app)/suppliers/page.tsx':
`export default function SuppliersPage() {
  return <div>Suppliers (placeholder)</div>;
}`,

  'app/(app)/suppliers/benchmark/page.tsx':
`export default function SupplierBenchmarkPage() {
  return <div>Supplier Benchmark (placeholder)</div>;
}`,

  'app/(app)/market-intelligence/page.tsx':
`export default function MarketIntelligencePage() {
  return <div>Market Intelligence (placeholder)</div>;
}`,

  'app/(app)/reports/page.tsx':
`export default function ReportsPage() {
  return <div>Reports (placeholder)</div>;
}`,

  'app/(app)/management/page.tsx':
`export default function ManagementPage() {
  return <div>Management (placeholder)</div>;
}`,

  'app/(app)/settings/preferences/page.tsx':
`export default function PreferencesPage() {
  return <div>Company Preferences (placeholder)</div>;
}`,

  // ---------- ENTITY TYPES ----------
  // Field names below are taken directly from final-database-schema (verified, 8 tables)
  // and the Data Dictionary Addendum v2 — NOT re-guessed.

  'types/entities/company.ts':
`export interface Company {
  company_ID: number;
  company_name: string;
  company_address: string;
  contact_email: string;
  contact_number: string;
  status: 'Active' | 'Inactive';
  created_at: string;
}`,

  'types/entities/users.ts':
`export interface Users {
  user_ID: number;
  company_ID: number;
  last_name: string;
  first_name: string;
  middle_name?: string;
  email: string;
  // password_hash intentionally omitted — never expose this on the frontend type
  user_role: 'Owner' | 'Admin' | 'Estimator' | 'Viewer';
  status: 'Active' | 'Inactive';
  created_at: string;
}`,

  'types/entities/suppliers.ts':
`export interface Suppliers {
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
}`,

  'types/entities/category.ts':
`export interface Category {
  category_ID: number;
  category_type: string;
  category_desc?: string;
}`,

  'types/entities/items.ts':
`export interface Items {
  item_code: number;
  category_ID: number;
  item_name: string;
  material: string;
  brand: string;
  quality?: 'Budget' | 'Standard' | 'Premium';
  unit: string;
  size_width: number;
  size_length: number;
  color: string;
  description?: string;
}`,

  'types/entities/quotation.ts':
`export interface Quotation {
  quote_ID: number;
  company_ID: number;
  user_ID: number;
  project_name: string;
  project_location: string;
  project_region: string;
  input_method: string;
  status: string;
  total_material_cost: number;
  total_service_cost: number;
  grand_total: number;
  created_at: string;
  updated_at: string;
}`,

  'types/entities/quotations-items.ts':
`export interface QuotationsItems {
  quote_item_ID: number;
  quote_ID: number;
  item_code: number;
  quantity: number;
  unit_cost: number;
  markup_percentage: number;
  final_unit_price: number;
  total_cost: number;
  source_type: string;
}`,

  'types/entities/quotation-service-cost.ts':
`export interface QuotationServiceCost {
  service_cost_ID: number;
  quote_ID: number;
  service_type: string;
  description?: string;
  labor_cost: number;
  equipment_cost: number;
  contingency_cost: number;
  other_cost: number;
  subtotal: number;
}`,

  // ---- Panel-mandated entities (from Data Dictionary Addendum v2) ----

  'types/entities/historical-price-record.ts':
`export interface HistoricalPriceRecord {
  price_record_ID: number;
  item_code: number; // FK -> Items.item_code (confirmed, not item_id)
  source: 'DPWH' | 'Supplier_Upload' | 'PSA';
  region?: string; // should match Suppliers.region vocabulary exactly
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: number;
  price: number;
  recorded_at: string;
}`,

  'types/entities/material-price-variance.ts':
`// Computed/derived data — likely read-only on the frontend (job output or view, not a form)
export interface MaterialPriceVariance {
  variance_ID: number;
  item_code: number;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: number;
  percent_change: number;
  trend_direction: 'Up' | 'Down' | 'Stable';
  is_significant_spike: boolean; // threshold >=15%, per manuscript
}`,

  'types/entities/supplier-discount-rule.ts':
`export interface SupplierDiscountRule {
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
}`,

  'types/entities/supplier-benchmark.ts':
`// 1:1 with Suppliers — supplier_ID is both PK and FK here, no separate identity column
export interface SupplierBenchmark {
  supplier_ID: number;
  average_price_score: number;
  update_frequency_score: number;
  reliability_score: number;
  delivery_score: number;
  overall_score: number;
}`,

  // NOTE: Supplier_Region intentionally NOT included.
  // Decision: Suppliers.region/city already covers this; a standalone region table
  // isn't justified without evidence of multi-branch suppliers. Revisit only if that changes.

  'types/entities/index.ts':
`export * from './company';
export * from './users';
export * from './suppliers';
export * from './category';
export * from './items';
export * from './quotation';
export * from './quotations-items';
export * from './quotation-service-cost';
export * from './historical-price-record';
export * from './material-price-variance';
export * from './supplier-discount-rule';
export * from './supplier-benchmark';
// Supplier_Region intentionally omitted — see note in supplier-benchmark.ts directory`,

  // ---------- FEATURE COMPONENT STUBS ----------
  'features/company-rules/components/CompanyRulesShell.tsx':
`export default function CompanyRulesShell() {
  return <div>Company Rules Shell (placeholder)</div>;
}`,

  'features/company-rules/components/MaterialPreferenceTab.tsx':
`export default function MaterialPreferenceTab() {
  return <div>Material Preferences (placeholder)</div>;
}`,

  'features/company-rules/components/SupplierDiscountRulesTab.tsx':
`export default function SupplierDiscountRulesTab() {
  return <div>Supplier Discount Rules (placeholder)</div>;
}`,

  'features/company-rules/components/index.ts':
`export { default as CompanyRulesShell } from './CompanyRulesShell';
export { default as MaterialPreferenceTab } from './MaterialPreferenceTab';
export { default as SupplierDiscountRulesTab } from './SupplierDiscountRulesTab';
// Add more exports as components are created`,

  'features/market-intelligence/components/MarketIntelligenceDashboard.tsx':
`export default function MarketIntelligenceDashboard() {
  return <div>Market Intelligence Dashboard (placeholder)</div>;
}`,

  'features/market-intelligence/components/MaterialTrendChart.tsx':
`export default function MaterialTrendChart() {
  return null; // Placeholder — recharts implementation later
}`,

  'features/market-intelligence/components/index.ts':
`export { default as MarketIntelligenceDashboard } from './MarketIntelligenceDashboard';
export { default as MaterialTrendChart } from './MaterialTrendChart';`,

  'features/supplier-benchmarking/components/SupplierBenchmarkDashboard.tsx':
`export default function SupplierBenchmarkDashboard() {
  return <div>Supplier Benchmark Dashboard (placeholder)</div>;
}`,

  'features/supplier-benchmarking/components/index.ts':
`export { default as SupplierBenchmarkDashboard } from './SupplierBenchmarkDashboard';`,

  'features/pricelist/components/PricelistTable.tsx':
`export default function PricelistTable() {
  return <div>Pricelist Table (placeholder)</div>;
}`,

  'features/pricelist/components/index.ts':
`export { default as PricelistTable } from './PricelistTable';`,

  // ---------- SHARED COMPONENTS ----------
  'components/data-table/DataTable.tsx':
`export function DataTable() {
  return <div>DataTable (placeholder)</div>;
}`,

  'components/data-table/index.ts':
`export { DataTable } from './DataTable';`,

  'components/layout/AppShell.tsx':
`export default function AppShell({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}`,

  'components/layout/Sidebar.tsx':
`export default function Sidebar() {
  return <aside>Sidebar (placeholder)</aside>;
}`,

  'components/layout/Header.tsx':
`export default function Header() {
  return <header>Header (placeholder)</header>;
}`,

  'components/layout/index.ts':
`export { default as AppShell } from './AppShell';
export { default as Sidebar } from './Sidebar';
export { default as Header } from './Header';`,

  // ---------- HOOKS ----------
  'hooks/useFetch.ts':
`import { useState, useEffect } from 'react';
export function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // TODO: Implement real fetch logic later
  return { data, isLoading, error };
}`,

  'hooks/useCompanyRules.ts':
`import { useState } from 'react';
export function useCompanyRules() {
  // TODO: Replace with actual API call
  return { data: [], isLoading: false, error: null };
}`,

  // ---------- API CLIENT ----------
  'lib/api/client.ts':
`const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
export async function apiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(\`\${API_BASE}\${endpoint}\`, options);
  if (!res.ok) throw new Error(\`API error: \${res.status}\`);
  return res.json();
}`,

  // ---------- PROVIDERS ----------
  'providers/AuthProvider.tsx':
`'use client';
import { createContext, useContext } from 'react';
const AuthContext = createContext(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContext.Provider value={null}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }`,
};

// ============================================================
// 2. Write all files (and create directories automatically)
// ============================================================
Object.entries(files).forEach(([filePath, content]) => {
  const fullPath = path.join(process.cwd(), filePath);
  const dir = path.dirname(fullPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`✅ Created: ${filePath}`);
});

console.log('\n🎉 All stub files created successfully!');
console.log('Run `npm run dev` to see your app with placeholders.');