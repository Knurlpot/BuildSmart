export type ClientType = 'New' | 'Returning';
export type ClientStatus = 'Active' | 'Inactive';

export interface Client {
  client_id: number;
  company_id: number;
  client_name: string;
  contact_person?: string | null;
  contact_email?: string | null;
  contact_number?: string | null;
  client_address?: string | null;
  // NOT NULL DEFAULT 'New' at the DB level. API reads normalize this from quotation history:
  // 0 quotation projects = New, 1+ quotation projects = Returning.
  client_type: ClientType;
  quotation_project_count?: number;
  notes?: string | null;
  status: ClientStatus;
  created_at: string;
}

export const CLIENT_TYPES: ClientType[] = ['New', 'Returning'];
