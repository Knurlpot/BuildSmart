// Mirrors quotation (singular — renamed in schema v3) in BuildSmart_schema_v3.sql.
// Wire format (snake_case vs camelCase) UNVERIFIED against the backend — confirm
// before trusting at runtime.
//
// NO is_archived column — confirmed dead. v3 explicitly documents "Hide" in Open
// Projects as a client-side, session-only display filter (eye icon), NOT
// persisted. Do not re-add is_archived; see app/(app)/projects/page.tsx for the
// client-only Hide implementation this backs.
import type { PhRegion } from './common';

export interface Quotation {
  quote_id: number;
  company_id: number;
  user_id: number;
  project_name: string;
  project_location: string;
  project_region: PhRegion;
  input_method: 'Manual' | 'Blueprint' | 'Hybrid';
  blueprint_file_path?: string | null;
  status: 'Draft' | 'Final';
  total_material_cost: number;
  total_service_cost: number;
  grand_total: number;
  created_at: string;
  updated_at: string;
}
