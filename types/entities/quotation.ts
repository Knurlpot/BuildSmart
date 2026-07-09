// Mirrors quotations in the authoritative SQL. Wire format (snake_case vs camelCase)
// UNVERIFIED against the backend — confirm before trusting at runtime.
export interface Quotation {
  quote_id: number;
  company_id: number;
  user_id: number;
  project_name: string;
  project_location: string;
  project_region: string;
  input_method: string;
  status: 'Draft' | 'Final';
  total_material_cost: number;
  total_service_cost: number;
  grand_total: number;
  created_at: string;
  updated_at: string;
  // PROPOSED column — NOT in the authoritative 13-table SQL yet. Requires a backend
  // schema change. See app/(app)/projects/page.tsx for the Archive feature this backs.
  is_archived?: boolean;
}
