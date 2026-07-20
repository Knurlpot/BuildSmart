// PROVISIONAL — see lib/dev/provisional/quotationGenerationTypes.ts for why `Client` has
// no real schema table yet. `/api/clients` and `/api/clients/new` are unconfirmed guesses,
// not a committed contract — kept as plausible REST paths so this is a drop-in swap once a
// real client table/endpoint exists.
import { useFetch } from './useFetch';
import { useMutation } from './useMutation';
import type { Client } from '@/lib/dev/provisional/quotationGenerationTypes';

export function useClients() {
  const { data, isLoading, error, refetch } = useFetch<Client[]>('/api/clients');
  const create = useMutation<Client>();
  return {
    clients: data ?? [],
    isLoading,
    error,
    refetch,
    createClient: (payload: Omit<Client, 'client_id'>) => create.mutate('/api/clients/new', payload, 'POST'),
    isCreating: create.isLoading,
    createError: create.error,
    resetCreate: create.reset,
  };
}
