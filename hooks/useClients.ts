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