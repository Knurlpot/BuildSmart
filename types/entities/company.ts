export interface Company {
  company_ID: number;
  company_name: string;
  company_address: string;
  contact_email: string;
  contact_number: string;
  status: 'Active' | 'Inactive';
  created_at: string;
}