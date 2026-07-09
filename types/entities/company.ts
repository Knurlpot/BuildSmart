// Mirrors company in the authoritative SQL. Wire format (snake_case vs camelCase)
// UNVERIFIED against the backend — confirm before trusting at runtime.
export interface Company {
  company_id: number;
  company_name: string;
  company_address: string;
  contact_email: string;
  contact_number: string;
  specialization_1: string;
  specialization_2?: string;
  specialization_3?: string;
  // Upload mechanism (multipart form vs plain URL) is a backend contract question,
  // unconfirmed — treated as a plain string/URL on the frontend for now.
  company_logo?: string;
  status: 'Active' | 'Inactive';
  created_at: string;
}
