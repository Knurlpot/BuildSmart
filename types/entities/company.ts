export interface Company {
  company_id: number;
  company_name: string;
  company_address: string;
  contact_email: string;
  contact_number: string;
  specialization_1: string;
  // null (not omitted/empty-string) when unset — see lib/specializations.ts's
  // specializationsToColumns.
  specialization_2: string | null;
  specialization_3: string | null;
  // Upload mechanism (multipart form vs plain URL) is a backend contract question,
  // unconfirmed — treated as a plain string/URL on the frontend for now.
  company_logo?: string;
  status: 'Active' | 'Inactive';
  created_at: string;
}