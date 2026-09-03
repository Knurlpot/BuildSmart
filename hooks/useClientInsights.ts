// ‼️ HONESTY CONSTRAINT — read before extending this file.
//
// The `client` table (types/entities/client.ts) and `quotation.client_id` FK are now real,
// so a client's real history CAN be computed: how many quotations they have, the most
// recent one. That's exactly what this hook returns — nothing more.
//
// Still NOT real, still NOT returned here: a "usual tier" (no per-quote tier/strategy_type
// is stored against quotation in the consolidated schema), "preferred materials" (nothing
// links a client to materials), or any behavioral/personality note ("responds to warranty
// packages," etc — pure invention, no column anywhere could back it). Do not add fields for
// these. The day the backend adds a tier column to quotation, or a treatment_type linkage,
// THIS is the file to extend — not before, and not with a guessed field name.
//
// Assumed endpoint — UNVERIFIED, confirm with the backend team:
//   GET /api/clients/:clientId/insights -> ClientInsights
// No real backend route exists in this branch yet; this follows the same "assumed REST
// path, clearly labeled" convention as lib/api/auth.ts and hooks/useQuotationGeneration.ts.
import { useFetch } from './useFetch';
import type { ClientType } from '@/types/entities';

export interface ClientInsights {
  hasHistory: boolean;
  clientType: ClientType;
  projectCount: number;
  projects: {
    quote_id: number;
    project_name: string;
    project_region: string;
    status: string;
    accepted_tier: "Practical" | "Premium" | null;
    grand_total: number;
    created_at: string;
  }[];
  mostRecentProject: {
    quote_id: number;
    project_name: string;
    project_region: string;
    status: string;
    accepted_tier: "Practical" | "Premium" | null;
    grand_total: number;
    created_at: string;
  } | null;
}

export interface UseClientInsightsResult {
  insights: ClientInsights | null;
  isLoading: boolean;
  error: Error | null;
}

export function useClientInsights(clientId: number | null): UseClientInsightsResult {
  const endpoint = clientId !== null ? `/api/clients/${clientId}/insights` : null;
  const { data, isLoading, error } = useFetch<ClientInsights>(endpoint);
  return { insights: data, isLoading, error };
}
