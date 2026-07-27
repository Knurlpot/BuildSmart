// Mirrors client in the consolidated backend schema (database_schema.sql / "final database
// schema") — added alongside quotation.client_id as a real FK. Wire format (snake_case vs
// camelCase) UNVERIFIED against the backend — confirm before trusting at runtime.
//
// Previously modeled as a fully client-side "provisional" shape with a string staging id
// (see lib/dev/provisional/quotationGenerationTypes.ts's git history) because the schema had
// no client table at all. That gap is closed — this is now a real entity, matching every
// column on the real CREATE TABLE client (...) exactly. Do not re-add fields the table
// doesn't have (e.g. a computed "tier" or "preferred materials" — those still have no
// backing column anywhere; see ClientInsightCard.tsx / useClientInsights.ts for the honesty
// line on what's real vs. fabricated).
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
