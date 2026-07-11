import { useState } from 'react';
import { apiClient } from '@/lib/api/client';

interface MutationState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
}

export interface UseMutationResult<T> extends MutationState<T> {
  mutate: (endpoint: string, body: unknown, method?: 'PATCH' | 'POST' | 'PUT') => Promise<T>;
  reset: () => void;
}

/**
 * Write-path complement to useFetch: no fabricated success — `data` only
 * populates from a real response, `error` surfaces exactly what the request
 * failed with. Endpoint is passed per-call (not bound at hook creation) so a
 * single instance can serve multiple rows/targets, e.g. an actions column.
 */
export function useMutation<T = unknown>(): UseMutationResult<T> {
  const [state, setState] = useState<MutationState<T>>({ data: null, error: null, isLoading: false });

  const mutate = async (endpoint: string, body: unknown, method: 'PATCH' | 'POST' | 'PUT' = 'PATCH') => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const result = await apiClient<T>(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      setState({ data: result, error: null, isLoading: false });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ data: null, error, isLoading: false });
      throw error;
    }
  };

  const reset = () => setState({ data: null, error: null, isLoading: false });

  return { ...state, mutate, reset };
}
