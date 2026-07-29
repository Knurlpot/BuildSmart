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
  // NOT NULL DEFAULT 'New' at the DB level — always a real value once read back from the
  // server. Manually chosen by whoever creates the client record, never a computed/inferred
  // insight (that would be exactly the kind of fabrication the honesty constraint rules out).
  client_type: ClientType;
  default_downpayment_percentage?: number | null;
  notes?: string | null;
  status: ClientStatus;
  created_at: string;
}

export const CLIENT_TYPES: ClientType[] = ['New', 'Returning'];