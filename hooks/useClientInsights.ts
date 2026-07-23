// ‼️ HONESTY CONSTRAINT — read before touching this file.
//
// The consolidated schema has NO client entity: `quotation` has no client_id, and there is
// no table anywhere that could tell us a client's past project count, tiers, averages, or
// anything else about their history with this company. That is a pending backend decision
// (a client table + a quotation.client_id FK, at minimum — see
// lib/dev/provisional/quotationGenerationTypes.ts's Client doc comment for the exact gap).
//
// So this hook does NOT fetch anything and does NOT invent anything. It always returns
// "no history" — that's not a placeholder loading state, it's the honest answer given what
// the database can currently prove. ClientInsightCard.tsx renders exactly that: never a
// fabricated project count, tier, average, or risk/payment flag.
//
// The day the backend adds a client entity + history, swap the body below for a real
// `useFetch<ClientInsights>(`/api/clients/${clientId}/insights`)` call and extend
// `ClientInsights` with real fields sourced from that endpoint — not before, and not with
// invented field names guessed ahead of time.
export interface ClientInsights {
  hasHistory: false;
}

export interface UseClientInsightsResult {
  insights: ClientInsights | null;
  isLoading: boolean;
  error: null;
}

export function useClientInsights(clientId: string | null): UseClientInsightsResult {
  if (!clientId) return { insights: null, isLoading: false, error: null };
  return { insights: { hasHistory: false }, isLoading: false, error: null };
}
