// `client` is a real table now (types/entities/client.ts) — `/api/clients` and
// `/api/clients/new` are still unconfirmed guesses, not a committed contract (no backend
// route exists in this branch yet), kept as plausible REST paths per this codebase's
// "assumed endpoint" convention. company_id/client_id are never invented here — company_id
// comes from the session server-side, client_id is read back from the create response.
import { useFetch } from './useFetch';
import { useMutation } from './useMutation';
import type { Client } from '@/types/entities';

export function useClients() {
  const { data, isLoading, error, refetch } = useFetch<Client[]>('/api/clients');
  const create = useMutation<Client>();
  return {
    clients: data ?? [],
    isLoading,
    error,
    refetch,
    createClient: (payload: Omit<Client, 'client_id' | 'company_id' | 'status' | 'created_at'>) =>
      create.mutate('/api/clients/new', payload, 'POST'),
    isCreating: create.isLoading,
    createError: create.error,
    resetCreate: create.reset,
  };
}
