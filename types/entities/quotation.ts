export interface Quotation {
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
}